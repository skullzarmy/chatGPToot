const express = require("express");
const app = express();
const rateLimit = require("express-rate-limit");
const port = process.env.PORT || 3000;
const { exec } = require("child_process");

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

const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.query.apiKey;

    if (apiKey === process.env.STATUS_API_KEY) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
};

app.use("/status", apiKeyMiddleware);

app.use(
    "/status",
    rateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 100, // limit each IP to 100 requests per windowMs
    })
);

app.get("/status", (req, res) => {
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
