const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const http = require("http");
const { exec } = require("child_process");
const port = process.env.PORT || 3000;
const authToken = process.env.STATUS_API_TOKEN; // Load the secret token from the .env file

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

const server = http.createServer((req, res) => {
    if (req.url === "/status" && req.method === "GET") {
        const requestToken = req.headers["x-auth-token"];

        if (requestToken !== authToken) {
            res.statusCode = 401;
            res.end("Unauthorized");
            return;
        }
        // Set the CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET");
        res.setHeader("Content-Type", "application/json");

        isBotRunning((botRunning) => {
            isBlogOnline((blogOnline) => {
                const botStatus = botRunning ? "online" : "offline";
                const blogStatus = blogOnline ? "online" : "offline";
                res.end(JSON.stringify({ bot: { status: botStatus }, blog: { status: blogStatus } }));
            });
        });
    } else {
        res.statusCode = 401;
        res.end("Unauthorized");
    }
});

server.listen(port, () => {
    console.log(`Status HTTP server listening at http://localhost:${port}`);
});
