// index.js (Full Updated Script)

// --- Library Imports ---
const { Client, GatewayIntentBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
let economyCollection, verificationsCollection, marketCollection, lootboxCollection;
let userPaginationData = {};

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy");
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
        marketCollection = db.collection("market_listings");
        lootboxCollection = db.collection("lootbox_listings");
        console.log("Database collections are set up.");
    } catch (error) { console.error("DB connection failed", error); process.exit(1); }
}

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
const ITEMS = { 
    'iron_ore': { name: "Iron Ore", emoji: "🔩" }, 
    'copper_ore': { name: "Copper Ore", emoji: "🟤" }, 
    'wood': { name: "Wood", emoji: "🪵" }, 
    'stone': { name: "Stone", emoji: "🪨" }, 
    'coal': { name: "Coal", emoji: "⚫" }, 
    'raw_crystal':{ name: "Raw Crystal", emoji: "💎" }, 
    'iron_ingot': { name: "Iron Ingot", emoji: "⛓️" }, 
    'copper_ingot':{ name: "Copper Ingot", emoji: "🧡" }, 
    'basic_pickaxe': { name: "Basic Pickaxe", emoji: "⛏️", type: "tool", effects: { work_bonus_flat: 1 }, craftable: true, recipe: { 'stone': 5, 'wood': 2 } }, 
    'sturdy_pickaxe': { name: "Sturdy Pickaxe", emoji: "⚒️", type: "tool", effects: { work_bonus_percent: 0.10 }, craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } }, 
    'iron_pickaxe': { name: "Iron Pickaxe", emoji: "🦾", type: "tool", effects: { work_bonus_flat: 5 }, craftable: true, recipe: { 'iron_ingot': 5, 'wood': 2} }, 
    'crystal_pickaxe': { name: "Crystal Pickaxe", emoji: "💠", type: "tool", effects: { work_bonus_percent: 0.30 }, craftable: true, recipe: { 'sturdy_pickaxe': 1, 'raw_crystal': 3, 'iron_ore': 5 } }, 
    'gathering_basket': { name: "Gathering Basket", emoji: "🧺", type: "tool", craftable: true, recipe: { 'wood': 15, 'stone': 5 } }, 
    'smelter': { name: "Smelter", emoji: "🔥", type: "tool", craftable: true, recipe: { 'stone': 9 } },
    // --- NEW & UPDATED FOOD ITEMS ---
    'wild_berries': { name: "Wild Berries", emoji: "🫐", type: "food", buff: { duration_ms: 5 * 60 * 1000, effects: { gather_cooldown_reduction_ms: 10 * 1000 } } },
    'glow_mushroom': { name: "Glow Mushroom", emoji: "🍄", type: "food", buff: { duration_ms: 10 * 60 * 1000, effects: { gather_cooldown_reduction_ms: 5 * 1000 } } },
    'raw_meat': { name: "Raw Meat", emoji: "🍖", type: "food", buff: { duration_ms: 1 * 60 * 1000, effects: { work_bonus_percent: -0.10 } } }, // Debuff!
    'smoked_meat': { name: "Smoked Meat", emoji: "🥩", type: "food", buff: { duration_ms: 5 * 60 * 1000, effects: { work_cooldown_reduction_ms: 15 * 1000 } } },
    'spicy_pepper': { name: "Spicy Pepper", emoji: "🌶️", type: "food", buff: { duration_ms: 3 * 60 * 1000, effects: { work_double_or_nothing: true } } },
};
const GATHER_TABLE = { 
    'iron_ore': { baseChance: 0.60, minQty: 1, maxQty: 3 }, 
    'copper_ore': { baseChance: 0.40, minQty: 1, maxQty: 2 }, 
    'stone': { baseChance: 0.70, minQty: 2, maxQty: 5 }, 
    'wood': { baseChance: 0.50, minQty: 1, maxQty: 4 }, 
    'coal': { baseChance: 0.30, minQty: 1, maxQty: 2 }, 
    'raw_crystal':{ baseChance: 0.05, minQty: 1, maxQty: 1 },
    'wild_berries': { baseChance: 0.15, minQty: 1, maxQty: 1 },
    'glow_mushroom': { baseChance: 0.10, minQty: 1, maxQty: 1 },
    'raw_meat': { baseChance: 0.20, minQty: 1, maxQty: 1 }, // 20% chance
    'spicy_pepper': { baseChance: 0.03, minQty: 1, maxQty: 1 }, // 3% chance (rare)
};
const SMELTABLE_ORES = { 'iron_ore': 'iron_ingot', 'copper_ore': 'copper_ingot' };
const COOKABLE_FOODS = { 'raw_meat': 'smoked_meat' }; // New constant for cooking
const SLOT_REELS = [ ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔']];
const SLOTS_PAYOUTS = { three_of_a_kind: 15, two_of_a_kind: 3.5, jackpot_symbol: '💎', jackpot_multiplier: 50 };
const VENDOR_TICK_INTERVAL_MINUTES = 1;
const VENDORS = [ { name: "TerraNova Exports", sellerId: "NPC_TERRA", stock: [ { itemId: 'wood', quantity: 20, price: 1 }, { itemId: 'stone', quantity: 20, price: 1 } ], chance: 0.5 }, { name: "Nexus Logistics", sellerId: "NPC_NEXUS", stock: [ { itemId: 'basic_pickaxe', quantity: 1, price: 15 }, { itemId: 'sturdy_pickaxe', quantity: 1, price: 75 } ], chance: 0.3 }, { name: "Blackrock Mining Co.", sellerId: "NPC_BLACKROCK", stock: [ { itemId: 'coal', quantity: 15, price: 2 }, { itemId: 'iron_ore', quantity: 10, price: 3 } ], chance: 0.4 }, { name: "Copperline Inc.", sellerId: "NPC_COPPER", stock: [ { itemId: 'copper_ore', quantity: 10, price: 4 } ], chance: 0.2 }, { name: "Junk Peddler", sellerId: "NPC_JUNK", stock: [ { itemId: 'stone', quantity: 5, price: 1 }, { itemId: 'wood', quantity: 5, price: 1 } ], chance: 0.6 } ];
const LOOTBOX_VENDOR_NAME = "The Collector";
const LOOTBOX_VENDOR_ID = "NPC_COLLECTOR";
const LOOTBOX_TICK_INTERVAL_MINUTES = 1;
const MAX_LOOTBOX_LISTINGS = 5;
const LOOTBOXES = {
    'miners_crate': { name: "Miner's Crate", emoji: '📦', price: 250, contents: [ { type: 'item', id: 'iron_ore', min: 10, max: 25, weight: 40 }, { type: 'item', id: 'copper_ore', min: 8, max: 20, weight: 30 }, { type: 'item', id: 'coal', min: 15, max: 30, weight: 20 }, { type: 'item', id: 'basic_pickaxe', min: 1, max: 1, weight: 9 }, { type: 'item', id: 'sturdy_pickaxe', min: 1, max: 1, weight: 1 } ] },
    'builders_crate': { name: "Builder's Crate", emoji: '🧱', price: 300, contents: [ { type: 'item', id: 'wood', min: 20, max: 50, weight: 50 }, { type: 'item', id: 'stone', min: 20, max: 50, weight: 45 }, { type: 'item', id: 'smelter', min: 1, max: 1, weight: 5 } ] },
    'gamblers_crate': { name: "Gambler's Crate", emoji: '💰', price: 400, contents: [ { type: 'bits', id: null, min: 1, max: 200, weight: 60 }, { type: 'bits', id: null, min: 201, max: 600, weight: 35 }, { type: 'bits', id: null, min: 601, max: 1500, weight: 5 } ] },
    'crystal_crate': { name: "Crystal Crate", emoji: '💎', price: 500, contents: [ { type: 'item', id: 'raw_crystal', min: 1, max: 3, weight: 80 }, { type: 'item', id: 'raw_crystal', min: 4, max: 8, weight: 18 }, { type: 'item', id: 'crystal_pickaxe', min: 1, max: 1, weight: 2 } ] }
};

// =========================================================================
// --- DATABASE & COMMAND HANDLERS ---
// =========================================================================
async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(drednotName) { const lowerName = drednotName.toLowerCase(); const newAccount = { _id: lowerName, balance: STARTING_BALANCE, discordId: null, lastWork: null, lastGather: null, lastDaily: null, lastSlots: null, inventory: {}, smelting: null, activeBuffs: [] }; await economyCollection.insertOne(newAccount); return newAccount; }
async function updateAccount(accountId, updates) { await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates }); }
async function modifyInventory(accountId, itemId, amount) { if (!itemId) return; const updateField = `inventory.${itemId}`; await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $inc: { [updateField]: amount } }); }
function getItemIdByName(name) { return Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === name.toLowerCase()); }
function formatDuration(seconds) { if (seconds < 60) return `${Math.ceil(seconds)}s`; const minutes = Math.floor(seconds / 60); const remainingSeconds = Math.ceil(seconds % 60); return `${minutes}m ${remainingSeconds}s`; }
async function findNextAvailableListingId(collection) { const listings = await collection.find({}, { projection: { listingId: 1 } }).toArray(); const usedIds = listings.map(l => l.listingId).filter(id => id != null).sort((a, b) => a - b); let expectedId = 1; for (const id of usedIds) { if (id !== expectedId) { return expectedId; } expectedId++; } return expectedId; }
function getPaginatedResponse(identifier, type, allLines, title, pageChange = 0) { const linesPerPage = 5; if (pageChange === 0 || !userPaginationData[identifier] || userPaginationData[identifier].type !== type) { userPaginationData[identifier] = { lines: allLines, currentPage: 0, type, title }; } const session = userPaginationData[identifier]; session.currentPage += pageChange; const totalPages = Math.ceil(session.lines.length / linesPerPage); if (session.currentPage >= totalPages && totalPages > 0) session.currentPage = totalPages - 1; if (session.currentPage < 0) session.currentPage = 0; const startIndex = session.currentPage * linesPerPage; const linesForPage = session.lines.slice(startIndex, startIndex + linesPerPage); const footer = `Page ${session.currentPage + 1}/${totalPages}. Use !n or !p to navigate.`; const discordContent = `**--- ${title} (Page ${session.currentPage + 1}/${totalPages}) ---**\n${linesForPage.length > 0 ? linesForPage.join('\n') : "No items on this page."}`; const row = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId(`paginate_back_${identifier}`).setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage === 0), new ButtonBuilder().setCustomId(`paginate_next_${identifier}`).setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage >= totalPages - 1) ); const gameContent = [`--- ${title} ---`, ...linesForPage, footer]; return { discord: { content: discordContent, components: [row] }, game: gameContent }; }

