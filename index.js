// --- Library Imports ---
const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json());
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const YOUR_API_KEY = 'drednot123';

// --- MongoDB Setup ---
// (This section is unchanged)
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
const mongoClient = new MongoClient(mongoUri);
let economyCollection, verificationsCollection, marketCollection;
async function connectToDatabase() { try { await mongoClient.connect(); console.log("Connected to MongoDB!"); const db = mongoClient.db("drednot_economy"); economyCollection = db.collection("players"); verificationsCollection = db.collection("verifications"); marketCollection = db.collection("market_listings"); } catch (error) { console.error("DB connection failed", error); process.exit(1); } }

// --- ECONOMY DEFINITIONS ---
// (This section is unchanged)
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const DAILY_REWARD = 25;
const WORK_REWARD_MIN = 5, WORK_REWARD_MAX = 35, WORK_COOLDOWN_MINUTES = 1;
const GATHER_COOLDOWN_MINUTES = 3;
const MARKET_TAX_RATE = 0.05;
const FLIP_MIN_BET = 5, FLIP_MAX_BET = 100;
const SLOTS_MIN_BET = 10, SLOTS_MAX_BET = 1500, SLOTS_COOLDOWN_SECONDS = 5;
const ITEMS = { 'iron_ore': { name: "Iron Ore" }, 'copper_ore': { name: "Copper Ore" }, 'stone': { name: "Stone" }, 'wood': { name: "Wood" }, 'coal': { name: "Coal" }, 'basic_pickaxe': { name: "Basic Pickaxe", craftable: true, recipe: { 'stone': 5, 'wood': 2 } }, 'sturdy_pickaxe': { name: "Sturdy Pickaxe", craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } } };
const GATHER_TABLE = { 'iron_ore': { baseChance: 0.60, minQty: 1, maxQty: 3 }, 'copper_ore': { baseChance: 0.40, minQty: 1, maxQty: 2 }, 'stone': { baseChance: 0.70, minQty: 2, maxQty: 5 }, 'wood': { baseChance: 0.50, minQty: 1, maxQty: 4 }, 'coal': { baseChance: 0.30, minQty: 1, maxQty: 2 } };
const SLOT_REELS = [ ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔']];
const SLOTS_PAYOUTS = { three_of_a_kind: 15, two_of_a_kind: 3.5, jackpot_symbol: '💎', jackpot_multiplier: 50 };

// --- DATABASE HELPER FUNCTIONS ---
// (This section is unchanged)
async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(drednotName) { const lowerName = drednotName.toLowerCase(); const newAccount = { _id: lowerName, balance: STARTING_BALANCE, discordId: null, lastWork: null, lastGather: null, lastDaily: null, lastSlots: null, inventory: {} }; await economyCollection.insertOne(newAccount); return newAccount; }
async function updateAccount(accountId, updates) { await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates }); }
async function modifyInventory(accountId, itemId, amount) { if (!itemId) return; const updateField = `inventory.${itemId}`; await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $inc: { [updateField]: amount } }); }
function getItemIdByName(name) { return Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === name.toLowerCase()); }
function formatDuration(seconds) { if (seconds < 60) return `${Math.ceil(seconds)}s`; const minutes = Math.floor(seconds / 60); const remainingSeconds = Math.ceil(seconds % 60); return `${minutes}m ${remainingSeconds}s`; }

// --- COMMAND HANDLER LOGIC (New leaderboard handler added) ---
async function handleWork(account) { /* ... unchanged ... */ }
async function handleGather(account) { /* ... unchanged ... */ }
function handleInventory(account) { /* ... unchanged ... */ }
function handleRecipes() { /* ... unchanged ... */ }
async function handleCraft(account, itemName) { /* ... unchanged ... */ }
async function handleDaily(account) { /* ... unchanged ... */ }
async function handleFlip(account, amount, choice) { /* ... unchanged ... */ }
async function handleSlots(account, amount) { /* ... unchanged ... */ }

// --- NEW LEADERBOARD FUNCTION ---
async function handleLeaderboard() {
    const topPlayers = await economyCollection.find()
        .sort({ balance: -1 }) // Sort by balance, highest first
        .limit(10) // Get the top 10
        .toArray();

    if (topPlayers.length === 0) {
        return "The leaderboard is empty!";
    }

    let lbMessage = [`**🏆 Top 10 Richest Players 🏆**`];
    topPlayers.forEach((player, index) => {
        lbMessage.push(`${index + 1}. **${player._id}** - ${player.balance} ${CURRENCY_NAME}`);
    });
    return lbMessage; // Return an array for multi-line messages
}

// =========================================================================
// --- DISCORD BOT LOGIC (Updated) ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in!`));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    // ... (Code is mostly the same, just a new case for leaderboard)
    // Add the /leaderboard case
    switch (commandName) {
        // ... all previous cases
        case 'leaderboard':
            const lbMessage = await handleLeaderboard();
            await interaction.editReply({ content: Array.isArray(lbMessage) ? lbMessage.join('\n') : lbMessage });
            break;
    }
});

// =========================================================================
// --- WEB SERVER LOGIC (Updated) ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));

app.post('/command', async (req, res) => {
    // ... (unchanged security and user checks)
    
    // Add the !lb / !leaderboard case
    switch (command) {
        // ... all previous cases
        case 'lb':
        case 'leaderboard':
            responseMessage = await handleLeaderboard(); // The handler returns an array
            break;
    }

    // The response handler now expects an array or a string
    res.status(200).json({ reply: responseMessage });
});

// --- STARTUP ---
async function startServer() {
    await connectToDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    app.listen(3000, () => console.log(`Web server is listening.`));
}
startServer();
