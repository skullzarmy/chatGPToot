const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");
const moment = require("moment-timezone");
const { logUsage } = require("./usage_logger");
const { logFeedback, countFeedback } = require("./feedback_logger");
const { rssHandler } = require("./rss_handler");
const { newsHandler } = require("./news_handler");
const config = require(path.join(__dirname, "..", "config.json"));
const rss_urls = config.rss_urls;
const rss = new rssHandler(rss_urls);
const newsChecker = new newsHandler();
const example_image_prompts = config.example_image_prompts;
const mention_prompt = config.prompts.mention_prompt;
const news_disclaimer = config.prompts.news_disclaimer;
const { openai, initMastodon, rateLimiterGroup } = require("./init");
let mastodon;

//
//
//  Utility functions
//
//

async function downloadImage(url, dest) {
    try {
        const response = await axios({
            method: "get",
            url: url,
            responseType: "stream",
        });

        const writer = fs.createWriteStream(dest);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });
    } catch (error) {
        throw new Error("Error downloading image: " + error.message);
    }
}

async function addContext(msgs) {
    // const topTags = await getTrendingTags();
    const date = new Date();
    const systemMessage = {
        role: "system",
        content: `Adding context: The current date is ${date.toLocaleString("en-US", {
            timeZone: "UTC",
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })} in UTC.`,
    };

    const news = await newsChecker.fetchNews(3);
    const newsMsg = [
        {
            role: "system",
            content: "Adding context: Latest AI and LLM news headlines",
        },
    ];

    for (const item of news) {
        newsMsg.push({
            role: "system",
            content: `${item.title} - ${item.description} - ${item.pubDate} - ${item.link}`,
        });
    }
    msgs.push(systemMessage);
    msgs.push(...newsMsg);
    msgs.push(news_disclaimer.slice()[0]);
}

async function postToot(status, visibility, in_reply_to_id, account = false) {
    const maxChars = 490;

    if (status.length > 500) {
        let statusCopy = status;
        let tootCount = 1;
        let tootTexts = [];

        // Split statusCopy into tootTexts
        while (statusCopy.length > 0) {
            let lastSpace = statusCopy.substring(0, maxChars).lastIndexOf(" ");
            if (lastSpace === -1 || statusCopy.length <= maxChars) {
                lastSpace = maxChars;
            }
            tootTexts.push(statusCopy.substring(0, lastSpace));
            statusCopy = statusCopy.substring(lastSpace + 1);
        }

        // Calculate totalToots
        const totalToots = tootTexts.length;

        // Post toots in order
        for (const tootText of tootTexts) {
            try {
                const params = {
                    status: `${
                        account && tootCount > 1 ? "@" + account + " cont. " : ""
                    }${tootText} [${tootCount}/${totalToots}]`,
                    visibility,
                    ...(in_reply_to_id ? { in_reply_to_id } : {}),
                };

                // Wrap the result in a promise and await
                await new Promise(async (resolve, reject) => {
                    try {
                        const result = await mastodon.post("statuses", params);
                        if (tootCount === 1) {
                            in_reply_to_id = result.data.id; // reply to the first toot for the subsequent toots
                        }
                        resolve(result);
                    } catch (error) {
                        reject(`Error posting toot: ${error}`);
                    }
                });
            } catch (error) {
                throw new Error(`Error posting toot: ${error}`);
            }

            tootCount++;
        }
    } else {
        try {
            const params = {
                status,
                visibility,
                ...(in_reply_to_id ? { in_reply_to_id } : {}),
            };
            await mastodon.post("statuses", params);
        } catch (error) {
            throw new Error(`Error posting toot: ${error}`);
        }
    }
}

function dismissNotification(id) {
    return new Promise(async (resolve, reject) => {
        try {
            const result = await mastodon.post(`notifications/${id}/dismiss`);
            resolve(result);
        } catch (error) {
            reject(`Error dismissing notification: ${error}`);
        }
    });
}

//
//
//  Getter functions
//
//

function getFollowing() {
    return mastodon.get(`accounts/${process.env.MASTODON_ACCOUNT_ID}/following`);
}

function isAdmin(username) {
    console.log(`Checking if ${username} is an admin`);
    if (!process.env.MASTODON_ADMIN_ACCOUNT) {
        return false;
    } else {
        return process.env.MASTODON_ADMIN_ACCOUNT == username;
    }
}

