const { MongoClient } = require('mongodb');

let economyCollection, verificationsCollection, marketCollection, lootboxCollection;

async function connectToDatabase(uri) {
    const mongoClient = new MongoClient(uri);
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy");
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
        marketCollection = db.collection("market_listings");
        lootboxCollection = db.collection("lootbox_listings");
        console.log("Database collections are set up.");
        return true;
    } catch (error) {
        console.error("DB connection failed", error);
        process.exit(1);
    }
}

function getCollections() {
    return { economyCollection, verificationsCollection, marketCollection, lootboxCollection };
}

async function getAccount(identifier) {
    const idStr = String(identifier).toLowerCase();
    return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] });
}

async function createNewAccount(drednotName, startingBalance) {
    const lowerName = drednotName.toLowerCase();
    const newAccount = {
        _id: lowerName,
        balance: startingBalance,
        discordId: null,
        lastWork: null,
        lastGather: null,
        lastDaily: null,
        lastSlots: null,
        inventory: {},
        smelting: null,
        activeBuffs: []
    };
    await economyCollection.insertOne(newAccount);
    return newAccount;
}

async function updateAccount(accountId, updates) {
    await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $set: updates });
}

async function modifyInventory(accountId, itemId, amount) {
    if (!itemId) return;
    const updateField = `inventory.${itemId}`;
    await economyCollection.updateOne({ _id: accountId.toLowerCase() }, { $inc: { [updateField]: amount } });
}

async function findNextAvailableListingId(collection) {
    const listings = await collection.find({}, { projection: { listingId: 1 } }).toArray();
    const usedIds = listings.map(l => l.listingId).filter(id => id != null).sort((a, b) => a - b);
    let expectedId = 1;
    for (const id of usedIds) {
        if (id !== expectedId) {
            return expectedId;
        }
        expectedId++;
    }
    return expectedId;
}

module.exports = {
    connectToDatabase,
    getCollections,
    getAccount,
    createNewAccount,
    updateAccount,
    modifyInventory,
    findNextAvailableListingId,
};
