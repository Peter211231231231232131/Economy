// /handlers/commandHandlers.js

const { getEconomyCollection, getMarketCollection, getLootboxCollection, getMongoClient, getVerificationsCollection, getClansCollection, getServerStateCollection } = require('../utils/database');
const { getAccount, createNewAccount, updateAccount, modifyInventory, getItemIdByName, formatDuration, findNextAvailableListingId, getPaginatedResponse, selfHealAccount, shuffleArray, openLootbox, getActiveTraits, toBoldFont, rollNewTrait, secureRandomFloat } = require('../utils/utilities');
const {
    ITEMS, TRAITS, CURRENCY_NAME, GATHER_TABLE, MAX_GATHER_TYPES_BASE, WORK_REWARD_MIN, WORK_REWARD_MAX,
    WORK_COOLDOWN_MINUTES, MINIMUM_ACTION_COOLDOWN_MS, GATHER_COOLDOWN_MINUTES, HOURLY_COOLDOWN_MINUTES, HOURLY_REWARD_BASE,
    HOURLY_STREAK_BONUS, DAILY_REWARD_BASE, DAILY_STREAK_BONUS, SMELTABLE_ORES, COOKABLE_FOODS, SMELT_COAL_COST_PER_ORE,
    SMELT_COOLDOWN_SECONDS_PER_ORE, FLIP_MIN_BET, FLIP_MAX_BET, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_COOLDOWN_SECONDS,
    SLOT_REELS, SLOTS_PAYOUTS, MARKET_TAX_RATE, LOOTBOXES, STARTING_BALANCE, DREDNOT_INVITE_LINK, DISCORD_INVITE_LINK, CLAN_LEVELS
} = require('../config');
const { getCurrentGlobalEvent } = require('../utils/tickers');
const { getClanById } = require('./clanHandlers');
// This file contains the core logic for every player command.

function handleItemInfo(itemId) {
    const itemDef = ITEMS[itemId];
    if (!itemDef) return `Could not find an item with that ID.`;

    const header = `${itemDef.emoji || '📦'} **${itemDef.name}**\n--------------------`;
    let infoLines = [];

    if (itemDef.description) {
        infoLines.push(`> ${itemDef.description}`);
    }
    if (itemDef.type) {
        const typeFormatted = itemDef.type.charAt(0).toUpperCase() + itemDef.type.slice(1);
        infoLines.push(`> **Type:** ${typeFormatted}`);
    }
    if (itemDef.effects) {
        for (const effect in itemDef.effects) {
            const value = itemDef.effects[effect];
            let effectText = '> **Effect:** ';
            if (effect === 'work_bonus_flat') {
                effectText += `Increases Bits from /work by a flat bonus of +${value}.`;
            } else if (effect === 'work_bonus_percent') {
                effectText += `Increases Bits from /work by a bonus of ${value * 100}%.`;
            } else if (effect === 'work_cooldown_reduction_percent') {
                effectText += `Reduces /work cooldown by ${value}%.`;
            }
            infoLines.push(effectText);
        }
    }
    if (itemDef.craftable) {
        const recipeParts = Object.entries(itemDef.recipe).map(([resId, qty]) => {
            const resource = ITEMS[resId];
            return `${resource.emoji} ${qty}x ${resource.name}`;
        });
        infoLines.push(`> **Craftable:** Yes`);
        infoLines.push(`> **Recipe:** ${recipeParts.join(', ')}`);
    }
    if (infoLines.length === 0 && !itemDef.description) {
        infoLines.push('> **Use:** A basic resource used in crafting recipes.');
    }
    return [header, ...infoLines].join('\n');
}

async function handleRecipes() {
    let recipeList = ['📜 **Available Recipes:**'];
    for (const itemId in ITEMS) {
        if (ITEMS[itemId].craftable) {
            const recipeParts = Object.entries(ITEMS[itemId].recipe).map(([resId, qty]) => `${ITEMS[resId].emoji} ${qty}x ${ITEMS[resId].name}`);
            recipeList.push(`> ${ITEMS[itemId].emoji} **${ITEMS[itemId].name}**: Requires ${recipeParts.join(', ')}`);
        }
    }
    return recipeList.length > 1 ? recipeList.join('\n') : 'There are no craftable items yet.';
}

async function handleCraft(account, itemName, quantity) {
    const economyCollection = getEconomyCollection();
    if (isNaN(quantity) || quantity <= 0) {
        return { success: false, message: "Invalid quantity. Please provide a positive number." };
    }
    const itemToCraftId = getItemIdByName(itemName);
    if (!itemToCraftId || !ITEMS[itemToCraftId].craftable) {
        return { success: false, message: `"${itemName}" is not a valid, craftable item. Check \`/recipes\` or \`!recipes\`.` };
    }

    const recipe = ITEMS[itemToCraftId].recipe;
    let updates = {};
    let missingResources = [];

    for (const resId in recipe) {
        const requiredQty = recipe[resId] * quantity;
        const playerQty = account.inventory[resId] || 0;
        if (playerQty < requiredQty) {
            missingResources.push(`${requiredQty - playerQty} more ${ITEMS[resId].name}`);
        }
        updates[`inventory.${resId}`] = -requiredQty;
    }

    if (missingResources.length > 0) {
        return { success: false, message: `You don't have enough resources! You need: ${missingResources.join(', ')}.` };
    }

    updates[`inventory.${itemToCraftId}`] = quantity;

    await economyCollection.updateOne({ _id: account._id }, { $inc: updates });
    return { success: true, message: `You successfully crafted **${quantity}x** ${ITEMS[itemToCraftId].name}!` };
}

