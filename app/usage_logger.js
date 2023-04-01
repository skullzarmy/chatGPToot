const fs = require("fs");
const path = require("path");

const usageLogFile = path.join(__dirname, "..", "logs", "usage_log.json");

function readUsageLog() {
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
