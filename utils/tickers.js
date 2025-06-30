// /utils/tickers.js

const { EmbedBuilder } = require('discord.js');
const { getEconomyCollection, getMarketCollection, getLootboxCollection, getServerStateCollection, getClansCollection } = require('./database');
const { modifyInventory, updateAccount, findNextAvailableListingId, formatDuration } = require('./utilities');
const {
    VENDOR_TICK_INTERVAL_MINUTES,
    LOOTBOX_TICK_INTERVAL_MINUTES,
    EVENT_TICK_INTERVAL_MINUTES,
    VENDORS,
    ITEMS,
    LOOTBOXES,
    MAX_LOOTBOX_LISTINGS,
    EVENT_CHANNEL_ID,
    EVENT_CHANCE,
    EVENTS,
    FALLBACK_PRICES,
    CLAN_WAR_DURATION_DAYS, // <-- Added
    CLAN_WAR_REWARDS,       // <-- Added
} = require('../config');


let currentGlobalEvent = null;

async function getAveragePlayerPrice(itemId) {
    const marketCollection = getMarketCollection();
    const playerListings = await marketCollection.find({ itemId: itemId, sellerId: { $not: /^NPC_/ } },{ projection: { price: 1 } }).sort({ price: 1 }).toArray();
    if (playerListings.length === 0) return null;
    if (playerListings.length < 3) {
        const simpleTotal = playerListings.reduce((sum, listing) => sum + listing.price, 0);
        return simpleTotal / playerListings.length;
    }
    const sliceAmount = Math.floor(playerListings.length * 0.1);
    const sanitizedListings = playerListings.slice(sliceAmount, -sliceAmount);
    const listToAverage = sanitizedListings.length > 0 ? sanitizedListings : playerListings;
    const totalValue = listToAverage.reduce((sum, listing) => sum + listing.price, 0);
    return totalValue / listToAverage.length;
}

async function processVendorTicks() {
    console.log("Processing regular vendor tick...");
    const marketCollection = getMarketCollection();
    const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)];
    const currentListingsCount = await marketCollection.countDocuments({ sellerId: vendor.sellerId });
    if (currentListingsCount >= 3) { return; }
    if (Math.random() < vendor.chance) {
        const itemToSell = vendor.stock[Math.floor(Math.random() * vendor.stock.length)];
        let finalPrice;
        if (itemToSell.price) {
            finalPrice = itemToSell.price;
        } else {
            const avgPrice = await getAveragePlayerPrice(itemToSell.itemId);
            if (avgPrice) {
                finalPrice = Math.ceil(avgPrice * 1.15);
            } else {
                const priceRange = FALLBACK_PRICES[itemToSell.itemId] || FALLBACK_PRICES.default;
                finalPrice = Math.floor(Math.random() * (priceRange.max - priceRange.min + 1)) + priceRange.min;
            }
        }
        try {
            const newListingId = await findNextAvailableListingId(marketCollection);
            await marketCollection.insertOne({ listingId: newListingId, sellerId: vendor.sellerId, sellerName: vendor.name, itemId: itemToSell.itemId, quantity: itemToSell.quantity, price: finalPrice });
            console.log(`${vendor.name} listed ${itemToSell.quantity}x ${ITEMS[itemToSell.itemId].name} for ${finalPrice} Bits each!`);
        } catch (error) {
            if (error.code === 11000) { console.warn(`[Vendor Tick] Race condition for ${vendor.name}. Retrying next tick.`); }
            else { console.error(`[Vendor Tick] Error for ${vendor.name}:`, error); }
        }
    }
}

