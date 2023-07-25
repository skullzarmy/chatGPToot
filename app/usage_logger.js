const fs = require("fs/promises");
const path = require("path");

const logsDirectory = path.join(__dirname, "..", "logs");

/**
 *
 * Returns the path to the current usage log file.
 *
 * @returns {string}
 * @throws {Error}
 */
function getCurrentUsageLogFile() {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(logsDirectory, `usage_log_${today}.json`);
}

/**
 *
 * Reads the current usage log file and returns the data.
 *
 * @returns {Promise<{users: []}>}
 * @throws {Error}
 */
async function readUsageLog() {
    const usageLogFile = getCurrentUsageLogFile();
    try {
        await fs.access(usageLogFile);
    } catch (error) {
        console.log(`Creating new usage log file: ${usageLogFile}`);
        await fs.writeFile(usageLogFile, JSON.stringify({ users: [] }));
    }

    const data = await fs.readFile(usageLogFile, "utf-8");
    return JSON.parse(data);
}

/**
 *
 * Writes the usage log data to the current usage log file.
 *
 * @param {{users: []}} data
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function writeUsageLog(data) {
    const usageLogFile = getCurrentUsageLogFile();
    try {
        await fs.writeFile(usageLogFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing usage log file:", error);
        throw error;
    }
}

/**
 *
 * Logs the usage of the bot.
 *
 * @param {string} userName
 * @param {string} statusId
 * @param {string} content
 * @param {string} requestType
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function logUsage(userName, statusId, content, requestType) {
    try {
        const usageData = await readUsageLog();
        const existingUser = usageData.users.find((user) => user.name === userName);

        if (existingUser) {
            existingUser.interactions.push({ statusId, content, requestType, timestamp: new Date() });
        } else {
            usageData.users.push({
                name: userName,
                interactions: [{ statusId, content, requestType, timestamp: new Date() }],
            });
        }

        await writeUsageLog(usageData);
    } catch (error) {
        console.error("Error logging usage:", error);
        throw error;
    }
}

module.exports = {
    logUsage,
};