async function handleWork(account) {
    const now = Date.now();
    let currentCooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;

    // --- BUFF & DEBUFF LOGIC ---
    let activeBuffs = (account.activeBuffs || []).filter(buff => buff.expiresAt > now);
    let bonusFlat = 0;
    let bonusPercent = 0.0;
    let spicyPepperBuff = null;
    let cooldownReduction = 0;

    // Tool Bonuses
    for (const itemId in account.inventory) {
        const itemDef = ITEMS[itemId];
        if (itemDef?.type === 'tool' && itemDef.effects) {
            const qty = account.inventory[itemId];
            if (itemDef.effects.work_bonus_flat) bonusFlat += itemDef.effects.work_bonus_flat * qty;
            if (itemDef.effects.work_bonus_percent) bonusPercent += itemDef.effects.work_bonus_percent * qty;
        }
    }

    // Food Buffs
    for (const buff of activeBuffs) {
        const itemDef = ITEMS[buff.itemId];
        if (itemDef?.buff?.effects) {
            if (itemDef.buff.effects.work_bonus_percent) bonusPercent += itemDef.buff.effects.work_bonus_percent; // Handles debuffs too
            if (itemDef.buff.effects.work_cooldown_reduction_ms) cooldownReduction += itemDef.buff.effects.work_cooldown_reduction_ms;
            if (itemDef.buff.effects.work_double_or_nothing) spicyPepperBuff = itemDef.buff.effects.work_double_or_nothing;
        }
    }
    currentCooldown -= cooldownReduction;
    
    if (account.lastWork && (now - account.lastWork) < currentCooldown) {
        return { success: false, message: `You are on cooldown. Wait ${formatDuration((currentCooldown - (now - account.lastWork)) / 1000)}.` };
    }

    let baseEarnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN;
    const bonusAmount = Math.floor(baseEarnings * bonusPercent) + bonusFlat;
    let totalEarnings = baseEarnings + bonusAmount;
    
    let surgeMessage = '';
    
    // Spicy Pepper Logic (Overrides normal earnings)
    if (spicyPepperBuff) {
        if (Math.random() < 0.5) {
            totalEarnings = 0;
            surgeMessage = ` The Spicy Pepper backfired! You earned nothing.`
        } else {
            totalEarnings *= 2;
            surgeMessage = ` The Spicy Pepper kicked in! Your earnings were doubled!`
        }
    }

    await updateAccount(account._id, { balance: Math.round(account.balance + totalEarnings), lastWork: now });
    let bonusText = bonusAmount !== 0 ? ` (${bonusAmount > 0 ? '+' : ''}${bonusAmount} bonus)` : '';
    let replyMessage = `You earned ${Math.round(totalEarnings)} ${CURRENCY_NAME}${bonusText}!${surgeMessage}`;
    
    return { success: true, message: replyMessage };
}

