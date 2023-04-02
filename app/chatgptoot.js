const dotenv = require("dotenv");
dotenv.config();
const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");
const fs = require("fs");
const path = require("path");
const request = require("request");
const { Group } = require("bottleneck");
const { logUsage } = require("./usage_logger");
const { logFeedback } = require("./feedback_logger");

const requiredEnvVars = ["OPENAI_KEY", "MASTODON_ACCESS_TOKEN", "MASTODON_API_URL", "MASTODON_ACCOUNT_ID"];
let missingVars = [];
requiredEnvVars.forEach((envVarName) => {
    if (!process.env[envVarName]) {
        missingVars.push(envVarName);
    }
});
if (missingVars.length > 0) {
    console.error("Missing the following required environment variables. Please check your .env file.");
    console.error(missingVars);
    process.exit(1);
}

const mastodon = new M({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: process.env.MASTODON_API_URL,
});

const configuration = new Configuration({ apiKey: process.env.OPENAI_KEY });
const openai = new OpenAIApi(configuration);

const messages = [
    {
        role: "system",
        content:
            "You are chatGPToot! You are connected to a Mastodon social bot. Your current task is to respond to a direct mention, which will be posted to your Mastodon account. There is no human intervention. Limit your response to 500 characters.",
    },
];

const MAX_TOKENS = 3000; // You can adjust this value based on your requirements

const rateLimiterGroup = new Group({
    maxConcurrent: 1, // Only 1 request per user at a time
    minTime: 1000, // 1 second between requests
});

function downloadImage(url, dest, cb) {
    request.head(url, function (err, res, body) {
        request(url).pipe(fs.createWriteStream(dest)).on("close", cb);
    });
}

async function addContext(msgs) {
    const topTags = await getTrendingTags();
    const date = new Date();
    const systemMessage = {
        role: "system",
        content: `The current date is ${date.toLocaleString("en-US", {
            timeZone: "UTC",
        })} in UTC. The top tags are ${topTags.join(", ")}.`,
    };
    msgs.push(systemMessage);
}

