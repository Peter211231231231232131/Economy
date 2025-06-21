// index.js - Full updated code

// --- Library Imports ---
const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const express = require('express');
const fs = require('fs');

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json());
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const YOUR_API_KEY = 'drednot123';

// =========================================================================
// --- NEW: ITEM AND GATHERING DEFINITIONS ---
// =========================================================================
const GATHER_RESOURCES_TABLE = {
    'iron_ore':   { name: "Iron Ore", baseChance: 0.60, minQty: 1, maxQty: 3 },
    'copper_ore': { name: "Copper Ore", baseChance: 0.40, minQty: 1, maxQty: 2 },
    'stone':      { name: "Stone", baseChance: 0.70, minQty: 2, maxQty: 5 },
    'wood':       { name: "Wood", baseChance: 0.50, minQty: 1, maxQty: 4 },
    'coal':       { name: "Coal", baseChance: 0.30, minQty: 1, maxQty: 2 },
};
const GATHER_COOLDOWN_MINUTES = 3;

// =========================================================================
// --- SHARED ECONOMY LOGIC & DATABASE ---
// =========================================================================
const DATA_DIR = './data';
const ECONOMY_STORAGE_FILE = `${DATA_DIR}/economy_data.json`;
const PENDING_VERIFICATIONS_FILE = `${DATA_DIR}/pending_verifications.json`;
let economyData = {};
let pendingVerifications = {};
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const WORK_REWARD_MIN = 5;
const WORK_REWARD_MAX = 25;
const WORK_COOLDOWN_MINUTES = 2;

function loadData() { /* ... unchanged ... */ try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); if (fs.existsSync(ECONOMY_STORAGE_FILE)) economyData = JSON.parse(fs.readFileSync(ECONOMY_STORAGE_FILE)); else economyData = {}; if (fs.existsSync(PENDING_VERIFICATIONS_FILE)) pendingVerifications = JSON.parse(fs.readFileSync(PENDING_VERIFICATIONS_FILE)); else pendingVerifications = {}; console.log('Databases loaded.'); } catch (err) { console.error('Error loading data:', err); } }
async function saveData() { /* ... unchanged ... */ try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); await fs.promises.writeFile(ECONOMY_STORAGE_FILE, JSON.stringify(economyData, null, 2)); await fs.promises.writeFile(PENDING_VERIFICATIONS_FILE, JSON.stringify(pendingVerifications, null, 2)); } catch (err) { console.error('Error saving data:', err); } }
function getAccountKey(identifier) { /* ... unchanged ... */ const idStr = String(identifier).toLowerCase(); for (const key in economyData) if (key.toLowerCase() === idStr) return key; for (const key in economyData) if (economyData[key].discordId === String(identifier)) return key; return null; }

// UPDATED: createNewAccount now includes an inventory
async function createNewAccount(drednotName) {
    const lowerName = drednotName.toLowerCase();
    economyData[lowerName] = { 
        balance: STARTING_BALANCE, 
        discordId: null, 
        lastWork: null,
        lastGather: null, // For gather cooldown
        inventory: {}    // Player's item storage
    };
    await saveData();
    return economyData[lowerName];
}

async function handleWorkCommand(accountKey) { /* ... unchanged ... */ const account = economyData[accountKey]; if (!account) return { success: false, message: 'Account not found.' }; const now = Date.now(); const cooldown = WORK_COOLDOWN_MINUTES * 60 * 1000; if (account.lastWork && (now - account.lastWork) < cooldown) { const remaining = cooldown - (now - account.lastWork); return { success: false, message: `On cooldown. Wait ${Math.ceil(remaining / 60000)} min.` }; } const earnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN; account.balance += earnings; account.lastWork = now; await saveData(); return { success: true, message: `You earned ${earnings} ${CURRENCY_NAME}! New balance: ${account.balance}.` }; }

