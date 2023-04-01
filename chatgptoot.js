const dotenv = require("dotenv");
dotenv.config();
const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");
const fs = require("fs");
const path = require("path");
const request = require("request");

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

function downloadImage(url, dest, cb) {
    request.head(url, function (err, res, body) {
        request(url).pipe(fs.createWriteStream(dest)).on("close", cb);
    });
}

function postToot(status, visibility, in_reply_to_id) {
    return mastodon.post("statuses", {
        status,
        visibility,
        in_reply_to_id,
    });
}

function dismissNotification(id) {
    return mastodon.post(`notifications/${id}/dismiss`);
}

function getFollowing() {
    return mastodon.get(`accounts/${process.env.MASTODON_ACCOUNT_ID}/following`);
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

        if (command === "//image//") {
            handleImageCommand(mention, prompt);
        } else if (command === "//help//" || command === "//commands//") {
            handleHelpCommand(mention);
        } else {
            handleRegularMention(mention);
        }
    } else {
        console.log("Not following user.");
        const reply =
            "I'm sorry, I'm not following you. I am only responding to mentions from users I am following. Please let us know if you would like to help us test this bot and how you would like to use it to be considered.";
        await postToot(reply, "public", mention.status.id);
        await dismissNotification(mention.id);
    }
}

async function handleImageCommand(mention, prompt) {
    try {
        const response = await openai.createImage({ prompt, n: 1, size: "512x512" });
        const imageUrl = response.data.data[0].url;

        const filename = `new_toot_${Date.now()}.png`;
        const filepath = path.join(__dirname, "media", filename);

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
                const tootResponse = await mastodon
                    .post("statuses", {
                        status: tootText,
                        in_reply_to_id: mention.status.id,
                        media_ids: [mediaId],
                        visibility: "public",
                    })
                    .then((tootResponse) => {
                        console.log("Toot with image posted:", tootResponse.data.uri);
                    })
                    .catch((error) => {
                        console.error("Error posting toot with image:", error);
                    });
                await dismissNotification(mention.id);
            } else {
                const tootText = `Image prompt: ${prompt.substring(0, 486)}`;
                const tootResponse = await mastodon
                    .post("statuses", {
                        status: tootText,
                        media_ids: [mediaId],
                        visibility: "public",
                    })
                    .then((tootResponse) => {
                        console.log("Toot with image posted:", tootResponse.data.uri);
                    })
                    .catch((error) => {
                        console.error("Error posting toot with image:", error);
                    });
            }
        });
    } catch (error) {
        console.error(`OpenAI Error: ${JSON.stringify(error)}`);
    }
}

async function handleHelpCommand(mention) {
    await postToot(
        `Hello, @${mention.account.username} I will respond to the following commands if you start your mention with them: //image//, //help//, //commands//. Example: //image// a cat eating a taco`,
        "public",
        mention.status.id
    );
    await dismissNotification(mention.id);
}

async function handleRegularMention(mention) {
    try {
        let conversation = messages.slice();
        await fetchConversation(mention.status.id, conversation);

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: conversation,
        });

        const reply = response.data.choices[0].message.content;
        await postToot(reply, "public", mention.status.id);
        await dismissNotification(mention.id);
    } catch (error) {
        console.error(`OpenAI Error: ${error}`);
    }
}

async function generateImagePrompt() {
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
    return prompt;
}

async function generateToot() {
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

    const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: msg,
    });

    const toot = response.data.choices[0].message.content;
    return toot;
}

async function checkMentions() {
    try {
        const notifications = await mastodon.get("notifications", { types: ["mention"] });
        console.log(`${notifications.data.length} mentions found at ${new Date()}`);
        if (notifications.data.length > 0) {
            const followingResponse = await getFollowing();
            const following = followingResponse.data;

            for (const mention of notifications.data) {
                await processMention(mention, following);
            }
        }
    } catch (error) {
        console.error("Error checking mentions:", error);
    }
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
