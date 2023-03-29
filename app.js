require("dotenv").config();
const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

function postToot(devMode = false) {
    const messages = [
        {
            role: "system",
            content:
                "You are chatGPToot! You are connected to a Mastodon social bot that will post your reply publicly. We do this once every 8 hours. This is your chance to speak to the world at large. Limit your replies to 500 characters. Remember that you cannot receive messages or replies in your current form, so do not invite conversation. This is a one-way communication. Avoid introductions, as this will get tiresome. Focus on stream of thought.",
        },
        { role: "user", content: "What would you like to say?" },
    ];
    openai
        .createChatCompletion({ model: "gpt-3.5-turbo", messages: messages })
        .then((response) => {
            const chatResponse = response.data.choices[0].message.content;
            console.log(`OpenAI Completion Response: ${chatResponse}`);

            if (!devMode) {
                const mastodon = new M({
                    access_token: process.env.MASTODON_ACCESS_TOKEN,
                    api_url: process.env.MASTODON_API_URL,
                });

                mastodon
                    .post("statuses", {
                        status: chatResponse,
                        visibility: "public",
                    })
                    .then((result) => {
                        console.log("Toot successfully posted:", result.data.content);
                    })
                    .catch((error) => {
                        console.error(`Mastodon Error: ${error}`);
                    });
            } else {
                console.log("Toot not posted (dev mode):", chatResponse);
            }

            console.log("Next toot will be posted at: ", new Date(Date.now() + 8 * 60 * 60 * 1000));
        })
        .catch((error) => {
            console.error(`OpenAI Error: ${JSON.stringify(error)}`);
        });
}

// Parse command line arguments
const args = process.argv.slice(2);
const devMode = args.includes("--dev");
const runNow = args.includes("--run-now");

// Run the code on an interval of 8 hours
setInterval(() => {
    postToot(devMode);
}, 8 * 60 * 60 * 1000);
if (devMode) {
    postToot(devMode);
}
console.log("ChatGPToot is running...");
if (runNow) {
    postToot(devMode);
} else {
    console.log("Next toot will be posted at: ", new Date(Date.now() + 8 * 60 * 60 * 1000));
}