async function handleSmelt(account, itemName, quantity) {
    const economyCollection = getEconomyCollection();
    const advancedSmelterCount = account.inventory['advanced_smelter'] || 0;
    const basicSmelterCount = account.inventory['smelter'] || 0;

    if (advancedSmelterCount < 1 && basicSmelterCount < 1) {
        return { success: false, message: "You need to craft a 🔥 Smelter or an Advanced Smelter first!" };
    }
    if (account.smelting && account.smelting.finishTime > Date.now()) {
        return { success: false, message: `You are already processing something! Wait for it to finish.` };
    }

    const itemIdToProcess = getItemIdByName(itemName);
    if (!itemIdToProcess) {
        return { success: false, message: `Invalid item: ${itemName}` };
    }

    let resultItemId;
    let processType;
    if (SMELTABLE_ORES[itemIdToProcess]) {
        resultItemId = SMELTABLE_ORES[itemIdToProcess];
        processType = 'smelting';
    } else if (COOKABLE_FOODS[itemIdToProcess]) {
        resultItemId = COOKABLE_FOODS[itemIdToProcess];
        processType = 'cooking';
    } else {
        return { success: false, message: `You can't smelt or cook that. Valid inputs: Iron Ore, Copper Ore, Raw Meat.` };
    }

    if (isNaN(quantity) || quantity <= 0) {
        return { success: false, message: "Invalid quantity." };
    }
    if ((account.inventory[itemIdToProcess] || 0) < quantity) {
        return { success: false, message: `You don't have enough ${ITEMS[itemIdToProcess].name}.` };
    }
    const coalNeeded = quantity * SMELT_COAL_COST_PER_ORE;
    if ((account.inventory['coal'] || 0) < coalNeeded) {
        return { success: false, message: `You don't have enough coal. You need ${coalNeeded} ⚫ Coal.` };
    }

    const updateResult = await economyCollection.findOneAndUpdate(
        { _id: account._id, [`inventory.${itemIdToProcess}`]: { $gte: quantity }, [`inventory.coal`]: { $gte: coalNeeded } },
        { $inc: { [`inventory.${itemIdToProcess}`]: -quantity, [`inventory.coal`]: -coalNeeded } }
    );

    if (!updateResult) {
        return { success: false, message: "Failed to start smelting, you might not have enough resources. Please check your inventory." };
    }
    
    let smelterPower = basicSmelterCount + (advancedSmelterCount * 2); // Advanced smelters count as two
    let timePerItem = (SMELT_COOLDOWN_SECONDS_PER_ORE / smelterPower) * 1000;
    
    const currentGlobalEvent = getCurrentGlobalEvent();
    if (currentGlobalEvent && currentGlobalEvent.effect.type === 'super_smelter') {
        timePerItem /= 2;
    }
    const totalTime = timePerItem * quantity;
    const finishTime = Date.now() + totalTime;

    await updateAccount(account._id, { smelting: { resultItemId: resultItemId, quantity, finishTime } });

    let eventText = currentGlobalEvent && currentGlobalEvent.effect.type === 'super_smelter' ? ` (Thanks to ${currentGlobalEvent.name}!)` : '';
    return { success: true, message: `You begin ${processType} **${quantity}x** ${ITEMS[itemIdToProcess].name}. It will take **${formatDuration(totalTime / 1000)}**${eventText}.` };
}

async function handleTimers(account) {
    const now = Date.now();
    const timers = [];

    let workCooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;
    let gatherCooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000;
    let hourlyCooldown = HOURLY_COOLDOWN_MINUTES * 60 * 1000;

    // Trait effects
    if (account.traits) {
        getActiveTraits(account, 'prodigy').forEach(t => {
            const reduction = 5 * t.level;
            workCooldown *= (1 - reduction / 100);
            gatherCooldown *= (1 - reduction / 100);
        });
    }
    
    // Tool effects
    for (const itemId in account.inventory) {
        if (account.inventory[itemId] > 0) {
            const itemDef = ITEMS[itemId];
            if (itemDef?.type === 'tool' && itemDef.effects?.work_cooldown_reduction_percent) {
                const qty = account.inventory[itemId];
                const totalReductionPercent = itemDef.effects.work_cooldown_reduction_percent * qty;
                workCooldown *= (1 - totalReductionPercent / 100);
            }
        }
    }
    
    // Buff effects
    const activeBuffs = (account.activeBuffs || []).filter(buff => buff.expiresAt > now);
    for (const buff of activeBuffs) {
        const itemDef = ITEMS[buff.itemId];
        if (itemDef?.buff?.effects) {
            if (itemDef.buff.effects.work_cooldown_reduction_ms) workCooldown -= itemDef.buff.effects.work_cooldown_reduction_ms;
            if (itemDef.buff.effects.gather_cooldown_reduction_ms) gatherCooldown -= itemDef.buff.effects.gather_cooldown_reduction_ms;
        }
    }

    workCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, workCooldown);
    gatherCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, gatherCooldown);

    timers.push(`> 💪 **Work**: ${(account.lastWork && (now - account.lastWork) < workCooldown) ? formatDuration(((account.lastWork + workCooldown) - now) / 1000) : 'Ready!'}`);
    timers.push(`> ⛏️ **Gather**: ${(account.lastGather && (now - account.lastGather) < gatherCooldown) ? formatDuration(((account.lastGather + gatherCooldown) - now) / 1000) : 'Ready!'}`);

    const hourlyTimeLeft = (account.lastHourly || 0) + hourlyCooldown - now;
    timers.push(`>  hourly: ${hourlyTimeLeft > 0 ? formatDuration(hourlyTimeLeft / 1000) : 'Ready!'}`);

    const dailyCooldown = 22 * 60 * 60 * 1000;
    const dailyTimeLeft = (account.lastDaily || 0) + dailyCooldown - now;
    timers.push(`> 📅 **Daily**: ${dailyTimeLeft > 0 ? formatDuration(dailyTimeLeft / 1000) : 'Ready!'}`);

    const slotsTimeLeft = (account.lastSlots || 0) + SLOTS_COOLDOWN_SECONDS * 1000 - now;
    if (slotsTimeLeft > 0) timers.push(`> 🎰 **Slots**: ${formatDuration(slotsTimeLeft / 1000)}`);

    if (account.smelting && account.smelting.finishTime > now) {
        timers.push(`> 🔥 **Smelting**: ${formatDuration((account.smelting.finishTime - now) / 1000)}`);
    }

    if(account.clanJoinCooldown && now < account.clanJoinCooldown) {
        timers.push(`> 🛡️ **Clan Join**: ${formatDuration((account.clanJoinCooldown.getTime() - now) / 1000)}`);
    }

    if (activeBuffs.length > 0) {
        timers.push(`\n**Active Buffs:**`);
        activeBuffs.forEach(buff => {
            const itemDef = ITEMS[buff.itemId];
            const timeLeft = formatDuration((buff.expiresAt - now) / 1000);
            timers.push(`> ${itemDef?.emoji || '❔'} ${itemDef?.name || 'Unknown Buff'}: **${timeLeft}** remaining`);
        });
    }

    return timers;
}

