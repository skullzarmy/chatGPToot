const fs = require("fs/promises");
const path = require("path");

const feedbackLogFile = path.join(path.resolve(__dirname, "..", "feedback"), "feedback_log.json");

/**
 *
 * This function reads the feedback log file and returns the parsed data.
 *
 * @returns {Promise<{feedback: {userId: string, statusId: string, content: string, timestamp: Date}[]}>}
 */
async function readFeedbackLog() {
    try {
        const data = await fs.readFile(feedbackLogFile, "utf-8");
        const parsedData = JSON.parse(data);
        if (!parsedData.feedback) {
            parsedData.feedback = [];
        }
        return parsedData;
    } catch (error) {
        if (error.code === "ENOENT") {
            console.log("No feedback logs yet. Creating a new file...");
            await fs.writeFile(feedbackLogFile, JSON.stringify({ feedback: [] }));
            return { feedback: [] };
        }
        console.error("Error reading feedback log file:", error);
        throw error;
    }
}

/**
 *
 * This function writes the given data to the feedback log file.
 *
 * @param {{feedback: {userId: string, statusId: string, content: string, timestamp: Date}[]}} data
 */
async function writeFeedbackLog(data) {
    try {
        await fs.writeFile(feedbackLogFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing feedback log file:", error);
        throw error;
    }
}

/**
 *
 * This function logs the given feedback to the feedback log file.
 *
 * @param {string} userId
 * @param {string} statusId
 * @param {string} content
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function logFeedback(userId, statusId, content) {
    try {
        const feedbackData = await readFeedbackLog();
        feedbackData.feedback.push({
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

/**
 *
 * This function counts the number of feedbacks in the feedback log file.
 *
 * @returns {Promise<number>}
 * @throws {Error}
 */
async function countFeedback() {
    try {
        const feedbackData = await readFeedbackLog();
        if (!feedbackData.feedback) {
            return 0;
        }
        return feedbackData.feedback.length;
    } catch (error) {
        console.error("Error counting feedback:", error);
        throw error;
    }
}

module.exports = {
    logFeedback,
    countFeedback,
};
