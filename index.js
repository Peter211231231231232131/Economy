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
// (Unchanged)
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
const mongoClient = new MongoClient(mongoUri);
let economyCollection, verificationsCollection, marketCollection;
async function connectToDatabase() { try { await mongoClient.connect(); console.log("Connected to MongoDB!"); const db = mongoClient.db("drednot_economy"); economyCollection = db.collection("players"); verificationsCollection = db.collection("verifications"); marketCollection = db.collection("market_listings"); } catch (error) { console.error("DB connection failed", error); process.exit(1); } }

// =========================================================================
// --- ECONOMY DEFINITIONS (with NPC Vendor items) ---
// =========================================================================
const CURRENCY_NAME = 'Bits';
// ... (Other constants are unchanged) ...

const ITEMS = {
    'iron_ore': { name: "Iron Ore", emoji: "🔩" },
    'copper_ore': { name: "Copper Ore", emoji: "🟤" },
    'stone': { name: "Stone", emoji: "🪨" },
    'wood': { name: "Wood", emoji: "🪵" },
    'coal': { name: "Coal", emoji: "⚫" },
    'basic_pickaxe': { name: "Basic Pickaxe", emoji: "⛏️", craftable: true, recipe: { 'stone': 5, 'wood': 2 } },
    'sturdy_pickaxe': { name: "Sturdy Pickaxe", emoji: "⚒️", craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } },
};
// ... (Other definitions like GATHER_TABLE are unchanged) ...

// --- NEW: NPC VENDOR CONFIGURATION ---
const NEXUS_SELLER_NAME = "Nexus Logistics";
const NEXUS_SUPPLY_DROP_INTERVAL_MINUTES = 45;
const NEXUS_SUPPLY_DROP_ITEMS = [
    { itemId: 'basic_pickaxe', weight: 5, price: 15 },
    { itemId: 'sturdy_pickaxe', weight: 2, price: 75 },
];

const COMP5_SELLER_NAME = "TerraNova Exports";
const COMP5_SALES_INTERVAL_MINUTES = 20;
const COMP5_SALES_ITEMS = [
    { itemId: 'wood', quantity: 20, price: 1 },
    { itemId: 'stone', quantity: 20, price: 1 },
    { itemId: 'coal', quantity: 15, price: 2 },
    { itemId: 'iron_ore', quantity: 10, price: 3 },
];
// ------------------------------------

// =========================================================================
// --- DATABASE & COMMAND HANDLERS (with NPC Logic) ---
// =========================================================================
// (Most helper functions are unchanged)

// --- NEW: NPC VENDOR LOGIC ---
async function processNexusSupplyDrop() {
    console.log("Checking for Nexus Supply Drop...");
    // Simple chance to drop an item each interval
    if (Math.random() < 0.5) { // 50% chance to drop something
        const weightedList = [];
        NEXUS_SUPPLY_DROP_ITEMS.forEach(item => {
            for (let i = 0; i < item.weight; i++) weightedList.push(item);
        });
        const selectedItem = weightedList[Math.floor(Math.random() * weightedList.length)];
        
        await marketCollection.insertOne({
            sellerId: "NPC_NEXUS",
            sellerName: NEXUS_SELLER_NAME,
            itemId: selectedItem.itemId,
            quantity: 1,
            price: selectedItem.price
        });
        console.log(`Nexus listed 1x ${ITEMS[selectedItem.itemId].name} for sale!`);
    }
}

async function processComp5Sales() {
    console.log("Checking for TerraNova Exports restock...");
    // Simple chance to list one of their items
    if (Math.random() < 0.75) { // 75% chance to list something
        const selectedItem = COMP5_SALES_ITEMS[Math.floor(Math.random() * COMP5_SALES_ITEMS.length)];
        
        await marketCollection.insertOne({
            sellerId: "NPC_COMP5",
            sellerName: COMP5_SELLER_NAME,
            itemId: selectedItem.itemId,
            quantity: selectedItem.quantity,
            price: selectedItem.price
        });
        console.log(`TerraNova Exports listed ${selectedItem.quantity}x ${ITEMS[selectedItem.itemId].name} for sale!`);
    }
}
// -----------------------------

// (The rest of the command handlers like handleWork, handleGather, etc., are unchanged)

// =========================================================================
// --- DISCORD BOT LOGIC (Unchanged) ---
// =========================================================================
// (The interactionCreate and handleSlashCommand functions are exactly the same as before)


// =========================================================================
// --- WEB SERVER LOGIC (Unchanged) ---
// =========================================================================
// (The app.get and app.post functions are exactly the same as before)


// =========================================================================
// --- STARTUP (Updated to include NPC timers) ---
// =========================================================================
async function startServer() {
    await connectToDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    app.listen(3000, () => console.log(`Web server is listening.`));

    // --- NEW: Start the background timers for NPC vendors ---
    console.log(`Starting NPC vendor timers...`);
    setInterval(processNexusSupplyDrop, NEXUS_SUPPLY_DROP_INTERVAL_MINUTES * 60 * 1000);
    setInterval(processComp5Sales, COMP5_SALES_INTERVAL_MINUTES * 60 * 1000);
    // ----------------------------------------------------
}

startServer();
