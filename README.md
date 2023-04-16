[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/banner2-direct.svg)](https://stand-with-ukraine.pp.ua)

# chatGPToot 🦣 -- Mastodon OpenAI Chatbot 🤖

![GitHub issues](https://img.shields.io/github/issues-raw/skullzarmy/chatGPToot)
![GitHub pull requests](https://img.shields.io/github/issues-pr-raw/skullzarmy/chatGPToot)

## Description

### This is a Mastodon chatbot that uses OpenAI to generate responses. The bot can post toots and DALL-E images based on a pre-written prompt or respond to direct mentions.

![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fsocaltechlab.com%2F.netlify%2Ffunctions%2FgithubProxy)

![Mastodon Follow](https://img.shields.io/mastodon/follow/110178159113810309?domain=https%3A%2F%2Fbotsin.space&style=social)
![Mastodon Follow](https://img.shields.io/mastodon/follow/109988942401723597?domain=https%3A%2F%2Fmastodon.social&style=social)

[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://stand-with-ukraine.pp.ua)

<a href="https://www.buymeacoffee.com/skllzrmy"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a beer&emoji=🍺&slug=skllzrmy&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>

---

| [🆕 - **Updates** - 🆕](#updates) | [🤖 - Mastodon Mention Commands - 🤖](#mention-commands) | [✳️ - Dependencies - ✳️](#dependencies) | [💾 - Installation - 💾](#installation) | [⚖️ - License - ⚖️](#license) |

---

## Stats

![Lines of Code](https://img.shields.io/tokei/lines/github/skullzarmy/ChatGPToot)
![Repo Size](https://img.shields.io/github/repo-size/skullzarmy/ChatGPToot)
![File Count](https://img.shields.io/github/directory-file-count/skullzarmy/ChatGPToot)

---

## Dependencies

### Bot

![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/axios)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/bottleneck)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/date-fns)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/dotenv-safe)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/moment-timezone)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/node-cron)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/redis)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/openai)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/xml2js)

### Status Server

![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/express)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/express-rate-limit)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/skullzarmy/ChatGPToot/helmet)

## Installation

_assumes you already have a Mastodon bot account and have your secret token, as well as an OpenAI API key_

-   Clone the repository: `git clone https://github.com/skullzarmy/chatGPToot.git`
-   `npm install` to initiate node and install dependencies
-   `npm run setup` will create needed folders
-   `cp .env.example .env` will copy [.env.example](.env.example) to [.env](.env) file
-   `nano .env` or use text editor to edit [.env](.env) file and add your credentials
-   `nano config.json` or use text editor to edit [config.json](config.json) file
    -   **IMPORTANT** Your bot will toot about all of my blog posts if you do not edit this!
    -   I **STRONGLY** recommend running `npm run ingest-feeds` after adding a new RSS feed, or else it will toot about each new one it finds. There is no mechanism to modulate number or tempo, it will just spit them out! Ingesting the feed will add all existing items to local file memory, and check against that file for new items in the loop.

### .env

```bash
MASTODON_ACCESS_TOKEN=GET-FROM-MASTODON
MASTODON_API_URL=YOUR-MASTODON-INSTANCE
OPENAI_KEY=sk-...
MASTODON_ACCOUNT_ID=GET-FROM-MASTODON
MASTODON_ADMIN_ACCOUNT=TO-ENABLE-ADMIN-COMMANDS
MASTODON_ADMIN_ALERT_USERNAME=TO-ALERT-FOR-FEEDBACK
NEWSDATA_API_KEY=SET-UP-A-FREE-KEY-TO-GET-NEWS-DATA
#STATUS_API_TOKEN=GENERATE-NEW-PRIVATE-KEY-TO-AUTH-STATUS-REQUESTS
```

### config.json

```json
{
    "rss_urls": ["http://YOUR-RSS-FEED-URL/rss"],
    ...
}
```

