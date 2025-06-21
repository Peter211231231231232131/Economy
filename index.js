// --- Library Imports ---
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const Database = require("@replit/database");

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json());

// Initialize the persistent Replit Database
const db = new Database();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const YOUR_API_KEY = 'drednot123'; // Your secret API key

// =========================================================================
// --- SHARED ECONOMY LOGIC & DATABASE (Using Replit DB) ---
// =========================================================================

// These variables hold the data in memory after being loaded from the DB
let economyData = {};
let pendingVerifications = {};

const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const WORK_REWARD_MIN = 5;
const WORK_REWARD_MAX = 25;
const WORK_COOLDOWN_MINUTES = 2;

// Reads data from the persistent Replit DB into memory
async function loadData() {
  try {
    const savedEconomy = await db.get("economyData");
    if (savedEconomy) {
        economyData = savedEconomy;
        console.log('Economy database loaded from Replit DB.');
    } else {
        console.log('No economy database found, starting fresh.');
        economyData = {};
    }

    const savedVerifications = await db.get("pendingVerifications");
    if (savedVerifications) {
        pendingVerifications = savedVerifications;
        console.log('Pending verifications loaded from Replit DB.');
    } else {
        console.log('No pending verifications found, starting fresh.');
        pendingVerifications = {};
    }
  } catch (err) {
    console.error('Error loading data from Replit DB:', err);
    economyData = {};
    pendingVerifications = {};
  }
}

// Writes the in-memory data to the persistent Replit DB
async function saveData() {
  try {
    await db.set("economyData", economyData);
    await db.set("pendingVerifications", pendingVerifications);
  } catch (err) {
    console.error('Error saving data to Replit DB:', err);
  }
}

// Helper function to find an account by either Drednot name or linked Discord ID
function getAccountKey(identifier) {
  const identifierStr = String(identifier).toLowerCase();
  // Check if the identifier is a Drednot name (a primary key)
  for (const key in economyData) {
      if (key.toLowerCase() === identifierStr) {
          return key;
      }
  }
  // If not, check if it's a linked Discord ID
  for (const key in economyData) {
      if (economyData[key].discordId === String(identifier)) {
          return key;
      }
  }
  return null; // Not found
}

// Creates an account using the Drednot name as the primary key
async function createNewAccount(drednotName) {
    const lowerName = drednotName.toLowerCase();
    economyData[lowerName] = { 
        balance: STARTING_BALANCE, 
        discordId: null, // No Discord ID linked yet
        lastWork: null 
    };
    await saveData();
    return economyData[lowerName];
}

// Handles the logic for the !work or /work command
async function handleWorkCommand(accountKey) {
    const account = economyData[accountKey];
    if (!account) return { success: false, message: 'Account not found.' };

    const now = Date.now();
    const cooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;

    if (account.lastWork && (now - account.lastWork) < cooldown) {
        const remaining = cooldown - (now - account.lastWork);
        return { success: false, message: `You are on cooldown. Please wait another ${Math.ceil(remaining / 60000)} minute(s).` };
    }

    const earnings = Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN;
    account.balance += earnings;
    account.lastWork = now;
    await saveData();

    return { success: true, message: `You worked hard and earned ${earnings} ${CURRENCY_NAME}! Your new balance is ${account.balance}.` };
}