async function processLootboxVendorTick() {
    const lootboxCollection = getLootboxCollection();
    console.log("Processing lootbox vendor tick...");
    const currentListings = await lootboxCollection.find({}).toArray();
    const currentListingsCount = currentListings.length;
    if (currentListingsCount > 0 && Math.random() < 0.25) {
        const listingToRemove = currentListings[Math.floor(Math.random() * currentListings.length)];
        await lootboxCollection.deleteOne({ _id: listingToRemove._id });
        const crateName = LOOTBOXES[listingToRemove.lootboxId]?.name || 'an unknown crate';
        console.log(`The Collector removed all ${crateName}s from the shop.`);
        return;
    }
    if (currentListingsCount < MAX_LOOTBOX_LISTINGS) {
        const existingCrateIds = currentListings.map(c => c.lootboxId);
        const availableCrates = Object.keys(LOOTBOXES).filter(id => !existingCrateIds.includes(id));
        if (availableCrates.length > 0) {
            const crateToSellId = availableCrates[Math.floor(Math.random() * availableCrates.length)];
            const crateToSell = LOOTBOXES[crateToSellId];
            const quantity = Math.floor(Math.random() * 5) + 1;
            await lootboxCollection.insertOne({ sellerId: "NPC_COLLECTOR", lootboxId: crateToSellId, quantity: quantity, price: crateToSell.price });
            console.log(`The Collector listed ${quantity}x ${crateToSell.name}!`);
        }
    }
}

async function processFinishedSmelting(client) {
    const economyCollection = getEconomyCollection();
    const now = Date.now();
    const finishedSmelts = await economyCollection.find({ "smelting.finishTime": { $ne: null, $lte: now } }).toArray();
    for (const account of finishedSmelts) {
        const { resultItemId, quantity } = account.smelting;
        await modifyInventory(account._id, resultItemId, quantity);
        await updateAccount(account._id, { smelting: null });
        try {
            if (account.discordId) {
                const user = await client.users.fetch(account.discordId);
                user.send(`✅ Your processing is complete! You received ${quantity}x ${ITEMS[resultItemId].name}.`);
            }
        } catch (e) {
            console.log(`Could not DM ${account.drednotName || account._id} about finished processing.`);
        }
    }
}

async function processGlobalEventTick(client) {
    const now = Date.now();
    const eventChannel = client.channels.cache.get(EVENT_CHANNEL_ID);
    if (currentGlobalEvent && now > currentGlobalEvent.expiresAt) {
        console.log(`Global event '${currentGlobalEvent.name}' has ended.`);
        if (eventChannel) {
            const endEmbed = new EmbedBuilder().setColor('#DDDDDD').setTitle(`${currentGlobalEvent.emoji} Event Ended!`).setDescription(`The **${currentGlobalEvent.name}** event is now over. Things are back to normal!`);
            await eventChannel.send({ embeds: [endEmbed] }).catch(console.error);
        }
        currentGlobalEvent = null;
    }
    if (!currentGlobalEvent && Math.random() < EVENT_CHANCE) {
        const eventKeys = Object.keys(EVENTS);
        const randomEventKey = eventKeys[Math.floor(Math.random() * eventKeys.length)];
        const eventData = EVENTS[randomEventKey];
        currentGlobalEvent = { ...eventData, type: randomEventKey, startedAt: now, expiresAt: now + eventData.duration_ms };
        console.log(`Starting new global event: '${currentGlobalEvent.name}'`);
        if (eventChannel) {
            const startEmbed = new EmbedBuilder().setColor('#FFD700').setTitle(`${currentGlobalEvent.emoji} GLOBAL EVENT STARTED!`).setDescription(`**${currentGlobalEvent.name}**\n\n${currentGlobalEvent.description}`).setFooter({ text: `This event will last for ${formatDuration(currentGlobalEvent.duration_ms / 1000)}.` });
            await eventChannel.send({ content: '@here A new global event has begun!', embeds: [startEmbed] }).catch(console.error);
        }
    }
}

// --- NEW FUNCTION ---
// /utils/tickers.js
// /utils/tickers.js

