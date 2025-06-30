// /utils/utilities.js

const crypto = require('crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TRAITS, ITEMS, STARTING_BALANCE } = require('../config');
const { getEconomyCollection, getMarketCollection } = require('./database');

// This object will serve as an in-memory cache for pagination data.
let userPaginationData = {};

function rollNewTrait() {
    const totalWeight = Object.values(TRAITS).reduce((sum, trait) => sum + trait.weight, 0);
    let random = secureRandomFloat() * totalWeight;
    for (const traitId in TRAITS) {
        if (random < TRAITS[traitId].weight) {
            const level = Math.ceil(secureRandomFloat() * TRAITS[traitId].maxLevel);
            return { name: traitId, level: level };
        }
        random -= TRAITS[traitId].weight;
    }
}

function secureRandomFloat() {
    return crypto.randomBytes(4).readUInt32LE(0) / 0xffffffff;
}

async function getAccount(identifier) {
    if (!identifier) return null; // Prevent errors if identifier is null/undefined
    const economyCollection = getEconomyCollection();
    const idStr = String(identifier);

    // This query is more robust. It checks the lowercase _id, the original cased ID, and the discordId.
    // The 'i' flag makes the regex search case-insensitive.
    return await economyCollection.findOne({
        $or: [
            { _id: new RegExp(`^${idStr}$`, 'i') },
            { discordId: idStr }
        ]
    });
}

async function createNewAccount(identifier, type = 'drednot') {
    const economyCollection = getEconomyCollection();
    const idStr = String(identifier).toLowerCase();
    const newAccount = {
        _id: idStr,
        drednotName: type === 'drednot' ? String(identifier) : null,
        displayName: null,
        discordId: type === 'discord' ? String(identifier) : null,
        balance: STARTING_BALANCE,
        lastWork: null,
        lastGather: null,
        lastDaily: null,
        dailyStreak: 0,
        lastHourly: null,
        hourlyStreak: 0,
        lastSlots: null,
        inventory: {},
        smelting: null,
        activeBuffs: [],
        wasBumped: false,
        clanId: null,
        clanJoinCooldown: null,
        traits: { slots: [rollNewTrait(), rollNewTrait()] },
        zeal: { stacks: 0, lastAction: 0 }
    };
    await economyCollection.insertOne(newAccount);
    console.log(`Created new ${type} account for ${identifier}`);
    return newAccount;
}

async function updateAccount(identifier, updates) {
    const economyCollection = getEconomyCollection();
    const idStr = String(identifier).toLowerCase();
    await economyCollection.updateOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }, { $set: updates });
}

async function modifyInventory(identifier, itemId, amount) {
    if (!itemId) return;
    const economyCollection = getEconomyCollection();
    const updateField = `inventory.${itemId}`;
    const idStr = String(identifier).toLowerCase();
    await economyCollection.updateOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }, { $inc: { [updateField]: amount } });
}

function getItemIdByName(name) {
    if (!name) return null;
    return Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === name.toLowerCase());
}

