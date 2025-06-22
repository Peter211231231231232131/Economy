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
let economyCollection, verificationsCollection, marketCollection;

let userPaginationData = {}; // Stores { identifier: { lines: [], currentPage: 0, type: '', title: '' } }

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy");
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
        marketCollection = db.collection("market_listings");
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
function getPaginatedResponse(identifier, type, allLines, title, pageChange = 0) { const linesPerPage = 5; if (pageChange === 0 || !userPaginationData[identifier] || userPaginationData[identifier].type !== type) { userPaginationData[identifier] = { lines: allLines, currentPage: 0, type, title }; } const session = userPaginationData[identifier]; session.currentPage += pageChange; const totalPages = Math.ceil(session.lines.length / linesPerPage); if (session.currentPage >= totalPages && totalPages > 0) session.currentPage = totalPages - 1; if (session.currentPage < 0) session.currentPage = 0; const startIndex = session.currentPage * linesPerPage; const linesForPage = session.lines.slice(startIndex, startIndex + linesPerPage); const footer = `Page ${session.currentPage + 1}/${totalPages}.`; const discordContent = `**--- ${title} (Page ${session.currentPage + 1}/${totalPages}) ---**\n${linesForPage.length > 0 ? linesForPage.join('\n') : "No items on this page."}`; const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`paginate_back_${identifier}`).setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage === 0), new ButtonBuilder().setCustomId(`paginate_next_${identifier}`).setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage >= totalPages - 1)); const gameContent = [`--- ${title} ---`, ...linesForPage, footer]; return { discord: { content: discordContent, components: [row] }, game: gameContent }; }
async function findNextAvailableListingId() { const listings = await marketCollection.find({}, { projection: { listingId: 1 } }).sort({ listingId: 1 }).toArray(); const usedIds = listings.map(l => l.listingId); let nextId = 1; while (usedIds.includes(nextId)) { nextId++; } return nextId; }
async function handleWork(account) { const now = Date.now(); const cooldown = WORK_COOLDOWN_MINUTES * 60 * 1000; if (account.lastWork && (now - account.lastWork) < cooldown) return { success: false, message: `You are on cooldown. Wait ${formatDuration((cooldown - (now - account.lastWork)) / 1000)}.` }; let baseEarnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN; let bonusFlat = 0, bonusPercent = 0.0; for (const itemId in account.inventory) { const itemDef = ITEMS[itemId]; if (itemDef?.type === 'tool' && itemDef.effects) { const qty = account.inventory[itemId]; if (itemDef.effects.work_bonus_flat) bonusFlat += itemDef.effects.work_bonus_flat * qty; if (itemDef.effects.work_bonus_percent) bonusPercent += itemDef.effects.work_bonus_percent * qty; } } const bonusAmount = Math.floor(baseEarnings * bonusPercent) + bonusFlat; const totalEarnings = baseEarnings + bonusAmount; await updateAccount(account._id, { balance: account.balance + totalEarnings, lastWork: now }); let bonusText = bonusAmount > 0 ? ` (+${bonusAmount} bonus)` : ''; return { success: true, message: `You earned ${totalEarnings} ${CURRENCY_NAME}${bonusText}! New balance is ${account.balance + totalEarnings}.` }; }
async function handleGather(account) { const now = Date.now(); const cooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000; if (account.lastGather && (now - account.lastGather) < cooldown) return { success: false, message: `You are tired. Wait ${formatDuration((cooldown - (now - account.lastGather)) / 1000)}.` }; const basketCount = account.inventory['gathering_basket'] || 0; const maxTypes = MAX_GATHER_TYPES_BASE + basketCount; let gatheredItems = []; let updates = {}; const shuffledOres = Object.keys(GATHER_TABLE).sort(() => 0.5 - Math.random()); for (const itemId of shuffledOres) { if (gatheredItems.length >= maxTypes) break; if (Math.random() < GATHER_TABLE[itemId].baseChance) { let qty = Math.floor(Math.random() * (GATHER_TABLE[itemId].maxQty - GATHER_TABLE[itemId].minQty + 1)) + GATHER_TABLE[itemId].minQty; for (let i = 0; i < basketCount; i++) if (Math.random() < 0.5) qty++; updates[`inventory.${itemId}`] = qty; gatheredItems.push(`${ITEMS[itemId].emoji} ${qty}x ${ITEMS[itemId].name}`); } } await economyCollection.updateOne({ _id: account._id }, { $inc: updates, $set: { lastGather: now } }); if (gatheredItems.length === 0) return { success: true, message: 'You searched but found nothing of value.' }; return { success: true, message: `You gathered: ${gatheredItems.join(', ')}` }; }
function handleInventory(account, filter = null) { if (!account.inventory || Object.keys(account.inventory).length === 0) return 'Your inventory is empty.'; let invList = []; const filterLower = filter ? filter.toLowerCase() : null; for (const itemId in account.inventory) { if (account.inventory[itemId] > 0) { const item = ITEMS[itemId]; if (!item) continue; if (!filterLower || item.name.toLowerCase().includes(filterLower)) invList.push(`> ${item.emoji || '❓'} ${account.inventory[itemId]}x ${item.name}`); } } if (invList.length === 0) return `You have no items matching "${filter}".`; const header = filter ? `🎒 **Inventory (Filtered by: ${filter})**` : '🎒 **Your Inventory:**'; return [header, ...invList].join('\n'); }
function handleRecipes() { let recipeList = ['📜 **Available Recipes:**']; for (const itemId in ITEMS) { if (ITEMS[itemId].craftable) { const recipeParts = Object.entries(ITEMS[itemId].recipe).map(([resId, qty]) => `${ITEMS[resId].emoji} ${qty}x ${ITEMS[resId].name}`); recipeList.push(`> ${ITEMS[itemId].emoji} **${ITEMS[itemId].name}**: Requires ${recipeParts.join(', ')}`); } } return recipeList.length > 1 ? recipeList.join('\n') : 'There are no craftable items yet.'; }
async function handleCraft(account, itemName) { const itemToCraftId = getItemIdByName(itemName); if (!itemToCraftId || !ITEMS[itemToCraftId].craftable) return `"${itemName}" is not a valid, craftable item. Check \`/recipes\`.`; const recipe = ITEMS[itemToCraftId].recipe; for (const resId in recipe) { const requiredQty = recipe[resId]; const playerQty = account.inventory[resId] || 0; if (playerQty < requiredQty) return `You don't have enough resources! You need ${requiredQty - playerQty} more ${ITEMS[resId].name}.`; } for (const resId in recipe) await modifyInventory(account._id, resId, -recipe[resId]); await modifyInventory(account._id, itemToCraftId, 1); return `You successfully crafted 1x ${ITEMS[itemToCraftId].name}!`; }
async function handleDaily(account) { const now = new Date(); const lastDaily = account.lastDaily ? new Date(account.lastDaily) : null; if (lastDaily && now.toDateString() === lastDaily.toDateString()) return { success: false, message: "You have already claimed your daily reward today." }; await updateAccount(account._id, { balance: account.balance + DAILY_REWARD, lastDaily: now }); return { success: true, message: `You claimed your daily ${DAILY_REWARD} ${CURRENCY_NAME}! Your new balance is ${account.balance + DAILY_REWARD}.` }; }
async function handleFlip(account, amount, choice) { if (isNaN(amount) || amount < FLIP_MIN_BET || amount > FLIP_MAX_BET) return { success: false, message: `Bet must be between ${FLIP_MIN_BET} and ${FLIP_MAX_BET}.` }; if (account.balance < amount) return { success: false, message: "You don't have enough bits." }; const result = Math.random() < 0.5 ? 'heads' : 'tails'; if (result === choice) { await updateAccount(account._id, { balance: account.balance + amount }); return { success: true, message: `It was ${result}! You win ${amount} ${CURRENCY_NAME}! New balance: ${account.balance + amount}.` }; } else { await updateAccount(account._id, { balance: account.balance - amount }); return { success: false, message: `It was ${result}. You lost ${amount} ${CURRENCY_NAME}. New balance: ${account.balance - amount}.` }; } }
async function handleSlots(account, amount) { const now = Date.now(); const cooldown = SLOTS_COOLDOWN_SECONDS * 1000; if (account.lastSlots && (now - account.lastSlots) < cooldown) return { success: false, message: `Slow down! Wait ${formatDuration((cooldown - (now - account.lastSlots))/1000)}.` }; if (isNaN(amount) || amount < SLOTS_MIN_BET || amount > SLOTS_MAX_BET) return { success: false, message: `Bet must be between ${SLOTS_MIN_BET} and ${SLOTS_MAX_BET}.` }; if (account.balance < amount) return { success: false, message: "You don't have enough bits." }; await updateAccount(account._id, { lastSlots: now }); const s1 = SLOT_REELS[0][Math.floor(Math.random()*SLOT_REELS[0].length)], s2 = SLOT_REELS[1][Math.floor(Math.random()*SLOT_REELS[1].length)], s3 = SLOT_REELS[2][Math.floor(Math.random()*SLOT_REELS[2].length)]; const resultString = `[ ${s1} | ${s2} | ${s3} ]`; let winMultiplier = 0; let winMessage = ''; if (s1 === s2 && s2 === s3) { winMultiplier = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? SLOTS_PAYOUTS.jackpot_multiplier : SLOTS_PAYOUTS.three_of_a_kind; winMessage = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? "JACKPOT! 💎" : "Three of a kind!"; } else if (s1 === s2 || s2 === s3 || s1 === s3) { winMultiplier = SLOTS_PAYOUTS.two_of_a_kind; winMessage = "Two of a kind!"; } let finalMessage, newBalance; if (winMultiplier > 0) { const winnings = Math.floor(amount * winMultiplier); newBalance = account.balance + winnings; finalMessage = `${resultString} - ${winMessage} You win ${winnings} ${CURRENCY_NAME}! New balance: ${newBalance}.`; await updateAccount(account._id, { balance: newBalance }); } else { newBalance = account.balance - amount; finalMessage = `${resultString} - You lost ${amount} ${CURRENCY_NAME}. New balance: ${newBalance}.`; await updateAccount(account._id, { balance: newBalance }); } return { success: true, message: finalMessage }; }
async function handleLeaderboard() { const topPlayers = await economyCollection.find().sort({ balance: -1 }).limit(50).toArray(); if (topPlayers.length === 0) return { success: false, lines: ["The leaderboard is empty!"]}; const lines = topPlayers.map((player, index) => `${index + 1}. **${player._id}** - ${player.balance} ${CURRENCY_NAME}`); return { success: true, lines: lines }; }
function handleTimers(account) { const now = Date.now(); const timers = []; timers.push(`💪 Work: ${(account.lastWork && (now - account.lastWork) < WORK_COOLDOWN_MINUTES * 60 * 1000) ? formatDuration(((account.lastWork + WORK_COOLDOWN_MINUTES * 60 * 1000) - now) / 1000) : 'Ready!'}`); timers.push(`⛏️ Gather: ${(account.lastGather && (now - account.lastGather) < GATHER_COOLDOWN_MINUTES * 60 * 1000) ? formatDuration(((account.lastGather + GATHER_COOLDOWN_MINUTES * 60 * 1000) - now) / 1000) : 'Ready!'}`); const nextDaily = new Date(); nextDaily.setUTCDate(nextDaily.getUTCDate() + 1); nextDaily.setUTCHours(0, 0, 0, 0); timers.push(`📅 Daily: ${account.lastDaily && new Date(account.lastDaily).getUTCDate() === new Date().getUTCDate() ? formatDuration((nextDaily - now) / 1000) : 'Ready!'}`); const slotsTimeLeft = (account.lastSlots || 0) + SLOTS_COOLDOWN_SECONDS * 1000 - now; if (slotsTimeLeft > 0) timers.push(`🎰 Slots: ${formatDuration(slotsTimeLeft / 1000)}`); if (account.smelting && account.smelting.finishTime > now) timers.push(`🔥 Smelting: ${formatDuration((account.smelting.finishTime - now) / 1000)}`); return [`**Personal Cooldowns for ${account._id}:**`].concat(timers.map(t => `> ${t}`)); }
async function handleSmelt(account, oreName, quantity) { const smelterCount = account.inventory['smelter'] || 0; if (smelterCount < 1) return { success: false, message: "You need to craft a 🔥 Smelter first!" }; if (account.smelting && account.smelting.finishTime > Date.now()) return { success: false, message: `You are already smelting! Wait for it to finish.` }; const oreId = getItemIdByName(oreName); const ingotId = SMELTABLE_ORES[oreId]; if (!ingotId) return { success: false, message: `You can't smelt that. Valid ores: Iron Ore, Copper Ore.` }; if (isNaN(quantity) || quantity <= 0) return { success: false, message: "Invalid quantity." }; if ((account.inventory[oreId] || 0) < quantity) return { success: false, message: `You don't have enough ${ITEMS[oreId].name}.` }; const coalNeeded = quantity * SMELT_COAL_COST_PER_ORE; if ((account.inventory['coal'] || 0) < coalNeeded) return { success: false, message: `You don't have enough coal. You need ${coalNeeded} ⚫ Coal.` }; await modifyInventory(account._id, oreId, -quantity); await modifyInventory(account._id, 'coal', -coalNeeded); const timePerOre = (SMELT_COOLDOWN_SECONDS_PER_ORE / smelterCount) * 1000; const totalTime = timePerOre * quantity; const finishTime = Date.now() + totalTime; await updateAccount(account._id, { smelting: { ingotId, quantity, finishTime } }); return { success: true, message: `You begin smelting ${quantity}x ${ITEMS[oreId].name}. It will take ${formatDuration(totalTime/1000)}.` }; }
async function handlePay(senderAccount, recipientAccount, amount) { if (isNaN(amount) || amount <= 0) return { success: false, message: "Please provide a valid, positive amount to pay." }; if (senderAccount.balance < amount) return { success: false, message: `You don't have enough Bits. You only have ${senderAccount.balance}.`}; if (senderAccount._id === recipientAccount._id) return { success: false, message: "You can't pay yourself!" }; await updateAccount(senderAccount._id, { balance: senderAccount.balance - amount }); await updateAccount(recipientAccount._id, { balance: recipientAccount.balance + amount }); return { success: true, message: `You paid ${amount} ${CURRENCY_NAME} to **${recipientAccount._id}**.` }; }
async function handleMarket(filter = null) { let query = {}; const filterLower = filter ? filter.toLowerCase().trim() : null; if (filterLower) { const itemIds = Object.keys(ITEMS).filter(k => ITEMS[k].name.toLowerCase().includes(filterLower)); if (itemIds.length === 0) return { success: false, lines: [`No market listings found matching "${filter}".`] }; query = { itemId: { $in: itemIds } }; } const listings = await marketCollection.find(query).sort({ listingId: 1 }).toArray(); if (listings.length === 0) { const message = filter ? `No market listings found matching "${filter}".` : "The market is empty."; return { success: false, lines: [message] }; } const formattedLines = listings.map(l => `(ID: ${l.listingId}) ${ITEMS[l.itemId]?.emoji || '📦'} **${l.quantity}x** ${ITEMS[l.itemId].name} @ **${l.price}** ${CURRENCY_NAME} ea. by *${l.sellerName}*`); return { success: true, lines: formattedLines }; }

