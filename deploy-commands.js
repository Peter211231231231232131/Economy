// This script is for telling Discord what slash commands our bot has.
// We only need to run this once, or when we add/change a command.
const { REST, Routes } = require("discord.js");
require("dotenv").config(); // To load the .env file

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID; // We need to add this to Secrets!

if (!token || !clientId) {
    throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env file!");
}

const commands = [
    {
        name: "link",
        description: "Links your Discord account to your Drednot.io account.",
        options: [
            {
                name: "drednot_name",
                type: 3, // String
                description: "Your exact in-game name in Drednot.io",
                required: true,
            },
        ],
    },
    {
        name: "balance",
        description: "Check your in-game balance (must be linked).",
    },
    {
        name: "work",
        description: "Work to earn bits (must be linked).",
    },
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
    try {
        console.log("Started refreshing application (/) commands.");

        await rest.put(Routes.applicationCommands(clientId), {
            body: commands,
        });

        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
    }
})();