async function getStatus() {
    try {
        const date = new Date();
        const countfeedback = await countFeedback();
        // const trends = await getTrendingTags(); // botsin.space does not support this endpoint

        const prompt = "This is a test. Plese reply with a pleasant message.";
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 10,
            temperature: 0.1,
        });

        let openAIStatus = "not working";
        if (response.data.choices[0].text) {
            openAIStatus = "working as expected";
        }

        const status = `The current date is ${moment(date)
            .tz("UTC")
            .format(
                "YYYY-MM-DD HH:mm:ss"
            )} in UTC. Currently ${countfeedback} logged feedback message(s). The connection to OpenAI is ${openAIStatus}. Test response: ${
            response.data.choices[0].text ? response.data.choices[0].text : "Test failed"
        }`;

        return status;
    } catch (error) {
        console.error(`Error getting status: ${error}`);
        const status = `The current date is ${moment(date)
            .tz("UTC")
            .format(
                "YYYY-MM-DD HH:mm:ss"
            )} in UTC. Currently ${countfeedback} logged feedback message(s). The connection to OpenAI is not working. Test response: Test failed`;
        throw new Error(status);
    }
}

async function getTrendingTags() {
    const response = await mastodon.get("trends/tags");
    const tags = response.data.map((tag) => tag.name);
    // return tags;
    return false;
}

async function fetchConversation(statusId, messages = [], tokens = 0) {
    try {
        const status = await mastodon.get(`statuses/${statusId}`);
        const inReplyToId = status.data.in_reply_to_id;
        const content = status.data.content.replace(/<[^>]*>?/gm, "");
        const newTokens = tokens + content.split(" ").length;

        if (newTokens <= config.max_tokens) {
            if (inReplyToId) {
                messages = await fetchConversation(inReplyToId, messages, newTokens);
            }

            const message = {
                role: status.data.account.id === process.env.MASTODON_ACCOUNT_ID ? "assistant" : "user",
                content,
            };

            messages.push(message);
        }
    } catch (error) {
        console.error(`Mastodon Error: ${error}`);
    }
    return messages;
}

async function checkMentions() {
    try {
        const notifications = await mastodon.get("notifications", { types: ["mention"] });
        console.log(`${notifications.data.length} mentions found at ${new Date()}`);
        if (notifications.data.length > 0) {
            const followingResponse = await getFollowing();
            const following = followingResponse.data;

            for (const mention of notifications.data) {
                const userId = mention.account.id;
                const rateLimiter = rateLimiterGroup.key(userId);
                try {
                    rateLimiter.schedule(() => processMention(mention, following));
                } catch (error) {
                    handleLimitReached(mention);
                }
            }
        }
    } catch (error) {
        console.error("Error checking mentions:", error);
        throw error;
    }
}

//
//
//  Processor / Handler functions
//
//

async function processMention(mention, following) {
    try {
        await dismissNotification(mention.id);
        const isFollowing = following.some((followed) => followed.id === mention.account.id);
        const content = mention.status.content
            .replace(/<[^>]*>?/gm, "")
            .replace("@mrroboto", "")
            .trim();
        const commandIndex = content.indexOf("//");
        const commandEndIndex =
            content.indexOf(" ", commandIndex) !== -1 ? content.indexOf(" ", commandIndex) : content.length;
        const command = content.slice(commandIndex, commandEndIndex).trim();
        const prompt = content.replace(command, "").trim();

        console.log("User: ", mention.account.acct);
        console.log("User ID: ", mention.account.id);
        console.log("Content: ", content);
        console.log("Command: ", command);
        console.log("Prompt: ", prompt);

        switch (command) {
            case "//img//":
            case "//imege//":
            case "//image//":
                handleImageCommand(mention, prompt, isFollowing).catch((error) => console.error(error));
                break;
            case "//img-asst//":
            case "//image-assist//":
                handleImageAssistCommand(mention, prompt, isFollowing).catch((error) => console.error(error));
                break;
            case "//news//":
                handleNewsCommand(mention).catch((error) => console.error(error));
                break;
            case "//help//":
            case "//commands//":
                handleHelpCommand(mention).catch((error) => console.error(error));
                break;
            case "//comment//":
            case "//feedback//":
                handleFeedbackCommand(mention, prompt, isFollowing).catch((error) => console.error(error));
                break;
            case "//beta//":
            case "//beta-application//":
                handleBetaApplicationCommand(mention, isFollowing).catch((error) => console.error(error));
                break;
            case "//toot-now//":
                handleTootNowCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//image-now//":
                handleImageNowCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//status//":
                handleStatusCommand(mention).catch((error) => console.error(error));
                break;
            default:
                handleRegularMention(mention).catch((error) => console.error(error));
                break;
        }
    } catch (error) {
        console.error("Error processing mention:", error);
        throw error;
    }
}