async function handleGather(account) { const now = Date.now(); let currentCooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000; let activeBuffs = account.activeBuffs || []; const validBuffs = activeBuffs.filter(buff => buff.expiresAt > now); let cooldownReduction = 0; if (validBuffs.length < activeBuffs.length) { await updateAccount(account._id, { activeBuffs: validBuffs }); account.activeBuffs = validBuffs; } for (const buff of validBuffs) { const itemDef = ITEMS[buff.itemId]; if (itemDef?.buff?.effects?.gather_cooldown_reduction_ms) { cooldownReduction += itemDef.buff.effects.gather_cooldown_reduction_ms; } } currentCooldown -= cooldownReduction; if (account.lastGather && (now - account.lastGather) < currentCooldown) { return { success: false, message: `You are tired. Wait ${formatDuration((currentCooldown - (now - account.lastGather)) / 1000)}.` }; } const basketCount = account.inventory['gathering_basket'] || 0; const maxTypes = MAX_GATHER_TYPES_BASE + basketCount; let gatheredItems = []; let updates = {}; const shuffledOres = Object.keys(GATHER_TABLE).sort(() => 0.5 - Math.random()); for (const itemId of shuffledOres) { if (gatheredItems.length >= maxTypes) break; if (Math.random() < GATHER_TABLE[itemId].baseChance) { let qty = Math.floor(Math.random() * (GATHER_TABLE[itemId].maxQty - GATHER_TABLE[itemId].minQty + 1)) + GATHER_TABLE[itemId].minQty; for (let i = 0; i < basketCount; i++) if (Math.random() < 0.5) qty++; updates[`inventory.${itemId}`] = qty; gatheredItems.push(`${ITEMS[itemId].emoji} ${qty}x ${ITEMS[itemId].name}`); } } await economyCollection.updateOne({ _id: account._id }, { $inc: updates, $set: { lastGather: now } }); if (gatheredItems.length === 0) return { success: true, message: 'You searched but found nothing of value.' }; return { success: true, message: `You gathered: ${gatheredItems.join(', ')}` }; }
function handleInventory(account, filter = null) { if (!account.inventory || Object.keys(account.inventory).length === 0) return 'Your inventory is empty.'; let invList = []; const filterLower = filter ? filter.toLowerCase() : null; for (const itemId in account.inventory) { if (account.inventory[itemId] > 0) { const item = ITEMS[itemId]; if (!item) continue; if (!filterLower || item.name.toLowerCase().includes(filterLower)) invList.push(`> ${item.emoji || '❓'} ${account.inventory[itemId]}x ${item.name}`); } } if (invList.length === 0) return `You have no items matching "${filter}".`; const header = filter ? `🎒 **Inventory (Filtered by: ${filter})**` : '🎒 **Your Inventory:**'; return [header, ...invList].join('\n'); }
function handleRecipes() { let recipeList = ['📜 **Available Recipes:**']; for (const itemId in ITEMS) { if (ITEMS[itemId].craftable) { const recipeParts = Object.entries(ITEMS[itemId].recipe).map(([resId, qty]) => `${ITEMS[resId].emoji} ${qty}x ${ITEMS[resId].name}`); recipeList.push(`> ${ITEMS[itemId].emoji} **${ITEMS[itemId].name}**: Requires ${recipeParts.join(', ')}`); } } return recipeList.length > 1 ? recipeList.join('\n') : 'There are no craftable items yet.'; }
async function handleCraft(account, itemName) { const itemToCraftId = getItemIdByName(itemName); if (!itemToCraftId || !ITEMS[itemToCraftId].craftable) return `"${itemName}" is not a valid, craftable item. Check \`/recipes\`.`; const recipe = ITEMS[itemToCraftId].recipe; for (const resId in recipe) { const requiredQty = recipe[resId]; const playerQty = account.inventory[resId] || 0; if (playerQty < requiredQty) return `You don't have enough resources! You need ${requiredQty - playerQty} more ${ITEMS[resId].name}.`; } for (const resId in recipe) await modifyInventory(account._id, resId, -recipe[resId]); await modifyInventory(account._id, itemToCraftId, 1); return `You successfully crafted 1x ${ITEMS[itemToCraftId].name}!`; }
async function handleDaily(account) { const now = new Date(); const lastDaily = account.lastDaily ? new Date(account.lastDaily) : null; if (lastDaily && now.toDateString() === lastDaily.toDateString()) return { success: false, message: "You have already claimed your daily reward today." }; await updateAccount(account._id, { balance: account.balance + DAILY_REWARD, lastDaily: now }); return { success: true, message: `You claimed your daily ${DAILY_REWARD} ${CURRENCY_NAME}! Your new balance is ${account.balance + DAILY_REWARD}.` }; }
async function handleFlip(account, amount, choice) { if (isNaN(amount) || amount < FLIP_MIN_BET || amount > FLIP_MAX_BET) { return { success: false, message: `Bet must be between ${FLIP_MIN_BET} and ${FLIP_MAX_BET}.` }; } if (account.balance < amount) { return { success: false, message: "You don't have enough bits." }; } const result = Math.random() < 0.5 ? 'heads' : 'tails'; const lowerChoice = choice.toLowerCase(); if (result.startsWith(lowerChoice)) { await updateAccount(account._id, { balance: account.balance + amount }); return { success: true, message: `It was ${result}! You win ${amount} ${CURRENCY_NAME}! New balance: ${account.balance + amount}.` }; } else { await updateAccount(account._id, { balance: account.balance - amount }); return { success: false, message: `It was ${result}. You lost ${amount} ${CURRENCY_NAME}. New balance: ${account.balance - amount}.` }; } }
async function handleSlots(account, amount) { const now = Date.now(); const cooldown = SLOTS_COOLDOWN_SECONDS * 1000; if (account.lastSlots && (now - account.lastSlots) < cooldown) return { success: false, message: `Slow down! Wait ${formatDuration((cooldown - (now - account.lastSlots))/1000)}.` }; if (isNaN(amount) || amount < SLOTS_MIN_BET || amount > SLOTS_MAX_BET) return { success: false, message: `Bet must be between ${SLOTS_MIN_BET} and ${SLOTS_MAX_BET}.` }; if (account.balance < amount) return { success: false, message: "You don't have enough bits." }; await updateAccount(account._id, { lastSlots: now }); const s1 = SLOT_REELS[0][Math.floor(Math.random()*SLOT_REELS[0].length)], s2 = SLOT_REELS[1][Math.floor(Math.random()*SLOT_REELS[1].length)], s3 = SLOT_REELS[2][Math.floor(Math.random()*SLOT_REELS[2].length)]; const resultString = `[ ${s1} | ${s2} | ${s3} ]`; let winMultiplier = 0; let winMessage = ''; if (s1 === s2 && s2 === s3) { winMultiplier = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? SLOTS_PAYOUTS.jackpot_multiplier : SLOTS_PAYOUTS.three_of_a_kind; winMessage = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? "JACKPOT! 💎" : "Three of a kind!"; } else if (s1 === s2 || s2 === s3 || s1 === s3) { winMultiplier = SLOTS_PAYOUTS.two_of_a_kind; winMessage = "Two of a kind!"; } let finalMessage, newBalance; if (winMultiplier > 0) { const winnings = Math.floor(amount * winMultiplier); newBalance = account.balance + winnings; finalMessage = `${resultString} - ${winMessage} You win ${winnings} ${CURRENCY_NAME}! New balance: ${newBalance}.`; await updateAccount(account._id, { balance: newBalance }); } else { newBalance = account.balance - amount; finalMessage = `${resultString} - You lost ${amount} ${CURRENCY_NAME}. New balance: ${newBalance}.`; await updateAccount(account._id, { balance: newBalance }); } return { success: true, message: finalMessage }; }
async function handleLeaderboard() { const topPlayers = await economyCollection.find().sort({ balance: -1 }).limit(50).toArray(); if (topPlayers.length === 0) return { success: false, lines: ["The leaderboard is empty!"]}; const lines = topPlayers.map((player, index) => `${index + 1}. **${player._id}** - ${player.balance} ${CURRENCY_NAME}`); return { success: true, lines: lines }; }

