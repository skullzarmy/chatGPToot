require("dotenv").config();
const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");
const fs = require("fs");
const path = require("path");
const request = require("request");

const mastodon = new M({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: process.env.MASTODON_API_URL,
});
const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
});
const openai = new OpenAIApi(configuration);
const messages = [
    {
        role: "system",
        content:
            "You are chatGPToot! You are connected to a Mastodon social bot. Your current task is to respond to a direct mention, which will be posted to your Mastodon account. There is no human intervention. Limit your response to 500 characters.",
    },
];
var devMode = false;

function downloadImage(uri, filename, callback) {
    request.head(uri, function (err, res, body) {
        request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
    });
}

function checkMentions() {
    mastodon
        .get("notifications", {
            types: ["mention"],
        })
        .then((resp_mentions) => {
            console.log(resp_mentions.data.length + " mentions found at " + new Date());
            // loop through each mention
            for (var i in resp_mentions.data) {
                mastodon
                    .get("accounts/" + process.env.MASTODON_ACCOUNT_ID + "/following")
                    .then((resp_following) => {
                        console.log(resp_following.data);
                        for (var i in resp_following.data) {
                            var mention = resp_mentions.data[i];
                            var msgs = messages;
                            // strip out all html elements from status.content and store in a new variable
                            var status = mention.status.content.replace(/<[^>]*>?/gm, "");
                            console.log(status);
                            if (resp_following.data[i].id === resp_mentions.data[i].account.id) {
                                // if the first 6 characters of status contains a / then it is a command. split before the last slash and take that as the commands, and save everything after the slash as the status. if there is no slash do nothing
                                var san_status = status.replace("@chatGPToot", "");
                                console.log(san_status);
                                var command = false;
                                if (san_status.trim().substring(0, 2) === "//") {
                                    command = san_status
                                        .substring(0, san_status.lastIndexOf("//"))
                                        .split("//")
                                        .filter((e) => e);
                                    // strip out the slashes from the commands
                                    command = command.map((e) => e.replace("//", ""));
                                    status = status.substring(status.lastIndexOf("//") + 1);
                                }
                                if (command) {
                                    console.log("user " + mention.account.username + " used commands: " + command);
                                    if (command.includes("image")) {
                                        openai
                                            .createImage({ prompt: status, n: 1, size: "512x512" })
                                            .then((response) => {
                                                var imgURL = response.data.data[0].url;
                                                console.log(`OpenAI Image Response: ${imgURL}`);

                                                const filename = "new_toot_" + Date.now() + ".png";
                                                // const filePath = path.join(__dirname, filename); - put the image inside a media folder at this directory
                                                const filePath = path.join(__dirname, "media", filename); // put the image inside a media folder at this directory

                                                downloadImage(imgURL, filePath, function () {
                                                    console.log("Image downloaded to " + filePath);
                                                    if (!devMode) {
                                                        mastodon
                                                            .post("media", {
                                                                file: fs.createReadStream(filePath),
                                                                in_reply_to_id: mention.status.id,
                                                            })
                                                            .then((resp) => {
                                                                id = resp.data.id;
                                                                mastodon
                                                                    .post("statuses", {
                                                                        status:
                                                                            "@" +
                                                                            mention.account.username +
                                                                            " Image prompt: " +
                                                                            status.substring(0, 486),
                                                                        media_ids: [id],
                                                                        in_reply_to_id: mention.status.id,
                                                                    })
                                                                    .catch((error) => {
                                                                        console.error(`Mastodon Error: ${error}`);
                                                                    });
                                                                console.log("Media successfully posted");
                                                                mastodon
                                                                    .post("notifications/" + mention.id + "/dismiss")
                                                                    .then((result) => {
                                                                        console.log("Notification cleared.");
                                                                    })
                                                                    .catch((error) => {
                                                                        console.error(`Mastodon Error: ${error}`);
                                                                    });
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
                                    }

                                    if (command.includes("help") || command.includes("commands")) {
                                        // use mastodon to reply with the list of commands (help or commands, and image) in the format "//help//" or "//image// a cat eating a taco"
                                        mastodon
                                            .post("statuses", {
                                                status:
                                                    "Hello, @" +
                                                    mention.account.username +
                                                    " I will respond to the following commands if you start your mention with them: //image//, //help//, //commands//. Example: //image// a cat eating a taco",
                                                visibility: "public",
                                                in_reply_to_id: mention.status.id,
                                            })
                                            .then((resp) => {
                                                mastodon
                                                    .post("notifications/" + mention.id + "/dismiss")
                                                    .then((result) => {
                                                        console.log("Notification cleared.");
                                                    })
                                                    .catch((error) => {
                                                        console.error(`Mastodon Error: ${error}`);
                                                    });
                                            })
                                            .catch((error) => {
                                                console.error(`Mastodon Error: ${error}`);
                                            });
                                    }
                                } else {
                                    msgs.push(
                                        {
                                            role: "system",
                                            content: "user " + mention.account.username + " mentioned you, saying:",
                                        },
                                        {
                                            role: "user",
                                            content: status,
                                        }
                                    );
                                    openai
                                        .createChatCompletion({ model: "gpt-3.5-turbo", messages: messages })
                                        .then((resp_chatcomp) => {
                                            var reply = resp_chatcomp.data.choices[0].message.content;
                                            console.log(reply);
                                            var tootArray = false;
                                            // if chatresponse is less than 500 characters, we can post it as is.
                                            if (reply.length > 500) {
                                                tootCount = Math.ceil(reply.length / 495);
                                                tootArray = [];
                                                for (let i = 0; i < tootCount; i++) {
                                                    const toot =
                                                        reply.substring(i * 495, i * 495 + 495) +
                                                        "[" +
                                                        (i + 1) +
                                                        "/" +
                                                        tootCount +
                                                        "]";
                                                    tootArray.push(toot);
                                                }
                                            }
                                            if (tootArray) {
                                                // post reply to Mastodon in multiple parts
                                                for (let i = 0; i < tootArray.length; i++) {
                                                    mastodon
                                                        .post("statuses", {
                                                            status: tootArray[i],
                                                            visibility: "public",
                                                            in_reply_to_id: mention.status.id,
                                                        })
                                                        .then((result) => {
                                                            if (i != tootArray.length) {
                                                                console.log(
                                                                    "Reply part " + i + " successfully posted:",
                                                                    tootArray[i]
                                                                );
                                                            } else {
                                                                console.log("Reply successfully posted:", tootArray[i]);
                                                                mastodon
                                                                    .post("notifications/" + mention.id + "/dismiss")
                                                                    .then((result) => {
                                                                        console.log(
                                                                            "Notification " + mention.id + " cleared."
                                                                        );
                                                                    })
                                                                    .catch((error) => {
                                                                        console.error(`Mastodon Error: ${error}`);
                                                                    });
                                                            }
                                                        })
                                                        .catch((error) => {
                                                            console.error(`Mastodon Error: ${error}`);
                                                        });
                                                }
                                            } else {
                                                // post reply to Mastodon
                                                mastodon
                                                    .post("statuses", {
                                                        status: reply,
                                                        visibility: "public",
                                                        in_reply_to_id: mention.status.id,
                                                    })
                                                    .then((result) => {
                                                        console.log("Reply successfully posted:", result.data.content);
                                                        mastodon
                                                            .post("notifications/" + mention.id + "/dismiss")
                                                            .then((result) => {
                                                                console.log("Notification cleared.");
                                                            })
                                                            .catch((error) => {
                                                                console.error(`Mastodon Error: ${error}`);
                                                            });
                                                    })
                                                    .catch((error) => {
                                                        console.error(`Mastodon Error: ${error}`);
                                                    });
                                            }
                                        })
                                        .catch((error) => {
                                            console.log(error);
                                        });
                                }
                            } else {
                                console.log("Not following user.");
                                reply =
                                    "I'm sorry, I'm not following you. I am only responding to mentions from users I am following. Please let us know if you would like to help us test this bot and how you would like to use it to be considered.";
                                mastodon
                                    .post("statuses", {
                                        status: reply,
                                        visibility: "public",
                                        in_reply_to_id: mention.status.id,
                                    })
                                    .then((result) => {
                                        console.log("Reply successfully posted:", result.data.content);
                                        mastodon
                                            .post("notifications/" + mention.id + "/dismiss")
                                            .then((result) => {
                                                console.log("Notification cleared.");
                                            })
                                            .catch((error) => {
                                                console.error(`Mastodon Error: ${error}`);
                                            });
                                    })
                                    .catch((error) => {
                                        console.error(`Mastodon Error: ${error}`);
                                    });
                            }
                        }
                    })
                    .catch((error) => {
                        console.log(error);
                        return error;
                    });
            }
        })
        .catch((error) => {
            console.log(error);
        });
}
const args = process.argv.slice(2);
const noLoop = args.includes("--no-loop");

if (!noLoop) {
    setInterval(() => {
        checkMentions();
    }, 15000);
}
checkMentions();