async function handleImageCommand(mention, prompt, isFollowing = false) {
    if (isFollowing) {
        try {
            const response = await openai.createImage({ prompt, n: 1, size: "512x512" });
            const imageUrl = response.data.data[0].url;
            const tokens = "unknown";

            const filename = `new_toot_${Date.now()}.png`;
            const filepath = path.join(__dirname, "..", "media", filename);

            await downloadImage(imageUrl, filepath);
            console.log("Image downloaded to " + filepath);

            const mediaResponse = await mastodon.post("media", {
                file: fs.createReadStream(filepath),
                description: prompt,
            });

            const tootVis = mention ? mention.status.visibility : false || "public";

            const mediaId = mediaResponse.data.id;
            let tootText;
            let tootParams = {
                media_ids: [mediaId],
                visibility: tootVis,
            };

            if (mention) {
                tootText = `@${mention.account.acct} Image prompt: ${prompt.substring(
                    0,
                    484 - mention.account.username.length
                )}`;
                tootParams.status = tootText;
                tootParams.in_reply_to_id = mention.status.id;

                logUsage(mention.account.acct, mention.status.id, prompt, tokens, "image");
            } else {
                tootText = `Image prompt: ${prompt.substring(0, 486)}`;
                tootParams.status = tootText;

                logUsage("mrroboto", null, "generate image", tokens, "image");
            }

            const tootResponse = await mastodon.post("statuses", tootParams);
            console.log("Toot with image posted:", tootResponse.data.uri);

            fs.unlink(filepath, (err) => {
                if (err) {
                    console.error("Error deleting file:", err);
                } else {
                    console.log("File deleted:", filepath);
                }
            });
        } catch (error) {
            console.error(`Error in handleImageCommand: ${JSON.stringify(error)}`);
            throw error;
        }
    } else {
        console.log("Not following user.");
        const reply = `${mention.account.acct} I'm sorry, I'm not following you. This command is currently only available to users I am following. If you would like to help us test, you can apply at https://forms.gle/drpUrRnhwioXuiYU7`;
        const tootVis = mention ? mention.status.visibility : false || "public";
        postToot(reply, tootVis, mention.status.id).catch((error) => console.error(error));
    }
}

async function handleImageAssistCommand(mention, prompt, isFollowing = false) {
    if (isFollowing) {
        try {
            const newPrompt = await generateImagePrompt(prompt);

            const response = await openai.createImage({ prompt: newPrompt, n: 1, size: "512x512" });
            const imageUrl = response.data.data[0].url;
            const tokens = "unknown";

            const filename = `new_toot_${Date.now()}.png`;
            const filepath = path.join(__dirname, "..", "media", filename);

            await downloadImage(imageUrl, filepath);
            console.log("Image downloaded to " + filepath);

            const mediaResponse = await mastodon.post("media", {
                file: fs.createReadStream(filepath),
                description: newPrompt,
            });

            const tootVis = mention ? mention.status.visibility : false || "public";

            const mediaId = mediaResponse.data.id;
            let tootText;
            let tootParams = {
                media_ids: [mediaId],
                visibility: tootVis,
            };

            if (mention) {
                tootText = `@${mention.account.acct} Image prompt: ${newPrompt.substring(
                    0,
                    484 - mention.account.username.length
                )}`;
                tootParams.status = tootText;
                tootParams.in_reply_to_id = mention.status.id;
                tootParams.visibility = tootVis;

                logUsage(mention.account.acct, mention.status.id, prompt, tokens, "image");
            } else {
                tootText = `Image prompt: ${newPrompt.substring(0, 486)}`;
                tootParams.status = tootText;

                logUsage("mrroboto", null, "generate image", tokens, "image");
            }

            const tootResponse = await mastodon.post("statuses", tootParams);
            console.log("Toot with image posted:", tootResponse.data.uri);

            fs.unlink(filepath, (err) => {
                if (err) {
                    console.error("Error deleting file:", err);
                } else {
                    console.log("File deleted:", filepath);
                }
            });
        } catch (error) {
            console.error(`Error in handleImageAssistCommand: ${JSON.stringify(error)}`);
            throw error;
        }
    } else {
        console.log("Not following user.");
        const reply = `${mention.account.acct} I'm sorry, I'm not following you. This command is currently only available to users I am following. If you would like to help us test, you can apply at https://forms.gle/drpUrRnhwioXuiYU7`;
        const tootVis = mention ? mention.status.visibility : false || "public";
        postToot(reply, tootVis, mention.status.id).catch((error) => console.error(error));
    }
}