function handleTimers(account) {
    const now = Date.now();
    const timers = [];
    
    let workCooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;
    let gatherCooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000;

    const activeBuffs = (account.activeBuffs || []).filter(buff => buff.expiresAt > now);
    for (const buff of activeBuffs) {
        const itemDef = ITEMS[buff.itemId];
        if (itemDef?.buff?.effects) {
            if(itemDef.buff.effects.work_cooldown_reduction_ms) workCooldown -= itemDef.buff.effects.work_cooldown_reduction_ms;
            if(itemDef.buff.effects.gather_cooldown_reduction_ms) gatherCooldown -= itemDef.buff.effects.gather_cooldown_reduction_ms;
        }
    }

    timers.push(`💪 Work: ${(account.lastWork && (now - account.lastWork) < workCooldown) ? formatDuration(((account.lastWork + workCooldown) - now) / 1000) : 'Ready!'}`);
    timers.push(`⛏️ Gather: ${(account.lastGather && (now - account.lastGather) < gatherCooldown) ? formatDuration(((account.lastGather + gatherCooldown) - now) / 1000) : 'Ready!'}`);
    const nextDaily = new Date(); nextDaily.setUTCDate(nextDaily.getUTCDate() + 1); nextDaily.setUTCHours(0, 0, 0, 0);
    timers.push(`📅 Daily: ${account.lastDaily && new Date(account.lastDaily).getUTCDate() === new Date().getUTCDate() ? formatDuration((nextDaily - now) / 1000) : 'Ready!'}`);
    const slotsTimeLeft = (account.lastSlots || 0) + SLOTS_COOLDOWN_SECONDS * 1000 - now;
    if (slotsTimeLeft > 0) timers.push(`🎰 Slots: ${formatDuration(slotsTimeLeft / 1000)}`);
    if (account.smelting && account.smelting.finishTime > now) timers.push(`🔥 Smelting: ${formatDuration((account.smelting.finishTime - now) / 1000)}`);

    if (activeBuffs.length > 0) {
        timers.push(`\n**Active Buffs:**`);
        activeBuffs.forEach(buff => {
            const itemDef = ITEMS[buff.itemId];
            const timeLeft = formatDuration((buff.expiresAt - now) / 1000);
            timers.push(`${itemDef.emoji} ${itemDef.name}: ${timeLeft} remaining`);
        });
    }

    return [`**Personal Cooldowns for ${account._id}:**`].concat(timers.map(t => t.startsWith('**') ? t : `> ${t}`));
}

async function handleSmelt(account, itemName, quantity) {
    const smelterCount = account.inventory['smelter'] || 0;
    if (smelterCount < 1) return { success: false, message: "You need to craft a 🔥 Smelter first!" };
    if (account.smelting && account.smelting.finishTime > Date.now()) return { success: false, message: `You are already smelting! Wait for it to finish.` };
    
    const itemIdToProcess = getItemIdByName(itemName);
    if (!itemIdToProcess) return { success: false, message: `Invalid item: ${itemName}` };

    const smeltableOreResult = SMELTABLE_ORES[itemIdToProcess];
    const cookableFoodResult = COOKABLE_FOODS[itemIdToProcess];

    let resultItemId;
    let processType;

    if (smeltableOreResult) {
        resultItemId = smeltableOreResult;
        processType = 'smelting';
    } else if (cookableFoodResult) {
        resultItemId = cookableFoodResult;
        processType = 'cooking';
    } else {
        return { success: false, message: `You can't smelt or cook that. Valid inputs: Iron Ore, Copper Ore, Raw Meat.` };
    }

    if (isNaN(quantity) || quantity <= 0) return { success: false, message: "Invalid quantity." };
    if ((account.inventory[itemIdToProcess] || 0) < quantity) return { success: false, message: `You don't have enough ${ITEMS[itemIdToProcess].name}.` };
    
    const coalNeeded = quantity * SMELT_COAL_COST_PER_ORE;
    if ((account.inventory['coal'] || 0) < coalNeeded) return { success: false, message: `You don't have enough coal. You need ${coalNeeded} ⚫ Coal.` };
    
    await modifyInventory(account._id, itemIdToProcess, -quantity);
    await modifyInventory(account._id, 'coal', -coalNeeded);
    
    const timePerItem = (SMELT_COOLDOWN_SECONDS_PER_ORE / smelterCount) * 1000;
    const totalTime = timePerItem * quantity;
    const finishTime = Date.now() + totalTime;

    // Use a unified 'smelting' object in DB. The 'processFinishedSmelting' function can handle both.
    await updateAccount(account._id, { smelting: { ingotId: resultItemId, quantity, finishTime } });
    
    return { success: true, message: `You begin ${processType} ${quantity}x ${ITEMS[itemIdToProcess].name}. It will take ${formatDuration(totalTime/1000)}.` };
}

async function handlePay(senderAccount, recipientAccount, amount) { if (isNaN(amount) || amount <= 0) return { success: false, message: "Please provide a valid, positive amount to pay." }; if (senderAccount.balance < amount) return { success: false, message: `You don't have enough Bits. You only have ${senderAccount.balance}.`}; if (senderAccount._id === recipientAccount._id) return { success: false, message: "You can't pay yourself!" }; await updateAccount(senderAccount._id, { balance: senderAccount.balance - amount }); await updateAccount(recipientAccount._id, { balance: recipientAccount.balance + amount }); return { success: true, message: `You paid ${amount} ${CURRENCY_NAME} to **${recipientAccount._id}**.` }; }
async function handleMarket(filter = null) { let query = {}; const filterLower = filter ? filter.toLowerCase().trim() : null; if (filterLower) { const itemIds = Object.keys(ITEMS).filter(k => ITEMS[k].name.toLowerCase().includes(filterLower)); if (itemIds.length === 0) return { success: false, lines: [`No market listings found matching "${filter}".`] }; query = { itemId: { $in: itemIds } }; } const listings = await marketCollection.find(query).sort({ listingId: 1 }).toArray(); const brokenListings = listings.filter(l => l.listingId == null); if (brokenListings.length > 0) { console.log(`[Self-Heal] Found ${brokenListings.length} broken market listings. Repairing now...`); for (const listing of brokenListings) { const newId = await findNextAvailableListingId(marketCollection); await marketCollection.updateOne({ _id: listing._id }, { $set: { listingId: newId } }); listing.listingId = newId; console.log(`[Self-Heal] Repaired listing for item ${listing.itemId}. New ID: ${newId}`); } } if (listings.length === 0) { const message = filter ? `No market listings found matching "${filter}".` : "The market is empty."; return { success: false, lines: [message] }; } const formattedLines = listings.map(l => `(ID: ${l.listingId}) ${ITEMS[l.itemId]?.emoji || '📦'} **${l.quantity}x** ${ITEMS[l.itemId].name} @ **${l.price}** ${CURRENCY_NAME} ea. by *${l.sellerName}*`); return { success: true, lines: formattedLines }; }
function openLootbox(lootboxId) { const lootbox = LOOTBOXES[lootboxId]; if (!lootbox) return null; const totalWeight = lootbox.contents.reduce((sum, item) => sum + item.weight, 0); let random = Math.random() * totalWeight; for (const item of lootbox.contents) { if (random < item.weight) { const amount = Math.floor(Math.random() * (item.max - item.min + 1)) + item.min; return { type: item.type, id: item.id, amount: amount }; } random -= item.weight; } return null; }
async function handleCrateShop() { const listings = await lootboxCollection.find().sort({ lootboxId: 1 }).toArray(); if (listings.length === 0) { return { success: false, lines: [`The Collector has no crates for sale right now.`] }; } const formattedLines = listings.filter(l => LOOTBOXES[l.lootboxId]).map(l => { const crate = LOOTBOXES[l.lootboxId]; return `${crate.emoji} **${l.quantity}x** ${crate.name} @ **${crate.price}** ${CURRENCY_NAME} ea.`; }); if (formattedLines.length === 0) { return { success: false, lines: [`The Collector's stock is being updated. Please check back in a moment.`] }; } return { success: true, lines: formattedLines }; }
function handleItemInfo(itemName) { const itemId = getItemIdByName(itemName); if (!itemId) { return `Could not find an item named "${itemName}".`; } const itemDef = ITEMS[itemId]; const header = `${itemDef.emoji} **${itemDef.name}**\n--------------------`; let infoLines = []; if (itemDef.type) { const typeFormatted = itemDef.type.charAt(0).toUpperCase() + itemDef.type.slice(1); infoLines.push(`> **Type:** ${typeFormatted}`); } switch (itemId) { case 'gathering_basket': infoLines.push(`> **Effect:** Allows you to find more item types and quantities when you /gather.`); break; case 'smelter': infoLines.push(`> **Effect:** Enables the /smelt command. More smelters reduce smelting time.`); break; case 'coal': infoLines.push(`> **Use:** Required fuel for the /smelt command.`); break; } if (itemDef.effects) { for (const effect in itemDef.effects) { const value = itemDef.effects[effect]; let effectText = '> **Effect:** '; if (effect === 'work_bonus_flat') { effectText += `Increases Bits from /work by a flat bonus of +${value}.`; } else if (effect === 'work_bonus_percent') { effectText += `Increases Bits from /work by a bonus of ${value * 100}%.`; } infoLines.push(effectText); } } if (itemDef.craftable) { const recipeParts = Object.entries(itemDef.recipe).map(([resId, qty]) => { const resource = ITEMS[resId]; return `${resource.emoji} ${qty}x ${resource.name}`; }); infoLines.push(`> **Craftable:** Yes`); infoLines.push(`> **Recipe:** ${recipeParts.join(', ')}`); } if (infoLines.length === 0) { infoLines.push('> **Use:** A basic resource used in crafting recipes.'); } return [header, ...infoLines].join('\n'); }

