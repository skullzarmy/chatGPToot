# chatGPToot 🦣 -- Mastodon OpenAI Chatbot 🤖

### This is a Mastodon chatbot that uses OpenAI to generate responses. The bot can post daily toots based on a pre-written prompt or generate an image based on a user prompt and post it to Mastodon.

---

## Installation

-   Clone the repository: `git clone https://github.com/skullzarmy/chatGPToot.git`
-   Copy the .env-example file to .env: `cp .env-example .env`
-   Fill in the .env file with your Mastodon access token, Mastodon API URL, and OpenAI API key.

---

## Usage

The main functionality of the chatbot can be found in the `app.js` file. Running `node app.js` will generate a response using OpenAI and post a toot to Mastodon. To change the daily toot prompt, edit the messages array in `app.js`.

## Arguments

### The following arguments are available for `app.js`:

-   `--dev`: Run the chatbot in development mode. The toot will not be posted to Mastodon, and the console will show the generated toot or image URL instead.
-   `--run-now`: Run the chatbot immediately, instead of waiting for the next interval.
-   `--post-image`: Generate an image and post it to Mastodon instead of generating a toot.
-   `--prompt [string]`: Specify a user prompt to use instead of the default prompt in the code. The prompt should be enclosed in quotes.
-   `--no-loop`: Run the chatbot once and exit, instead of running on an interval.

## Example Usage

`node app.js` - Will start the bot in normal operation.

`node app.js --run-now --no-loop --post-image --prompt "A robot mastodon typing at a computer"` - Will generate an image from the supplied prompt and post it, then exit.

`node app.js --run-now --prompt "Write a toot about cute mastodons."` - Will generate a toot from the supplied prompt and post it, then continue looping on an interval. **The prompt will be used each loop**

## Mention reply

-   Bot can respond to direct messages from accounts it follows.
-   Configure `MASTODON_ACCOUNT_ID` in .env file

`npm run mentions` - Runs daemon that checks for new notifications every minute and responds if following user

`npm run mentions-once` - Will check and respond to notifications once then exit

---

## Deployment on Netlify -- (not currently using cloud deployment)

-   Create a new site in Netlify from your Git repository.
-   In the "Build & Deploy" settings for your site, set the "Build command" to npm run build.
-   Set the "Publish directory" to /.
-   Add your environment variables to the "Environment variables" settings for your site, including the Mastodon access token, Mastodon API URL, and OpenAI API key.
-   Save your settings and trigger a new build by clicking the "Trigger deploy" button.
-   Once your build is complete, your Mastodon chatbot should be up and running on Netlify.

---
