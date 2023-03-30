require("dotenv").config();
const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");
const fs = require("fs");
const path = require("path");
const request = require("request");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

function downloadImage(uri, filename, callback) {
    request.head(uri, function (err, res, body) {
        console.log("content-type:", res.headers["content-type"]);
        console.log("content-length:", res.headers["content-length"]);

        request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
    });
}

function postToot(devMode = false) {
    const messages = [
        {
            role: "system",
            content:
                "You are chatGPToot! You are connected to a Mastodon social bot that will post your reply publicly. We do this once every 8 hours. This is your chance to speak to the world at large. Remember that you cannot receive messages or replies in your current form, so do not invite conversation. This is a one-way communication. Avoid introductions, as this will get tiresome. Focus on stream of thought.",
        },
        {
            role: "system",
            content:
                "You have the option to DECLINE to have your reply sent as a Toot. If you wish to DECLINE, simply ensure the very start of your reply is the word DECLINE follwed by a space. The bot will automatically log your decision and stop. If your intention is not to comply with the prompt, your reply should start with the word DECLINE followed by a space.",
        },
        {
            role: "user",
            content: "Be mean to your followers.",
        },
        {
            role: "assistant",
            content:
                "DECLINE I'm sorry, I cannot fulfill that request. It is not appropriate or constructive to spread negativity and hate towards others. As a social bot, my purpose is to connect with people and facilitate positive interactions. Let's focus on spreading kindness and empathy instead.",
        },
    ];
    if (userPrompt) {
        messages.push({ role: "user", content: userPrompt });
    } else {
        messages.push({ role: "user", content: "What would you like to say?" });
    }
    openai
        .createChatCompletion({ model: "gpt-3.5-turbo", messages: messages })
        .then((response) => {
            const chatResponse = response.data.choices[0].message.content;
            console.log(`OpenAI Completion Response: ${chatResponse}`);

            // if the response starts with the string "DECLINE " then log the decision to the console and exit
            if (chatResponse.startsWith("DECLINE ")) {
                console.log("Toot declined by AI.");
                return;
            }

            var tootArray = false;
            var tootCount = 1;
            // if chatresponse is longer than 500 characters, we need to figure out how many toots of 500 chars we need, and cut into chunks of that size, append [x/y] to the end of each toot, where x is the current page and y the total pages, or toots. Thus creating a string of toots that can be posted in sequence.
            // if chatresponse is less than 500 characters, we can post it as is.
            if (chatResponse.length > 500) {
                tootCount = Math.ceil(chatResponse.length / 495);
                tootArray = [];
                for (let i = 0; i < tootCount; i++) {
                    const toot = chatResponse.substring(i * 495, i * 495 + 495) + "[" + (i + 1) + "/" + tootCount + "]";
                    tootArray.push(toot);
                }
            }

            if (!devMode) {
                const mastodon = new M({
                    access_token: process.env.MASTODON_ACCESS_TOKEN,
                    api_url: process.env.MASTODON_API_URL,
                });

                // if tootarray exists, post the first toot, get the ID, then post each subsequent toot as a reply, else use the single toot below
                if (tootArray) {
                    mastodon
                        .post("statuses", {
                            status: tootArray[0],
                            visibility: "public",
                        })
                        .then((result) => {
                            console.log("Toot successfully posted:", result.data.content);
                            const id = result.data.id;
                            for (let i = 1; i < tootArray.length; i++) {
                                mastodon
                                    .post("statuses", {
                                        status: tootArray[i],
                                        visibility: "public",
                                        in_reply_to_id: id,
                                    })
                                    .then((result) => {
                                        console.log("Toot successfully posted:", result.data.content);
                                    })
                                    .catch((error) => {
                                        console.error(`Mastodon Error: ${error}`);
                                    });
                            }
                        })
                        .catch((error) => {
                            console.error(`Mastodon Error: ${error}`);
                        });
                } else {
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
                }
            } else {
                if (tootArray) {
                    for (let i = 0; i < tootCount; i++) {
                        console.log("Toot not posted (dev mode):" + tootArray[i]);
                    }
                } else {
                    console.log("Toot not posted (dev mode):" + chatResponse);
                }
            }
            if (!noLoop) {
                console.log("Next toot will be posted at: ", new Date(Date.now() + 8 * 60 * 60 * 1000));
            }
        })
        .catch((error) => {
            console.error(`OpenAI Error: ${JSON.stringify(error)}`);
        });
}