async function handleEat(account, foodName) {
    const foodId = getItemIdByName(foodName);
    if (!foodId) return `Could not find a food named "${foodName}".`;

    const itemDef = ITEMS[foodId];
    if (itemDef.type !== 'food') return `You can't eat a ${itemDef.name}!`;
    if (!account.inventory[foodId] || account.inventory[foodId] < 1) return `You don't have any ${itemDef.name} in your inventory.`;

    await modifyInventory(account._id, foodId, -1);
    const now = Date.now();
    const buff = { itemId: foodId, expiresAt: now + itemDef.buff.duration_ms };
    await economyCollection.updateOne({ _id: account._id }, { $push: { activeBuffs: buff } });

    // --- Dynamic Response Message ---
    let effectDescriptions = [];
    if (itemDef.buff.effects) {
        if (itemDef.buff.effects.gather_cooldown_reduction_ms) effectDescriptions.push(`gather cooldown reduced by ${itemDef.buff.effects.gather_cooldown_reduction_ms / 1000}s`);
        if (itemDef.buff.effects.work_cooldown_reduction_ms) effectDescriptions.push(`work cooldown reduced by ${itemDef.buff.effects.work_cooldown_reduction_ms / 1000}s`);
        if (itemDef.buff.effects.work_bonus_percent) {
            const verb = itemDef.buff.effects.work_bonus_percent > 0 ? 'increased' : 'decreased';
            effectDescriptions.push(`work earnings ${verb} by ${Math.abs(itemDef.buff.effects.work_bonus_percent * 100)}%`);
        }
        if (itemDef.buff.effects.work_double_or_nothing) effectDescriptions.push(`your work earnings are now double or nothing`);
    }

    const durationText = formatDuration(itemDef.buff.duration_ms / 1000);
    const effectsText = effectDescriptions.length > 0 ? `Your ${effectDescriptions.join(', ')}.` : '';
    return `You eat the ${itemDef.name}. ${effectsText} This effect will last for ${durationText}!`;
}

// --- BACKGROUND & NPC LOGIC ---
async function processVendorTicks() { console.log("Processing regular vendor tick..."); const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)]; const currentListingsCount = await marketCollection.countDocuments({ sellerId: vendor.sellerId }); if (currentListingsCount >= 3) { console.log(`${vendor.name} has enough items listed. Skipping.`); return; } if (Math.random() < vendor.chance) { const itemToSell = vendor.stock[Math.floor(Math.random() * vendor.stock.length)]; try { const newListingId = await findNextAvailableListingId(marketCollection); await marketCollection.insertOne({ listingId: newListingId, sellerId: vendor.sellerId, sellerName: vendor.name, itemId: itemToSell.itemId, quantity: itemToSell.quantity, price: itemToSell.price }); console.log(`${vendor.name} listed ${itemToSell.quantity}x ${ITEMS[itemToSell.itemId].name}!`); } catch (error) { if (error.code === 11000) { console.warn(`[Vendor Tick] Race condition for ${vendor.name}. Retrying next tick.`); } else { console.error(`[Vendor Tick] Error for ${vendor.name}:`, error); } } } }
async function processLootboxVendorTick() { console.log("Processing lootbox vendor tick..."); const currentListingsCount = await lootboxCollection.countDocuments({}); if (currentListingsCount >= MAX_LOOTBOX_LISTINGS) { console.log("The Collector has enough listings. Skipping."); return; } const lootboxTypes = Object.keys(LOOTBOXES); const crateToSellId = lootboxTypes[Math.floor(Math.random() * lootboxTypes.length)]; const alreadySelling = await lootboxCollection.findOne({ lootboxId: crateToSellId }); if (alreadySelling) { console.log(`The Collector is already selling ${crateToSellId}. Skipping.`); return; } const crateToSell = LOOTBOXES[crateToSellId]; const quantity = Math.floor(Math.random() * 5) + 1; await lootboxCollection.insertOne({ sellerId: LOOTBOX_VENDOR_ID, lootboxId: crateToSellId, quantity: quantity, price: crateToSell.price }); console.log(`The Collector listed ${quantity}x ${crateToSell.name}!`); }
async function processFinishedSmelting() { const now = Date.now(); const finishedSmelts = await economyCollection.find({ "smelting.finishTime": { $ne: null, $lte: now } }).toArray(); for (const account of finishedSmelts) { const { ingotId, quantity } = account.smelting; await modifyInventory(account._id, ingotId, quantity); await updateAccount(account._id, { smelting: null }); try { const user = await client.users.fetch(account.discordId); user.send(`✅ Your smelting is complete! You received ${quantity}x ${ITEMS[ingotId].name}.`); } catch (e) { console.log(`Could not DM ${account._id} about finished smelt.`); } } }