// --- REPLACE THIS ENTIRE FUNCTION ---
async function processClanWarTick(client) {
    const serverState = getServerStateCollection();
    const clans = getClansCollection();
    const economy = getEconomyCollection();

    let state = await serverState.findOne({ stateKey: "clan_war" });

    // --- FIX: COMBINED & ROBUST INITIALIZATION ---
    // This block now handles both a missing document AND an incomplete document.
    if (!state || !state.warEndTime || !(state.warEndTime instanceof Date)) {
        const reason = !state ? "No state found" : "State was incomplete/invalid";
        console.log(`[CLAN WAR] Initializing/Resetting war. Reason: ${reason}.`);
        
        const newEndTime = new Date(Date.now() + CLAN_WAR_DURATION_DAYS * 24 * 60 * 60 * 1000);
        
        // Use upsert:true to create the document if it's missing, or update it if it exists.
        await serverState.updateOne(
            { stateKey: "clan_war" },
            { $set: { warEndTime: newEndTime } },
            { upsert: true }
        );
        
        console.log(`[CLAN WAR] War clock started. Ends at: ${newEndTime.toISOString()}`);
        return; // End this tick, the next one will be normal.
    }
    // --- END FIX ---

    // The rest of the function now only runs if we are 100% sure the state is valid.
    if (new Date() > state.warEndTime) {
        console.log("[CLAN WAR] War has ended. Processing rewards...");

        // Find top 3 clans
        const winningClans = await clans.find({ warPoints: { $gt: 0 } }).sort({ warPoints: -1 }).limit(3).toArray();
        if (winningClans.length > 0) {
            // Announce winners in event channel
            const eventChannel = client.channels.cache.get(EVENT_CHANNEL_ID);
            if (eventChannel) {
                const winnerDescriptions = winningClans.map((c, i) => {
                    const medals = ['🏆', '🥈', '🥉'];
                    return `${medals[i]} **[${c.tag}] ${c.name}** - ${c.warPoints.toLocaleString()} Points`;
                });
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('⚔️ Clan War Concluded! ⚔️')
                    .setDescription(`The battle has ended! Here are the final standings:\n\n${winnerDescriptions.join('\n')}`)
                    .setFooter({ text: "Rewards have been distributed to the members of the winning clans." });
                await eventChannel.send({ embeds: [embed] }).catch(console.error);
            }

            // Distribute rewards
            for (let i = 0; i < winningClans.length; i++) {
                const clan = winningClans[i];
                const rank = i + 1;
                const reward = CLAN_WAR_REWARDS[rank];
                if (reward && reward.items) {
                    const members = await economy.find({ clanId: clan._id }).toArray();
                    for (const member of members) {
                        for (const item of reward.items) {
                            await modifyInventory(member._id, item.itemId, item.quantity);
                        }
                    }
                }
            }
        }
        
        // Reset for the next war
        await clans.updateMany({}, { $set: { warPoints: 0 } });
        const newEndTime = new Date(Date.now() + CLAN_WAR_DURATION_DAYS * 24 * 60 * 60 * 1000);
        await serverState.updateOne({ stateKey: "clan_war" }, { $set: { warEndTime: newEndTime } });
        console.log(`[CLAN WAR] All clan points reset. New war started. Ends at: ${newEndTime.toISOString()}`);
    }
}
const getCurrentGlobalEvent = () => currentGlobalEvent;

function startTickingProcesses(client) {
    setInterval(processVendorTicks, VENDOR_TICK_INTERVAL_MINUTES * 60 * 1000);
    setInterval(processLootboxVendorTick, LOOTBOX_TICK_INTERVAL_MINUTES * 60 * 1000);
    setInterval(() => processFinishedSmelting(client), 5000);
    setInterval(() => processGlobalEventTick(client), EVENT_TICK_INTERVAL_MINUTES * 60 * 1000);
    
    // Add the new clan war ticker, runs every minute
    setInterval(() => processClanWarTick(client), 60 * 1000);
}

module.exports = {
    startTickingProcesses,
    getCurrentGlobalEvent,
};
