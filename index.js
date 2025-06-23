// index.js

const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const express = require('express');
const db = require('./database');
const { executeCommand } = require('./command-handler');
const logic = require('./game-logic');

const app = express();
const port = 3000;
app.use(express.json());
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const YOUR_API_KEY = 'drednot123';
const mongoUri = process.env.MONGO_URI;

// --- Discord Bot Event Listeners ---
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));

client.on('interactionCreate', async (interaction) => {
    // For now, we only handle slash commands. Buttons would go here too.
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({ ephemeral: true });

    // Build the context object from the Discord interaction
    const context = {
        source: 'discord',
        identifier: interaction.user.id,
        interaction: interaction,
        args: interaction.options.data.map(opt => opt.value), // A simple way to get args
    };

    const replyMessage = await executeCommand(interaction.commandName, context);
    
    // Ensure there is a message to send before replying
    if (replyMessage) {
        // The reply might be an array (for new users) or a string
        await interaction.editReply({ content: Array.isArray(replyMessage) ? replyMessage.join('\n') : String(replyMessage) });
    } else {
        // Handle cases where a command might not return anything
        await interaction.editReply({ content: "Command executed." });
    }
});


// --- Web Server for In-Game Commands ---
app.get("/", (req, res) => res.send("Bot is alive!"));

app.post('/command', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== YOUR_API_KEY) return res.status(401).send('Error: Invalid API key');

    const { command, username, args } = req.body;
    
    // Build the context object from the in-game request
    const context = {
        source: 'game',
        identifier: username,
        args: args || [],
    };
    
    const replyMessage = await executeCommand(command, context);
    res.json({ reply: replyMessage });
});

// --- Main Startup Function ---
async function startServer() {
    if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
    await db.connectToDatabase(mongoUri);
    
    // Start background timers
    // setInterval(logic.processVendorTicks, logic.VENDOR_TICK_INTERVAL_MINUTES * 60 * 1000);
    // setInterval(logic.processLootboxVendorTick, logic.LOOTBOX_TICK_INTERVAL_MINUTES * 60 * 1000);
    // setInterval(logic.processFinishedSmelting, 15 * 1000); 

    // Login to Discord and start the web server
    client.login(process.env.DISCORD_TOKEN).then(() => {
        console.log("Discord bot has successfully logged in.");
        app.listen(port, () => {
            console.log(`Web server is listening on port ${port}.`);
        });
    }).catch(error => {
        console.error("Failed to log in to Discord:", error);
        process.exit(1);
    });
}

// --- Run the Bot ---
startServer();
