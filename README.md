# chatGPToot 🦣 -- Mastodon OpenAI Chatbot 🤖

## Description

### This is a Mastodon chatbot that uses OpenAI to generate responses. The bot can post toots and DALL-E images based on a pre-written prompt or respond to direct mentions.

## [Follow ChatGPToot](https://masto.ai/@chatGPToot)

[🤖 Mastodon Mention Commands 🤖](#mention-commands-) | [⚖️ License ⚖️](#license-⚖️) |

## Installation

_assumes you already have a Mastodon bot account and have your secret token, as well as an OpenAI API key_

-   Clone the repository: `git clone https://github.com/skullzarmy/chatGPToot.git`
-   `npm install` to initiate node and install dependencies
-   `npm run setup` will create needed folders
-   `cp .env.example .env` will copy `.env.example` to `.env` file
-   `nano .env` or use text editor to edit `.env` file and add your credentials

([top](#description))

## Arguments

### The following arguments are available for `chatgptoot.js`:

`--no-loop` - Disables the automatic toot, image, and mention loops. This is useful if you want to run the script manually to test it.

`--no-image` - Disables the automatic image loop.

`--no-toot` - Disables the automatic toot loop.

`--no-mention` - Disables the automatic mention loop.

`--toot-now` - Generates a toot and posts it immediately.

`--image-now` - Generates an image prompt and posts it immediately.

([top](#description))

## Example Usage

`npm run bot` will run the bot in a loop, tooting, mentioning, and posting images.

`npm run bot-mention` will run the bot in a loop, mentioning but not tooting or posting images.

`npm run bot-image` will run the bot in a loop, posting images but not tooting or mentioning.

`npm run bot-toot` will run the bot in a loop, tooting but not mentioning or posting images.

`npm run single-toot` will run the bot once, tooting but not mentioning or posting images.

`npm run single-image` will run the bot once, posting images but not tooting or mentioning.

`npm run single-mention` will run the bot once, mentioning but not tooting or posting images.

`npm run tail-logs` will stream the new bot logs to your terminal.

`npm run usage` will generate a usage report located in `reports/`

([top](#description))

## Mention Commands 🤖

The bot supports the following commands when responding to a mention:

_command must be at the beginning of the mention (after the @mention)_

### Following Only (bot account must follow user sending command)

-   "{prompt}" - Bot will respond to direct mentions. If no command is used, bot will use your mention text and generate a chat completion for reply.
-   "//img// {prompt}" or "//image// {prompt}" - Treats as an image prompt, generates a DALL-E image, and posts it in reply
-   "//img-asst// {prompt}" or "//image-assist// {prompt}" - Asks GPT-3 to revise your idea into a new image prompt, then sends for DALL-E image generation and returns image and prompt in reply.
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

`npm run usage` will print and save a usage summary to `reports/`

([top](#description))

## License ⚖️

This project is released under the [MIT License](LICENSE.txt). You are free to use, modify, and distribute the source code, subject to the terms and conditions of the license.

The [MIT License](LICENSE.txt) is a permissive open-source software license that allows you to use this project for any purpose, including commercial use. By using this project, you agree to retain the original copyright notice and the full license text in all copies or substantial portions of the software.

We encourage collaboration and contribution to the project. Feel free to fork, modify, and share your improvements with the community. Our goal is to make this software as useful and accessible as possible, and your contributions will help us achieve that.

Please note that this project is provided "as is" without any warranty or liability. The authors are not responsible for any consequences that may arise from the use of this software.

([top](#description))

---

---

## GPT-4 Suggested Improvements

Overall, the script looks well-structured and functional. However, I found a few improvements and potential issues that should be addressed:

### Function naming consistency:

Some function names are in camelCase (e.g., handleImageCommand), while others use underscores (e.g., logUsage). It's best to maintain consistency in naming conventions.

### fetchConversation function:

The fetchConversation function seems to have a logical issue. When calling the function with await fetchConversation(mention.status.id, conversation);, it will push the messages to the conversation array, but since it's an async function, the result may not be available immediately. To fix this, consider returning the updated messages array from the fetchConversation function and assigning it back to the conversation variable.

## To Do

-   Implement redis for persistent bottleneck rate limiting
-   Implement fs/promise in chatgptoot.js (download image broke)

([top](#description))
