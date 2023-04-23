const fs = require("fs/promises");
const path = require("path");

const logsDirectory = path.join(__dirname, "..", "logs");

function getCurrentUsageLogFile() {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(logsDirectory, `usage_log_${today}.json`);
}

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

async function writeUsageLog(data) {
    const usageLogFile = getCurrentUsageLogFile();
    try {
        await fs.writeFile(usageLogFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing usage log file:", error);
        throw error;
    }
}

async function logUsage(userName, statusId, content, tokens, requestType) {
    try {
        const usageData = await readUsageLog();
        const existingUser = usageData.users.find((user) => user.name === userName);

        if (existingUser) {
            existingUser.interactions.push({ statusId, content, tokens, requestType, timestamp: new Date() });
        } else {
            usageData.users.push({
                name: userName,
                interactions: [{ statusId, content, tokens, requestType, timestamp: new Date() }],
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
