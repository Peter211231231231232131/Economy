// /utils/database.js

const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error("CRITICAL: MONGO_URI not found in environment variables!");
}

const mongoClient = new MongoClient(mongoUri);

// We will store the collection objects here after connecting
let db;
let economyCollection, verificationsCollection, marketCollection, lootboxCollection, clansCollection, serverStateCollection;

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        db = mongoClient.db("drednot_economy");
        
        // Initialize collections
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
        marketCollection = db.collection("market_listings");
        lootboxCollection = db.collection("lootbox_listings");
        clansCollection = db.collection("clans");
        serverStateCollection = db.collection("server_state");

        console.log("Database collections are set up.");
    } catch (error) {
        console.error("DB connection failed", error);
        process.exit(1);
    }
}

// Functions to get access to the collections
// This pattern ensures that we don't try to access a collection before the database is connected
const getDB = () => db;
const getEconomyCollection = () => economyCollection;
const getVerificationsCollection = () => verificationsCollection;
const getMarketCollection = () => marketCollection;
const getLootboxCollection = () => lootboxCollection;
const getClansCollection = () => clansCollection;
const getServerStateCollection = () => serverStateCollection;
const getMongoClient = () => mongoClient;


module.exports = {
    connectToDatabase,
    getDB,
    getEconomyCollection,
    getVerificationsCollection,
    getMarketCollection,
    getLootboxCollection,
    getClansCollection,
    getServerStateCollection,
    getMongoClient,
};
