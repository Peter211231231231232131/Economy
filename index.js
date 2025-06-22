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

// --- MONGODB DATABASE SETUP ---
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
const mongoClient = new MongoClient(mongoUri);
let economyCollection, verificationsCollection, marketCollection;

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy");
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
        marketCollection = db.collection("market_listings");
    } catch (error) { console.error("Failed to connect to MongoDB", error); process.exit(1); }
}

// --- ECONOMY DEFINITIONS ---
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const DAILY_REWARD = 25;
const WORK_REWARD_MIN = 5, WORK_REWARD_MAX = 35, WORK_COOLDOWN_MINUTES = 1;
const GATHER_COOLDOWN_MINUTES = 3;
const MARKET_TAX_RATE = 0.05;
const FLIP_MIN_BET = 5, FLIP_MAX_BET = 100;
const SLOTS_MIN_BET = 10, SLOTS_MAX_BET = 1500, SLOTS_COOLDOWN_SECONDS = 5;

const ITEMS = {
    'iron_ore': { name: "Iron Ore", description: "A common metallic ore." },
    'copper_ore': { name: "Copper Ore", description: "A reddish-brown metallic ore." },
    'stone': { name: "Stone", description: "A basic building material." },
    'wood': { name: "Wood", description: "A basic building material." },
    'coal': { name: "Coal", description: "A combustible rock, used as fuel." },
    'basic_pickaxe': { name: "Basic Pickaxe", description: "A simple pickaxe.", craftable: true, recipe: { 'stone': 5, 'wood': 2 } },
    'sturdy_pickaxe': { name: "Sturdy Pickaxe", description: `Slightly increases earnings from work.`, craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } },
};
const GATHER_TABLE = { 'iron_ore': { baseChance: 0.60, minQty: 1, maxQty: 3 }, 'copper_ore': { baseChance: 0.40, minQty: 1, maxQty: 2 }, 'stone': { baseChance: 0.70, minQty: 2, maxQty: 5 }, 'wood': { baseChance: 0.50, minQty: 1, maxQty: 4 }, 'coal': { baseChance: 0.30, minQty: 1, maxQty: 2 } };
const SLOT_REELS = [ ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔']];
const SLOTS_PAYOUTS = { three_of_a_kind: 15, two_of_a_kind: 3.5, jackpot_symbol: '💎', jackpot_multiplier: 50 };

// --- DATABASE HELPER FUNCTIONS ---
async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(drednotName) { const lowerName = drednotName.toLowerCase(); const newAccount = { _id: lowerName, balance: STARTING_BALANCE, discordId: null, lastWork: null, lastGather: null, lastDaily: null, lastSlots: null, inventory: {} }; await economyCollection.insertOne(newAccount); return newAccount; }
async function updateAccount(accountId, updates) { await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates }); }
async function modifyInventory(accountId, itemId, amount) { if (!itemId) return; const updateField = `inventory.${itemId}`; await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $inc: { [updateField]: amount } }); }
function getItemIdByName(name) { return Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === name.toLowerCase()); }
function formatDuration(seconds) { if (seconds < 60) return `${Math.ceil(seconds)}s`; const minutes = Math.floor(seconds / 60); const remainingSeconds = Math.ceil(seconds % 60); return `${minutes}m ${remainingSeconds}s`; }

