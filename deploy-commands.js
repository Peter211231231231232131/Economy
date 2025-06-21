// deploy-commands.js

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) throw new Error("Missing secrets!");

const commands = [
    {
        name: 'link',
        description: 'Links your Discord account to your Drednot.io account.',
        options: [{ name: 'drednot_name', type: 3, description: 'Your exact in-game name', required: true, }],
    },
    {
        name: 'balance',
        description: 'Check your in-game balance.',
    },
    {
        name: 'work',
        description: 'Work to earn bits.',
    },
    // --- NEW COMMANDS ---
    {
        name: 'gather',
        description: 'Gather for random resources.',
    },
    {
        name: 'inventory',
        description: 'Check your item inventory.',
        options: [{ name: 'item_name', type: 3, description: 'Optional: name of an item to inspect', required: false }]
    }
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