function postToot(status, visibility, in_reply_to_id) {
    return new Promise(async (resolve, reject) => {
        try {
            const params = {
                status,
                visibility,
                ...(in_reply_to_id ? { in_reply_to_id } : {}),
            };
            const result = await mastodon.post("statuses", params);
            resolve(result);
        } catch (error) {
            reject(`Error posting toot: ${error}`);
        }
    });
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

function getFollowing() {
    return mastodon.get(`accounts/${process.env.MASTODON_ACCOUNT_ID}/following`);
}

function isAdmin(userId) {
    if (!process.env.MASTODON_ADMIN_ACCOUNT_IDS) {
        return false;
    } else {
        return process.env.MASTODON_ADMIN_ACCOUNT_IDS.split(",").includes(userId);
    }
}

async function getTrendingTags() {
    const response = await mastodon.get("trends/tags");
    const tags = response.data.map((tag) => tag.name);
    return tags;
}

async function fetchConversation(statusId, messages = [], tokens = 0) {
    try {
        const status = await mastodon.get(`statuses/${statusId}`);
        const inReplyToId = status.data.in_reply_to_id;
        const content = status.data.content.replace(/<[^>]*>?/gm, "");
        const newTokens = tokens + content.split(" ").length;

        if (newTokens <= MAX_TOKENS) {
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

async function processMention(mention, following) {
    const isFollowing = following.some((followed) => followed.id === mention.account.id);

    if (isFollowing) {
        const content = mention.status.content
            .replace(/<[^>]*>?/gm, "")
            .replace("@chatGPToot", "")
            .trim();
        const commandIndex = content.indexOf("//");
        const commandEndIndex =
            content.indexOf(" ", commandIndex) !== -1 ? content.indexOf(" ", commandIndex) : content.length;
        const command = content.slice(commandIndex, commandEndIndex).trim();
        const prompt = content.replace(command, "").trim();

        console.log("Content: ", content);
        console.log("Command: ", command);
        console.log("Prompt: ", prompt);

        switch (command) {
            case "//image//":
                handleImageCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//help//":
            case "//commands//":
                handleHelpCommand(mention).catch((error) => console.error(error));
                break;
            case "//feedback//":
                handleFeedbackCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//beta-application//":
                handleBetaApplicationCommand(mention).catch((error) => console.error(error));
                break;
            case "//toot-now//":
                handleTootNowCommand(mention, prompt).catch((error) => console.error(error));
                break;
            case "//image-now//":
                handleImageNowCommand(mention, prompt).catch((error) => console.error(error));
                break;
            default:
                handleRegularMention(mention).catch((error) => console.error(error));
        }
    } else {
        console.log("Not following user.");
        const reply =
            "I'm sorry, I'm not following you. I am only responding to mentions from users I am following. If you would like to help us test, you can apply at https://forms.gle/EpfnksenW4xbdcE4A";
        postToot(reply, "public", mention.status.id)
            .then(() => dismissNotification(mention.id))
            .catch((error) => console.error(error));
    }
}

async function handleImageCommand(mention, prompt) {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await openai.createImage({ prompt, n: 1, size: "512x512" });
            const imageUrl = response.data.data[0].url;
            const tokens = "unknown";

            const filename = `new_toot_${Date.now()}.png`;
            const filepath = path.join(__dirname, "..", "media", filename);

            downloadImage(imageUrl, filepath, async () => {
                console.log("Image downloaded to " + filepath);

                const mediaResponse = await mastodon.post("media", {
                    file: fs.createReadStream(filepath),
                });

                const mediaId = mediaResponse.data.id;
                if (mention) {
                    const tootText = `@${mention.account.username} Image prompt: ${prompt.substring(
                        0,
                        484 - mention.account.username.length
                    )}`;
                    await mastodon
                        .post("statuses", {
                            status: tootText,
                            in_reply_to_id: mention.status.id,
                            media_ids: [mediaId],
                            visibility: "public",
                        })
                        .then((tootResponse) => {
                            console.log("Toot with image posted:", tootResponse.data.uri);
                            resolve();
                        })
                        .catch((error) => {
                            console.error("Error posting toot with image:", error);
                        });
                    await dismissNotification(mention.id);
                    logUsage(mention.account.id, mention.status.id, prompt, tokens, "image");
                } else {
                    const tootText = `Image prompt: ${prompt.substring(0, 486)}`;
                    await mastodon
                        .post("statuses", {
                            status: tootText,
                            media_ids: [mediaId],
                            visibility: "public",
                        })
                        .then((tootResponse) => {
                            console.log("Toot with image posted:", tootResponse.data.uri);
                            resolve();
                        })
                        .catch((error) => {
                            console.error("Error posting toot with image:", error);
                        });
                    logUsage(process.env.MASTODON_ACCOUNT_ID, null, "generate image", tokens, "image");
                }
                fs.unlink(filepath, (err) => {
                    if (err) {
                        console.error("Error deleting file:", err);
                    } else {
                        console.log("File deleted:", filepath);
                    }
                });
            });
        } catch (error) {
            console.error(`OpenAI Error: ${JSON.stringify(error)}`);
            reject(error);
        }
    });
}

async function handleHelpCommand(mention) {
    return new Promise(async (resolve, reject) => {
        try {
            await postToot(
                `Hello, @${mention.account.username} I will respond to the following commands if you start your mention with them: //image//, //help//, //commands//, //beta-application//, and //feedback//. Example: //image// a cat eating a taco`,
                "public",
                mention.status.id
            );
            await dismissNotification(mention.id);
            resolve();
        } catch (error) {
            console.error(`Error handling help command: ${JSON.stringify(error)}`);
            reject(error);
        }
    });
}

async function handleBetaApplicationCommand(mention) {
    return new Promise(async (resolve, reject) => {
        try {
            await postToot(
                `Hello, @${mention.account.username} If you would like to help us test this bot, please apply at https://forms.gle/EpfnksenW4xbdcE4A.`,
                "public",
                mention.status.id
            );
            await dismissNotification(mention.id);
            resolve();
        } catch (error) {
            console.error("Error handling beta application command:", error);
            reject(error);
        }
    });
}

async function handleRegularMention(mention) {
    return new Promise(async (resolve, reject) => {
        try {
            let conversation = messages.slice();
            await fetchConversation(mention.status.id, conversation);

            const systemMessage = {
                role: "system",
                content: `The user's handle is @${mention.account.username}.`,
            };
            conversation.push(systemMessage);

            await addContext(conversation);

            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: conversation,
            });

            const reply = response.data.choices[0].message.content;
            await postToot(reply, "public", mention.status.id);
            await dismissNotification(mention.id);
            // Find the last user message in the conversation
            const lastUserMessage = conversation
                .slice()
                .reverse()
                .find((message) => message.role === "user");
            if (lastUserMessage) {
                const tokens = response.data.choices[0].tokens;
                logUsage(mention.account.id, mention.status.id, lastUserMessage.content, tokens, "chat");
            }
            resolve();
        } catch (error) {
            console.error(`OpenAI Error: ${error}`);
            reject(error);
        }
    });
}