// --- MODIFIED ---
async function handleWork(account) {
    const economyCollection = getEconomyCollection();
    let now = Date.now();
    let baseCooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;
    let workBonusPercent = 0, scavengerChance = 0, cooldownReductionPercent = 0;
    let momentumChance = 0;

    // --- CLAN PERK INTEGRATION ---
    let clan = null;
    if (account.clanId) {
        clan = await getClanById(account.clanId);
        if (clan) {
            if (clan.level >= 8) workBonusPercent += 15;
            else if (clan.level >= 4) workBonusPercent += 10;
            else if (clan.level >= 2) workBonusPercent += 5;
            
            if (clan.level >= 7) momentumChance = 5;
            else if (clan.level >= 3) momentumChance = 2.5;
        }
    }
    // --- END CLAN PERK INTEGRATION ---

    // Trait bonuses
    if (account.traits) {
        getActiveTraits(account, 'wealth').forEach(t => workBonusPercent += 5 * t.level);
        getActiveTraits(account, 'scavenger').forEach(t => scavengerChance += 5 * t.level);
        getActiveTraits(account, 'prodigy').forEach(t => cooldownReductionPercent += 5 * t.level);
    }

    let currentCooldown = baseCooldown * (1 - cooldownReductionPercent / 100);
    
    let toolBonusFlat = 0;
    let toolBonusPercent = 0;
    for (const itemId in account.inventory) {
        if (account.inventory[itemId] > 0) {
            const itemDef = ITEMS[itemId];
            if (itemDef?.type === 'tool' && itemDef.effects) {
                const qty = account.inventory[itemId];
                if (itemDef.effects.work_bonus_flat) toolBonusFlat += itemDef.effects.work_bonus_flat * qty;
                if (itemDef.effects.work_bonus_percent) toolBonusPercent += itemDef.effects.work_bonus_percent * qty;
                if (itemDef.effects.work_cooldown_reduction_percent) {
                    currentCooldown *= (1 - (itemDef.effects.work_cooldown_reduction_percent / 100) * qty);
                }
            }
        }
    }
    
    currentCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, currentCooldown);
    if (account.lastWork && (now - account.lastWork) < currentCooldown) {
        return { success: false, message: `You are on cooldown. Wait **${formatDuration((currentCooldown - (now - account.lastWork)) / 1000)}**.` };
    }
    
    let baseEarnings = Math.floor(secureRandomFloat() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN;
    const totalPercentBonus = workBonusPercent + (toolBonusPercent * 100);
    const bonusFromPercent = Math.floor(baseEarnings * (totalPercentBonus / 100));
    let totalEarnings = baseEarnings + bonusFromPercent + toolBonusFlat;

    let bonusText = (bonusFromPercent + toolBonusFlat) > 0 ? ` (+${(bonusFromPercent + toolBonusFlat)} bonus)` : '';
    let eventMessage = '';
    const currentGlobalEvent = getCurrentGlobalEvent();
    if (currentGlobalEvent && currentGlobalEvent.effect.type === 'work') {
        totalEarnings *= currentGlobalEvent.effect.multiplier;
        eventMessage = ` **(x${currentGlobalEvent.effect.multiplier} ${currentGlobalEvent.name}!)**`;
    }
    
    if (!isFinite(totalEarnings) || isNaN(totalEarnings)) { return { success: false, message: "An error occurred calculating earnings." }; }

    let finalMessage = `You earned **${Math.round(totalEarnings)}** ${CURRENCY_NAME}${bonusText}!${eventMessage}`;
    const cooldownReset = Math.random() * 100 < momentumChance;
    let updates = { $inc: { balance: totalEarnings } };

    if (!cooldownReset) {
        updates.$set = { lastWork: now };
    } else {
        finalMessage += `\n> ✨ Your clan's **Momentum** perk reset your cooldown!`;
    }
    
    let scavengerLoot = '';
    if (scavengerChance > 0 && secureRandomFloat() * 100 < scavengerChance) {
        const loot = ['wood', 'stone'][Math.floor(Math.random() * 2)];
        const qty = Math.floor(Math.random() * 3) + 1;
        scavengerLoot = `\n> Your Scavenger trait found you **${qty}x** ${ITEMS[loot].name}!`;
        if(!updates.$inc) updates.$inc = {};
        updates.$inc[`inventory.${loot}`] = qty;
    }
    await economyCollection.updateOne({ _id: account._id }, updates);

    // --- CLAN WAR INTEGRATION ---
    if (clan) {
        const warState = await getServerStateCollection().findOne({ stateKey: "clan_war" });
        if (warState && new Date() < warState.warEndTime) {
            await getClansCollection().updateOne({ _id: clan._id }, { $inc: { warPoints: 1 } });
        }
    }
    // --- END CLAN WAR INTEGRATION ---

    return { success: true, message: finalMessage + scavengerLoot, earned: totalEarnings };
}

