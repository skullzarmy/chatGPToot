const fs = require("fs/promises");
const path = require("path");
const { parseISO } = require("date-fns");
const { format } = require("date-fns");

const logsFolder = path.join(__dirname, "..", "logs");

/**
 *
 * Reads all the usage logs and returns the data.
 *
 * @returns {Promise<{users: []}>}
 * @throws {Error}
 */
async function readUsageLog() {
    try {
        const files = await fs.readdir(logsFolder);
        const usageLogFiles = files.filter((file) => file.startsWith("usage_log") && file.endsWith(".json"));

        let allLogs = { users: [] };
        for (const logFile of usageLogFiles) {
            const fileContent = await fs.readFile(path.join(logsFolder, logFile), "utf-8");
            const parsedContent = JSON.parse(fileContent);
            allLogs.users = allLogs.users.concat(parsedContent.users);
        }
        return allLogs;
    } catch (error) {
        console.log("No usage logs yet.");
        return { users: [] };
    }
}

/**
 *
 * Returns the stats for a user.
 *
 * @param {{name: string, interactions: []}} user
 * @returns {{name: string, count: number, chatCount: number, imageCount: number, earliest: Date, latest: Date}}
 * @throws {Error}
 */
function getUserStats(user) {
    const chats = user.interactions.filter((interaction) => interaction.requestType === "chat");
    const images = user.interactions.filter((interaction) => interaction.requestType === "image");
    const earliest = new Date(Math.min(...user.interactions.map((interaction) => new Date(interaction.timestamp))));
    const latest = new Date(Math.max(...user.interactions.map((interaction) => new Date(interaction.timestamp))));
    return {
        name: user.name,
        count: user.interactions.length,
        chatCount: chats.length,
        imageCount: images.length,
        earliest: earliest,
        latest: latest,
    };
}

/**
 *
 * Generates the stats table.
 *
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<[{name: string, count: number, chatCount: number, imageCount: number, chatTokens: number, imageTokens: number, earliest: Date, latest: Date}]>}
 * @throws {Error}
 */
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

/**
 *
 * Generates the CSV file.
 *
 * @param {[{name: string, count: number, chatCount: number, imageCount: number, chatTokens: number, imageTokens: number, earliest: Date, latest: Date}]} stats
 * @param {string} filename
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function generateCsv(stats, filename) {
    let csv = "Username,Total Logs,Chat Logs,Image Logs,Total Chat Tokens,Total Image Tokens,Earliest Log,Latest Log\n";
    stats.forEach((stat) => {
        csv += `${stat.name},${stat.count},${stat.chatCount},${stat.imageCount},${format(
            stat.earliest,
            "yyyy-MM-dd HH:mm:ss"
        )},${format(stat.latest, "yyyy-MM-dd HH:mm:ss")}\n`;
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