// --- COMMAND HANDLER LOGIC ---
async function handleWork(account) { const now = Date.now(); const cooldown = WORK_COOLDOWN_MINUTES * 60 * 1000; if (account.lastWork && (now - account.lastWork) < cooldown) { const remaining = cooldown - (now - account.lastWork); return { success: false, message: `You are on cooldown. Wait ${formatDuration(remaining / 1000)}.` }; } const earnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN; await updateAccount(account._id, { balance: account.balance + earnings, lastWork: now }); return { success: true, message: `You earned ${earnings} ${CURRENCY_NAME}! New balance is ${account.balance + earnings}.` }; }
async function handleGather(account) { const now = Date.now(); const cooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000; if (account.lastGather && (now - account.lastGather) < cooldown) { const remaining = cooldown - (now - account.lastGather); return { success: false, message: `You are tired. Wait ${formatDuration(remaining / 1000)}.` }; } let gatheredItems = []; let updates = {}; for (const itemId in GATHER_TABLE) { if (Math.random() < GATHER_TABLE[itemId].baseChance) { const qty = Math.floor(Math.random() * (GATHER_TABLE[itemId].maxQty - GATHER_TABLE[itemId].minQty + 1)) + GATHER_TABLE[itemId].minQty; updates[`inventory.${itemId}`] = qty; gatheredItems.push(`${qty}x ${ITEMS[itemId].name}`); } } await economyCollection.updateOne({ _id: account._id }, { $inc: updates, $set: { lastGather: now } }); if (gatheredItems.length === 0) return { success: true, message: 'You searched but found nothing.' }; return { success: true, message: `You gathered: ${gatheredItems.join(', ')}.` }; }
function handleInventory(account) { if (!account.inventory || Object.keys(account.inventory).length === 0) return 'Your inventory is empty.'; let invList = ['Your inventory:']; for (const itemId in account.inventory) { if (account.inventory[itemId] > 0) invList.push(`- ${account.inventory[itemId]}x ${ITEMS[itemId]?.name || itemId}`); } return invList.length > 1 ? invList.join('\n') : 'Your inventory is empty.'; }
function handleRecipes() { let recipeList = ['**Available Recipes:**']; for (const itemId in ITEMS) { if (ITEMS[itemId].craftable) { const recipeParts = Object.entries(ITEMS[itemId].recipe).map(([resId, qty]) => `${qty}x ${ITEMS[resId].name}`); recipeList.push(`- **${ITEMS[itemId].name}**: Requires ${recipeParts.join(', ')}`); } } return recipeList.length > 1 ? recipeList.join('\n') : 'There are no craftable items yet.'; }
async function handleCraft(account, itemName) { const itemToCraftId = getItemIdByName(itemName); if (!itemToCraftId || !ITEMS[itemToCraftId].craftable) return `"${itemName}" is not a valid, craftable item. Check \`/recipes\`.`; const recipe = ITEMS[itemToCraftId].recipe; for (const resId in recipe) { const requiredQty = recipe[resId]; const playerQty = account.inventory[resId] || 0; if (playerQty < requiredQty) return `You don't have enough resources! You need ${requiredQty - playerQty} more ${ITEMS[resId].name}.`; } for (const resId in recipe) await modifyInventory(account._id, resId, -recipe[resId]); await modifyInventory(account._id, itemToCraftId, 1); return `You successfully crafted 1x ${ITEMS[itemToCraftId].name}!`; }
async function handleDaily(account) { const now = new Date(); const lastDaily = account.lastDaily ? new Date(account.lastDaily) : null; if (lastDaily && now.toDateString() === lastDaily.toDateString()) return { success: false, message: "You have already claimed your daily reward today. Come back tomorrow!" }; await updateAccount(account._id, { balance: account.balance + DAILY_REWARD, lastDaily: now }); return { success: true, message: `You claimed your daily ${DAILY_REWARD} ${CURRENCY_NAME}! Your new balance is ${account.balance + DAILY_REWARD}.` }; }
async function handleFlip(account, amount, choice) { if (amount < FLIP_MIN_BET || amount > FLIP_MAX_BET) return { success: false, message: `Your bet must be between ${FLIP_MIN_BET} and ${FLIP_MAX_BET} ${CURRENCY_NAME}.` }; if (account.balance < amount) return { success: false, message: "You don't have enough bits for that bet." }; const result = Math.random() < 0.5 ? 'heads' : 'tails'; if (result === choice) { await updateAccount(account._id, { balance: account.balance + amount }); return { success: true, message: `It was ${result}! You win ${amount} ${CURRENCY_NAME}! New balance: ${account.balance + amount}.` }; } else { await updateAccount(account._id, { balance: account.balance - amount }); return { success: false, message: `It was ${result}. You lost ${amount} ${CURRENCY_NAME}. New balance: ${account.balance - amount}.` }; } }
async function handleSlots(account, amount) { const now = Date.now(); const cooldown = SLOTS_COOLDOWN_SECONDS * 1000; if (account.lastSlots && (now - account.lastSlots) < cooldown) return { success: false, message: `Slow down! You can play slots again in ${formatDuration(Math.ceil((cooldown - (now - account.lastSlots))/1000))}.` }; if (amount < SLOTS_MIN_BET || amount > SLOTS_MAX_BET) return { success: false, message: `Your bet must be between ${SLOTS_MIN_BET} and ${SLOTS_MAX_BET} ${CURRENCY_NAME}.` }; if (account.balance < amount) return { success: false, message: "You don't have enough bits for that bet." }; await updateAccount(account._id, { lastSlots: now }); const s1 = SLOT_REELS[0][Math.floor(Math.random()*SLOT_REELS[0].length)], s2 = SLOT_REELS[1][Math.floor(Math.random()*SLOT_REELS[1].length)], s3 = SLOT_REELS[2][Math.floor(Math.random()*SLOT_REELS[2].length)]; const resultString = `[ ${s1} | ${s2} | ${s3} ]`; let winMultiplier = 0; let message = ''; if (s1 === s2 && s2 === s3) { winMultiplier = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? SLOTS_PAYOUTS.jackpot_multiplier : SLOTS_PAYOUTS.three_of_a_kind; message = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? "JACKPOT! 💎" : "Three of a kind!"; } else if (s1 === s2 || s2 === s3 || s1 === s3) { winMultiplier = SLOTS_PAYOUTS.two_of_a_kind; message = "Two of a kind!"; } if (winMultiplier > 0) { const winnings = Math.floor(amount * winMultiplier); await updateAccount(account._id, { balance: account.balance + winnings }); return { success: true, message: `${resultString} - ${message} You win ${winnings} ${CURRENCY_NAME}! New balance: ${account.balance + winnings}.` }; } else { await updateAccount(account._id, { balance: account.balance - amount }); return { success: false, message: `${resultString} - You lost ${amount} ${CURRENCY_NAME}. New balance: ${account.balance - amount}.` }; } }
async function handleLeaderboard() { const topPlayers = await economyCollection.find().sort({ balance: -1 }).limit(10).toArray(); if (topPlayers.length === 0) return ["The leaderboard is empty!"]; let lbMessage = [`**🏆 Top 10 Richest Players 🏆**`]; topPlayers.forEach((player, index) => { lbMessage.push(`${index + 1}. **${player._id}** - ${player.balance} ${CURRENCY_NAME}`); }); return lbMessage; }