// =========================================================================
// --- Discord Bot Logic (Using Slash Commands) ---
// =========================================================================
client.on('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}!`);
  loadData();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;
  const discordId = user.id;

  // Defer reply to give the bot time to process, making it more reliable
  await interaction.deferReply({ ephemeral: true });

  const accountKey = getAccountKey(discordId);

  if (commandName === 'link') {
    if (accountKey) {
        return interaction.editReply({ content: `Your Discord account is already linked to the Drednot account **${accountKey}**!` });
    }
    const drednotNameToLink = options.getString('drednot_name');
    const targetAccountKey = getAccountKey(drednotNameToLink);
    if (targetAccountKey && economyData[targetAccountKey].discordId) {
        return interaction.editReply({ content: `Sorry, the Drednot name **${drednotNameToLink}** is already linked to another Discord user.` });
    }

    const codeWords = ['apple', 'boat', 'cat', 'dog', 'earth', 'fish', 'grape', 'house'];
    const verificationCode = `${codeWords[Math.floor(Math.random() * codeWords.length)]}-${Math.floor(100 + Math.random() * 900)}`;

    pendingVerifications[verificationCode] = { discordId, drednotName: drednotNameToLink, timestamp: Date.now() };
    await saveData();

    const replyContent = `**Verification Started!**\nTo prove you own the Drednot account **${drednotNameToLink}**, please go into the game and type:\n\`\`\`!verify ${verificationCode}\`\`\`\nThis code will expire in 5 minutes.`;
    await interaction.editReply({ content: replyContent }); 

  } else if (!accountKey) {
    // If user is not linked, tell them to link first for any other command
    await interaction.editReply({ content: 'Your Discord account is not linked. Please use `/link YourDrednotName` to begin the verification process.' });
    return;
  }

  // Commands for linked users
  if (commandName === 'balance') {
      await interaction.editReply({ content: `Your linked account **(${accountKey})** has a balance of: ${economyData[accountKey].balance} ${CURRENCY_NAME}.` });
  } else if (commandName === 'work') {
      const result = await handleWorkCommand(accountKey);
      await interaction.editReply({ content: result.message });
  }
});

// =========================================================================
// --- Web Server Logic (for the game) ---
// =========================================================================
app.get("/", (request, response) => {
  response.send("Bot is alive and ready!"); // For UptimeRobot
});

app.post('/command', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== YOUR_API_KEY) return res.status(401).send('Error: Invalid API key');

  const { command, username, args } = req.body;
  let responseMessage = '';
  let accountKey = getAccountKey(username);

  if (command === 'verify') {
      const code = args[0];
      const verificationData = pendingVerifications[code];

      if (!verificationData || (Date.now() - verificationData.timestamp > 5 * 60 * 1000)) {
          responseMessage = 'That verification code is invalid or has expired. Please start over in Discord with `/link`.';
      } else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) {
          responseMessage = 'This verification code is for a different Drednot user. Please check your spelling and try again.';
      } else {
          // Success! Finalize the link.
          let targetAccountKey = getAccountKey(username);
          if (!targetAccountKey) {
              await createNewAccount(username);
              targetAccountKey = getAccountKey(username);
          }
          economyData[targetAccountKey].discordId = verificationData.discordId;
          delete pendingVerifications[code]; // Clean up the used code
          await saveData(); // Save all changes
          responseMessage = `✅ Verification successful! Your Drednot and Discord accounts are now linked.`;

          // Try to send a confirmation DM on Discord
          try {
            const discordUser = await client.users.fetch(verificationData.discordId);
            discordUser.send(`Great news! Your link to the Drednot account **${username}** has been successfully verified.`);
          } catch (e) { console.log("Couldn't send DM confirmation. User might have DMs disabled."); }
      }
  } else if (!accountKey) {
    // Auto-create account in-game on first command use
    await createNewAccount(username);
    responseMessage = `Welcome, ${username}! Your account has been created with ${STARTING_BALANCE} ${CURRENCY_NAME}. To use commands in Discord, go there and use \`/link ${username}\` to start verification.`;
  } else {
    // Handle regular commands for existing users
    if (command === 'bal' || command === 'balance') {
        responseMessage = `${username}, your balance is: ${economyData[accountKey].balance} ${CURRENCY_NAME}.`;
    } else if (command === 'work') {
        const result = await handleWorkCommand(accountKey);
        responseMessage = `${username}, ${result.message}`; 
    } else {
        responseMessage = `Unknown command: !${command}`;
    }
  }

  res.status(200).json({ reply: responseMessage });
});

// --- Start Everything ---
app.listen(3000, () => {
  console.log("Web server is listening for game commands.");
});

client.login(process.env.DISCORD_TOKEN);
