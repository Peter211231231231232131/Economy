// deploy-command.js

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) throw new Error("Missing secrets!");

const commands = [
    { name: 'link', description: 'Links your Discord account to your Drednot.io account.', options: [{ name: 'drednot_name', type: 3, description: 'Your exact in-game name', required: true }] },
    { name: 'balance', description: 'Check your in-game balance.' },
    { name: 'work', description: 'Work to earn bits.' },
    { name: 'gather', description: 'Gather for random resources.' },
    { name: 'inventory', description: 'Check your item inventory.', options: [{ name: 'item_name', type: 3, description: 'Optional: name of an item to inspect', required: false }] },
    { name: 'recipes', description: 'View a list of all craftable items.' },
    { name: 'craft', description: 'Craft an item.', options: [{ name: 'item_name', type: 3, description: 'The name of the item to craft', required: true }] },
    { name: 'daily', description: 'Claim your daily reward.' },
    { name: 'flip', description: 'Flip a coin for bits.', options: [{ name: 'amount', type: 4, description: 'The amount to bet', required: true }, { name: 'choice', type: 3, description: 'Your choice (heads or tails)', required: true, choices: [{name: 'Heads', value: 'heads'}, {name: 'Tails', value: 'tails'}] }] },
    { name: 'slots', description: 'Play the slot machine.', options: [{ name: 'amount', type: 4, description: 'The amount to bet', required: true }] },
    { name: 'market', description: 'View items for sale on the player market (!m)', options: [{ name: 'filter', type: 3, description: 'Optional: filter market by item name', required: false }] },
    { name: 'marketsell', description: 'Put an item up for sale (!ms)', options: [ { name: 'item_name', type: 3, description: 'Item name', required: true }, { name: 'quantity', type: 4, description: 'How many', required: true }, { name: 'price', type: 10, description: 'Price per item', required: true }] },
    { name: 'marketbuy', description: 'Buy an item from the market (!mb)', options: [{ name: 'listing_id', type: 4, description: 'The numerical ID of the listing to purchase', required: true }] },
    { name: 'marketcancel', description: 'Cancel one of your market listings (!mc)', options: [{ name: 'listing_id', type: 4, description: 'The numerical ID of the listing to cancel', required: true }] },
    { name: 'leaderboard', description: 'Shows the top players by balance.' },
    { name: 'timers', description: 'Check your personal cooldowns.' },
    { name: 'smelt', description: 'Smelt ores into ingots.', options: [ { name: 'ore_name', type: 3, description: 'The type of ore to smelt (e.g., Iron Ore)', required: true }, { name: 'quantity', type: 4, description: 'How many ores to smelt', required: true }] },
    { name: 'pay', description: 'Give Bits to another player.', options: [ { name: 'user', type: 6, description: 'The Discord user to pay', required: true }, { name: 'amount', type: 4, 'description': 'The amount of Bits to give', required: true }] },
    { name: 'iteminfo', description: 'Get information about a specific item.', options: [{ name: 'item_name', type: 3, description: 'The name of the item to inspect', required: true }] },
    
    // New command for eating food
    { name: 'eat', description: 'Consume food for a temporary buff.', options: [{ name: 'food_name', type: 3, description: 'The name of the food to eat from your inventory', required: true }] },

    // Crate Shop Commands
    { 
        name: 'crateshop', 
        description: "View The Collector's special crates for sale (!cs)." 
    },
    { 
        name: 'crateoshopbuy', 
        description: 'Buy and open one or more crates from The Collector (!csb).', 
        options: [
            { 
                name: 'crate_name', 
                type: 3,
                description: "The name of the crate you want to buy.", 
                required: true,
                choices: [
                    { name: "Miner's Crate", value: "Miner's Crate" },
                    { name: "Builder's Crate", value: "Builder's Crate" },
                    { name: "Gambler's Crate", value: "Gambler's Crate" },
                    { name: "Crystal Crate", value: "Crystal Crate" },
                ]
            },
            { 
                name: 'amount', 
                type: 4,
                description: 'The number of crates you want to buy and open.', 
                required: true 
            }
        ] 
    },
];

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
    try {
        console.log(`Registering ${commands.length} application (/) commands.`);
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) { 
        console.error("❌ FAILED TO DEPLOY COMMANDS:", error); 
    }
})();