// --- BACKGROUND & NPC LOGIC ---
async function processVendorTicks() { console.log("Processing vendor tick..."); for (const vendor of VENDORS) { const currentListingsCount = await marketCollection.countDocuments({ sellerId: vendor.sellerId }); if (currentListingsCount >= 3) { continue; } if (Math.random() < vendor.chance) { const itemToSell = vendor.stock[Math.floor(Math.random() * vendor.stock.length)]; const newListingId = await findNextAvailableListingId(); await marketCollection.insertOne({ listingId: newListingId, sellerId: vendor.sellerId, sellerName: vendor.name, itemId: itemToSell.itemId, quantity: itemToSell.quantity, price: itemToSell.price }); console.log(`${vendor.name} listed ${itemToSell.quantity}x ${ITEMS[itemToSell.itemId].name}!`); } } }
async function processFinishedSmelting() { const now = Date.now(); const finishedSmelts = await economyCollection.find({ "smelting.finishTime": { $ne: null, $lte: now } }).toArray(); for (const account of finishedSmelts) { const { ingotId, quantity } = account.smelting; await modifyInventory(account._id, ingotId, quantity); await updateAccount(account._id, { smelting: null }); try { const user = await client.users.fetch(account.discordId); user.send(`✅ Your smelting is complete! You received ${quantity}x ${ITEMS[ingotId].name}.`); } catch (e) { console.log(`Could not DM ${account._id} about finished smelt.`); } } }

