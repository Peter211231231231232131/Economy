// create-indexes.js
// A one-time script to add necessary indexes to the MongoDB collections for performance.

const { MongoClient } = require('mongodb');

// --- CONFIGURATION ---
// The script will use the same MONGO_URI your bot uses.
const mongoUri = process.env.MONGO_URI;
const dbName = 'drednot_economy'; // The name of your database

if (!mongoUri) {
    console.error("CRITICAL: MONGO_URI environment variable not found!");
    console.error("Please ensure you run this script with your environment variables loaded.");
    console.error("Example: node -r dotenv/config create-indexes.js");
    process.exit(1);
}

// --- MAIN SCRIPT ---
async function applyIndexes() {
    console.log("Attempting to connect to the database...");
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log("✅ Successfully connected to MongoDB.");
        const db = client.db(dbName);

        // --- Indexes for 'players' collection ---
        const playersCollection = db.collection("players");
        console.log("\nApplying indexes to 'players' collection...");

        await playersCollection.createIndex({ discordId: 1 });
        console.log(" -> Created index on: { discordId }");

        await playersCollection.createIndex({ drednotName: 1 });
        console.log(" -> Created index on: { drednotName }");

        await playersCollection.createIndex({ displayName: 1 });
        console.log(" -> Created index on: { displayName }");

        await playersCollection.createIndex({ balance: -1 });
        console.log(" -> Created index on: { balance: -1 } (for leaderboard)");

        await playersCollection.createIndex({ "smelting.finishTime": 1 });
        console.log(" -> Created index on: { smelting.finishTime } (for smelting processor)");


        // --- Indexes for 'market_listings' collection ---
        const marketCollection = db.collection("market_listings");
        console.log("\nApplying indexes to 'market_listings' collection...");

        // --- Handle duplicate listingId entries BEFORE creating unique index ---
        console.log("Checking for duplicate 'listingId' values to prepare for unique index...");
        const duplicates = await marketCollection.aggregate([
            { $group: {
                _id: "$listingId",
                count: { $sum: 1 },
                ids: { $push: "$_id" }
            }},
            { $match: {
                count: { $gt: 1 }
            }}
        ]).toArray();

        if (duplicates.length > 0) {
            console.warn(`Found ${duplicates.length} 'listingId' values with duplicates. Cleaning up...`);
            let deletedCount = 0;
            for (const dup of duplicates) {
                // Keep one instance (e.g., the first one found or the one with the 'earliest' _id)
                // Remove the rest. Sort by _id to ensure deterministic removal.
                const idsToDelete = dup.ids.sort((a, b) => String(a).localeCompare(String(b))).slice(1);
                if (idsToDelete.length > 0) {
                    const deleteResult = await marketCollection.deleteMany({ _id: { $in: idsToDelete } });
                    deletedCount += deleteResult.deletedCount;
                    console.log(` -> Deleted ${deleteResult.deletedCount} duplicates for listingId: ${dup._id}`);
                }
            }
            console.log(`Finished cleanup. Total duplicates deleted: ${deletedCount}.`);
        } else {
            console.log("No duplicate 'listingId' values found.");
        }
        // --- End of duplicate handling ---

        // This one makes finding a listing by its ID instant.
        // It also enforces that every listingId MUST be unique, preventing data corruption.
        // This will only succeed now that duplicates have been removed.
        await marketCollection.createIndex({ listingId: 1 }, { unique: true });
        console.log(" -> Created UNIQUE index on: { listingId }");

        // This one makes filtering the market by item name fast.
        await marketCollection.createIndex({ itemId: 1 });
        console.log(" -> Created index on: { itemId } (for market filtering)");


        console.log("\n✅ All indexes have been successfully created or confirmed.");

    } catch (error) {
        // MongoDB's createIndex is "idempotent". If the index already exists, it won't error.
        // This catch is for other problems, like connection issues or unhandled duplicate key errors.
        console.error("\n❌ An error occurred during the process:", error);
    } finally {
        // Ensure the client is always closed.
        await client.close();
        console.log("\nDatabase connection closed.");
    }
}

// Run the function
applyIndexes();