// =========================================================================
// --- DISCORD BOT LOGIC ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in!`));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
        await handleSlashCommand(interaction);
    } catch (error) {
        console.error("Error handling slash command:", error);
        if (interaction.replied || interaction.deferred) await interaction.editReply({ content: 'An unexpected error occurred!' });
    }
});

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

    const account = await getAccount(user.id);
    if (!account) return interaction.editReply({ content: 'Your account is not linked. Use `/link` first.' });
    
    let result, amount, choice, itemName, quantity, price, listingId;
    switch (commandName) {
        case 'balance': await interaction.editReply({ content: `Your balance is: ${account.balance} ${CURRENCY_NAME}.` }); break;
        case 'work': result = await handleWork(account); await interaction.editReply({ content: result.message }); break;
        case 'daily': result = await handleDaily(account); await interaction.editReply({ content: result.message }); break;
        case 'gather': result = await handleGather(account); await interaction.editReply({ content: result.message }); break;
        case 'inventory': await interaction.editReply({ content: handleInventory(account) }); break;
        case 'recipes': await interaction.editReply({ content: handleRecipes() }); break;
        case 'craft': itemName = options.getString('item_name'); result = await handleCraft(account, itemName); await interaction.editReply({ content: result }); break;
        case 'flip': amount = options.getInteger('amount'); choice = options.getString('choice'); result = await handleFlip(account, amount, choice); await interaction.editReply({ content: result.message }); break;
        case 'slots': amount = options.getInteger('amount'); result = await handleSlots(account, amount); await interaction.editReply({ content: result.message }); break;
        case 'leaderboard': result = await handleLeaderboard(); await interaction.editReply({ content: result.join('\n') }); break;
        case 'market': const listings = await marketCollection.find().limit(20).toArray(); if (listings.length === 0) return interaction.editReply({ content: 'The market is empty.' }); const marketMessage = listings.map(l => `(ID: ${l._id.toString().slice(-6)}) **${l.quantity}x** ${ITEMS[l.itemId].name} @ **${l.price}** ${CURRENCY_NAME} ea. by *${l.sellerName}*`).join('\n'); await interaction.editReply({ content: `**Market Listings:**\n${marketMessage}` }); break;
        case 'marketsell': itemName = options.getString('item_name'); quantity = options.getInteger('quantity'); price = options.getNumber('price'); const itemIdToSell = getItemIdByName(itemName); if (!itemIdToSell) return interaction.editReply({ content: 'Invalid item name.' }); if (quantity <= 0 || price <= 0) return interaction.editReply({ content: 'Quantity and price must be positive.' }); if ((account.inventory[itemIdToSell] || 0) < quantity) return interaction.editReply({ content: 'You do not have enough of that item to sell.' }); await modifyInventory(account._id, itemIdToSell, -quantity); const listing = await marketCollection.insertOne({ sellerId: account._id, sellerName: account._id, itemId: itemIdToSell, quantity, price }); await interaction.editReply({ content: `You listed ${quantity}x ${ITEMS[itemIdToSell].name} for sale. Listing ID: ${listing.insertedId.toString().slice(-6)}` }); break;
        case 'marketbuy': listingId = options.getString('listing_id'); let listingToBuy; try { const listingsArray = await marketCollection.find({}).toArray(); listingToBuy = listingsArray.find(l => l._id.toString().endsWith(listingId)); if (!listingToBuy) throw new Error(); } catch (e) { return interaction.editReply({ content: 'Invalid listing ID.' }); } if (listingToBuy.sellerId === account._id) return interaction.editReply({ content: "You can't buy your own listing." }); const totalCost = listingToBuy.quantity * listingToBuy.price; if (account.balance < totalCost) return interaction.editReply({ content: `You can't afford this. It costs ${totalCost} ${CURRENCY_NAME}.` }); await updateAccount(account._id, { balance: account.balance - totalCost }); await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity); const sellerAccount = await getAccount(listingToBuy.sellerId); if (sellerAccount) await updateAccount(sellerAccount._id, { balance: sellerAccount.balance + (totalCost * (1 - MARKET_TAX_RATE)) }); await marketCollection.deleteOne({ _id: listingToBuy._id }); await interaction.editReply({ content: `You bought ${listingToBuy.quantity}x ${ITEMS[listingToBuy.itemId].name}!` }); break;
        case 'marketcancel': const cancelId = options.getString('listing_id'); let listingToCancel; try { const listingsArray = await marketCollection.find({}).toArray(); listingToCancel = listingsArray.find(l => l._id.toString().endsWith(cancelId)); if (!listingToCancel) throw new Error(); } catch (e) { return interaction.editReply({ content: 'Invalid listing ID.' }); } if (listingToCancel.sellerId !== account._id) return interaction.editReply({ content: 'This is not your listing.' }); await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity); await marketCollection.deleteOne({ _id: listingToCancel._id }); await interaction.editReply({ content: `You cancelled your listing for ${listingToCancel.quantity}x ${ITEMS[listingToCancel.itemId].name}.` }); break;
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
    
    let account = await getAccount(username);
    if (!account) {
        account = await createNewAccount(username);
        return res.json({ reply: `Welcome, ${username}! Account created with ${STARTING_BALANCE} ${CURRENCY_NAME}. In Discord, use \`/link ${username}\` to link.` });
    }

    let result;
    switch (command) {
        case 'bal': case 'balance': responseMessage = `${username}, your balance is: ${account.balance} ${CURRENCY_NAME}.`; break;
        case 'work': result = await handleWork(account); responseMessage = `${username}, ${result.message}`; break;
        case 'gather': result = await handleGather(account); responseMessage = `${username}, ${result.message}`; break;
        case 'inv': case 'inventory': responseMessage = handleInventory(account); break;
        case 'recipes': responseMessage = handleRecipes(); break;
        case 'craft': responseMessage = await handleCraft(account, args.join(' ')); break;
        case 'daily': result = await handleDaily(account); responseMessage = `${username}, ${result.message}`; break;
        case 'flip': if (args.length < 2) { responseMessage = "Usage: !flip <amount> <heads/tails>"; } else { result = await handleFlip(account, parseInt(args[0]), args[1].toLowerCase()); responseMessage = `${username}, ${result.message}`; } break;
        case 'slots': if (args.length < 1) { responseMessage = "Usage: !slots <amount>"; } else { result = await handleSlots(account, parseInt(args[0])); responseMessage = `${username}, ${result.message}`; } break;
        case 'lb': case 'leaderboard': result = await handleLeaderboard(); responseMessage = result; break;
        case 'm': case 'market': const listings = await marketCollection.find().limit(10).toArray(); if (listings.length === 0) { responseMessage = 'The market is empty.'; } else { responseMessage = [`**Market Listings:**`].concat(listings.map(l => `(ID: ${l._id.toString().slice(-6)}) ${l.quantity}x ${ITEMS[l.itemId].name} @ ${l.price} Bits by ${l.sellerName}`)); } break;
        case 'ms': case 'marketsell': if (args.length < 3) { responseMessage = "Usage: !marketsell <item name> <qty> <price>"; } else { const itemName = args.slice(0, -2).join(' '); const qty = parseInt(args[args.length - 2]); const price = parseFloat(args[args.length - 1]); const itemId = getItemIdByName(itemName); if (!itemId || isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) { responseMessage = "Invalid format. Usage: !ms <item name> <quantity> <price>"; } else if ((account.inventory[itemId] || 0) < qty) { responseMessage = "You don't have enough of that item."; } else { await modifyInventory(account._id, itemId, -qty); const listing = await marketCollection.insertOne({ sellerId: account._id, sellerName: account._id, itemId, quantity: qty, price }); responseMessage = `Listed ${qty}x ${ITEMS[itemId].name}. Listing ID: ${listing.insertedId.toString().slice(-6)}`; } } break;
        case 'mb': case 'marketbuy': if (args.length < 1) { responseMessage = "Usage: !marketbuy <listing_id>"; } else { let listingToBuy; try { const listingsArray = await marketCollection.find({}).toArray(); listingToBuy = listingsArray.find(l => l._id.toString().endsWith(args[0])); if (!listingToBuy) throw new Error(); } catch (e) { responseMessage = 'Invalid listing ID.'; break; } const totalCost = listingToBuy.quantity * listingToBuy.price; if (listingToBuy.sellerId === account._id) { responseMessage = "You can't buy your own listing."; } else if (account.balance < totalCost) { responseMessage = "You can't afford this."; } else { await updateAccount(account._id, { balance: account.balance - totalCost }); await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity); const sellerAccount = await getAccount(listingToBuy.sellerId); if (sellerAccount) await updateAccount(sellerAccount._id, { balance: sellerAccount.balance + (totalCost * (1 - MARKET_TAX_RATE)) }); await marketCollection.deleteOne({ _id: listingToBuy._id }); responseMessage = `You bought ${listingToBuy.quantity}x ${ITEMS[listingToBuy.itemId].name}!`; } } break;
        case 'mc': case 'marketcancel': if (args.length < 1) { responseMessage = "Usage: !marketcancel <listing_id>"; } else { let listingToCancel; try { const listingsArray = await marketCollection.find({}).toArray(); listingToCancel = listingsArray.find(l => l._id.toString().endsWith(args[0])); if (!listingToCancel) throw new Error(); } catch (e) { responseMessage = 'Invalid listing ID.'; break; } if (listingToCancel.sellerId !== account._id) { responseMessage = "This is not your listing."; } else { await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity); await marketCollection.deleteOne({ _id: listingToCancel._id }); responseMessage = `Cancelled your listing for ${listingToCancel.quantity}x ${ITEMS[listingToCancel.itemId].name}.`; } } break;
        default: responseMessage = `Unknown command: !${command}`;
    }
    res.json({ reply: responseMessage });
});

// --- STARTUP ---
async function startServer() {
    await connectToDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    app.listen(3000, () => console.log(`Web server is listening.`));
}

startServer();
