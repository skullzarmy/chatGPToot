const fs = require("fs");
const path = require("path");

const feedbackLogFile = path.join(__dirname, "..", "feedback", "feedback_log.json");

function readFeedbackLog() {
    if (!fs.existsSync(feedbackLogFile)) {
        console.log("No feedback logs yet.");
        return { feedbacks: [] };
    }
    return JSON.parse(fs.readFileSync(feedbackLogFile, "utf-8"));
}

function writeFeedbackLog(data) {
    fs.writeFileSync(feedbackLogFile, JSON.stringify(data, null, 2));
}

function logFeedback(userId, statusId, content) {
    const feedbackData = readFeedbackLog();
    feedbackData.feedbacks.push({
        userId,
        statusId,
        content,
        timestamp: new Date(),
    });
    writeFeedbackLog(feedbackData);
}

module.exports = {
    logFeedback,
};

// TODO: mastodon ping admins when feedback is logged