// --- MODIFIED ---
async function handleGather(account) {
    const economyCollection = getEconomyCollection();
    let now = Date.now();
    let baseCooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000;
    let cooldownReductionPercent = 0, surveyorChance = 0;
    let momentumChance = 0, abundanceBonus = 0;

    // --- CLAN PERK INTEGRATION ---
    let clan = null;
    if (account.clanId) {
        clan = await getClanById(account.clanId);
        if (clan) {
            if (clan.level >= 10) abundanceBonus = 5;
            else if (clan.level >= 9) abundanceBonus = 2;
            else if (clan.level >= 6) abundanceBonus = 1;

            if (clan.level >= 7) momentumChance = 5;
            else if (clan.level >= 3) momentumChance = 2.5;
        }
    }
    // --- END CLAN PERK INTEGRATION ---

    if (account.traits) {
        getActiveTraits(account, 'prodigy').forEach(t => cooldownReductionPercent += 5 * t.level);
        getActiveTraits(account, 'surveyor').forEach(t => surveyorChance += 2 * t.level);
    }

    let currentCooldown = baseCooldown * (1 - cooldownReductionPercent / 100);
    
    currentCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, currentCooldown);

    const cooldownReset = Math.random() * 100 < momentumChance;
    if (!cooldownReset && account.lastGather && (now - account.lastGather) < currentCooldown) {
        return { success: false, message: `You are tired. Wait **${formatDuration((currentCooldown - (now - account.lastGather)) / 1000)}**.` };
    }
    
    const basketCount = account.inventory['gathering_basket'] || 0;
    const maxTypes = MAX_GATHER_TYPES_BASE + basketCount;
    let gatheredItems = [];
    let updates = {};
    const shuffledItems = Object.keys(GATHER_TABLE).sort(() => 0.5 - secureRandomFloat());

    for (const itemId of shuffledItems) {
        if (gatheredItems.length >= maxTypes) break;
        let chance = GATHER_TABLE[itemId].baseChance;
        if (secureRandomFloat() < chance) {
            let baseQty = Math.floor(secureRandomFloat() * (GATHER_TABLE[itemId].maxQty - GATHER_TABLE[itemId].minQty + 1)) + GATHER_TABLE[itemId].minQty;
            let bonusQty = 0;
            for (let i = 0; i < basketCount; i++) if (secureRandomFloat() < 0.5) bonusQty++;
            const finalQty = baseQty + bonusQty + abundanceBonus;
            updates[`inventory.${itemId}`] = (updates[`inventory.${itemId}`] || 0) + finalQty;
            const bonusText = bonusQty > 0 ? ` (+${bonusQty} basket)` : '';
            const clanBonusText = abundanceBonus > 0 ? ` (+${abundanceBonus} clan)` : '';
            gatheredItems.push({ id: itemId, qty: finalQty, text: `> ${ITEMS[itemId].emoji} **${finalQty}x** ${ITEMS[itemId].name}${bonusText}${clanBonusText}` });
        }
    }
    
    let setUpdates = {};
    if (!cooldownReset) {
        setUpdates.lastGather = now;
    }

    if (Object.keys(updates).length === 0) {
        await updateAccount(account._id, setUpdates);
        let msg = 'You searched but found nothing of value.';
        if (cooldownReset) msg += `\n> ✨ Your clan's **Momentum** perk reset your cooldown!`;
        return { success: true, message: msg };
    }
    
    await economyCollection.updateOne({ _id: account._id }, { $inc: updates, $set: setUpdates });
    let message = `You gathered:\n${gatheredItems.map(i => i.text).join('\n')}`;
    if (cooldownReset) message += `\n> ✨ Your clan's **Momentum** perk reset your cooldown!`;
    
    // --- CLAN WAR INTEGRATION ---
    if (clan) {
        const warState = await getServerStateCollection().findOne({ stateKey: "clan_war" });
        if (warState && new Date() < warState.warEndTime) {
            await getClansCollection().updateOne({ _id: clan._id }, { $inc: { warPoints: 1 } });
        }
    }
    // --- END CLAN WAR INTEGRATION ---

    return { success: true, message: message };
}

async function handleHourly(account) {
    const economyCollection = getEconomyCollection();
    const now = Date.now();
    const hourlyCooldown = HOURLY_COOLDOWN_MINUTES * 60 * 1000;
    const streakBreakTime = 2 * hourlyCooldown;

    if (account.lastHourly && (now - account.lastHourly) < hourlyCooldown) {
        const remainingTime = formatDuration((hourlyCooldown - (now - account.lastHourly)) / 1000);
        return { success: false, message: `You can claim your hourly reward in **${remainingTime}**.` };
    }

    let currentStreak = account.hourlyStreak || 0;
    let streakMessage = '';

    if (account.lastHourly && (now - account.lastHourly) < streakBreakTime) {
        currentStreak++;
    } else {
        if (currentStreak > 1) {
            streakMessage = `Your previous hourly streak of ${currentStreak} has been broken.`;
        }
        currentStreak = 1;
    }

    const streakBonus = (currentStreak - 1) * HOURLY_STREAK_BONUS;
    const totalReward = HOURLY_REWARD_BASE + streakBonus;

    await economyCollection.updateOne(
        { _id: account._id },
        {
            $inc: { balance: totalReward },
            $set: { lastHourly: now, hourlyStreak: currentStreak }
        }
    );

    let finalMessage = `You claimed your hourly reward of **${HOURLY_REWARD_BASE} ${CURRENCY_NAME}**!`;
    if (streakBonus > 0) {
        finalMessage += `\n> ✨ Streak Bonus: +**${streakBonus}** ${CURRENCY_NAME} (Hour ${currentStreak})`;
    }
    if (streakMessage) {
        finalMessage += `\n> ${streakMessage}`;
    }

    return { success: true, message: finalMessage };
}

