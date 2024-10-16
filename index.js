const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const app = express();
const port = process.env.PORT || 3001;

// Discord bot token
const token = process.env.DISCORD_TOKEN;
const roleId = process.env.ROLE_ID;

// GitHub OAuth credentials
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// Map to store temporary state for user verifications
const stateMap = new Map();

// Function to send verification button message
async function sendVerificationMessage(channel) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('verify_button')
                .setLabel('Verify with GitHub')
                .setStyle(ButtonStyle.Primary)
        );

    await channel.send({
        content: 'Click the button below to verify your GitHub account:',
        components: [row],
    });
    console.log('Sent verification message');
}

// Send the verification message on bot startup
client.once('ready', async () => {
    console.log('Bot is logged in and ready!');
    // Send the message to a specific channel in your server
    const guild = client.guilds.cache.get(process.env.GUILD_ID); // Replace with your guild ID
    if (guild) {
        const channel = guild.channels.cache.get(process.env.CHANNEL_ID); // Replace with your channel ID
        if (channel) {
            await sendVerificationMessage(channel);
        } else {
            console.error('Channel not found');
        }
    } else {
        console.error('Guild not found');
    }
});

// Send the verification message when the bot joins a new guild
client.on('guildCreate', async guild => {
    const defaultChannel = guild.systemChannel || guild.channels.cache.find(channel => channel.type === 'GUILD_TEXT' && channel.permissionsFor(guild.me).has('SEND_MESSAGES'));
    if (defaultChannel) {
        await sendVerificationMessage(defaultChannel);
    } else {
        console.error('No default channel found or lacking permissions');
    }
});

// Interaction handler for the button
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'verify_button') {
        const state = Math.random().toString(36).substring(2);
        stateMap.set(state, interaction.user.id); // Store the user ID for state validation

        // Generate the authentication URL
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        await interaction.reply({
            content: `Click [here](${authUrl}) to authenticate with GitHub.`,
            ephemeral: true, // Sends a private message to the user
        });
    }
});

// Root route for debugging purposes
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// GitHub OAuth callback endpoint
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!stateMap.has(state)) {
        return res.status(400).send('Invalid state.');
    }

    const userId = stateMap.get(state);
    stateMap.delete(state);

    try {
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: githubClientId,
            client_secret: githubClientSecret,
            code,
            redirect_uri: redirectUri,
            state,
        }, {
            headers: { 'Accept': 'application/json' }
        });

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `token ${accessToken}` }
        });

        const createdAt = new Date(userResponse.data.created_at);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        if (createdAt < oneYearAgo) {
            const guild = client.guilds.cache.first();
            const member = await guild.members.fetch(userId);
            await member.roles.add(roleId);
            res.send('You have been verified and granted the role!');
        } else {
            res.send('Your GitHub account is not old enough.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error.');
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Log in to Discord with the bot token
client.login(token).then(() => {
    console.log('Bot is logged in');
}).catch(console.error);
