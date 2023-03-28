# chatGPToot 🦣 -- Mastodon OpenAI Chatbot 🤖

This is a Mastodon chatbot that uses OpenAI to generate responses. The bot can post daily toots based on a pre-written prompt.

## Installation

Clone the repository: `git clone https://github.com/skullzarmy/chatGPToot.git`
Copy the `.env-example` file to `.env`: `cp .env-example .env`
Fill in the `.env` file with your Mastodon access token, Mastodon API URL, and OpenAI API key.

## Usage

The main functionality of the chatbot can be found in the `app.js` file. Running node `app.js` will generate a response using OpenAI and post a toot to Mastodon.

To change the daily prompt, edit the messages array in `app.js`.

## ToDo

-   Bot can respond to direct messages from accounts it follows.

## License

This project is licensed under the MIT License. See the LICENSE file for more information.