async function handleDaily(account) {
    const economyCollection = getEconomyCollection();
    const now = Date.now();
    const dailyCooldown = 22 * 60 * 60 * 1000;
    const streakBreakTime = 2 * 24 * 60 * 60 * 1000;

    if (account.lastDaily && (now - account.lastDaily) < dailyCooldown) {
        const remainingTime = formatDuration((dailyCooldown - (now - account.lastDaily)) / 1000);
        return { success: false, message: `You can claim your daily reward in **${remainingTime}**.` };
    }

    let currentStreak = account.dailyStreak || 0;
    let streakMessage = '';

    if (account.lastDaily && (now - account.lastDaily) < streakBreakTime) {
        currentStreak++;
    } else {
        if (currentStreak > 1) {
            streakMessage = `Your previous daily streak of ${currentStreak} has been broken.`;
        }
        currentStreak = 1;
    }

    const streakBonus = (currentStreak - 1) * DAILY_STREAK_BONUS;
    const totalReward = DAILY_REWARD_BASE + streakBonus;

    await economyCollection.updateOne(
        { _id: account._id },
        {
            $inc: { balance: totalReward },
            $set: { lastDaily: now, dailyStreak: currentStreak }
        }
    );

    let finalMessage = `You claimed your daily reward of **${DAILY_REWARD_BASE} ${CURRENCY_NAME}**!`;
    if (streakBonus > 0) {
        finalMessage += `\n> 🔥 Streak Bonus: +**${streakBonus}** ${CURRENCY_NAME} (Day ${currentStreak})`;
    }
    if (streakMessage) {
        finalMessage += `\n> ${streakMessage}`;
    }

    return { success: true, message: finalMessage };
}

async function handleFlip(account, amount, choice) {
    const economyCollection = getEconomyCollection();
    if (isNaN(amount) || amount < FLIP_MIN_BET || amount > FLIP_MAX_BET) {
        return { success: false, message: `Bet must be between **${FLIP_MIN_BET}** and **${FLIP_MAX_BET}**.` };
    }
    const preLossBalance = account.balance;
    if (preLossBalance < amount) {
        return { success: false, message: "You don't have enough bits." };
    }
    const result = secureRandomFloat() < 0.5 ? 'heads' : 'tails';
    const lowerChoice = choice.toLowerCase();
    let updates = {};
    let newBalance;

    if (result.startsWith(lowerChoice)) {
        newBalance = preLossBalance + amount;
        updates = { $inc: { balance: amount } };
        await economyCollection.updateOne({ _id: account._id }, updates);
        return { success: true, message: `It was **${result}**! You win **${amount}** ${CURRENCY_NAME}!\nYour new balance is **${newBalance}**.` };
    } else {
        newBalance = preLossBalance - amount;
        updates = { $inc: { balance: -amount } };
        const addictTraits = getActiveTraits(account, 'the_addict');
        if (addictTraits.length > 0) {
            if (preLossBalance > 0) {
                const lossPercent = Math.min(1, amount / preLossBalance);
                let totalBuff = 0;
                addictTraits.forEach(t => totalBuff += 50 * t.level);
                let workBonus = 0;
                if (isFinite(lossPercent) && totalBuff > 0) workBonus = lossPercent * totalBuff;
                if (workBonus > 0 && isFinite(workBonus)) {
                    const buff = { itemId: 'the_addict_rush', expiresAt: Date.now() + 5 * 60 * 1000, effects: { work_bonus_percent: workBonus } };
                    updates.$push = { activeBuffs: buff };
                }
            }
        }
        await economyCollection.updateOne({ _id: account._id }, updates);
        return { success: false, message: `It was **${result}**. You lost **${amount}** ${CURRENCY_NAME}.\nYour new balance is **${newBalance}**.` };
    }
}