// =========================================================================
// --- DISCORD BOT LOGIC ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) await handleSlashCommand(interaction);
        else if (interaction.isButton()) await handleButtonInteraction(interaction);
    } catch (error) {
        console.error("Error handling interaction:", error);
        if (interaction.replied || interaction.deferred) await interaction.editReply({ content: 'An unexpected error occurred!', components: [] });
    }
});

async function handleButtonInteraction(interaction) {
    const [action, type, userId] = interaction.customId.split('_');
    if (interaction.user.id !== userId) return interaction.reply({ content: "You cannot use these buttons.", ephemeral: true });
    
    const session = userPaginationData[userId];
    if (!session) return interaction.update({ content: 'This interactive message has expired or is invalid.', components: [] });

    const pageChange = (type === 'next') ? 1 : -1;
    const { discord } = getPaginatedResponse(userId, session.type, session.lines, session.title, pageChange);
    await interaction.update(discord);
}

async function handleSlashCommand(interaction) {
    const { commandName, user, options } = interaction;
    await interaction.deferReply({ ephemeral: true });

    if (commandName === 'link') {
        const existingLink = await getAccount(user.id);
        if (existingLink) return interaction.editReply({ content: `Your account is already linked to **${existingLink._id}**.` });
        const drednotNameToLink = options.getString('drednot_name');
        const targetAccount = await getAccount(drednotNameToLink);
        if (targetAccount && targetAccount.discordId) return interaction.editReply({ content: `**${drednotNameToLink}** is already linked.` });
        const verificationCode = `${Math.floor(1000 + Math.random() * 9000)}`;
        await verificationsCollection.insertOne({ _id: verificationCode, discordId: user.id, drednotName: drednotNameToLink, timestamp: Date.now() });
        await interaction.editReply({ content: `**Verification Started!**\nIn Drednot, type: \`!verify ${verificationCode}\`\nThis code expires in 5 minutes.` });
        return;
    }
    
    if (['market', 'leaderboard', 'recipes'].includes(commandName)) {
        let result, title, type;
        if (commandName === 'market') { const filter = options.getString('filter'); result = await handleMarket(filter); title = filter ? `Market (Filter: ${filter})` : "Market"; type = 'market'; }
        if (commandName === 'leaderboard') { result = await handleLeaderboard(); title = "Leaderboard"; type = 'leaderboard'; }
        if (commandName === 'recipes') { const recipeLines = handleRecipes().split('\n'); title = recipeLines.shift(); result = { success: true, lines: recipeLines }; type = 'recipes'; }
        
        if (!result.success) return interaction.editReply({ content: result.lines[0], components: [] });

        const { discord } = getPaginatedResponse(user.id, type, result.lines, title, 0);
        await interaction.editReply(discord);
        return;
    }

    const account = await getAccount(user.id);
    if (!account) return interaction.editReply({ content: 'Your account is not linked. Use `/link` first.' });
    
    let result, amount, choice, itemName, quantity, price, listingId;
    switch (commandName) {
        case 'balance': await interaction.editReply({ content: `Your balance is: ${account.balance} ${CURRENCY_NAME}.` }); break;
        case 'work': result = await handleWork(account); await interaction.editReply({ content: result.message }); break;
        case 'daily': result = await handleDaily(account); await interaction.editReply({ content: result.message }); break;
        case 'gather': result = await handleGather(account); await interaction.editReply({ content: result.message }); break;
        case 'inventory': itemName = options.getString('item_name'); result = handleInventory(account, itemName); await interaction.editReply({ content: result }); break;
        case 'craft': itemName = options.getString('item_name'); result = await handleCraft(account, itemName); await interaction.editReply({ content: result }); break;
        case 'flip': amount = options.getInteger('amount'); choice = options.getString('choice'); result = await handleFlip(account, amount, choice); await interaction.editReply({ content: result.message }); break;
        case 'slots': amount = options.getInteger('amount'); result = await handleSlots(account, amount); await interaction.editReply({ content: result.message }); break;
        case 'timers': result = handleTimers(account); await interaction.editReply({ content: result.join('\n') }); break;
        case 'smelt': itemName = options.getString('ore_name'); quantity = options.getInteger('quantity'); result = await handleSmelt(account, itemName, quantity); await interaction.editReply({ content: result.message }); break;
        case 'pay': const recipientUser = options.getUser('user'); amount = options.getInteger('amount'); if (recipientUser.bot) return interaction.editReply({ content: "You can't pay bots."}); const recipientAccount = await getAccount(recipientUser.id); if (!recipientAccount) return interaction.editReply({ content: `That user isn't linked to a Drednot account yet.` }); result = await handlePay(account, recipientAccount, amount); await interaction.editReply({ content: result.message }); break;
        case 'marketsell': itemName = options.getString('item_name'); quantity = options.getInteger('quantity'); price = options.getNumber('price'); const itemIdToSell = getItemIdByName(itemName); if (!itemIdToSell) return interaction.editReply({ content: 'Invalid item name.' }); if (quantity <= 0 || price <= 0) return interaction.editReply({ content: 'Quantity and price must be positive.' }); if ((account.inventory[itemIdToSell] || 0) < quantity) return interaction.editReply({ content: 'You do not have enough of that item to sell.' }); await modifyInventory(account._id, itemIdToSell, -quantity); const newListingId = await findNextAvailableListingId(); await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: account._id, itemId: itemIdToSell, quantity, price }); await interaction.editReply({ content: `You listed ${quantity}x ${ITEMS[itemIdToSell].name} for sale. Listing ID: **${newListingId}**` }); break;
        case 'marketbuy': listingId = options.getInteger('listing_id'); const listingToBuy = await marketCollection.findOne({ listingId: listingId }); if (!listingToBuy) return interaction.editReply({ content: 'Invalid listing ID.' }); if (listingToBuy.sellerId === account._id) return interaction.editReply({ content: "You can't buy your own listing." }); const totalCost = listingToBuy.quantity * listingToBuy.price; if (account.balance < totalCost) return interaction.editReply({ content: `You can't afford this. It costs ${totalCost} ${CURRENCY_NAME}.` }); await updateAccount(account._id, { balance: account.balance - totalCost }); await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity); const sellerAccount = await getAccount(listingToBuy.sellerId); if (sellerAccount) await updateAccount(sellerAccount._id, { balance: sellerAccount.balance + (totalCost * (1 - MARKET_TAX_RATE)) }); await marketCollection.deleteOne({ _id: listingToBuy._id }); await interaction.editReply({ content: `You bought ${listingToBuy.quantity}x ${ITEMS[listingToBuy.itemId].name}!` }); break;
        case 'marketcancel': const listingIdToCancel = options.getInteger('listing_id'); const listingToCancel = await marketCollection.findOne({ listingId: listingIdToCancel }); if (!listingToCancel || listingToCancel.sellerId !== account._id) return interaction.editReply({ content: 'This is not your listing or it does not exist.' }); await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity); await marketCollection.deleteOne({ _id: listingToCancel._id }); await interaction.editReply({ content: `You cancelled your listing for ${listingToCancel.quantity}x ${ITEMS[listingToCancel.itemId].name}.` }); break;
    }
}

