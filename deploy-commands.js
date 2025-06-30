// deploy-commands.js (Final Updated Version)

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
    throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in your .env file!");
}

const commands = [
    // --- Core Commands ---
    { name: 'link', description: 'Links your Discord account to your Drednot.io account.', options: [{ name: 'drednot_name', type: 3, description: 'Your exact in-game name', required: true }] },
    { name: 'name', description: 'Set a custom display name for the leaderboard (unlinked accounts only).', options: [{ name: 'new_name', type: 3, description: 'Your desired display name (3-16 characters)', required: true }] },
    { name: 'balance', description: 'Check your in-game balance.' },
    { name: 'work', description: 'Work to earn bits.' },
    { name: 'gather', description: 'Gather for random resources.' },
    { name: 'inventory', description: 'Check your item inventory.', options: [{ name: 'item_name', type: 3, description: 'Optional: name of an item to inspect', required: false }] },
    { name: 'recipes', description: 'View a list of all craftable items.' },
    { name: 'craft', description: 'Craft an item or multiple items at once.', options: [ { name: 'item_name', type: 3, description: 'The name of the item to craft', required: true, autocomplete: true }, { name: 'quantity', type: 4, description: 'How many to craft. Defaults to 1.', required: false } ] },
    { name: 'daily', description: 'Claim your daily reward and build a streak.' },
    { name: 'hourly', description: 'Claim your hourly reward and build a streak.' },
    { name: 'flip', description: 'Flip a coin for bits.', options: [{ name: 'amount', type: 4, description: 'The amount to bet', required: true }, { name: 'choice', type: 3, description: 'Your choice (heads or tails)', required: true, choices: [{name: 'Heads', value: 'heads'}, {name: 'Tails', value: 'tails'}] }] },
    { name: 'slots', description: 'Play the slot machine.', options: [{ name: 'amount', type: 4, description: 'The amount to bet', required: true }] },
    { name: 'market', description: 'View items for sale on the player market.', options: [{ name: 'filter', type: 3, description: 'Optional: filter market by item name', required: false }] },
    { name: 'marketsell', description: 'Put an item up for sale.', options: [ { name: 'item_name', type: 3, description: 'Item name', required: true, autocomplete: true }, { name: 'quantity', type: 4, description: 'How many', required: true }, { name: 'price', type: 10, description: 'Price per item', required: true } ] },
    { name: 'marketbuy', description: 'Buy an item from the market.', options: [{ name: 'listing_id', type: 4, description: 'The numerical ID of the listing to purchase', required: true }] },
    { name: 'marketcancel', description: 'Cancel one of your market listings.', options: [{ name: 'listing_id', type: 4, description: 'The numerical ID of the listing to cancel', required: true }] },
    { name: 'leaderboard', description: 'Shows the top players by balance.' },
    { name: 'timers', description: 'Check your personal cooldowns and active buffs.' },
    { name: 'smelt', description: 'Smelt ores or cook food in your smelter.', options: [ { name: 'ore_name', type: 3, description: 'The item to process (e.g., Iron Ore, Raw Meat)', required: true, autocomplete: true }, { name: 'quantity', type: 4, description: 'How many to process', required: true }] },
    { name: 'pay', description: 'Give Bits to another player.', options: [ { name: 'user', type: 6, description: 'The Discord user to pay', required: true }, { name: 'amount', type: 4, 'description': 'The amount of Bits to give', required: true }] },
    { name: 'eat', description: 'Consume food for a temporary buff.', options: [{ name: 'food_name', type: 3, description: 'The name of the food to eat from your inventory', required: true, autocomplete: true }] },
    { name: 'info', description: 'Get information about a specific item or trait.', options: [{ name: 'name', type: 3, description: 'The name of the item or trait to inspect', required: true, autocomplete: true }] },
    { name: 'traits', description: 'View or reroll your traits.', options: [ { type: 1, name: 'view', description: 'View your currently equipped traits.' }, { type: 1, name: 'reroll', description: 'Use a Trait Reforger to get two new random traits.' } ] },
    { name: 'crateshop', description: "View The Collector's special crates for sale." },
    { name: 'crateshopbuy', description: 'Buy and open one or more crates from The Collector.', options: [ { name: 'crate_name', type: 3, description: "The name of the crate you want to buy.", required: true, autocomplete: true }, { name: 'amount', type: 4, description: 'The number of crates you want to buy and open.', required: true } ] },

    // --- CLAN COMMANDS ---
    {
        name: 'clan',
        description: 'Manage and interact with clans.',
        options: [
            { type: 1, name: 'create', description: 'Create a new clan.', options: [{ name: 'name', type: 3, description: 'The name of your clan (3-24 chars)', required: true }] },
            { type: 1, name: 'leave', description: 'Leave your current clan.' },
            { type: 1, name: 'disband', description: 'Disband your clan (Owner only).' },
            { type: 1, name: 'kick', description: 'Kick a member from your clan (Owner only).', options: [{ name: 'user', type: 6, description: 'The member to kick', required: true }] },
            { type: 1, name: 'recruit', description: 'Set your clan recruitment status (Owner only).', options: [{ name: 'status', type: 4, description: '1 for Open, 2 for Closed', required: true, choices: [{ name: 'Open (Anyone can join)', value: 1 }, { name: 'Closed (Invite/Apply only)', value: 2 }] }] },
            { type: 1, name: 'upgrade', description: 'Upgrade your clan to the next level (Owner only).' },
            { type: 1, name: 'donate', description: 'Donate Bits to your clan\'s vault.', options: [{ name: 'amount', type: 4, description: 'The amount of Bits to donate', required: true }] },
            { type: 1, name: 'info', description: 'Get detailed information about a clan.', options: [{ name: 'code', type: 3, description: 'The 5-character code of the clan', required: true }] },
            { type: 1, name: 'list', description: 'Browse clans with open slots.' },
            { type: 1, name: 'war', description: 'View the current clan war leaderboard.' },
            { type: 1, name: 'join', description: 'Join an open clan or apply to a closed one.', options: [{ name: 'code', type: 3, description: 'The 5-character code of the clan', required: true }] },
            { type: 1, name: 'invite', description: 'View your invites, view applicants, or invite a player.', options: [{ name: 'user', type: 6, description: 'The user to invite (Owner only)', required: false }] },
            { type: 1, name: 'accept', description: 'Accept a clan application or invitation.', options: [{ name: 'user_or_code', type: 3, description: 'A player\'s name (to accept applicant) or a clan\'s code (to accept invite)', required: true }] },
            { type: 1, name: 'decline', description: 'Decline a clan application or invitation.', options: [{ name: 'code', type: 3, description: 'The 5-character code of the clan', required: true }] },
        ]
    },
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`[DEPLOY] Started registering ${commands.length} application (/) commands.`);
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        console.log('[DEPLOY] ✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error("❌ FAILED TO DEPLOY COMMANDS:", error);
    }
})();