// --- MODIFIED ---
async function handleSlots(account, amount) {
    let maxBet = SLOTS_MAX_BET;
    if (account.clanId) {
        const clan = await getClanById(account.clanId);
        if (clan && clan.level >= 5) {
            maxBet = SLOTS_MAX_BET * 2;
        }
    }
    
    const economyCollection = getEconomyCollection();
    const now = Date.now();
    const cooldown = SLOTS_COOLDOWN_SECONDS * 1000;
    if (account.lastSlots && (now - account.lastSlots) < cooldown) {
        return { success: false, message: `Slow down! Wait **${formatDuration((cooldown - (now - account.lastSlots)) / 1000)}**.` };
    }

    if (isNaN(amount) || amount < SLOTS_MIN_BET || amount > maxBet) {
        return { success: false, message: `Your bet must be between **${SLOTS_MIN_BET}** and **${maxBet}** ${CURRENCY_NAME}.` };
    }
    const preLossBalance = account.balance;
    if (preLossBalance < amount) {
        return { success: false, message: "You don't have enough bits." };
    }
    await updateAccount(account._id, { lastSlots: now });
    const s1 = SLOT_REELS[0][Math.floor(secureRandomFloat() * SLOT_REELS[0].length)], s2 = SLOT_REELS[1][Math.floor(secureRandomFloat() * SLOT_REELS[1].length)], s3 = SLOT_REELS[2][Math.floor(secureRandomFloat() * SLOT_REELS[2].length)];
    const resultString = `[ ${s1} | ${s2} | ${s3} ]`;
    let winMultiplier = 0; let winMessage = '';
    if (s1 === s2 && s2 === s3) { winMultiplier = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? SLOTS_PAYOUTS.jackpot_multiplier : SLOTS_PAYOUTS.three_of_a_kind; winMessage = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? "JACKPOT! 💎" : "Three of a kind!"; } else if (s1 === s2 || s2 === s3 || s1 === s3) { winMultiplier = SLOTS_PAYOUTS.two_of_a_kind; winMessage = "Two of a kind!"; }

    let finalMessage, newBalance, updates = {}, successStatus = false;
    if (winMultiplier > 0) {
        successStatus = true;
        const winnings = Math.floor(amount * winMultiplier);
        newBalance = preLossBalance + winnings;
        finalMessage = `${resultString}\n**${winMessage}** You win **${winnings}** ${CURRENCY_NAME}!\nNew balance: **${newBalance}**.`;
        updates = { $inc: { balance: winnings } };
    } else {
        successStatus = false;
        newBalance = preLossBalance - amount;
        finalMessage = `${resultString}\nYou lost **${amount}** ${CURRENCY_NAME}.\nNew balance: **${newBalance}**.`;
        updates = { $inc: { balance: -amount } };
        const addictTraits = getActiveTraits(account, 'the_addict');
        if (addictTraits.length > 0) {
            if (preLossBalance > 0) {
                const lossPercent = Math.min(1, amount / preLossBalance);
                let totalBuff = 0;
                addictTraits.forEach(t => totalBuff += 50 * t.level);
                let workBonus = 0;
                if (isFinite(lossPercent) && totalBuff > 0) workBonus = lossPercent * totalBuff;
                if (workBonus > 0 && isFinite(workBonus)) {
                    const buff = { itemId: 'the_addict_rush', expiresAt: Date.now() + 5 * 60 * 1000, effects: { work_bonus_percent: workBonus } };
                    updates.$push = { activeBuffs: buff };
                }
            }
        }
    }
    await economyCollection.updateOne({ _id: account._id }, updates);
    return { success: successStatus, message: finalMessage };
}

async function handlePay(senderAccount, recipientAccount, amount) {
    const economyCollection = getEconomyCollection();
    const parsedAmount = Math.floor(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return { success: false, message: "Please provide a valid, positive amount to pay." };
    }
    if (senderAccount._id === recipientAccount._id) {
        return { success: false, message: "You can't pay yourself!" };
    }

    const updateResult = await economyCollection.updateOne({ _id: senderAccount._id, balance: { $gte: parsedAmount } }, { $inc: { balance: -parsedAmount } });
    if (updateResult.modifiedCount === 0) {
        return { success: false, message: `You don't have enough Bits. You only have **${senderAccount.balance}**.` };
    }

    await economyCollection.updateOne({ _id: recipientAccount._id }, { $inc: { balance: parsedAmount } });

    const recipientName = recipientAccount.drednotName || recipientAccount.displayName || `User ${recipientAccount._id}`;
    return { success: true, message: `You paid **${parsedAmount}** ${CURRENCY_NAME} to **${recipientName}**.` };
}

async function handleAccountMerge(discordId, drednotName) {
    const economyCollection = getEconomyCollection();
    const mongoClient = getMongoClient();
    const drednotNameLower = drednotName.toLowerCase();
    const session = mongoClient.startSession();
    try {
        await session.startTransaction();
        const discordAccount = await economyCollection.findOne({ _id: discordId }, { session });
        let drednotAccount = await economyCollection.findOne({ _id: drednotNameLower }, { session });
        if (!drednotAccount) {
            await session.abortTransaction();
            // This is a special case where the drednot account doesn't exist yet, but we have a valid verification
            await createNewAccount(drednotName, 'drednot');
            drednotAccount = await getAccount(drednotName); // Re-fetch it outside the transaction context
            // Now, link the accounts
            await updateAccount(drednotAccount._id, { discordId: discordId });
            return { success: true, message: `✅ Verification successful! Your accounts are now linked.` };
        }
        if (!discordAccount) {
            await session.abortTransaction();
            await updateAccount(drednotName, { discordId: discordId });
            return { success: true, message: `✅ Verification successful! Your accounts are now linked.` };
        }
        if (!isFinite(discordAccount.balance) || !isFinite(drednotAccount.balance)) {
            throw new Error("Merge Conflict: One or both accounts have a corrupted balance. Cannot merge.");
        }
        if (discordAccount.smelting && drednotAccount.smelting) {
            throw new Error("Merge Conflict: Both accounts have active smelting jobs.");
        }
        const mergedData = {
            balance: discordAccount.balance + drednotAccount.balance,
            inventory: { ...drednotAccount.inventory },
            lastWork: Math.max(discordAccount.lastWork || 0, drednotAccount.lastWork || 0),
            lastGather: Math.max(discordAccount.lastGather || 0, drednotAccount.lastGather || 0),
            lastDaily: Math.max(discordAccount.lastDaily || 0, drednotAccount.lastDaily || 0),
            dailyStreak: Math.max(discordAccount.dailyStreak || 0, drednotAccount.dailyStreak || 0),
            lastHourly: Math.max(discordAccount.lastHourly || 0, drednotAccount.lastHourly || 0),
            hourlyStreak: Math.max(discordAccount.hourlyStreak || 0, drednotAccount.hourlyStreak || 0),
            lastSlots: Math.max(discordAccount.lastSlots || 0, drednotAccount.lastSlots || 0),
            smelting: drednotAccount.smelting || discordAccount.smelting,
            activeBuffs: (drednotAccount.activeBuffs || []).concat(discordAccount.activeBuffs || []),
            discordId: discordId,
            drednotName: drednotName,
            displayName: null,
            wasBumped: false,
            traits: drednotAccount.traits,
            zeal: drednotAccount.zeal
        };
        for (const itemId in discordAccount.inventory) {
            mergedData.inventory[itemId] = (mergedData.inventory[itemId] || 0) + discordAccount.inventory[itemId];
        }
        await economyCollection.updateOne({ _id: drednotNameLower }, { $set: mergedData }, { session });
        await economyCollection.deleteOne({ _id: discordId }, { session });
        await session.commitTransaction();
        console.log(`Successfully merged (via transaction) Discord account ${discordId} into Drednot account ${drednotName}`);
        return { success: true, message: `✅ Merge successful! Your Discord and Drednot progress have been combined.` };
    } catch (error) {
        console.error("Account merge transaction failed. Aborting.", error.message);
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        if (error.message.startsWith("Merge Conflict:")) {
            const reason = error.message.split(": ")[1];
            return { success: false, message: `❌ Merge Failed: ${reason}. Please wait for jobs to finish or contact an admin.` };
        }
        return { success: false, message: "❌ An unexpected error occurred during the account merge. Please try again." };
    } finally {
        await session.endSession();
    }
}

