// index.js (Refactored)

// --- Library Imports ---
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// --- Local Module Imports ---
const { connectToDatabase } = require('./utils/database');
const { handleSlashCommand } = require('./handlers/slashHandler');
const { handleApiCommand } = require('./handlers/apiHandler');
const { startTickingProcesses } = require('./utils/tickers');

// =========================================================================
// --- STABILITY: GLOBAL ERROR HANDLERS ---
// =========================================================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Uncaught Exception:', error);
});
// =========================================================================

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json()); // Middleware to parse JSON bodies

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- Event Listeners & API Routes ---

// The main entry point for all Discord interactions
client.on('interactionCreate', handleSlashCommand);

// A simple health-check endpoint
app.get("/", (req, res) => res.send("Bot is alive and ticking!"));

// The main entry point for all in-game commands from Drednot
app.post('/command', handleApiCommand);

// --- Server Initialization ---
async function startServer() {
    // 1. Connect to the database
    await connectToDatabase();
    
    // 2. Start the API server
    app.listen(port, () => console.log(`API server listening on port ${port}!`));
    
    // 3. Log in to Discord
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Discord bot logged in as ${client.user.tag}!`);

    // 4. Start all background processes (tickers)
    startTickingProcesses(client);
    console.log("Background ticker processes have been started.");
}

// Start the application
startServer();