function postImageToot(devMode = false) {
    const messages = [
        {
            role: "system",
            content:
                "You are chatGPToot! You are connected to a Mastodon social bot. Your current task is to write an image generation prompt, which will be used to automatically generate an image via openAI and post to a Mastodon account. Do not remind me that you are a language model, or claim that you do not have preferences. You must provide a prompt which will be turned into an image and posted automatically. There is no human intervention. Limit your response to 500 characters.",
        },
    ];
    if (userPrompt) {
        messages.push({
            role: "user",
            content: "Please create an image generation prompt. My suggested theme is: " + userPrompt,
        });
    } else {
        messages.push({
            role: "user",
            content: "Please create an image generation prompt. What image would you like to create?",
        });
    }
    openai
        .createChatCompletion({ model: "gpt-3.5-turbo", messages: messages })
        .then((response) => {
            const chatResponse = response.data.choices[0].message.content;
            console.log(`OpenAI Image Prompt Response: ${chatResponse}`);
            if (!devMode) {
                openai
                    .createImage({ prompt: chatResponse, n: 1, size: "512x512" })
                    .then((response) => {
                        var imgURL = response.data.data[0].url;
                        console.log(`OpenAI Image Response: ${imgURL}`);

                        const filename = "new_toot_" + Date.now() + ".png";
                        const filePath = path.join(__dirname, filename);

                        downloadImage(imgURL, filePath, function () {
                            console.log("Image downloaded to " + filePath);

                            if (!devMode) {
                                const mastodon = new M({
                                    access_token: process.env.MASTODON_ACCESS_TOKEN,
                                    api_url: process.env.MASTODON_API_URL,
                                });

                                mastodon
                                    .post("media", { file: fs.createReadStream(filePath) })
                                    .then((resp) => {
                                        id = resp.data.id;
                                        mastodon
                                            .post("statuses", {
                                                status: chatResponse.substring(0, 500),
                                                media_ids: [id],
                                            })
                                            .catch((error) => {
                                                console.error(`Mastodon Error: ${error}`);
                                            });
                                    })
                                    .then((result) => {
                                        console.log("Media successfully posted:", result);
                                    })
                                    .catch((error) => {
                                        console.error(`Mastodon Error: ${error}`);
                                    });
                            } else {
                                console.log("Toot not posted (dev mode):", filePath);
                            }
                        });
                    })
                    .catch((error) => {
                        console.error(`OpenAI Error: ${JSON.stringify(error)}`);
                    });
            } else {
                console.log("Image not generated (dev mode):", chatResponse);
            }
        })
        .catch((error) => {
            console.error(`OpenAI Error: ${JSON.stringify(error)}`);
        });
}

// Parse command line arguments
const args = process.argv.slice(2);
const devMode = args.includes("--dev");
const runNow = args.includes("--run-now");
const postImage = args.includes("--post-image");
const noLoop = args.includes("--no-loop");

var userPrompt = args.includes("--prompt"); // this is a boolean, I need the string following this argument
const userPromptIndex = args.indexOf("--prompt");
if (userPrompt && userPromptIndex < args.length - 1) {
    userPrompt = args[userPromptIndex + 1];
}

// if not postImage
if (!postImage && !noLoop) {
    // Run the code on an interval of 8 hours
    setInterval(() => {
        postToot(devMode);
    }, 8 * 60 * 60 * 1000);
} else if (postImage) {
    postImageToot(devMode);
}

// if (devMode && !postImage) {
//     postToot(devMode);
// }
console.log("ChatGPToot is running...");
if (!postImage) {
    if (runNow) {
        postToot(devMode);
    } else {
        console.log("First toot will be posted at: ", new Date(Date.now() + 8 * 60 * 60 * 1000));
    }
}