function formatDuration(seconds) {
    if (seconds <= 0) return '0s';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.ceil(seconds % 60);
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
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

const BOLD_MAP = { 'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣', 'k': '𝐤', 'l': '𝐥', 'm': '𝐦', 'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭', 'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳', 'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉', 'K': '𝐊', 'L': '𝐋', 'M': '𝐌', 'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓', 'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙', '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗', ' ': ' ', ':':':' };
function toBoldFont(text) {
    return String(text).split('').map(char => BOLD_MAP[char.toLowerCase()] || char).join('');
}

function getPaginatedResponse(identifier, type, allLines, title, pageChange = 0) {
    const linesPerPage = 10;
    if (pageChange === 0 || !userPaginationData[identifier] || userPaginationData[identifier].type !== type) {
        userPaginationData[identifier] = { lines: allLines, currentPage: 0, type, title };
    }
    const session = userPaginationData[identifier];
    session.currentPage += pageChange;
    const totalPages = Math.ceil(session.lines.length / linesPerPage);
    if (session.currentPage >= totalPages && totalPages > 0) session.currentPage = totalPages - 1;
    if (session.currentPage < 0) session.currentPage = 0;
    const startIndex = session.currentPage * linesPerPage;
    const linesForPage = session.lines.slice(startIndex, startIndex + linesPerPage);
    const footer = `Page ${session.currentPage + 1}/${totalPages}. Use !n or !p to navigate.`;
    const discordContent = `**--- ${title} (Page ${session.currentPage + 1}/${totalPages}) ---**\n${linesForPage.length > 0 ? linesForPage.join('\n') : "No items on this page."}`;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paginate_back_${identifier}`).setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage === 0),
        new ButtonBuilder().setCustomId(`paginate_next_${identifier}`).setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage >= totalPages - 1)
    );
    const gameContent = [`--- ${toBoldFont(title)} ---`, ...linesForPage, footer];
    return { discord: { content: discordContent, components: [row] }, game: gameContent };
}

async function selfHealAccount(account) {
    let updates = {};
    let needsUpdate = false;
    if (!account.traits) { updates['traits'] = { slots: [rollNewTrait(), rollNewTrait()] }; needsUpdate = true; console.log(`[Self-Heal] Adding traits to old account: ${account._id}`); }
    if (!account.drednotName && !account.discordId) { updates['drednotName'] = account._id; needsUpdate = true; console.log(`[Self-Heal] Fixing drednotName for old account: ${account._id}`); }
    if (account.dailyStreak === undefined) { updates['dailyStreak'] = 0; needsUpdate = true; console.log(`[Self-Heal] Adding dailyStreak to account: ${account._id}`); }
    if (account.lastHourly === undefined) { updates['lastHourly'] = null; needsUpdate = true; console.log(`[Self-Heal] Adding lastHourly to account: ${account._id}`); }
    if (account.hourlyStreak === undefined) { updates['hourlyStreak'] = 0; needsUpdate = true; console.log(`[Self-Heal] Adding hourlyStreak to account: ${account._id}`); }
    if (account.clanId === undefined) { updates['clanId'] = null; needsUpdate = true; console.log(`[Self-Heal] Adding clanId to account: ${account._id}`); }
    if (account.clanJoinCooldown === undefined) { updates['clanJoinCooldown'] = null; needsUpdate = true; console.log(`[Self-Heal] Adding clanJoinCooldown to account: ${account._id}`); }
    
    if (needsUpdate) {
        await updateAccount(account._id, updates);
        return getAccount(account._id); // Re-fetch the updated account
    }
    return account;
}

const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function openLootbox(lootboxId) {
    const { LOOTBOXES } = require('../config');
    const crate = LOOTBOXES[lootboxId];
    if (!crate) return null;
    const totalWeight = crate.contents.reduce((sum, item) => sum + item.weight, 0);
    let random = secureRandomFloat() * totalWeight;
    for (const reward of crate.contents) {
        if (random < reward.weight) {
            const amount = Math.floor(secureRandomFloat() * (reward.max - reward.min + 1)) + reward.min;
            return { type: reward.type, id: reward.id, amount: amount };
        }
        random -= reward.weight;
    }
    // Fallback for floating point inaccuracies
    const lastReward = crate.contents[crate.contents.length - 1];
    const amount = Math.floor(secureRandomFloat() * (lastReward.max - lastReward.min + 1)) + lastReward.min;
    return { type: lastReward.type, id: lastReward.id, amount: amount };
}

function getActiveTraits(account, traitName) {
    return (account.traits?.slots || []).filter(t => t.name === traitName);
}

// A function to generate the 5-character clan code
function generateClanCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

module.exports = {
    userPaginationData, // Note: This is an in-memory object, it will reset on restart.
    rollNewTrait,
    secureRandomFloat,
    getAccount,
    createNewAccount,
    updateAccount,
    modifyInventory,
    getItemIdByName,
    formatDuration,
    findNextAvailableListingId,
    toBoldFont,
    getPaginatedResponse,
    selfHealAccount,
    shuffleArray,
    openLootbox,
    getActiveTraits,
    generateClanCode
};