// =========================================================================
// --- WEB SERVER LOGIC ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));

app.post('/command', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== YOUR_API_KEY) return res.status(401).send('Error: Invalid API key');
    
    const { command, username, args } = req.body;
    const identifier = username.toLowerCase();
    let responseMessage = '';
    
    if (command === 'verify') {
        const code = args[0];
        const verificationData = await verificationsCollection.findOne({ _id: code });
        if (!verificationData || (Date.now() - verificationData.timestamp > 5 * 60 * 1000)) { responseMessage = 'That verification code is invalid or has expired.'; } 
        else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) { responseMessage = 'This verification code is for a different Drednot user.'; } 
        else {
            let targetAccount = await getAccount(username);
            if (!targetAccount) targetAccount = await createNewAccount(username);
            await updateAccount(targetAccount._id, { discordId: verificationData.discordId });
            await verificationsCollection.deleteOne({ _id: code });
            responseMessage = `✅ Verification successful! Your accounts are now linked.`;
            try { const discordUser = await client.users.fetch(verificationData.discordId); discordUser.send(`Great news! Your link to the Drednot account **${username}** has been successfully verified.`); } catch (e) { console.log("Couldn't send DM confirmation."); }
        }
        return res.json({ reply: responseMessage });
    }

    if (['n', 'next', 'p', 'back'].includes(command)) {
        const session = userPaginationData[identifier];
        if (!session) return res.json({ reply: 'You have no active list to navigate.' });
        const pageChange = (command === 'n' || command === 'next') ? 1 : -1;
        const { game } = getPaginatedResponse(identifier, session.type, session.lines, session.title, pageChange);
        return res.json({ reply: game.map(line => line.replace(/\*\*|`|>/g, '')) });
    }
    
    let account = await getAccount(username);
    if (!account) {
        account = await createNewAccount(username);
        return res.json({ reply: `Welcome, ${username}! Account created with ${STARTING_BALANCE} ${CURRENCY_NAME}. In Discord, use \`/link ${username}\` to link.` });
    }

    let result, lines, title;
    const cleanText = (text) => Array.isArray(text) ? text.map(t => t.replace(/\*\*|`|>/g, '')) : String(text).replace(/\*\*|`|>/g, '');

    switch (command) {
        case 'm': case 'market': const marketFilter = args.length > 0 ? args.join(' ') : null; result = await handleMarket(marketFilter); if (!result.success) { responseMessage = result.lines[0]; break; } title = marketFilter ? `Market (Filter: ${marketFilter})` : "Market"; const marketPage = getPaginatedResponse(identifier, 'market', result.lines, title, 0); responseMessage = marketPage.game.map(line => cleanText(line)); break;
        case 'lb': case 'leaderboard': result = await handleLeaderboard(); title = "Leaderboard"; const lbPage = getPaginatedResponse(identifier, 'leaderboard', result.lines, title, 0); responseMessage = lbPage.game.map(line => cleanText(line)); break;
        case 'recipes': lines = handleRecipes().split('\n'); title = lines.shift(); result = getPaginatedResponse(identifier, 'recipes', lines, title, 0); responseMessage = result.game.map(line => cleanText(line)); break;
        case 'bal': case 'balance': responseMessage = `${username}, your balance is: ${account.balance} ${CURRENCY_NAME}.`; break;
        case 'work': result = await handleWork(account); responseMessage = `${username}, ${result.message}`; break;
        case 'gather': result = await handleGather(account); responseMessage = `${username}, ${result.message}`; break;
        case 'inv': case 'inventory': const invFilter = args.length > 0 ? args.join(' ') : null; responseMessage = cleanText(handleInventory(account, invFilter)); break;
        case 'craft': if (args.length === 0) { responseMessage = "Usage: !craft <item name>"; } else { let craftResult = await handleCraft(account, args.join(' ')); responseMessage = craftResult.replace('`/recipes`', '`!recipes`'); } break;
        case 'daily': result = await handleDaily(account); responseMessage = `${username}, ${result.message}`; break;
        case 'flip': if (args.length < 2) { responseMessage = "Usage: !flip <amount> <heads/tails>"; } else { result = await handleFlip(account, parseInt(args[0]), args[1].toLowerCase()); responseMessage = `${username}, ${result.message}`; } break;
        case 'slots': if (args.length < 1) { responseMessage = "Usage: !slots <amount>"; } else { result = await handleSlots(account, parseInt(args[0])); responseMessage = `${username}, ${result.message}`; } break;
        case 'timer': case 'timers': result = handleTimers(account); responseMessage = result.map(line => cleanText(line)); break;
        case 'smelt': if (args.length < 2) { responseMessage = "Usage: !smelt <ore name> <quantity>"; } else { const oreName = args.slice(0, -1).join(' '); const quantity = parseInt(args[args.length - 1]); result = await handleSmelt(account, oreName, quantity); responseMessage = result.message; } break;
        case 'pay': if (args.length < 2) { responseMessage = "Usage: !pay <username> <amount>"; } else { const amountToPay = parseInt(args[args.length - 1]); const recipientName = args.slice(0, -1).join(' '); const recipientAccount = await getAccount(recipientName); if (!recipientAccount) { responseMessage = `Could not find a player named "${recipientName}".`; } else { result = await handlePay(account, recipientAccount, amountToPay); responseMessage = result.message.replace(/\*/g, ''); } } break;
        case 'ms': case 'marketsell': if (args.length < 3) { responseMessage = "Usage: !marketsell <item name> <qty> <price>"; } else { const itemName = args.slice(0, -2).join(' '); const qty = parseInt(args[args.length - 2]); const price = parseFloat(args[args.length - 1]); const itemId = getItemIdByName(itemName); if (!itemId || isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) { responseMessage = "Invalid format."; } else if ((account.inventory[itemId] || 0) < qty) { responseMessage = "You don't have enough of that item."; } else { await modifyInventory(account._id, itemId, -qty); const newListingId = await findNextAvailableListingId(); await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: account._id, itemId, quantity: qty, price }); responseMessage = `Listed ${qty}x ${ITEMS[itemId].name}. ID: ${newListingId}`; } } break;
        case 'mb': case 'marketbuy': if (args.length < 1) { responseMessage = "Usage: !marketbuy <listing_id>"; } else { const listingId = parseInt(args[0]); if(isNaN(listingId)) { responseMessage = "Listing ID must be a number."; break; } const listingToBuy = await marketCollection.findOne({ listingId: listingId }); if (!listingToBuy) { responseMessage = 'Invalid listing ID.'; break; } const totalCost = listingToBuy.quantity * listingToBuy.price; if (listingToBuy.sellerId === account._id) { responseMessage = "You can't buy your own listing."; } else if (account.balance < totalCost) { responseMessage = "You can't afford this."; } else { await updateAccount(account._id, { balance: account.balance - totalCost }); await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity); const sellerAccount = await getAccount(listingToBuy.sellerId); if (sellerAccount) await updateAccount(sellerAccount._id, { balance: sellerAccount.balance + (totalCost * (1 - MARKET_TAX_RATE)) }); await marketCollection.deleteOne({ _id: listingToBuy._id }); responseMessage = `You bought ${listingToBuy.quantity}x ${ITEMS[listingToBuy.itemId].name}!`; } } break;
        case 'mc': case 'marketcancel': if (args.length < 1) { responseMessage = "Usage: !marketcancel <listing_id>"; } else { const listingId = parseInt(args[0]); if(isNaN(listingId)) { responseMessage = "Listing ID must be a number."; break; } const listingToCancel = await marketCollection.findOne({ listingId: listingId }); if (!listingToCancel || listingToCancel.sellerId !== account._id) { responseMessage = "This is not your listing."; } else { await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity); await marketCollection.deleteOne({ _id: listingToCancel._id }); responseMessage = `Cancelled your listing for ${listingToCancel.quantity}x ${ITEMS[listingToCancel.itemId].name}.`; } } break;
        default: responseMessage = `Unknown command: !${command}`;
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