async function handleNewsCommand(mention) {
    try {
        const news = await newsChecker.fetchNews(3);
        const msg = [
            {
                role: "system",
                content: "Listing latest news article:",
            },
        ];
        const summaries = [];
        for (const item of news) {
            msg.push(
                {
                    role: "system",
                    content: `${item.title} - ${item.description} - ${item.pubDate} - ${item.link}`,
                },
                {
                    role: "system",
                    content: `${item.content.substring(0, 5000)}...`,
                }
            );
            msg.push({
                role: "user",
                content:
                    "Please summarize the latest news article in one or two sentences. You can also add your own thoughts or opinions.",
            });
            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: msg,
            });
            summaries.push(`${item.title}\n${response.data.choices[0].message.content}\n${item.link}`);
        }

        const reply = `@${mention.account.acct} ${summaries.join("\n\n")}`;
        const tootVis = mention ? mention.status.visibility : false || "public";
        postToot(reply, tootVis, mention.status.id, mention.account.acct).catch((error) => console.error(error));
        logUsage(mention.account.acct, mention.status.id, "news", "unknown", "news");
    } catch (error) {
        console.error(`Error in handleNewsCommand: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function handleHelpCommand(mention) {
    try {
        const tootVis = mention ? mention.status.visibility : false || "public";
        await postToot(
            `Hello, @${mention.account.acct} First and foremost, I am a chatbot fueled by Large Language Models and AI APIs. You can just chat with me and I will respond intelligently (I hope).\nI can also respond to the following commands if you start your mention with them:\nFOLLOWER ONLY - //image// and //image-assist//\nOPEN TO ALL - //news//, //help//, //commands//, //beta-application//, and //feedback//\nExample: //image// a cat eating a taco\nPlease check my GitHub link on my profile for the most up-to-date information on my commands and what they can do.`,
            tootVis,
            mention.status.id
        );
    } catch (error) {
        console.error(`Error handling help command: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function handleBetaApplicationCommand(mention, isFollowing = false) {
    const tootVis = mention ? mention.status.visibility : false || "public";
    if (isFollowing) {
        try {
            await postToot(
                `Hello, @${mention.account.acct} I am already following you! Please try a 'follower only' command. If you have issues please use //feedback// to let me know.`,
                tootVis,
                mention.status.id
            );
        } catch (error) {
            console.error("Error handling beta application command:", error);
            throw error;
        }
    } else {
        try {
            await postToot(
                `Hello, @${mention.account.acct} If you would like to help us test this bot, please apply at https://forms.gle/drpUrRnhwioXuiYU7.`,
                tootVis,
                mention.status.id
            );
        } catch (error) {
            console.error("Error handling beta application command:", error);
            throw error;
        }
    }
}

async function handleStatusCommand(mention) {
    try {
        const is_admin = await isAdmin(mention.account.acct);
        const tootVis = mention ? mention.status.visibility : false || "public";
        if (!is_admin) {
            await postToot(
                `Hello, @${mention.account.acct} You are not authorized to use this command.`,
                tootVis,
                mention.status.id
            );
        } else {
            let status = await getStatus();
            if (tootVis == "direct") {
                status = `@${mention.account.acct} ${status}`;
            }
            await postToot(status, tootVis, mention.status.id);
        }
    } catch (error) {
        console.error("Error handling status command:", error);
        throw error;
    }
}

async function handleRegularMention(mention) {
    try {
        let conversation = mention_prompt.slice();
        await fetchConversation(mention.status.id, conversation);

        const systemMessage = {
            role: "system",
            content: `The user's handle is @${mention.account.acct}.`,
        };
        conversation.push(systemMessage);

        await addContext(conversation);

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: conversation,
        });

        let reply = response.data.choices[0].message.content;
        const tootVis = mention ? mention.status.visibility : false || "public";
        if (tootVis == "direct") {
            reply = `@${mention.account.acct} ${reply}`;
        }
        await postToot(reply, tootVis, mention.status.id, mention.account.acct);

        // Find the last user message in the conversation
        const lastUserMessage = conversation
            .slice()
            .reverse()
            .find((message) => message.role === "user");
        if (lastUserMessage) {
            const tokens = response.data.choices[0].tokens;
            logUsage(mention.account.acct, mention.status.id, lastUserMessage.content, tokens, "chat");
        }
    } catch (error) {
        console.error(`OpenAI Error: ${error}`);
        throw error;
    }
}

