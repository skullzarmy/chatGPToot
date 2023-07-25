const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const express = require("express");
const https = require("https");
const rateLimit = require("express-rate-limit");
const { exec } = require("child_process");

const app = express();
const port = process.env.PORT || 3000;
const authToken = process.env.STATUS_API_TOKEN;

app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
    })
);

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token");
    res.setHeader("Content-Type", "application/json");

    next();
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
        return;
    });
}

function isBlogOnline(callback) {
    https
        .get("https://socaltechlab.com", (res) => {
            callback(res.statusCode === 200);
        })
        .on("error", (err) => {
            console.error(`Error: ${err.message}`);
            callback(false);
        });
}

app.get("/status", (req, res) => {
    const requestToken = req.headers["x-auth-token"];

    if (requestToken !== authToken) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    isBotRunning((botRunning) => {
        isBlogOnline((blogOnline) => {
            const botStatus = botRunning ? "online" : "offline";
            const blogStatus = blogOnline ? "online" : "offline";
            res.json({ bot: { status: botStatus }, blog: { status: blogStatus } });
        });
    });
});

app.listen(port, () => {
    console.log(`Status HTTP server listening at http://localhost:${port}`);
});
