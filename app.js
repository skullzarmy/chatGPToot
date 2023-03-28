require("dotenv").config();
const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

const messages = [
    {
        role: "system",
        content:
            "You are connected to a Mastodon social bot that will post your reply publicly. We do this once a day. This is your daily chance to speak to the world at large. Limit your replies to 500 characters.",
    },
    { role: "user", content: "What would you like to say today?" },
];

openai
    .createChatCompletion({ model: "gpt-3.5-turbo", messages: messages })
    .then((response) => {
        const chatResponse = response.data.choices[0].message.content;
        console.log(`OpenAI Completion Response: ${chatResponse}`);

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
    })
    .catch((error) => {
        console.error(`OpenAI Error: ${JSON.stringify(error)}`);
    });
