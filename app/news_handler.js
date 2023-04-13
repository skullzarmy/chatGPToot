const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const axios = require("axios");

class newsHandler {
    async fetchNews(limit = null) {
        try {
            const response = await axios.get("https://newsdata.io/api/1/news", {
                params: {
                    apikey: process.env.NEWSDATA_API_KEY,
                    q: "gpt OR ai OR llm OR openai OR copilot OR midjourney",
                    language: "en",
                    category: "science,technology",
                },
            });
            console.log(`Fetched news`);
            if (limit) {
                return response.data.results.slice(0, limit);
            }
            return response.data.results;
        } catch (error) {
            console.error(`Error fetching news:`, error);
            return [];
        }
    }
}

module.exports = newsHandler;
