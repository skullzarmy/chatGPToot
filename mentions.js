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
    const isFollowing = following.data.some((followed) => followed.id === mention.account.id);

    if (!isFollowing) {
        console.log("Not following user.");
        await postToot(
            "I'm sorry, I'm not following you. I am only responding to mentions from users I am following. Please let us know if you would like to help us test this bot and how you would like to use it to be considered.",
            "public",
            mention.status.id
        );
        await dismissNotification(mention.id);
        return;
    }

    const content = mention.status.content.replace(/<[^>]*>?/gm, "");
    const command = content.trim().substring(0, 2).toLowerCase();
    const text = content.substring(content.lastIndexOf("//") + 1).trim();

    console.log("Content: ", content);
    console.log("Command: ", command);
    console.log("Prompt: ", prompt);

    if (command === "//") {
        if (text.startsWith("image")) {
            handleImageCommand(mention, text.substring("image".length).trim());
        } else if (text.startsWith("help") || text.startsWith("commands")) {
            handleHelpCommand(mention);
        } else {
            handleHelpCommand(mention);
        }
    } else {
        handleRegularMention(mention);
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

            const media = await mastodon.post("media", {
                file: fs.createReadStream(filepath),
                in_reply_to_id: mention.status.id,
            });

            const id = media.data.id;
            await postToot(
                `@${mention.account.username} Image prompt: ${prompt.substring(0, 486)}`,
                "public",
                mention.status.id,
                id
            );
            await dismissNotification(mention.id);
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

function checkMentions() {
    mastodon
        .get("notifications", { types: ["mention"] })
        .then(async (response) => {
            console.log(response.data.length + " mentions found at " + new Date());

            for (const mention of response.data) {
                const following = await getFollowing();
                await processMention(mention, following);
            }
        })
        .catch((error) => console.error(`Mastodon Error: ${error}`));
}

const args = process.argv.slice(2);
const noLoop = args.includes("--no-loop");

if (!noLoop) {
    setInterval(() => {
        checkMentions();
    }, 15000);
}

checkMentions();