async function handleFeedbackCommand(mention, prompt) {
    return new Promise(async (resolve, reject) => {
        try {
            logFeedback(mention.account.id, mention.status.id, prompt);
            await postToot(
                `Thank you for your feedback, @${mention.account.username}! I have logged it and will use it to improve the bot.`,
                "public",
                mention.status.id
            );
            await dismissNotification(mention.id);
            resolve();
        } catch (error) {
            console.error(`Feedback Error: ${error}`);
            reject(error);
        }
    });
}

async function handleTootNowCommand(mention, prompt) {
    return new Promise(async (resolve, reject) => {
        try {
            const is_admin = await isAdmin(mention.account.id);
            if (!is_admin) {
                await postToot(
                    `Sorry, @${mention.account.username} you are not authorized to use this command.`,
                    "public",
                    mention.status.id
                );
                await dismissNotification(mention.id);
                resolve();
                return;
            } else {
                const genToot = await generateToot(prompt);
                await postToot(genToot, "public", mention.status.id);
                await dismissNotification(mention.id);
                resolve();
            }
        } catch (error) {
            console.error(`Toot Now Error: ${error}`);
            reject(error);
        }
    });
}

async function handleImageNowCommand(mention, prompt) {
    return new Promise(async (resolve, reject) => {
        try {
            const is_admin = await isAdmin(mention.account.id);
            if (!is_admin) {
                await postToot(
                    `Sorry, @${mention.account.username} you are not authorized to use this command.`,
                    "public",
                    mention.status.id
                );
                await dismissNotification(mention.id);
                resolve();
                return;
            } else {
                const genImage = await generateImagePrompt(prompt);
                await postImage(genImage, "public", mention.status.id);
                await dismissNotification(mention.id);
                resolve();
            }
        } catch (error) {
            console.error(`Image Now Error: ${error}`);
            reject(error);
        }
    });
}

async function generateImagePrompt() {
    return new Promise(async (resolve, reject) => {
        try {
            const msg = [
                {
                    role: "system",
                    content:
                        "You are chatGPToot! You are connected to a Mastodon social bot. Your current task is to write an image generation prompt, which will be used to automatically generate an image via openAI and post to a Mastodon account. Do not remind me that you are a language model, or claim that you do not have preferences. You must provide a prompt which will be turned into an image and posted automatically. There is no human intervention. Limit your response to 500 characters.",
                },
                {
                    role: "system",
                    content: "Please create an image generation prompt. What image would you like to create?",
                },
            ];

            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: msg,
            });

            const prompt = response.data.choices[0].message.content;
            resolve(prompt);
        } catch (error) {
            console.error(`OpenAI Error: ${error}`);
            reject(error);
        }
    });
}

async function generateToot() {
    return new Promise(async (resolve, reject) => {
        try {
            const msg = [
                {
                    role: "system",
                    content:
                        "You are chatGPToot! You are connected to a Mastodon social bot. Your current task is to write a toot, which will be posted to a Mastodon account. Do not remind me that you are a language model, or claim that you do not have preferences. You must provide a toot which will be posted automatically. There is no human intervention. Limit your response to 500 characters.",
                },
                {
                    role: "system",
                    content: "Please create a toot. What would you like to say?",
                },
            ];

            await addContext(msg);

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
                resolve(toot);
            }
        } catch (error) {
            console.error(`OpenAI Error: ${error}`);
            reject(error);
        }
    });
}

async function checkMentions() {
    return new Promise(async (resolve, reject) => {
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
            resolve();
        } catch (error) {
            console.error("Error checking mentions:", error);
            reject(error);
        }
    });
}

async function main() {
    const args = process.argv.slice(2);
    const noLoop = args.includes("--no-loop");
    const noImage = args.includes("--no-image");
    const noToot = args.includes("--no-toot");
    const noMention = args.includes("--no-mention");
    const tootNow = args.includes("--toot-now");
    const imageNow = args.includes("--image-now");

    if (!noLoop) {
        if (!noMention) {
            let mentionLoop = setInterval(() => {
                checkMentions();
            }, 15000); // 15 seconds
        }
        if (!noImage) {
            let imageLoop = setInterval(async () => {
                const prompt = await generateImagePrompt();
                handleImageCommand(null, prompt);
            }, 28800000); // 8 hours
        }
        if (!noToot) {
            let tootLoop = setInterval(async () => {
                const toot = await generateToot();
                postToot(toot, "public", null);
            }, 28800000); // 8 hours
        }
    }
    if (tootNow) {
        const toot = await generateToot();
        postToot(toot, "public", null);
    }
    if (imageNow) {
        const prompt = await generateImagePrompt();
        handleImageCommand(null, prompt);
    }
    if (!noMention) {
        await checkMentions();
    }
}

main();
