// rss_handler.js
const axios = require("axios");
const xml2js = require("xml2js");
const fs = require("fs");
const path = require("path");
const config = require("../config.json");

const JSON_FILE = path.join(__dirname, "..", "logs", "rss_feed_log.json");

class rssHandler {
    constructor(urls) {
        this.urls = urls;
        this.trackedItems = this.loadTrackedItems();
    }

    async fetchFeed(url) {
        try {
            const response = await axios.get(url);
            const parsedData = await xml2js.parseStringPromise(response.data);
            console.log(`Fetched feed from ${url}`);
            console.log(`Found ${parsedData.rss.channel[0].item.length} items`);
            // console.log(response.data);
            return parsedData.rss.channel[0].item;
        } catch (error) {
            console.error(`Error fetching feed from ${url}:`, error);
            return [];
        }
    }

    loadTrackedItems() {
        try {
            if (fs.existsSync(JSON_FILE) && fs.readFileSync(JSON_FILE, "utf-8").length > 0) {
                return JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
            } else {
                return {};
            }
        } catch (error) {
            console.error("Error loading tracked items:", error);
            return {};
        }
    }

    saveTrackedItems() {
        try {
            fs.writeFileSync(JSON_FILE, JSON.stringify(this.trackedItems, null, 2));
        } catch (error) {
            console.error("Error saving tracked items:", error);
        }
    }

    isNewItem(guid) {
        return !this.trackedItems.hasOwnProperty(guid);
    }

    trackItem(guid) {
        this.trackedItems[guid] = true;
    }

    async checkNewItems() {
        const newItems = [];

        for (const url of this.urls) {
            const items = await this.fetchFeed(url);

            for (const item of items) {
                const guid = item.guid[0];
                if (this.isNewItem(guid)) {
                    newItems.push(item);
                }
            }
        }

        newItems.sort((a, b) => new Date(a.pubDate[0]) - new Date(b.pubDate[0]));
        return newItems;
    }

    logItem(guid) {
        this.trackItem(guid);
        this.saveTrackedItems();
    }
}

async function ingestFeeds(urls) {
    const handler = new rssHandler(urls);
    const items = await handler.checkNewItems();

    for (const item of items) {
        const guid = item.guid[0];
        console.log(`Ingesting item: ${item.title[0]} (${guid})`);
        handler.logItem(guid);
    }
}

if (require.main === module) {
    const rssUrls = config.rss_urls;
    ingestFeeds(rssUrls);
}

module.exports = { rssHandler };