// --- DISCORD BOT LOGIC ---
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));
client.on('interactionCreate', async (interaction) => { try { if (interaction.isChatInputCommand()) await handleSlashCommand(interaction); else if (interaction.isButton()) await handleButtonInteraction(interaction); } catch (error) { console.error("Error handling interaction:", error); try { const errorReply = { content: 'An unexpected error occurred!', flags: MessageFlags.Ephemeral, components: [] }; if (interaction.replied || interaction.deferred) { await interaction.followUp(errorReply); } else { await interaction.reply(errorReply); } } catch (e) { console.error("CRITICAL: Could not send error reply to interaction.", e); } } });
async function handleButtonInteraction(interaction) { const [action, type, userId] = interaction.customId.split('_'); if (interaction.user.id !== userId) return interaction.reply({ content: "You cannot use these buttons.", flags: MessageFlags.Ephemeral }); const session = userPaginationData[userId]; if (!session) return interaction.update({ content: 'This interactive message has expired or is invalid.', components: [] }); const pageChange = (type === 'next') ? 1 : -1; const { discord } = getPaginatedResponse(userId, session.type, session.lines, session.title, pageChange); await interaction.update(discord); }
async function handleSlashCommand(interaction) { const { commandName, user, options } = interaction; await interaction.deferReply({ flags: MessageFlags.Ephemeral }); if (commandName === 'link') { const existingLink = await getAccount(user.id); if (existingLink) return interaction.editReply({ content: `Your account is already linked to **${existingLink._id}**.` }); const drednotNameToLink = options.getString('drednot_name'); const targetAccount = await getAccount(drednotNameToLink); if (targetAccount && targetAccount.discordId) return interaction.editReply({ content: `**${drednotNameToLink}** is already linked.` }); const verificationCode = `${Math.floor(1000 + Math.random() * 9000)}`; await verificationsCollection.insertOne({ _id: verificationCode, discordId: user.id, drednotName: drednotNameToLink, timestamp: Date.now() }); await interaction.editReply({ content: `**Verification Started!**\nIn Drednot, type: \`!verify ${verificationCode}\`\nThis code expires in 5 minutes.` }); return; } if (['market', 'leaderboard', 'recipes', 'crateshop'].includes(commandName)) { let result, title, type; if (commandName === 'market') { const filter = options.getString('filter'); result = await handleMarket(filter); title = filter ? `Market (Filter: ${filter})` : "Market"; type = 'market'; } if (commandName === 'leaderboard') { result = await handleLeaderboard(); title = "Leaderboard"; type = 'leaderboard'; } if (commandName === 'recipes') { const recipeLines = handleRecipes().split('\n'); title = recipeLines.shift(); result = { success: true, lines: recipeLines }; type = 'recipes'; } if (commandName === 'crateshop') { result = await handleCrateShop(); title = "The Collector's Crates"; type = 'crateshop'; } if (!result.success) return interaction.editReply({ content: result.lines[0], components: [] }); const { discord } = getPaginatedResponse(user.id, type, result.lines, title, 0); await interaction.editReply(discord); return; } if (commandName === 'iteminfo') { const itemName = options.getString('item_name'); const infoMessage = handleItemInfo(itemName); return interaction.editReply({ content: infoMessage }); } const account = await getAccount(user.id); if (!account) return interaction.editReply({ content: 'Your account is not linked. Use `/link` first.' }); let result, amount, choice, itemName, quantity, price, listingId; switch (commandName) { case 'balance': await interaction.editReply({ content: `Your balance is: ${account.balance} ${CURRENCY_NAME}.` }); break; case 'work': result = await handleWork(account); await interaction.editReply({ content: result.message }); break; case 'daily': result = await handleDaily(account); await interaction.editReply({ content: result.message }); break; case 'gather': result = await handleGather(account); await interaction.editReply({ content: result.message }); break; case 'inventory': itemName = options.getString('item_name'); result = handleInventory(account, itemName); await interaction.editReply({ content: result }); break; case 'craft': itemName = options.getString('item_name'); result = await handleCraft(account, itemName); await interaction.editReply({ content: result }); break; case 'eat': itemName = options.getString('food_name'); result = await handleEat(account, itemName); await interaction.editReply({ content: result }); break; case 'flip': amount = options.getInteger('amount'); choice = options.getString('choice'); result = await handleFlip(account, amount, choice); await interaction.editReply({ content: result.message }); break; case 'slots': amount = options.getInteger('amount'); result = await handleSlots(account, amount); await interaction.editReply({ content: result.message }); break; case 'timers': result = handleTimers(account); await interaction.editReply({ content: result.join('\n') }); break; case 'smelt': itemName = options.getString('ore_name'); quantity = options.getInteger('quantity'); result = await handleSmelt(account, itemName, quantity); await interaction.editReply({ content: result.message }); break; case 'pay': const recipientUser = options.getUser('user'); amount = options.getInteger('amount'); if (recipientUser.bot) return interaction.editReply({ content: "You can't pay bots." }); const recipientAccount = await getAccount(recipientUser.id); if (!recipientAccount) return interaction.editReply({ content: `That user isn't linked to a Drednot account yet.` }); result = await handlePay(account, recipientAccount, amount); await interaction.editReply({ content: result.message }); break; case 'marketsell': itemName = options.getString('item_name'); quantity = options.getInteger('quantity'); price = options.getNumber('price'); const itemIdToSell = getItemIdByName(itemName); if (!itemIdToSell) return interaction.editReply({ content: 'Invalid item name.' }); if (quantity <= 0 || price <= 0) return interaction.editReply({ content: 'Quantity and price must be positive.' }); if ((account.inventory[itemIdToSell] || 0) < quantity) return interaction.editReply({ content: 'You do not have enough of that item to sell.' }); try { await modifyInventory(account._id, itemIdToSell, -quantity); const newListingId = await findNextAvailableListingId(marketCollection); await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: account._id, itemId: itemIdToSell, quantity, price }); await interaction.editReply({ content: `You listed ${quantity}x ${ITEMS[itemIdToSell].name} for sale. Listing ID: **${newListingId}**` }); } catch (error) { if (error.code === 11000) { await modifyInventory(account._id, itemIdToSell, quantity); await interaction.editReply({ content: 'The market is busy and that listing ID was just taken. Your items have been returned. Please try again.' }); } else { console.error("Failed to list item:", error); await modifyInventory(account._id, itemIdToSell, quantity); await interaction.editReply({ content: 'An unexpected error occurred while listing your item. Please try again.' }); } } break; case 'marketbuy': listingId = options.getInteger('listing_id'); const listingToBuy = await marketCollection.findOne({ listingId: listingId }); if (!listingToBuy) return interaction.editReply({ content: 'Invalid listing ID.' }); if (listingToBuy.sellerId === account._id) return interaction.editReply({ content: "You can't buy your own listing." }); const totalCost = Math.round(listingToBuy.quantity * listingToBuy.price); if (account.balance < totalCost) return interaction.editReply({ content: `You can't afford this. It costs ${totalCost} ${CURRENCY_NAME}.` }); await updateAccount(account._id, { balance: account.balance - totalCost }); await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity); const sellerAccount = await getAccount(listingToBuy.sellerId); if (sellerAccount) { const earnings = Math.round(totalCost * (1 - MARKET_TAX_RATE)); await economyCollection.updateOne({ _id: sellerAccount._id }, { $inc: { balance: earnings } }); } await marketCollection.deleteOne({ _id: listingToBuy._id }); await interaction.editReply({ content: `You bought ${listingToBuy.quantity}x ${ITEMS[listingToBuy.itemId].name}!` }); break; case 'marketcancel': const listingIdToCancel = options.getInteger('listing_id'); const listingToCancel = await marketCollection.findOne({ listingId: listingIdToCancel }); if (!listingToCancel || listingToCancel.sellerId !== account._id) return interaction.editReply({ content: 'This is not your listing or it does not exist.' }); await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity); await marketCollection.deleteOne({ _id: listingToCancel._id }); await interaction.editReply({ content: `You cancelled your listing for ${listingToCancel.quantity}x ${ITEMS[listingToCancel.itemId].name}.` }); break; case 'crateoshopbuy': const crateNameToOpenSlash = options.getString('crate_name'); const amountToOpenSlash = options.getInteger('amount'); if (amountToOpenSlash <= 0) { return interaction.editReply({ content: "Please enter a valid amount to open." }); } const crateIdSlash = Object.keys(LOOTBOXES).find(k => LOOTBOXES[k].name.toLowerCase() === crateNameToOpenSlash.toLowerCase()); if (!crateIdSlash) { return interaction.editReply({ content: `The Collector doesn't sell a crate named "${crateNameToOpenSlash}". Check the /crateshop.` }); } const listingSlash = await lootboxCollection.findOne({ lootboxId: crateIdSlash }); if (!listingSlash) { return interaction.editReply({ content: `The Collector is not selling any "${crateNameToOpenSlash}" right now.` }); } if (listingSlash.quantity < amountToOpenSlash) { return interaction.editReply({ content: `The Collector only has ${listingSlash.quantity} of those crates in stock.` }); } const totalCostSlash = listingSlash.price * amountToOpenSlash; if (account.balance < totalCostSlash) { return interaction.editReply({ content: `You can't afford that. It costs ${totalCostSlash} ${CURRENCY_NAME} to open ${amountToOpenSlash}.` }); } await updateAccount(account._id, { balance: account.balance - totalCostSlash }); let totalRewardsSlash = {}; for (let i = 0; i < amountToOpenSlash; i++) { const reward = openLootbox(listingSlash.lootboxId); if (reward.type === 'bits') { totalRewardsSlash.bits = (totalRewardsSlash.bits || 0) + reward.amount; } else { totalRewardsSlash[reward.id] = (totalRewardsSlash[reward.id] || 0) + reward.amount; } } let rewardMessagesSlash = []; for (const rewardId in totalRewardsSlash) { if (rewardId === 'bits') { await economyCollection.updateOne({ _id: account._id }, { $inc: { balance: totalRewardsSlash[rewardId] } }); rewardMessagesSlash.push(`**${totalRewardsSlash[rewardId]}** ${CURRENCY_NAME}`); } else { await modifyInventory(account._id, rewardId, totalRewardsSlash[rewardId]); rewardMessagesSlash.push(`${ITEMS[rewardId].emoji} **${totalRewardsSlash[rewardId]}x** ${ITEMS[rewardId].name}`); } } await lootboxCollection.updateOne({ _id: listingSlash._id }, { $inc: { quantity: -amountToOpenSlash } }); await lootboxCollection.deleteMany({ quantity: { $lte: 0 } }); await interaction.editReply({ content: `You opened ${amountToOpenSlash}x ${LOOTBOXES[listingSlash.lootboxId].name} and received: ${rewardMessagesSlash.join(', ')}!` }); break; } }

