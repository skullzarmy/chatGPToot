const express = require("express");
const app = express();
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const port = process.env.PORT || 3000;
const { exec } = require("child_process");

// Enable CORS only for the specified origin
// app.use(cors({ origin: "https://socaltechlabs.com" }));

const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
function isBotRunning(callback) {
    exec("ps aux | grep node", (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            callback(false);
            return;
        }

        const lines = stdout.trim().split("\n");
        const botRunning = lines.some((line) => line.includes("app/chatgptoot.js"));
        callback(botRunning);
    });
}

function isBlogOnline(callback) {
    exec("curl -s -o /dev/null -w '%{http_code}' https://socaltechlab.com", (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            callback(false);
            return;
        }

        const blogOnline = stdout.trim() === "200";
        callback(blogOnline);
    });
}

app.get("/status", cors(), limiter, (req, res) => {
    isBotRunning((botRunning) => {
        isBlogOnline((blogOnline) => {
            const botStatus = botRunning ? "online" : "offline";
            const blogStatus = blogOnline ? "online" : "offline";
            res.json({ bot: { status: botStatus }, blog: { status: blogStatus } });
        });
    });
});

app.listen(port, () => {
    console.log(`Status server listening at http://localhost:${port}`);
});
