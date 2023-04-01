const fs = require("fs");
const path = require("path");

const logsDirectory = path.join(__dirname, "..", "logs");
const today = new Date().toISOString().slice(0, 10);
const usageLogFile = path.join(logsDirectory, `usage_log_${today}.json`);

function readUsageLog() {
    if (!fs.existsSync(usageLogFile)) {
        console.log(`Creating new usage log file: ${usageLogFile}`);
        fs.writeFileSync(usageLogFile, JSON.stringify({ users: [] }));
    }
    return JSON.parse(fs.readFileSync(usageLogFile, "utf-8"));
}

function writeUsageLog(data) {
    fs.writeFileSync(usageLogFile, JSON.stringify(data, null, 2));
}

function logUsage(userId, statusId, content, tokens, requestType) {
    const usageData = readUsageLog();
    const existingUser = usageData.users.find((user) => user.id === userId);

    if (existingUser) {
        existingUser.interactions.push({ statusId, content, tokens, requestType, timestamp: new Date() });
    } else {
        usageData.users.push({
            id: userId,
            interactions: [{ statusId, content, tokens, requestType, timestamp: new Date() }],
        });
    }

    writeUsageLog(usageData);
}

module.exports = {
    logUsage,
};