([top](#description))

## Arguments

### The following arguments are available for [app/chatgptoot.js](app/chatgptoot.js):

`--no-loop` - Disables the automatic toot, image, and mention loops. This is useful if you want to run the script manually to test it.

`--no-image` - Disables the automatic image loop.

`--no-toot` - Disables the automatic toot loop.

`--no-mention` - Disables the automatic mention loop.

`--no-rss` - Disables the RSS checker loop.

`--toot-now` - Generates a toot and posts it immediately.

`--image-now` - Generates an image prompt and posts it immediately.

([top](#description))

## NPM Scripts

`npm run bot` will run the bot in `nohup` a loop, tooting, mentioning, and posting images.

`npm run bot-tail` will run the bot as above and stream the logs to your terminal (by tailing the log file)

`npm run bot-mention` will run the bot in a loop, mentioning but not tooting or posting images.

`npm run bot-image` will run the bot in a loop, posting images but not tooting or mentioning.

`npm run bot-toot` will run the bot in a loop, tooting but not mentioning or posting images.

`npm run single-toot` will run the bot once, tooting but not mentioning or posting images.

`npm run single-image` will run the bot once, posting images but not tooting or mentioning.

`npm run single-mention` will run the bot once, mentioning but not tooting or posting images.

`npm run tail-logs` will stream the new bot logs to your terminal.

`npm run usage` will generate a usage report located in [reports/](reports/)

`npm run status-server` will start an express server on port 3000 & ngrok tunnel. Config in [app/status_http_server.js](./app/status_http_server.js)

-   Need to configure `ngrok config auth-token ...` from ngrok.
-   _I plan to make this more modular and move config to [config.js](./config.js) eventually_

`npm run ingest-feeds` will loop through your RSS feeds and ingest the existing items into a local file so they are not considered 'new'.

-   **HIGHLY RECOMMENDED THE FIRST TIME YOU ADD A NEW RSS FEED**

([top](#description))

## Mention Commands

The bot supports the following commands when responding to a mention:

_command must be at the beginning of the mention (after the @mention)_

### Following Only (bot account must follow user sending command)

-   "{prompt}" - Bot will respond to direct mentions. If no command is used, bot will use your mention text and generate a chat completion for reply.
-   "//img// {prompt}" or "//image// {prompt}" - Treats as an image prompt, generates a DALL-E image, and posts it in reply
-   "//img-asst// {prompt}" or "//image-assist// {prompt}" - Asks GPT-3 to revise your idea into a new image prompt, then sends for DALL-E image generation and returns image and prompt in reply.
-   "//news//" – For now this only checks for a few articles with keywords "gpt OR ai OR llm OR openai OR copilot OR midjourney" in Science or Technology categories. It will then read and summarize them for you. I plan to expand this to take prompts for search criteria but the news API costs $$. Feel free to buy me a beer to help support the development!
-   "//feedback// {feedback}" - Logs user feedback for review
-   "//beta//" or "//beta-application//" - Posts the application link to the user
-   "//help//" or "//commands//" - Posts a list of commands in reply

([top](#description))

### Admin Only

-   "//toot-now// {prompt}" - Posts a new toot to main bot account using given prompt
-   "//image-now// {prompt}" - Posts a new image to main bot account using given prompt
-   "//status//" - Replies with a status message.

### Example

`@chatGPToot //image// a cat eating a taco`

![a cat eating a taco](static/taco_cat.png "indeed, a cat eating a taco.")

([top](#description))

## Usage Logging Utilities

By default, the bot will log all usage to logs/usage_logs.json

`npm run usage` will print and save a usage summary to [reports/](reports/)

([top](#description))

## RSS Feed Subscription

Bot can now subscribe to RSS feeds, track previously known items, and generate toots about newly found items in the feed.

Modify the [config.json](config.json) file and add any number of RSS feeds to follow. Be careful! It will auto-post all newly found items without any care in the world about spamming everyone!

## GPT-4 Suggested Improvements

[COMPLETED]

## To Do

-   Implement redis for persistent bottleneck rate limiting
-   Implement fs/promise in chatgptoot.js (download image broke)
-   Consider restricting news injection in toot generation to specific times so toots are not always news related.

([top](#description))

## Updates

-   2023-04-13
    -   Removed dependency for deprecated `requests` package. This required refactoring the `node-mastodon` package, which has been abandoned. I removed the dependency on this package and added [modules/tusk/](modules/tusk/) which is largely the same code, refactored to use axios and utilize the vanilla js Promise functionality. Dependabot can leave me alone about it now.
    -   Setup an express server that serves a status JSON object. It checks my blog site and the bot node process and returns current status messages for both.
    -   Added RSS feed subscription. Define RSS URLs in [config.json](config.json)
    -   Bot account was suspended, so I moved to a new account on [@botsin.space](https://botsin.space). Bot is renamed Mr. Roboto (@mrroboto). I have decided **not** to change the repo name. Botsin.space does not enable the `trending/tags` API endpoint, which was used in `addContext()`, so I commented out the `getTrendingTags()` call but left it in place for running on instances that do support it. I may go to the trouble of setting up a separate account on another instance **just** to get trending tag data, but I highly doubt it.
    -   Instead of trending tags, I added a news checker [app/news_handler.js](app/news_handler.js) which will return the latest news. `addContext()` is making use of this now to enrich the chat completion's context. I have noticed it is more heavily weighing the output than I would like, so I may consider putting some trigger variable into the function invocation to control weather I want the news added or not. Then set some mechanism for deciding which of the scheduled toots will be news related. Maybe I will setup a whole separate loop for it.
-   2023-04-16
    -   Cleaned up the README.md. Added `npm run bot-tail` command and added docs for the server and ingest commands.
    -   Slava Ukraini

([top](#description))

---

---

## License

This project is released under the [MIT License](LICENSE.txt). You are free to use, modify, and distribute the source code, subject to the terms and conditions of the license.

The [MIT License](LICENSE.txt) is a permissive open-source software license that allows you to use this project for any purpose, including commercial use. By using this project, you agree to retain the original copyright notice and the full license text in all copies or substantial portions of the software.

We encourage collaboration and contribution to the project. Feel free to fork, modify, and share your improvements with the community. Our goal is to make this software as useful and accessible as possible, and your contributions will help us achieve that.

Please note that this project is provided "as is" without any warranty or liability. The authors are not responsible for any consequences that may arise from the use of this software.

<a href="https://www.buymeacoffee.com/skllzrmy"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a beer&emoji=🍺&slug=skllzrmy&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>

([top](#description))
