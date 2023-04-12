const { Configuration, OpenAIApi } = require("openai");
const M = require("mastodon");
const dotenvSafe = require("dotenv-safe");
dotenvSafe.config();
const { Group } = require("bottleneck");

const configuration = new Configuration({ apiKey: process.env.OPENAI_KEY });
const openai = new OpenAIApi(configuration);

function initMastodon(isDevMode) {
    let mastodon;
    if (!isDevMode) {
        mastodon = new M({
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
    reservoir: 50, // tokens per user
    reservoirRefreshAmount: 50,
    reservoirIncreaseMaximum: 50,
    reservoirRefreshInterval: 24 * 60 * 60 * 1000, // 24 hours
});

module.exports = {
    initMastodon,
    openai,
    rateLimiterGroup,
};