// --- NEW: Logic for the gather command ---
async function handleGatherCommand(accountKey) {
    const account = economyData[accountKey];
    if (!account) return { success: false, message: 'Account not found.' };
    const now = Date.now();
    const cooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000;
    if (account.lastGather && (now - account.lastGather) < cooldown) {
        const remaining = cooldown - (now - account.lastGather);
        return { success: false, message: `You are tired. Wait ${Math.ceil(remaining / 60000)} min to gather again.` };
    }

    let gatheredItems = [];
    for (const itemId in GATHER_RESOURCES_TABLE) {
        const itemInfo = GATHER_RESOURCES_TABLE[itemId];
        if (Math.random() < itemInfo.baseChance) {
            const qty = Math.floor(Math.random() * (itemInfo.maxQty - itemInfo.minQty + 1)) + itemInfo.minQty;
            account.inventory[itemId] = (account.inventory[itemId] || 0) + qty;
            gatheredItems.push(`${qty}x ${itemInfo.name}`);
        }
    }

    account.lastGather = now;
    await saveData();

    if (gatheredItems.length === 0) {
        return { success: true, message: 'You searched but found nothing of value.' };
    }
    return { success: true, message: `You gathered: ${gatheredItems.join(', ')}.` };
}

// --- NEW: Logic for the inventory command ---
function handleInventoryCommand(accountKey) {
    const account = economyData[accountKey];
    if (!account || !account.inventory || Object.keys(account.inventory).length === 0) {
        return 'Your inventory is empty.';
    }
    let invList = ['Your inventory:'];
    for (const itemId in account.inventory) {
        const itemName = GATHER_RESOURCES_TABLE[itemId]?.name || itemId;
        invList.push(`- ${account.inventory[itemId]}x ${itemName}`);
    }
    return invList.join('\n');
}

// =========================================================================
// --- Discord Bot Logic (Updated with new commands) ---
// =========================================================================
client.on('ready', () => { /* ... unchanged ... */ console.log(`Bot logged in!`); loadData(); });

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, user } = interaction;
    await interaction.deferReply({ ephemeral: true });
    const accountKey = getAccountKey(user.id);

    if (commandName === 'link') { /* ... unchanged ... */ }
    
    if (!accountKey) {
        return interaction.editReply({ content: 'Your account is not linked. Use `/link` first.' });
    }

    // --- UPDATED: Handle new commands ---
    switch (commandName) {
        case 'balance':
            await interaction.editReply({ content: `Your balance is: ${economyData[accountKey].balance} ${CURRENCY_NAME}.` });
            break;
        case 'work':
            const workResult = await handleWorkCommand(accountKey);
            await interaction.editReply({ content: workResult.message });
            break;
        case 'gather':
            const gatherResult = await handleGatherCommand(accountKey);
            await interaction.editReply({ content: gatherResult.message });
            break;
        case 'inventory':
            const invMessage = handleInventoryCommand(accountKey);
            await interaction.editReply({ content: invMessage });
            break;
    }
});

// =========================================================================
// --- Web Server Logic (Updated with new commands) ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));

app.post('/command', async (req, res) => {
    // ... (security check unchanged) ...
    const { command, username } = req.body;
    let responseMessage = '';
    let accountKey = getAccountKey(username);

    if (command === 'verify') { /* ... unchanged ... */ }
    
    if (!accountKey) {
        await createNewAccount(username);
        return res.json({ reply: `Welcome, ${username}! Account created. Go to Discord and use \`/link ${username}\` to link.` });
    }
    
    // --- UPDATED: Handle new commands ---
    let result;
    switch (command) {
        case 'bal':
        case 'balance':
            responseMessage = `${username}, your balance is: ${economyData[accountKey].balance} ${CURRENCY_NAME}.`;
            break;
        case 'work':
            result = await handleWorkCommand(accountKey);
            responseMessage = `${username}, ${result.message}`;
            break;
        case 'gather':
            result = await handleGatherCommand(accountKey);
            responseMessage = `${username}, ${result.message}`;
            break;
        case 'inv':
        case 'inventory':
            responseMessage = handleInventoryCommand(accountKey);
            break;
        default:
            responseMessage = `Unknown command: !${command}`;
    }
    res.status(200).json({ reply: responseMessage });
});

// --- Start Everything ---
client.login(process.env.DISCORD_TOKEN);
app.listen(3000, () => console.log("Web server is listening."));
