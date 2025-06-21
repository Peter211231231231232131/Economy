// --- Library Imports ---
const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const express = require('express');
const { MongoClient } = require('mongodb');

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json());
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const YOUR_API_KEY = 'drednot123'; // Your secret API key

// =========================================================================
// --- MONGODB DATABASE SETUP ---
// =========================================================================

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("CRITICAL: MONGO_URI not found in environment variables!");
}
const mongoClient = new MongoClient(mongoUri);
let economyCollection;
let verificationsCollection;

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy"); // You can name your database anything
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1); // Exit if we can't connect to the DB
    }
}

// =========================================================================
// --- ECONOMY LOGIC (Now uses MongoDB) ---
// =========================================================================
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const WORK_REWARD_MIN = 5;
const WORK_REWARD_MAX = 25;
const WORK_COOLDOWN_MINUTES = 2;
const GATHER_COOLDOWN_MINUTES = 3;
const GATHER_RESOURCES_TABLE = {
    'iron_ore':   { name: "Iron Ore", baseChance: 0.60, minQty: 1, maxQty: 3 },
    'copper_ore': { name: "Copper Ore", baseChance: 0.40, minQty: 1, maxQty: 2 },
    'stone':      { name: "Stone", baseChance: 0.70, minQty: 2, maxQty: 5 },
    'wood':       { name: "Wood", baseChance: 0.50, minQty: 1, maxQty: 4 },
    'coal':       { name: "Coal", baseChance: 0.30, minQty: 1, maxQty: 2 },
};

async function getAccount(identifier) {
    const identifierStr = String(identifier).toLowerCase();
    const query = { $or: [{ _id: identifierStr }, { discordId: String(identifier) }] };
    return await economyCollection.findOne(query);
}

async function createNewAccount(drednotName) {
    const lowerName = drednotName.toLowerCase();
    const newAccount = {
        _id: lowerName, // Use Drednot name as the unique ID
        balance: STARTING_BALANCE,
        discordId: null,
        lastWork: null,
        lastGather: null,
        inventory: {}
    };
    await economyCollection.insertOne(newAccount);
    return newAccount;
}

async function updateAccount(accountId, updates) {
    await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates });
}

async function handleWorkCommand(account) {
    const now = Date.now();
    const cooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;
    if (account.lastWork && (now - account.lastWork) < cooldown) {
        const remaining = cooldown - (now - account.lastWork);
        return { success: false, message: `You are on cooldown. Please wait another ${Math.ceil(remaining / 60000)} minute(s).` };
    }
    const earnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN;
    const newBalance = account.balance + earnings;
    await updateAccount(account._id, { balance: newBalance, lastWork: now });
    return { success: true, message: `You worked hard and earned ${earnings} ${CURRENCY_NAME}! Your new balance is ${newBalance}.` };
}

// =========================================================================
// --- Discord Bot Logic (Updated for DB) ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, options } = interaction;
    await interaction.deferReply({ ephemeral: true });

    if (commandName === 'link') {
        const existingLink = await getAccount(user.id);
        if (existingLink) return interaction.editReply({ content: `Your Discord account is already linked to the Drednot account **${existingLink._id}**!` });
        
        const drednotNameToLink = options.getString('drednot_name');
        const targetAccount = await getAccount(drednotNameToLink);
        if (targetAccount && targetAccount.discordId) return interaction.editReply({ content: `Sorry, the Drednot name **${drednotNameToLink}** is already linked to another Discord user.` });
        
        const codeWords = ['apple', 'boat', 'cat', 'dog', 'earth', 'fish', 'grape', 'house'];
        const verificationCode = `${codeWords[Math.floor(Math.random() * codeWords.length)]}-${Math.floor(100 + Math.random() * 900)}`;
        
        await verificationsCollection.insertOne({ _id: verificationCode, discordId: user.id, drednotName: drednotNameToLink, timestamp: Date.now() });
        
        const replyContent = `**Verification Started!**\nTo prove you own the Drednot account **${drednotNameToLink}**, please go into the game and type:\n\`\`\`!verify ${verificationCode}\`\`\`\nThis code will expire in 5 minutes.`;
        await interaction.editReply({ content: replyContent });
        return;
    }

    const account = await getAccount(user.id);
    if (!account) {
        return interaction.editReply({ content: 'Your Discord account is not linked. Please use `/link YourDrednotName` to begin the verification process.' });
    }

    if (commandName === 'balance') {
        await interaction.editReply({ content: `Your linked account **(${account._id})** has a balance of: ${account.balance} ${CURRENCY_NAME}.` });
    } else if (commandName === 'work') {
        const result = await handleWorkCommand(account);
        await interaction.editReply({ content: result.message });
    }
});

// =========================================================================
// --- Web Server Logic (Updated for DB) ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive and ready!"));

app.post('/command', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== YOUR_API_KEY) return res.status(401).send('Error: Invalid API key');
    
    const { command, username, args } = req.body;
    let responseMessage = '';
    
    if (command === 'verify') {
        const code = args[0];
        const verificationData = await verificationsCollection.findOne({ _id: code });

        if (!verificationData || (Date.now() - verificationData.timestamp > 5 * 60 * 1000)) {
            responseMessage = 'That verification code is invalid or has expired.';
        } else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) {
            responseMessage = 'This verification code is for a different Drednot user.';
        } else {
            let targetAccount = await getAccount(username);
            if (!targetAccount) {
                targetAccount = await createNewAccount(username);
            }
            await updateAccount(targetAccount._id, { discordId: verificationData.discordId });
            await verificationsCollection.deleteOne({ _id: code });
            
            responseMessage = `✅ Verification successful! Your accounts are now linked.`;
            try {
                const discordUser = await client.users.fetch(verificationData.discordId);
                discordUser.send(`Great news! Your link to the Drednot account **${username}** has been successfully verified.`);
            } catch (e) { console.log("Couldn't send DM confirmation."); }
        }
    } else {
        let account = await getAccount(username);
        if (!account) {
            await createNewAccount(username);
            responseMessage = `Welcome, ${username}! Your account has been created with ${STARTING_BALANCE} ${CURRENCY_NAME}. Go to Discord and use \`/link ${username}\` to link your account!`;
        } else {
            if (command === 'bal' || command === 'balance') {
                responseMessage = `${username}, your balance is: ${account.balance} ${CURRENCY_NAME}.`;
            } else if (command === 'work') {
                const result = await handleWorkCommand(account);
                responseMessage = `${username}, ${result.message}`;
            } else {
                responseMessage = `Unknown command: !${command}`;
            }
        }
    }
    res.status(200).json({ reply: responseMessage });
});

// --- Start Everything ---
async function startServer() {
    await connectToDatabase();
    client.login(process.env.DISCORD_TOKEN);
    app.listen(port, () => console.log(`Web server is listening on port ${port}`));
}

startServer();
