const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const fs = require("fs");
const path = require("path");
const request = require("request");
const cron = require("node-cron");
const moment = require("moment-timezone");
const { logUsage } = require("./usage_logger");
const { logFeedback, countFeedback } = require("./feedback_logger");
const { rssHandler } = require("./rss_handler");
const config = require(path.join(__dirname, "..", "config.json"));
const rss_urls = config.rss_urls;
const rss = new rssHandler(rss_urls);
const example_image_prompts = config.example_image_prompts;
const messages = config.messages;
const { openai, initMastodon, rateLimiterGroup } = require("./init");
let mastodon;

//
//
//  Utility functions
//
//

function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        try {
            request.head(url, function (err, res, body) {
                request(url).pipe(fs.createWriteStream(dest)).on("close", resolve).on("error", reject);
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function addContext(msgs) {
    // const topTags = await getTrendingTags();
    const date = new Date();
    const systemMessage = {
        role: "system",
        content: `The current date is ${date.toLocaleString("en-US", {
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
    msgs.push(systemMessage);
}

async function postToot(status, visibility, in_reply_to_id) {
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
                    status: `${tootText} [${tootCount}/${totalToots}]`,
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
        // const trends = await getTrendingTags();

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
    // disabled because botsin.space api disabled trending tags data
}

async function fetchConversation(statusId, messages = [], tokens = 0) {
    try {
        const status = await mastodon.get(`statuses/${statusId}`);
        const inReplyToId = status.data.in_reply_to_id;
        const content = status.data.content.replace(/<[^>]*>?/gm, "");
        const newTokens = tokens + content.split(" ").length;

        if (newTokens <= config.max_tokens) {
            if (inReplyToId) {
                await fetchConversation(inReplyToId, messages, newTokens);
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

                rateLimiter.schedule(() => processMention(mention, following));
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
    await dismissNotification(mention.id);
    const isFollowing = following.some((followed) => followed.id === mention.account.id);

    if (isFollowing) {
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
                handleImageCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//img-asst//":
            case "//image-assist//":
                handleImageAssistCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//help//":
            case "//commands//":
                handleHelpCommand(mention).catch((error) => console.error(error));
                break;
            case "//comment//":
            case "//feedback//":
                handleFeedbackCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//beta//":
            case "//beta-application//":
                handleBetaApplicationCommand(mention).catch((error) => console.error(error));
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
    } else {
        console.log("Not following user.");
        const reply =
            "I'm sorry, I'm not following you. I am only responding to mentions from users I am following. If you would like to help us test, you can apply at https://forms.gle/drpUrRnhwioXuiYU7";
        postToot(reply, "public", mention.status.id).catch((error) => console.error(error));
    }
}

async function handleImageCommand(mention, prompt) {
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
        });

        const mediaId = mediaResponse.data.id;
        let tootText;
        let tootParams = {
            media_ids: [mediaId],
            visibility: "public",
        };

        if (mention) {
            tootText = `@${mention.account.acct} Image prompt: ${prompt.substring(
                0,
                484 - mention.account.username.length
            )}`;
            tootParams.status = tootText;
            tootParams.in_reply_to_id = mention.status.id;

            logUsage(mention.account.id, mention.status.id, prompt, tokens, "image");
        } else {
            tootText = `Image prompt: ${prompt.substring(0, 486)}`;
            tootParams.status = tootText;

            logUsage(process.env.MASTODON_ACCOUNT_ID, null, "generate image", tokens, "image");
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
}

async function handleImageAssistCommand(mention, prompt) {
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
        });

        const mediaId = mediaResponse.data.id;
        let tootText;
        let tootParams = {
            media_ids: [mediaId],
            visibility: "public",
        };

        if (mention) {
            tootText = `@${mention.account.acct} Image prompt: ${newPrompt.substring(
                0,
                484 - mention.account.username.length
            )}`;
            tootParams.status = tootText;
            tootParams.in_reply_to_id = mention.status.id;

            logUsage(mention.account.id, mention.status.id, prompt, tokens, "image");
        } else {
            tootText = `Image prompt: ${newPrompt.substring(0, 486)}`;
            tootParams.status = tootText;

            logUsage(process.env.MASTODON_ACCOUNT_ID, null, "generate image", tokens, "image");
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
}

async function handleHelpCommand(mention) {
    try {
        await postToot(
            `Hello, @${mention.account.acct} I will respond to the following commands if you start your mention with them: //image//, //help//, //commands//, //beta-application//, and //feedback//. Example: //image// a cat eating a taco`,
            "public",
            mention.status.id
        );
    } catch (error) {
        console.error(`Error handling help command: ${JSON.stringify(error)}`);
        throw error;
    }
}

async function handleBetaApplicationCommand(mention) {
    try {
        await postToot(
            `Hello, @${mention.account.acct} If you would like to help us test this bot, please apply at https://forms.gle/drpUrRnhwioXuiYU7.`,
            "public",
            mention.status.id
        );
    } catch (error) {
        console.error("Error handling beta application command:", error);
        throw error;
    }
}

async function handleStatusCommand(mention) {
    try {
        const is_admin = await isAdmin(mention.account.acct);
        if (!is_admin) {
            await postToot(
                `Hello, @${mention.account.acct} You are not authorized to use this command.`,
                "public",
                mention.status.id
            );
        } else {
            const status = await getStatus();
            await postToot(status, "public", mention.status.id);
        }
    } catch (error) {
        console.error("Error handling status command:", error);
        throw error;
    }
}

async function handleRegularMention(mention) {
    try {
        let conversation = messages.slice();
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

        const reply = response.data.choices[0].message.content;
        await postToot(reply, "public", mention.status.id);

        // Find the last user message in the conversation
        const lastUserMessage = conversation
            .slice()
            .reverse()
            .find((message) => message.role === "user");
        if (lastUserMessage) {
            const tokens = response.data.choices[0].tokens;
            logUsage(mention.account.id, mention.status.id, lastUserMessage.content, tokens, "chat");
        }
    } catch (error) {
        console.error(`OpenAI Error: ${error}`);
        throw error;
    }
}

async function handleFeedbackCommand(mention, prompt) {
    try {
        logFeedback(mention.account.id, mention.status.id, prompt);
        await postToot(
            `Thank you for your feedback, @${mention.account.acct}! I have logged it and will use it to improve the bot.`,
            "public",
            mention.status.id
        );

        if (process.env.MASTODON_ADMIN_ALERT_USERNAME) {
            await postToot(
                `${process.env.MASTODON_ADMIN_ALERT_USERNAME} New feedback has been logged.`,
                "public",
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
        console.log("is_admin:", is_admin);
        if (!is_admin) {
            await postToot(
                `Sorry, @${mention.account.acct} you are not authorized to use this command.`,
                "public",
                mention.status.id
            );
        } else {
            const genToot = await generateToot(prompt);
            await postToot(genToot, "public", null);
        }
    } catch (error) {
        console.error(`Toot Now Error: ${error}`);
        throw error;
    }
}

async function handleImageNowCommand(mention, prompt) {
    try {
        const is_admin = await isAdmin(mention.account.acct);
        if (!is_admin) {
            await postToot(
                `Sorry, @${mention.account.acct} you are not authorized to use this command.`,
                "public",
                mention.status.id
            );
        } else {
            const genImage = await generateImagePrompt(prompt);
            await handleImageCommand(null, genImage);
        }
    } catch (error) {
        console.error(`Image Now Error: ${error}`);
        throw error;
    }
}

async function handleImageLoop() {
    const prompt = await generateImagePrompt();
    handleImageCommand(null, prompt);
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
    const now = moment().tz("America/Los_Angeles");
    console.log(`RSS loop called at ${now.format()} - ${newItems.length} new items processed`);
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
        logUsage(process.env.MASTODON_ACCOUNT_ID, null, "generate toot", tokens, "chat");

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
            const mentionInterval = "*/15 * * * * *"; // Check mentions every 15 seconds
            mentionCronJob = cron.schedule(mentionInterval, () => {
                checkMentions();
            });
        }

        if (!noRss) {
            let rssCronJob;
            const rssInterval = "*/15 * * * *"; // Check RSS every 15 minutes
            rssCronJob = cron.schedule(rssInterval, () => {
                handleRssLoop();
            });
        }

        if (!noImage) {
            let imageCronJobs = [];
            const imageTimes = [
                "0 9 * * *", // 9:00 AM Pacific local time
                "5 12 * * *", // 12:05 PM Pacific local time
                "0 16 * * *", // 4:00 PM Pacific local time
                "5 21 * * *", // 9:05 PM Pacific local time
            ];
            imageCronJobs = imageTimes.map((time) => {
                return cron.schedule(time, handleImageLoop, {
                    timezone: "America/Los_Angeles",
                });
            });
        }

        if (!noToot) {
            let tootCronJobs = [];
            const tootTimes = [
                "0 8 * * *", // 8:00 AM Pacific local time
                "0 12 * * *", // 12:00 PM Pacific local time
                "0 17 * * *", // 5:00 PM Pacific local time
                "0 21 * * *", // 9:00 PM Pacific local time
            ];
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

//
//
//  Run Main Function
//
//
main();