async function handleFeedbackCommand(mention, prompt, isFollowing = false) {
    try {
        logFeedback(mention.account.id, mention.status.id, prompt);
        const tootVis = mention ? mention.status.visibility : false || "public";
        await postToot(
            `Thank you for your feedback, @${mention.account.acct}! I have logged it and will use it to improve the bot.`,
            tootVis,
            mention.status.id
        );

        if (process.env.MASTODON_ADMIN_ALERT_USERNAME) {
            await postToot(
                `${process.env.MASTODON_ADMIN_ALERT_USERNAME} New feedback has been logged from user ${mention.account.acct}.\nIs follower: ${isFollowing}`,
                "direct",
                null
            );
        }
    } catch (error) {
        console.error(`Feedback Error: ${error}`);
        throw error;
    }
}

async function handleTootNowCommand(mention, prompt) {
    try {
        const is_admin = await isAdmin(mention.account.acct);
        const tootVis = mention ? mention.status.visibility : false || "public";
        console.log("is_admin:", is_admin);
        if (!is_admin) {
            await postToot(
                `Sorry, @${mention.account.acct} you are not authorized to use this command.`,
                tootVis,
                mention.status.id
            );
        } else {
            const genToot = await generateToot(prompt);
            await postToot(genToot, "public", null, mention.account.acct);
        }
    } catch (error) {
        console.error(`Toot Now Error: ${error}`);
        throw error;
    }
}

async function handleImageNowCommand(mention, prompt) {
    try {
        const is_admin = await isAdmin(mention.account.acct);
        const tootVis = mention ? mention.status.visibility : false || "public";
        if (!is_admin) {
            await postToot(
                `Sorry, @${mention.account.acct} you are not authorized to use this command.`,
                tootVis,
                mention.status.id
            );
        } else {
            const genImage = await generateImagePrompt(prompt);
            await handleImageCommand(null, genImage, true);
        }
    } catch (error) {
        console.error(`Image Now Error: ${error}`);
        throw error;
    }
}

async function handleImageLoop() {
    const prompt = await generateImagePrompt();
    handleImageCommand(null, prompt, true);
    const now = moment().tz("America/Los_Angeles");
    console.log(`Image loop called at ${now.format()}`);
}

async function handleTootLoop() {
    const toot = await generateToot();
    postToot(toot, "public", null);
    const now = moment().tz("America/Los_Angeles");
    console.log(`Toot loop called at ${now.format()}`);
}

async function handleRssLoop() {
    const newItems = await rss.checkNewItems();
    if (newItems.length > 0) {
        for (const item of newItems) {
            try {
                const toot = await generateToot(false, item);
                postToot(toot, "public", null);
                rss.logItem(item.guid[0]);
            } catch (error) {
                console.error("Error processing RSS item:", error);
            }
        }
    }
    console.log(`${newItems.length} new RSS items processed at ${new Date()}`);
}

async function handleLimitReached(mention) {
    await dismissNotification(mention.id);
    const tootVis = mention ? mention.status.visibility : false || "public";
    await postToot(
        `Sorry, @${mention.account.acct} you have reached the maximum number of mentions per hour. Please try again later.`,
        tootVis,
        mention.status.id
    );
}

//
//
//  Generator Functions
//
//

async function generateImagePrompt(uPrompt = false) {
    if (uPrompt) {
        uPrompt =
            "Please create an image generation prompt including subject, scene, and style cues, as well as related artist names, to ensure a high quality generation. Keep it two sentences or less. This is my idea: " +
            uPrompt;
    } else {
        uPrompt =
            "Please create an image generation prompt including subject, scene, and style cues, as well as related artist names, to ensure a high quality generation. Keep it two sentences or less. What image would you like to create?";
    }
    try {
        const msg = [
            {
                role: "system",
                content:
                    "You are Mr. Roboto! You are connected to a Mastodon social bot. Your current task is to write an image generation prompt, which will be used to automatically generate an image via DALL-E and post to a Mastodon account. You must provide a prompt which will be turned into an image and posted automatically. There is no human intervention. Limit your response to 500 characters.",
            },
        ];

        if (example_image_prompts.length > 0) {
            msg.push({
                role: "system",
                content: "example responses:",
            });
            for (const example in example_image_prompts) {
                msg.push({
                    role: "system",
                    content: example_image_prompts[example],
                });
            }
        }

        msg.push({
            role: "user",
            content: uPrompt,
        });

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: msg,
        });

        const prompt = response.data.choices[0].message.content;
        return prompt;
    } catch (error) {
        console.error(`OpenAI Error: ${error}`);
        throw error;
    }
}

