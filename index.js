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

// =========================================================================
// --- MONGODB DATABASE & IN-MEMORY STATE ---
// =========================================================================
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
const mongoClient = new MongoClient(mongoUri);
let economyCollection, verificationsCollection, marketCollection;

let userPaginationData = {}; // Stores { identifier: { lines: [], currentPage: 0, type: '', title: '' } }

async function connectToDatabase() { try { await mongoClient.connect(); console.log("Connected to MongoDB!"); const db = mongoClient.db("drednot_economy"); economyCollection = db.collection("players"); verificationsCollection = db.collection("verifications"); marketCollection = db.collection("market_listings"); } catch (error) { console.error("DB connection failed", error); process.exit(1); } }

// =========================================================================
// --- ECONOMY DEFINITIONS ---
// =========================================================================
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const DAILY_REWARD = 25;
const WORK_REWARD_MIN = 5, WORK_REWARD_MAX = 35, WORK_COOLDOWN_MINUTES = 1;
const GATHER_COOLDOWN_MINUTES = 3, MAX_GATHER_TYPES_BASE = 2;
const MARKET_TAX_RATE = 0.05;
const FLIP_MIN_BET = 5, FLIP_MAX_BET = 100;
const SLOTS_MIN_BET = 10, SLOTS_MAX_BET = 1500, SLOTS_COOLDOWN_SECONDS = 5;
const SMELT_COOLDOWN_SECONDS_PER_ORE = 30, SMELT_COAL_COST_PER_ORE = 1;
const ITEMS = { 'iron_ore': { name: "Iron Ore", emoji: "🔩" }, 'copper_ore': { name: "Copper Ore", emoji: "🟤" }, 'wood': { name: "Wood", emoji: "🪵" }, 'stone': { name: "Stone", emoji: "🪨" }, 'coal': { name: "Coal", emoji: "⚫" }, 'raw_crystal':{ name: "Raw Crystal", emoji: "💎" }, 'iron_ingot': { name: "Iron Ingot", emoji: "⛓️" }, 'copper_ingot':{ name: "Copper Ingot", emoji: "🧡" }, 'basic_pickaxe': { name: "Basic Pickaxe", emoji: "⛏️", type: "tool", effects: { work_bonus_flat: 1 }, craftable: true, recipe: { 'stone': 5, 'wood': 2 } }, 'sturdy_pickaxe': { name: "Sturdy Pickaxe", emoji: "⚒️", type: "tool", effects: { work_bonus_percent: 0.10 }, craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } }, 'iron_pickaxe': { name: "Iron Pickaxe", emoji: "🦾", type: "tool", effects: { work_bonus_flat: 5 }, craftable: true, recipe: { 'iron_ingot': 5, 'wood': 2} }, 'crystal_pickaxe': { name: "Crystal Pickaxe", emoji: "💠", type: "tool", effects: { work_bonus_percent: 0.30 }, craftable: true, recipe: { 'sturdy_pickaxe': 1, 'raw_crystal': 3, 'iron_ore': 5 } }, 'gathering_basket': { name: "Gathering Basket", emoji: "🧺", type: "tool", craftable: true, recipe: { 'wood': 15, 'stone': 5 } }, 'smelter': { name: "Smelter", emoji: "🔥", type: "tool", craftable: true, recipe: { 'stone': 9 } } };
const GATHER_TABLE = { 'iron_ore': { baseChance: 0.60, minQty: 1, maxQty: 3 }, 'copper_ore': { baseChance: 0.40, minQty: 1, maxQty: 2 }, 'stone': { baseChance: 0.70, minQty: 2, maxQty: 5 }, 'wood': { baseChance: 0.50, minQty: 1, maxQty: 4 }, 'coal': { baseChance: 0.30, minQty: 1, maxQty: 2 }, 'raw_crystal':{ baseChance: 0.05, minQty: 1, maxQty: 1 } };
const SMELTABLE_ORES = { 'iron_ore': 'iron_ingot', 'copper_ore': 'copper_ingot' };
const SLOT_REELS = [ ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔']];
const SLOTS_PAYOUTS = { three_of_a_kind: 15, two_of_a_kind: 3.5, jackpot_symbol: '💎', jackpot_multiplier: 50 };
const VENDOR_TICK_INTERVAL_MINUTES = 5;
const VENDORS = [ { name: "TerraNova Exports", sellerId: "NPC_TERRA", stock: [ { itemId: 'wood', quantity: 20, price: 1 }, { itemId: 'stone', quantity: 20, price: 1 } ], chance: 0.5 }, { name: "Nexus Logistics", sellerId: "NPC_NEXUS", stock: [ { itemId: 'basic_pickaxe', quantity: 1, price: 15 }, { itemId: 'sturdy_pickaxe', quantity: 1, price: 75 } ], chance: 0.3 }, { name: "Blackrock Mining Co.", sellerId: "NPC_BLACKROCK", stock: [ { itemId: 'coal', quantity: 15, price: 2 }, { itemId: 'iron_ore', quantity: 10, price: 3 } ], chance: 0.4 }, { name: "Copperline Inc.", sellerId: "NPC_COPPER", stock: [ { itemId: 'copper_ore', quantity: 10, price: 4 } ], chance: 0.2 }, { name: "Junk Peddler", sellerId: "NPC_JUNK", stock: [ { itemId: 'stone', quantity: 5, price: 1 }, { itemId: 'wood', quantity: 5, price: 1 } ], chance: 0.6 } ];

// =========================================================================
// --- DATABASE & COMMAND HANDLERS ---
// =========================================================================
async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(drednotName) { const lowerName = drednotName.toLowerCase(); const newAccount = { _id: lowerName, balance: STARTING_BALANCE, discordId: null, lastWork: null, lastGather: null, lastDaily: null, lastSlots: null, inventory: {}, smelting: null }; await economyCollection.insertOne(newAccount); return newAccount; }
async function updateAccount(accountId, updates) { await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates }); }
async function modifyInventory(accountId, itemId, amount) { if (!itemId) return; const updateField = `inventory.${itemId}`; await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $inc: { [updateField]: amount } }); }
function getItemIdByName(name) { return Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === name.toLowerCase()); }
function formatDuration(seconds) { if (seconds < 60) return `${Math.ceil(seconds)}s`; const minutes = Math.floor(seconds / 60); const remainingSeconds = Math.ceil(seconds % 60); return `${minutes}m ${remainingSeconds}s`; }
function sendPaginatedMessage(identifier, type, allLines, title) { const linesPerPage = 5; if (!userPaginationData[identifier] || userPaginationData[identifier].type !== type) { userPaginationData[identifier] = { lines: allLines, currentPage: 0, type, title }; } const session = userPaginationData[identifier]; const totalPages = Math.ceil(session.lines.length / linesPerPage); if (session.currentPage >= totalPages && totalPages > 0) session.currentPage = totalPages - 1; if (session.currentPage < 0) session.currentPage = 0; const startIndex = session.currentPage * linesPerPage; const linesForPage = session.lines.slice(startIndex, startIndex + linesPerPage); let footer = `Page ${session.currentPage + 1}/${totalPages}.`; if (session.currentPage > 0) footer += ' Use `/back` or `!p`.'; if (session.currentPage < totalPages - 1) footer += ' Use `/next` or `!n`.'; return [`**--- ${title} ---**`, ...linesForPage, footer]; }
async function handleWork(account) { /* ... same as before ... */ }
async function handleGather(account) { /* ... same as before ... */ }
function handleInventory(account) { /* ... same as before ... */ }
function handleRecipes() { /* ... same as before ... */ }
async function handleCraft(account, itemName) { /* ... same as before ... */ }
async function handleDaily(account) { /* ... same as before ... */ }
async function handleFlip(account, amount, choice) { /* ... same as before ... */ }
async function handleSlots(account, amount) { /* ... same as before ... */ }
async function handleTimers(account) { /* ... same as before ... */ }
async function handleSmelt(account, oreName, quantity) { /* ... same as before ... */ }
async function handleMarket() { const listings = await marketCollection.find().sort({ _id: -1 }).toArray(); if (listings.length === 0) return ["The market is empty."]; return listings.map(l => `(ID: \`${l._id.toString().slice(-6)}\`) ${ITEMS[l.itemId]?.emoji || '📦'} **${l.quantity}x** ${ITEMS[l.itemId].name} @ **${l.price}** ${CURRENCY_NAME} ea. by *${l.sellerName}*`); }
async function handleLeaderboard() { const topPlayers = await economyCollection.find().sort({ balance: -1 }).limit(50).toArray(); if (topPlayers.length === 0) return ["The leaderboard is empty!"]; return topPlayers.map((player, index) => `${index + 1}. **${player._id}** - ${player.balance} ${CURRENCY_NAME}`); }
async function processVendorTicks() { /* ... same as before ... */ }
async function processFinishedSmelting() { /* ... same as before ... */ }

