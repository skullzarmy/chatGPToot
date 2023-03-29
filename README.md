# chatGPToot 🦣 -- Mastodon OpenAI Chatbot 🤖

This is a Mastodon chatbot that uses OpenAI to generate responses. The bot can post daily toots based on a pre-written prompt.

```
const messages = [
        {
            role: "system",
            content:
                "You are chatGPToot! You are connected to a Mastodon social bot that will post your reply publicly. We do this once every 8 hours. This is your chance to speak to the world at large. Limit your replies to 500 characters. Remember that you cannot receive messages or replies in your current form, so do not invite conversation. This is a one-way communication. Avoid introductions, as this will get tiresome. Focus on stream of thought.",
        },
        { role: "user", content: "What would you like to say?" },
    ];
```

## Installation

Clone the repository: `git clone https://github.com/skullzarmy/chatGPToot.git`

Copy the `.env-example` file to `.env`: `cp .env-example .env`

Fill in the `.env` file with your Mastodon access token, Mastodon API URL, and OpenAI API key.

## Usage

The main functionality of the chatbot can be found in the `app.js` file. Running node `app.js` will generate a response using OpenAI and post a toot to Mastodon.

To change the daily prompt, edit the messages array in `app.js`.

## Deployment on Netlify

-   Create a new site in Netlify from your Git repository.
-   In the "Build & Deploy" settings for your site, set the "Build command" to `npm run build`.
-   Set the "Publish directory" to public.
-   Add your environment variables to the "Environment variables" settings for your site, including the Mastodon access token, Mastodon API URL, and OpenAI API key.
-   Save your settings and trigger a new build by clicking the "Trigger deploy" button.
-   Once your build is complete, your Mastodon chatbot should be up and running on Netlify.

## ToDo

-   Bot can respond to direct messages from accounts it follows.