async function generateToot(prompt = false, rss = false) {
    try {
        const msg = [
            {
                role: "system",
                content:
                    "You are Mr. Roboto! You are connected to a Mastodon social bot. Your current task is to write a toot, which will be posted to a Mastodon account. Do not remind me that you are a language model, or claim that you do not have preferences. You must provide a toot which will be posted automatically. There is no human intervention. Limit your response to 500 characters.",
            },
            {
                role: "system",
                content: "Please create a toot. What would you like to say?",
            },
        ];

        await addContext(msg);

        if (prompt && !rss) {
            msg.push({
                role: "user",
                content: `Your admin would like you to discuss: ${prompt}`,
            });
        }

        if (rss) {
            const title = rss.title;
            const pubDate = rss.pubDate;
            const link = rss.link;
            const content = rss["content:encoded"][0];
            msg.push(
                {
                    role: "user",
                    content: `We posted a new blog post! Title: ${title}`,
                },
                {
                    role: "user",
                    content: `Published: ${pubDate}`,
                },
                {
                    role: "user",
                    content: `Link: ${link}`,
                },
                {
                    role: "user",
                    content: `Content (first 500 chars): ${content.substring(0, 500)}`,
                },
                {
                    role: "user",
                    content: `Please summarize the new blog post into a new toot, inviting our followers to read the full post. Please include a link.`,
                }
            );
        }

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: msg,
        });

        const tokens = response.data.choices[0].message.tokens;
        logUsage("mrroboto", null, "generate toot", tokens, "chat");

        const toot = response.data.choices[0].message.content;
        if (toot.trim() === "") {
            console.log("Generated toot is empty");
            reject("Generated toot is empty");
        } else {
            return toot;
        }
    } catch (error) {
        console.error(`OpenAI Error: ${error}`);
        throw error;
    }
}

//
//
//  Main Function
//
//

async function main() {
    const botStartTime = moment().tz("UTC");
    console.log(`Bot started at ${botStartTime.format()}`);
    const args = process.argv.slice(2);
    const noLoop = args.includes("--no-loop");
    const noImage = args.includes("--no-image");
    const noToot = args.includes("--no-toot");
    const noMention = args.includes("--no-mention");
    const noRss = args.includes("--no-rss");
    const tootNow = args.includes("--toot-now");
    const imageNow = args.includes("--image-now");
    const rssNow = args.includes("--rss-now");
    const isDevMode = args.includes("--dev-mode");

    mastodon = initMastodon(isDevMode);

    if (!noLoop) {
        if (!noMention) {
            let mentionCronJob;
            const mentionInterval = config.intervals.mentionInterval;
            mentionCronJob = cron.schedule(mentionInterval, () => {
                checkMentions();
            });
        }

        if (!noRss) {
            let rssCronJob;
            const rssInterval = config.intervals.rssInterval;
            rssCronJob = cron.schedule(rssInterval, () => {
                handleRssLoop();
            });
        }

        if (!noImage) {
            let imageCronJobs = [];
            const imageTimes = config.intervals.imageTimes;
            imageCronJobs = imageTimes.map((time) => {
                return cron.schedule(time, handleImageLoop, {
                    timezone: "America/Los_Angeles",
                });
            });
        }

        if (!noToot) {
            let tootCronJobs = [];
            const tootTimes = config.intervals.tootTimes;
            tootCronJobs = tootTimes.map((time) => {
                return cron.schedule(time, handleTootLoop, {
                    timezone: "America/Los_Angeles",
                });
            });
        }
    }

    if (tootNow) {
        await handleTootLoop();
    }
    if (imageNow) {
        await handleImageLoop();
    }
    if (rssNow) {
        await handleRssLoop();
    }
    if (!noMention) {
        await checkMentions();
    }
}

// async function testMode() {
//     // code to run in test mode
// }
// testMode();

//
//
//  Run Main Function
//
//
main(); // disable this line when running in test mode