async function handleEat(account, foodName) {
    const economyCollection = getEconomyCollection();
    const foodId = getItemIdByName(foodName);
    if (!foodId) return { success: false, message: `Could not find a food named "${foodName}".` };
    const itemDef = ITEMS[foodId];
    if (itemDef.type !== 'food') return { success: false, message: `You can't eat a ${itemDef.name}!` };
    if (!itemDef.buff) return { success: false, message: `${itemDef.name} provides no special effect when eaten.` };
    if (!account.inventory[foodId] || account.inventory[foodId] < 1) return { success: false, message: `You don't have any ${itemDef.name} in your inventory.` };

    await modifyInventory(account._id, foodId, -1);
    const now = Date.now();
    let activeBuffs = (account.activeBuffs || []).filter(b => b.expiresAt > now);
    const existingBuffIndex = activeBuffs.findIndex(b => b.itemId === foodId);

    if (existingBuffIndex !== -1) {
        const remainingDuration = activeBuffs[existingBuffIndex].expiresAt - now;
        activeBuffs[existingBuffIndex].expiresAt = now + remainingDuration + itemDef.buff.duration_ms;
        await updateAccount(account._id, { activeBuffs: activeBuffs });
    } else {
        const newBuff = { itemId: foodId, expiresAt: now + itemDef.buff.duration_ms, effects: itemDef.buff.effects };
        await economyCollection.updateOne({ _id: account._id }, { $push: { activeBuffs: newBuff } });
    }

    let effectDescriptions = [];
    if (itemDef.buff?.effects) {
        if (itemDef.buff.effects.gather_cooldown_reduction_ms) effectDescriptions.push(`gather cooldown reduced by ${itemDef.buff.effects.gather_cooldown_reduction_ms / 1000}s`);
        if (itemDef.buff.effects.work_cooldown_reduction_ms) effectDescriptions.push(`work cooldown reduced by ${itemDef.buff.effects.work_cooldown_reduction_ms / 1000}s`);
        if (itemDef.buff.effects.work_bonus_percent) {
            const verb = itemDef.buff.effects.work_bonus_percent > 0 ? 'increased' : 'decreased';
            effectDescriptions.push(`work earnings ${verb} by ${Math.abs(itemDef.buff.effects.work_bonus_percent * 100)}%`);
        }
        if (itemDef.buff.effects.work_double_or_nothing) effectDescriptions.push(`your work earnings are now double or nothing`);
    }

    const durationText = formatDuration(itemDef.buff.duration_ms / 1000);
    const effectsText = effectDescriptions.length > 0 ? `Your ${effectDescriptions.join(', ')}.` : '';
    return { success: true, message: `You eat the **${itemDef.name}**. ${effectsText} This effect will last for **${durationText}**!` };
}

async function handleCrateShop() {
    const lootboxCollection = getLootboxCollection();
    const listings = await lootboxCollection.find().sort({ lootboxId: 1 }).toArray();
    if (listings.length === 0) {
        return { success: false, lines: [`The Collector has no crates for sale right now.`] };
    }
    const formattedLines = listings.filter(l => LOOTBOXES[l.lootboxId]).map(l => {
        const crate = LOOTBOXES[l.lootboxId];
        return `${crate.emoji} **${l.quantity}x** ${crate.name} @ **${crate.price}** ${CURRENCY_NAME} ea.`;
    });
    if (formattedLines.length === 0) {
        return { success: false, lines: [`The Collector's stock is being updated. Please check back in a moment.`] };
    }
    return { success: true, lines: formattedLines };
}

function handleInventory(account, filter = null) {
    if (!account.inventory || Object.keys(account.inventory).length === 0) return 'Your inventory is empty.';
    let invList = [];
    const filterLower = filter ? filter.toLowerCase() : null;
    for (const itemId in account.inventory) {
        if (account.inventory[itemId] > 0) {
            const item = ITEMS[itemId];
            if (!item) continue;
            if (!filterLower || item.name.toLowerCase().includes(filterLower)) {
                invList.push(`> ${item.emoji || '❓'} **${account.inventory[itemId]}x** ${item.name}`);
            }
        }
    }
    if (invList.length === 0) return `You have no items matching "${filter}".`;
    return invList.join('\n');
}

