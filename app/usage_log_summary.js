const fs = require("fs/promises");
const path = require("path");
const { parseISO } = require("date-fns");
const { format } = require("date-fns");

const usageLogFile = path.join(__dirname, "..", "logs", "usage_log.json");

async function readUsageLog() {
    try {
        const fileContent = await fs.readFile(usageLogFile, "utf-8");
        return JSON.parse(fileContent);
    } catch (error) {
        console.log("No usage logs yet.");
        return { users: [] };
    }
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

async function generateStatsTable(startDate, endDate) {
    const usageData = await readUsageLog();
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

async function generateCsv(stats, filename) {
    let csv = "User ID,Total Logs,Chat Logs,Image Logs,Total Chat Tokens,Total Image Tokens,Earliest Log,Latest Log\n";
    stats.forEach((stat) => {
        csv += `${stat.id},${stat.count},${stat.chatCount},${stat.imageCount},${stat.chatTokens},${
            stat.imageTokens
        },${format(stat.earliest, "yyyy-MM-dd HH:mm:ss")},${format(stat.latest, "yyyy-MM-dd HH:mm:ss")}\n`;
    });
    await fs.writeFile(filename, csv);
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

(async () => {
    const stats = await generateStatsTable(startDate, endDate);
    if (stats.length > 0) {
        console.table(stats);
        await generateCsv(
            stats,
            path.join(
                __dirname,
                "..",
                "reports",
                "report" + (startDate ? "_" + startDate : "_" + Date.now()) + (endDate ? "_" + endDate : "") + ".csv"
            )
        );
    }
})();