// =========================================================================
// --- WEB SERVER LOGIC ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));
app.post('/command', async (req, res) => { const apiKey = req.headers['x-api-key']; if (apiKey !== YOUR_API_KEY) return res.status(401).send('Error: Invalid API key'); const { command, username, args } = req.body; const identifier = username.toLowerCase(); let responseMessage = ''; if (command === 'verify') { const code = args[0]; const verificationData = await verificationsCollection.findOne({ _id: code }); if (!verificationData || (Date.now() - verificationData.timestamp > 5 * 60 * 1000)) { responseMessage = 'That verification code is invalid or has expired.'; } else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) { responseMessage = 'This verification code is for a different Drednot user.'; } else { let targetAccount = await getAccount(username); if (!targetAccount) targetAccount = await createNewAccount(username); await updateAccount(targetAccount._id, { discordId: verificationData.discordId }); await verificationsCollection.deleteOne({ _id: code }); responseMessage = `✅ Verification successful! Your accounts are now linked.`; try { const discordUser = await client.users.fetch(verificationData.discordId); discordUser.send(`Great news! Your link to the Drednot account **${username}** has been successfully verified.`); } catch (e) { console.log("Couldn't send DM confirmation."); } } return res.json({ reply: responseMessage }); } if (['n', 'next', 'p', 'previous'].includes(command)) { const session = userPaginationData[identifier]; if (!session) return res.json({ reply: 'You have no active list to navigate.' }); const pageChange = (command.startsWith('n')) ? 1 : -1; const { game } = getPaginatedResponse(identifier, session.type, session.lines, session.title, pageChange); return res.json({ reply: game.map(line => line.replace(/\*\*|`|>/g, '')) }); } let account = await getAccount(username); if (!account) { account = await createNewAccount(username); const welcomeMessage = [`Your new account has been created with ${STARTING_BALANCE} Bits.`, `Join the Discord for updates, support, and commands!`, `https://discord.gg/SvZe9ytB`, `NOTE: Use !link in-game to verify with your Discord account.`]; return res.json({ reply: welcomeMessage }); } let result, lines, title; const cleanText = (text) => Array.isArray(text) ? text.map(t => t.replace(/\*\*|`|>/g, '').replace(/<a?:.+?:\d+>/g, '').replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '')) : String(text).replace(/\*\*|`|>/g, '').replace(/<a?:.+?:\d+>/g, '').replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, ''); switch (command) { case 'iif': case 'iteminfo': if (args.length === 0) { responseMessage = "Usage: !iteminfo <item name>"; break; } const infoItemName = args.join(' '); const infoMessage = handleItemInfo(infoItemName); responseMessage = cleanText(infoMessage).split('\n'); break; case 'eat': if (args.length === 0) { responseMessage = "Usage: !eat <food name>"; break; } const foodName = args.join(' '); responseMessage = await handleEat(account, foodName); break; case 'm': case 'market': const marketFilter = args.length > 0 ? args.join(' ') : null; result = await handleMarket(marketFilter); if (!result.success) { responseMessage = result.lines[0]; break; } title = marketFilter ? `Market (Filter: ${marketFilter})` : "Market"; const marketPage = getPaginatedResponse(identifier, 'market', result.lines, title, 0); responseMessage = marketPage.game.map(line => cleanText(line)); break; case 'lb': case 'leaderboard': result = await handleLeaderboard(); if (!result.success) { responseMessage = result.lines[0]; break; } title = "Leaderboard"; const lbPage = getPaginatedResponse(identifier, 'leaderboard', result.lines, title, 0); responseMessage = lbPage.game.map(line => cleanText(line)); break; case 'recipes': lines = handleRecipes().split('\n'); title = lines.shift(); result = getPaginatedResponse(identifier, 'recipes', lines, title, 0); responseMessage = result.game.map(line => cleanText(line)); break; case 'bal': case 'balance': responseMessage = `Your balance is: ${account.balance} ${CURRENCY_NAME}.`; break; case 'work': result = await handleWork(account); responseMessage = result.message; break; case 'gather': result = await handleGather(account); responseMessage = result.message; break; case 'inv': case 'inventory': const invFilter = args.length > 0 ? args.join(' ') : null; responseMessage = cleanText(handleInventory(account, invFilter)); break; case 'craft': if (args.length === 0) { responseMessage = "Usage: !craft <item name>"; } else { let craftResult = await handleCraft(account, args.join(' ')); responseMessage = craftResult.replace('`/recipes`', '`!recipes`'); } break; case 'daily': result = await handleDaily(account); responseMessage = result.message; break; case 'flip': if (args.length < 2) { responseMessage = "Usage: !flip <amount> <h/t>"; } else { result = await handleFlip(account, parseInt(args[0]), args[1].toLowerCase()); responseMessage = result.message; } break; case 'slots': if (args.length < 1) { responseMessage = "Usage: !slots <amount>"; } else { result = await handleSlots(account, parseInt(args[0])); responseMessage = result.message; } break; case 'timers': result = handleTimers(account); responseMessage = result.map(line => cleanText(line)); break; case 'smelt': if (args.length < 1) { responseMessage = "Usage: !smelt <item name> [quantity]"; break; } const quantity = args.length > 1 && !isNaN(parseInt(args[args.length - 1])) ? parseInt(args.pop()) : 1; const itemName = args.join(' '); result = await handleSmelt(account, itemName, quantity); responseMessage = result.message; break; case 'pay': if (args.length < 2) { responseMessage = "Usage: !pay <username> <amount>"; } else { const amountToPay = parseInt(args[args.length - 1]); const recipientName = args.slice(0, -1).join(' '); const recipientAccount = await getAccount(recipientName); if (!recipientAccount) { responseMessage = `Could not find a player named "${recipientName}".`; } else { result = await handlePay(account, recipientAccount, amountToPay); responseMessage = result.message.replace(/\*/g, ''); } } break; case 'ms': case 'marketsell': if (args.length < 3) { responseMessage = "Usage: !marketsell [item] [qty] [price]"; } else { const itemName = args.slice(0, -2).join(' '); const qty = parseInt(args[args.length - 2]); const price = parseFloat(args[args.length - 1]); const itemId = getItemIdByName(itemName); if (!itemId || isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) { responseMessage = "Invalid format."; } else if ((account.inventory[itemId] || 0) < qty) { responseMessage = "You don't have enough of that item."; } else { try { await modifyInventory(account._id, itemId, -qty); const newListingId = await findNextAvailableListingId(marketCollection); await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: account._id, itemId, quantity: qty, price }); responseMessage = `Listed ${qty}x ${ITEMS[itemId].name}. ID: ${newListingId}`; } catch (error) { if (error.code === 11000) { await modifyInventory(account._id, itemId, qty); responseMessage = "Market is busy, ID was taken. Items returned. Try again."; } else { console.error("Failed to list item via in-game command:", error); await modifyInventory(account._id, itemId, qty); responseMessage = "An unexpected error occurred. Items returned."; } } } } break; case 'mb': case 'marketbuy': if (args.length < 1) { responseMessage = "Usage: !marketbuy [listing_id]"; } else { const listingId = parseInt(args[0]); if(isNaN(listingId)) { responseMessage = "Listing ID must be a number."; break; } const listingToBuy = await marketCollection.findOne({ listingId: listingId }); if (!listingToBuy) { responseMessage = 'Invalid listing ID.'; break; } if (listingToBuy.sellerId === account._id) { responseMessage = "You can't buy your own listing."; break; } const totalCost = Math.round(listingToBuy.quantity * listingToBuy.price); if (account.balance < totalCost) { responseMessage = "You can't afford this."; } else { await updateAccount(account._id, { balance: account.balance - totalCost }); await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity); const sellerAccount = await getAccount(listingToBuy.sellerId); if (sellerAccount) { const earnings = Math.round(totalCost * (1 - MARKET_TAX_RATE)); await updateAccount(sellerAccount._id, { balance: sellerAccount.balance + earnings }); } await marketCollection.deleteOne({ _id: listingToBuy._id }); responseMessage = `You bought ${listingToBuy.quantity}x ${ITEMS[listingToBuy.itemId].name}!`; } } break; case 'mc': case 'marketcancel': if (args.length < 1) { responseMessage = "Usage: !marketcancel [listing_id]"; } else { const listingId = parseInt(args[0]); if(isNaN(listingId)) { responseMessage = "Listing ID must be a number."; break; } const listingToCancel = await marketCollection.findOne({ listingId: listingId }); if (!listingToCancel || listingToCancel.sellerId !== account._id) { responseMessage = "This is not your listing."; } else { await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity); await marketCollection.deleteOne({ _id: listingToCancel._id }); responseMessage = `Cancelled your listing for ${listingToCancel.quantity}x ${ITEMS[listingToCancel.itemId].name}.`; } } break; case 'cs': result = await handleCrateShop(); if (!result.success) { responseMessage = result.lines[0]; break; } title = "The Collector's Crates"; const csPage = getPaginatedResponse(identifier, 'crateshop', result.lines, title, 0); responseMessage = csPage.game.map(line => cleanText(line)); break; case 'csb': case 'crateshopbuy': if (args.length < 2) { responseMessage = "Usage: !csb [crate name] [amount]"; break; } const amountToOpen = parseInt(args[args.length - 1]); const crateNameToOpen = args.slice(0, -1).join(' '); if (isNaN(amountToOpen) || amountToOpen <= 0) { responseMessage = "Please enter a valid amount to open."; break; } const crateId = Object.keys(LOOTBOXES).find(k => LOOTBOXES[k].name.toLowerCase() === crateNameToOpen.toLowerCase()); if (!crateId) { responseMessage = `The Collector doesn't sell a crate named "${crateNameToOpen}". Check the !cs shop.`; break; } const listing = await lootboxCollection.findOne({ lootboxId: crateId }); if (!listing) { responseMessage = `The Collector is not selling any "${crateNameToOpen}" right now.`; break; } if (listing.quantity < amountToOpen) { responseMessage = `The Collector only has ${listing.quantity} of those crates in stock.`; break; } const totalCostCrate = listing.price * amountToOpen; if (account.balance < totalCostCrate) { responseMessage = `You can't afford that. It costs ${totalCostCrate} ${CURRENCY_NAME} to open ${amountToOpen}.`; break; } await updateAccount(account._id, { balance: account.balance - totalCostCrate }); let totalRewards = {}; for (let i = 0; i < amountToOpen; i++) { const reward = openLootbox(listing.lootboxId); if (reward.type === 'bits') { totalRewards.bits = (totalRewards.bits || 0) + reward.amount; } else { totalRewards[reward.id] = (totalRewards[reward.id] || 0) + reward.amount; } } let rewardMessages = []; for (const rewardId in totalRewards) { if (rewardId === 'bits') { await economyCollection.updateOne({ _id: account._id }, { $inc: { balance: totalRewards[rewardId] } }); rewardMessages.push(`**${totalRewards[rewardId]}** ${CURRENCY_NAME}`); } else { await modifyInventory(account._id, rewardId, totalRewards[rewardId]); rewardMessages.push(`${ITEMS[rewardId].emoji} **${totalRewards[rewardId]}x** ${ITEMS[rewardId].name}`); } } await lootboxCollection.updateOne({ _id: listing._id }, { $inc: { quantity: -amountToOpen } }); await lootboxCollection.deleteMany({ quantity: { $lte: 0 } }); responseMessage = `You opened ${amountToOpen}x ${LOOTBOXES[listing.lootboxId].name} and received: ${cleanText(rewardMessages).join(', ')}!`; break; default: responseMessage = `Unknown command: !${command}`; } res.json({ reply: responseMessage }); });

// =========================================================================
// --- STARTUP ---
// =========================================================================
async function startServer() { await connectToDatabase(); console.log(`Starting background timers...`); setInterval(processVendorTicks, VENDOR_TICK_INTERVAL_MINUTES * 60 * 1000); setInterval(processLootboxVendorTick, LOOTBOX_TICK_INTERVAL_MINUTES * 60 * 1000); setInterval(processFinishedSmelting, 15 * 1000); client.login(process.env.DISCORD_TOKEN).then(() => { console.log("Discord bot has successfully logged in."); app.listen(3000, () => { console.log(`Web server is listening.`); }); }).catch(error => { console.error("Failed to log in to Discord:", error); process.exit(1); }); }

startServer();
