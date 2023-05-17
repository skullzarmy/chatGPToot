const { Configuration, OpenAIApi } = require("openai");
const T = require("tusk-mastodon");
const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const { Group } = require("bottleneck");

const configuration = new Configuration({ apiKey: process.env.OPENAI_KEY });
const openai = new OpenAIApi(configuration);

/**
 *
 * This function initializes the Mastodon API client.
 *
 * @param {boolean} isDevMode
 * @returns {T}
 * @throws {Error}
 */
function initMastodon(isDevMode = false) {
    let mastodon;
    if (!isDevMode) {
        mastodon = new T({
            access_token: process.env.MASTODON_ACCESS_TOKEN,
            api_url: process.env.MASTODON_API_URL,
        });
    } else {
        mastodon = {
            post: async (endpoint, params) => {
                console.log(`Pretending to post to endpoint '${endpoint}' with params:`, params);
                return Promise.resolve({ data: { id: 0 } });
            },
        };
    }
    return mastodon;
}

const rateLimiterGroup = new Group({
    maxConcurrent: 1, // Only 1 request per user at a time
    minTime: 15000, // 15 seconds between requests
    reservoir: 5, // tokens per user
    reservoirRefreshAmount: 5,
    reservoirIncreaseMaximum: 5,
    reservoirRefreshInterval: 1 * 60 * 60 * 1000, // 1 hour
}); // 5 requests per hour per user

module.exports = {
    initMastodon,
    openai,
    rateLimiterGroup,
};
