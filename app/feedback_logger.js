const fs = require("fs/promises");
const path = require("path");

const feedbackLogFile = path.join(path.resolve(__dirname, "..", "feedback"), "feedback_log.json");

async function readFeedbackLog() {
    try {
        if (!(await fs.access(feedbackLogFile))) {
            console.log("No feedback logs yet.");
            return { feedbacks: [] };
        }
        const data = await fs.readFile(feedbackLogFile, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading feedback log file:", error);
        throw error;
    }
}

async function writeFeedbackLog(data) {
    try {
        await fs.writeFile(feedbackLogFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing feedback log file:", error);
        throw error;
    }
}

async function logFeedback(userId, statusId, content) {
    try {
        const feedbackData = await readFeedbackLog();
        feedbackData.feedbacks.push({
            userId,
            statusId,
            content,
            timestamp: new Date(),
        });
        await writeFeedbackLog(feedbackData);
    } catch (error) {
        console.error("Error logging feedback:", error);
        throw error;
    }
}

module.exports = {
    logFeedback,
};
