const fs = require("fs");
const path = require("path");
const { parseISO } = require("date-fns");
const { format } = require("date-fns");

const usageLogFile = path.join(__dirname, "..", "logs", "usage_log.json");

function readUsageLog() {
    if (!fs.existsSync(usageLogFile)) {
        console.log("No usage logs yet.");
        return { users: [] };
    }
    return JSON.parse(fs.readFileSync(usageLogFile, "utf-8"));
}

function getUserStats(user) {
    const chats = user.interactions.filter((interaction) => interaction.requestType === "chat");
    const images = user.interactions.filter((interaction) => interaction.requestType === "image");
    const chatTokens = chats.reduce((total, interaction) => total + interaction.tokens, 0);
    const imageTokens = images.reduce((total, interaction) => total + interaction.tokens, 0);
    const earliest = new Date(Math.min(...user.interactions.map((interaction) => new Date(interaction.timestamp))));
    const latest = new Date(Math.max(...user.interactions.map((interaction) => new Date(interaction.timestamp))));
    return {
        id: user.id,
        count: user.interactions.length,
        chatCount: chats.length,
        imageCount: images.length,
        chatTokens: chatTokens,
        imageTokens: imageTokens,
        earliest: earliest,
        latest: latest,
    };
}

function generateStatsTable(startDate, endDate) {
    const usageData = readUsageLog();
    let stats = [];
    usageData.users.forEach((user) => {
        let userStats = getUserStats(user);
        if (startDate && endDate) {
            userStats.interactions = userStats.interactions.filter(
                (interaction) =>
                    parseISO(interaction.timestamp) >= parseISO(startDate) &&
                    parseISO(interaction.timestamp) <= parseISO(endDate)
            );
            userStats.count = userStats.interactions.length;
        }
        stats.push(userStats);
    });
    return stats;
}

function generateCsv(stats, filename) {
    let csv = "User ID,Total Logs,Chat Logs,Image Logs,Total Chat Tokens,Total Image Tokens,Earliest Log,Latest Log\n";
    stats.forEach((stat) => {
        csv += `${stat.id},${stat.count},${stat.chatCount},${stat.imageCount},${stat.chatTokens},${
            stat.imageTokens
        },${format(stat.earliest, "yyyy-MM-dd HH:mm:ss")},${format(stat.latest, "yyyy-MM-dd HH:mm:ss")}\n`;
    });
    fs.writeFileSync(filename, csv);
}

const args = process.argv.slice(2);
let startDate = null;
let endDate = null;
if (args.length >= 1) {
    startDate = args[0];
}
if (args.length >= 2) {
    endDate = args[1];
}

const stats = generateStatsTable(startDate, endDate);
if (stats.length > 0) {
    console.table(stats);
    generateCsv(
        stats,
        path.join(
            __dirname,
            "..",
            "reports",
            "report" + (startDate ? "_" + startDate : "_" + Date.now()) + (endDate ? "_" + endDate : "") + ".csv"
        )
    );
}
