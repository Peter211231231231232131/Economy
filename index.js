// --- Library Imports ---
const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const express = require('express');
const { MongoClient } = require('mongodb');

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json());
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
const YOUR_API_KEY = 'drednot123';

// =========================================================================
// --- MONGODB DATABASE SETUP (No changes here) ---
// =========================================================================
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
const mongoClient = new MongoClient(mongoUri);
let economyCollection, verificationsCollection;

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy");
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
    } catch (error) { console.error("Failed to connect to MongoDB", error); process.exit(1); }
}

// =========================================================================
// --- ECONOMY LOGIC & HELPER FUNCTIONS (No changes here) ---
// =========================================================================
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const WORK_REWARD_MIN = 5, WORK_REWARD_MAX = 25, WORK_COOLDOWN_MINUTES = 2;

async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(drednotName) { const lowerName = drednotName.toLowerCase(); const newAccount = { _id: lowerName, balance: STARTING_BALANCE, discordId: null, lastWork: null, inventory: {} }; await economyCollection.insertOne(newAccount); return newAccount; }
async function updateAccount(accountId, updates) { await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates }); }
async function handleWorkCommand(account) { const now = Date.now(); const cooldown = WORK_COOLDOWN_MINUTES * 60 * 1000; if (account.lastWork && (now - account.lastWork) < cooldown) { const remaining = cooldown - (now - account.lastWork); return { success: false, message: `You are on cooldown. Wait ${Math.ceil(remaining / 60000)} min.` }; } const earnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN; const newBalance = account.balance + earnings; await updateAccount(account._id, { balance: newBalance, lastWork: now }); return { success: true, message: `You earned ${earnings} ${CURRENCY_NAME}! New balance: ${newBalance}.` }; }

// =========================================================================
// --- Discord Bot Logic (Completely Rebuilt and Corrected) ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        // --- THIS IS THE NEW, CORRECT STRUCTURE ---
        // A single function call handles everything for clarity.
        await handleSlashCommand(interaction);
    } catch (error) {
        console.error("A critical error occurred while handling an interaction:", error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'An unexpected error occurred! Please try again later.' });
        } else {
            await interaction.reply({ content: 'An unexpected error occurred! Please try again later.', ephemeral: true });
        }
    }
});

async function handleSlashCommand(interaction) {
    const { commandName, user, options } = interaction;
    const discordId = user.id;

    if (commandName === 'link') {
        await interaction.deferReply({ ephemeral: true });
        const existingLink = await getAccount(discordId);
        if (existingLink) return interaction.editReply({ content: `Your account is already linked to **${existingLink._id}**.` });

        const drednotNameToLink = options.getString('drednot_name');
        const targetAccount = await getAccount(drednotNameToLink);
        if (targetAccount && targetAccount.discordId) return interaction.editReply({ content: `**${drednotNameToLink}** is already linked to another Discord user.` });

        const codeWords = ['apple', 'boat', 'cat', 'dog', 'earth'];
        const verificationCode = `${codeWords[Math.floor(Math.random() * codeWords.length)]}-${Math.floor(100 + Math.random() * 900)}`;
        await verificationsCollection.insertOne({ _id: verificationCode, discordId, drednotName: drednotNameToLink, timestamp: Date.now() });

        const replyContent = `**Verification Started!**\nTo link **${drednotNameToLink}**, go into the game and type:\n\`\`\`!verify ${verificationCode}\`\`\``;
        await interaction.editReply({ content: replyContent });
        return;
    }

    // For all other commands, we need a linked account.
    const account = await getAccount(discordId);
    if (!account) {
        await interaction.reply({ content: 'Your Discord account is not linked. Use `/link YourDrednotName` first.', ephemeral: true });
        return;
    }
    
    // Defer the reply for all other commands now that we know the user is linked.
    await interaction.deferReply({ ephemeral: true });

    if (commandName === 'balance') {
        await interaction.editReply({ content: `Your balance for **${account._id}** is: ${account.balance} ${CURRENCY_NAME}.` });
    } else if (commandName === 'work') {
        const result = await handleWorkCommand(account);
        await interaction.editReply({ content: result.message });
    }
}


// =========================================================================
// --- Web Server Logic (No changes needed here) ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));

app.post('/command', async (req, res) => {
    // This entire section remains the same as it was working correctly.
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
            account = await createNewAccount(username);
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

// --- Startup ---
async function startServer() {
    await connectToDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    app.listen(port, () => console.log(`Web server listening on port ${port}`));
}

startServer();
