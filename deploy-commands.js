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
    { name: 'inventory', description: 'Check your item inventory.' },
    { name: 'recipes', description: 'View a list of all craftable items.' },
    { name: 'craft', description: 'Craft an item.', options: [{ name: 'item_name', type: 3, description: 'The name of the item to craft', required: true }] },
    { name: 'daily', description: 'Claim your daily reward.' },
    { name: 'flip', description: 'Flip a coin for bits.', options: [{ name: 'amount', type: 4, description: 'The amount to bet', required: true }, { name: 'choice', type: 3, description: 'Your choice (heads or tails)', required: true, choices: [{name: 'Heads', value: 'heads'}, {name: 'Tails', value: 'tails'}] }] },
    { name: 'slots', description: 'Play the slot machine.', options: [{ name: 'amount', type: 4, description: 'The amount to bet', required: true }] },
    { name: 'market', description: 'View items for sale on the player market.' },
    { name: 'marketsell', description: 'Put an item up for sale.', options: [ { name: 'item_name', type: 3, description: 'The name of the item to sell', required: true }, { name: 'quantity', type: 4, description: 'How many to sell', required: true }, { name: 'price', type: 10, description: 'The price per item', required: true }] },
    { name: 'marketbuy', description: 'Buy an item from the market.', options: [{ name: 'listing_id', type: 3, description: 'The ID of the listing (e.g., a1b2c3d4)', required: true }] },
    { name: 'marketcancel', description: 'Cancel one of your market listings.', options: [{ name: 'listing_id', type: 3, description: 'The ID of the listing to cancel', required: true }] },
];

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
    try {
        console.log('Started refreshing all application (/) commands.');
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('Successfully reloaded all application (/) commands.');
    } catch (error) { console.error(error); }
})();