async function handleLeaderboard() {
    const economyCollection = getEconomyCollection();
    const allPlayers = await economyCollection.find({}).sort({ balance: -1 }).toArray();
    const updatePromises = [];
    for (const player of allPlayers) {
        if (!player.drednotName && !player.discordId) {
            console.log(`[Self-Heal] Found old account format for player: ${player._id}. Fixing...`);
            player.drednotName = player._id;
            updatePromises.push(economyCollection.updateOne({ _id: player._id }, { $set: { drednotName: player._id } }));
        }
    }
    if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`[Self-Heal] Finished fixing ${updatePromises.length} old accounts.`);
    }

    const linkedDiscordIds = new Set(allPlayers.filter(p => p.discordId && p.drednotName).map(p => p.discordId));
    const topPlayers = allPlayers.filter(player => {
        if (!player.drednotName && player.discordId) {
            return !linkedDiscordIds.has(player.discordId);
        }
        return true;
    }).slice(0, 50);

    if (topPlayers.length === 0) {
        return { success: false, lines: ["The leaderboard is empty!"] };
    }

    const lines = topPlayers.map((player, index) => {
        const name = player.drednotName || player.displayName || `User ${player._id}`;
        return `${index + 1}. **${name}** - ${Math.floor(player.balance)} ${CURRENCY_NAME}`;
    });
    return { success: true, lines: lines };
}

async function handleMarket(filter = null) {
    const marketCollection = getMarketCollection();
    const economyCollection = getEconomyCollection();
    let query = {};
    const filterLower = filter ? filter.toLowerCase().trim() : null;
    if (filterLower) {
        const itemIds = Object.keys(ITEMS).filter(k => ITEMS[k].name.toLowerCase().includes(filterLower));
        if (itemIds.length === 0) {
            return { success: false, lines: [`No market listings found matching "${filter}".`] };
        }
        query.itemId = { $in: itemIds };
    }

    const allListings = await marketCollection.find(query).toArray();
    if (allListings.length === 0) {
        const message = filter ? `No market listings found matching "${filter}".` : "The market is empty.";
        return { success: false, lines: [message] };
    }

    const sellerIds = [...new Set(allListings.map(l => l.sellerId).filter(id => !id.startsWith('NPC_')))];
    const sellerAccounts = await economyCollection.find({ _id: { $in: sellerIds } }).toArray();
    const sellerNameMap = new Map();
    for (const acc of sellerAccounts) {
        sellerNameMap.set(acc._id, acc.drednotName || acc.displayName || `User ${acc._id}`);
    }

    const npcListings = allListings.filter(l => l.sellerId.startsWith('NPC_')).sort((a, b) => a.price - b.price);
    const playerListings = allListings.filter(l => !l.sellerId.startsWith('NPC_'));
    const shuffledPlayerListings = shuffleArray(playerListings);
    const finalList = [...shuffledPlayerListings, ...npcListings];

    const brokenListings = finalList.filter(l => l.listingId == null);
    if (brokenListings.length > 0) {
        console.log(`[Self-Heal] Found ${brokenListings.length} broken market listings. Repairing now...`);
        for (const listing of brokenListings) {
            const newId = await findNextAvailableListingId(marketCollection);
            await marketCollection.updateOne({ _id: listing._id }, { $set: { listingId: newId } });
            listing.listingId = newId;
        }
    }

    const formattedLines = finalList.map(l => {
        const sellerName = l.sellerId.startsWith('NPC_') ? l.sellerName : (sellerNameMap.get(l.sellerId) || l.sellerName);
        return `(ID: ${l.listingId}) ${ITEMS[l.itemId]?.emoji || '📦'} **${l.quantity}x** ${ITEMS[l.itemId].name} @ **${l.price}** ${CURRENCY_NAME} ea. by *${sellerName}*`;
    });
    return { success: true, lines: formattedLines };
}

// --- NEW ---
async function handleClanWar() {
    const clans = getClansCollection();
    const serverState = getServerStateCollection();
    const warState = await serverState.findOne({ stateKey: "clan_war" });

    if (!warState || new Date() > warState.warEndTime) {
        return { success: false, message: "There is no clan war currently active." };
    }

    const topClans = await clans.find({ warPoints: { $gt: 0 } }).sort({ warPoints: -1 }).limit(10).toArray();

    if (topClans.length === 0) {
        return { success: true, message: "The clan war is active, but no clan has scored any points yet!" };
    }

    const timeLeft = formatDuration((warState.warEndTime.getTime() - Date.now()) / 1000);
    const header = `**Clan War: The Endless Conflict**\n\`----Time left: ${timeLeft}------\``;
    const medals = ['🏆', '🥈', '🥉'];
    const lines = topClans.map((clan, index) => {
        const medal = index < 3 ? `${medals[index]} ` : '';
        return `\`#${index + 1}.\` ${medal}\`[${clan.tag}] ${clan.name}\` - **${clan.warPoints.toLocaleString()}** Points`;
    });
    return { success: true, message: `${header}\n${lines.join('\n')}` };
}

module.exports = {
    handleItemInfo,
    handleRecipes,
    handleCraft,
    handleSmelt,
    handleTimers,
    handleWork,
    handleGather,
    handleHourly,
    handleDaily,
    handleFlip,
    handleSlots,
    handlePay,
    handleAccountMerge,
    handleEat,
    handleCrateShop,
    handleInventory,
    handleLeaderboard,
    handleMarket,
    handleClanWar, // <-- NEW
};
