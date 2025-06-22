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
// ... (work/gather configs, ITEMS, GATHER_TABLE all the same)

async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(drednotName) { /* ... same as before ... */ }
async function updateAccount(accountId, updates) { /* ... same as before ... */ }
async function handleWorkCommand(account) { /* ... same as before ... */ }
// ... (All other helper functions are the same)

// =========================================================================
// --- Discord Bot Logic (Corrected Deferral Logic) ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, options } = interaction;
    const discordId = user.id;

    // --- THIS IS THE FIX ---
    // Defer the reply IMMEDIATELY for ALL commands.
    await interaction.deferReply({ ephemeral: true });

    // Now, handle the logic.
    if (commandName === 'link') {
        const existingLink = await getAccount(discordId);
        if (existingLink) {
            return interaction.editReply({ content: `Your Discord account is already linked to the Drednot account **${existingLink._id}**!` });
        }
        
        const drednotNameToLink = options.getString('drednot_name');
        const targetAccount = await getAccount(drednotNameToLink);
        if (targetAccount && targetAccount.discordId) {
            return interaction.editReply({ content: `Sorry, the Drednot name **${drednotNameToLink}** is already linked to another Discord user.` });
        }
        
        const codeWords = ['apple', 'boat', 'cat', 'dog', 'earth', 'fish', 'grape', 'house'];
        const verificationCode = `${codeWords[Math.floor(Math.random() * codeWords.length)]}-${Math.floor(100 + Math.random() * 900)}`;
        
        await verificationsCollection.insertOne({ _id: verificationCode, discordId, drednotName: drednotNameToLink, timestamp: Date.now() });
        
        const replyContent = `**Verification Started!**\nTo prove you own the Drednot account **${drednotNameToLink}**, please go into the game and type:\n\`\`\`!verify ${verificationCode}\`\`\`\nThis code will expire in 5 minutes.`;
        await interaction.editReply({ content: replyContent });
        return;
    }

    // For all other commands, we require a linked account.
    const account = await getAccount(discordId);
    if (!account) {
        return interaction.editReply({ content: 'Your Discord account is not linked. Please use `/link YourDrednotName` to begin the verification process.' });
    }

    // Handle commands for linked users
    if (commandName === 'balance') {
        await interaction.editReply({ content: `Your linked account **(${account._id})** has a balance of: ${account.balance} ${CURRENCY_NAME}.` });
    } else if (commandName === 'work') {
        const result = await handleWorkCommand(account);
        await interaction.editReply({ content: result.message });
    }
    // ... add other commands like /gather, /inventory here later
});

// =========================================================================
// --- Web Server Logic (No changes needed here) ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive and ready!"));
app.post('/command', async (req, res) => { /* ... This entire section is unchanged ... */ });

// --- Startup ---
async function startServer() {
    await connectToDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    app.listen(port, () => console.log(`Web server listening on port ${port}`));
}

startServer();