// =========================================================================
// --- DISCORD BOT LOGIC ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
        await handleSlashCommand(interaction);
    } catch (error) { console.error("Error handling slash command:", error); if (interaction.replied || interaction.deferred) await interaction.editReply({ content: 'An unexpected error occurred!' }); }
});

async function handleSlashCommand(interaction) {
    const { commandName, user, options } = interaction;
    const identifier = user.id;

    if (commandName === 'next' || commandName === 'back') {
        const session = userPaginationData[identifier];
        if (!session) return interaction.reply({ content: 'You have no active list to navigate.', ephemeral: true });
        if (commandName === 'next') session.currentPage++; else session.currentPage--;
        const paginatedMessage = sendPaginatedMessage(identifier, session.type, session.lines, session.title);
        return interaction.reply({ content: paginatedMessage.join('\n'), ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (commandName === 'link') { /* ... unchanged ... */ }

    const account = await getAccount(identifier);
    if (!account && commandName !== 'link') return interaction.editReply({ content: 'Your account is not linked. Use `/link` first.' });
    
    let result, lines, title;
    switch (commandName) {
        case 'market': lines = await handleMarket(); title = "Market"; result = sendPaginatedMessage(identifier, commandName, lines, title); await interaction.editReply({ content: result.join('\n') }); break;
        case 'leaderboard': lines = await handleLeaderboard(); title = "Leaderboard"; result = sendPaginatedMessage(identifier, commandName, lines, title); await interaction.editReply({ content: result.join('\n') }); break;
        // ... (all other non-paginated commands are the same)
    }
}

// =========================================================================
// --- WEB SERVER LOGIC ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));

app.post('/command', async (req, res) => {
    const { command, username, args } = req.body;
    const identifier = username.toLowerCase();
    
    // Handle pagination commands for in-game
    if (command === 'n' || command === 'next' || command === 'p' || command === 'back') {
        const session = userPaginationData[identifier];
        if (!session) return res.json({ reply: 'You have no active list to navigate. Run a list command like !market first.' });
        if (command === 'n' || command === 'next') session.currentPage++; else session.currentPage--;
        const paginatedMessage = sendPaginatedMessage(identifier, session.type, session.lines, session.title);
        return res.json({ reply: paginatedMessage.map(line => line.replace(/\*|`|>/g, '').replace(/<a?:.+?:\d+>/g, '')) });
    }

    // ... (verification and account creation logic is the same)
    
    let result, lines, title;
    switch (command) {
        // ... all other non-paginated commands
        case 'm': case 'market': lines = await handleMarket(); title = "Market"; result = sendPaginatedMessage(identifier, command, lines, title); responseMessage = result.map(line => line.replace(/\*|`|>/g, '').replace(/<a?:.+?:\d+>/g, '')); break;
        case 'lb': case 'leaderboard': lines = await handleLeaderboard(); title = "Leaderboard"; result = sendPaginatedMessage(identifier, command, lines, title); responseMessage = result.map(line => line.replace(/\*|`|>/g, '')); break;
    }
    res.json({ reply: responseMessage });
});

// =========================================================================
// --- STARTUP ---
// =========================================================================
async function startServer() {
    await connectToDatabase();
    console.log(`Starting background timers...`);
    setInterval(processVendorTicks, VENDOR_TICK_INTERVAL_MINUTES * 60 * 1000);
    setInterval(processFinishedSmelting, 15 * 1000);
    client.login(process.env.DISCORD_TOKEN).then(() => {
        console.log("Discord bot has successfully logged in.");
        app.listen(3000, () => {
            console.log(`Web server is listening.`);
        });
    }).catch(error => {
        console.error("Failed to log in to Discord:", error);
        process.exit(1);
    });
}

startServer();
