// This is a one-time use script to clean up decimal balances in the database.
require('dotenv').config();
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("CRITICAL: MONGO_URI not found in your .env file!");
}

const client = new MongoClient(mongoUri);

async function runCleanup() {
    try {
        await client.connect();
        console.log("Connected to MongoDB Atlas.");

        const db = client.db("drednot_economy");
        const economyCollection = db.collection("players");

        console.log("Finding all players with decimal balances...");

        // Find all documents where the balance is not an integer.
        // This is more efficient than fetching all documents.
        const playersToUpdate = await economyCollection.find({ 
            balance: { $not: { $type: "int" } } 
        }).toArray();

        if (playersToUpdate.length === 0) {
            console.log("✅ No players with decimal balances found. Your data is clean!");
            return;
        }

        console.log(`Found ${playersToUpdate.length} players to update.`);

        // Prepare bulk operations for efficiency
        const operations = playersToUpdate.map(player => {
            const roundedBalance = Math.round(player.balance);
            console.log(`- ${player._id}: ${player.balance} -> ${roundedBalance}`);
            return {
                updateOne: {
                    filter: { _id: player._id },
                    update: { $set: { balance: roundedBalance } }
                }
            };
        });

        // Execute all updates at once
        const result = await economyCollection.bulkWrite(operations);
        
        console.log("\n========================================");
        console.log(`✅ Cleanup complete!`);
        console.log(`- Matched ${result.matchedCount} documents.`);
        console.log(`- Modified ${result.modifiedCount} documents.`);
        console.log("========================================");


    } catch (error) {
        console.error("❌ An error occurred during the cleanup process:", error);
    } finally {
        await client.close();
        console.log("Disconnected from MongoDB.");
    }
}

// IMPORTANT: It is highly recommended to back up your database before running this.
console.log("Starting balance cleanup process...");
runCleanup();
