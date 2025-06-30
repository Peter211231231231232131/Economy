// /handlers/apiHandler.js

const commandHandlers = require('./commandHandlers');
const clanHandlers = require('./clanHandlers');
const { getAccount, createNewAccount, selfHealAccount, getPaginatedResponse, toBoldFont, getItemIdByName, modifyInventory, findNextAvailableListingId, rollNewTrait, secureRandomFloat } = require('../utils/utilities');
const { getEconomyCollection, getVerificationsCollection, getMarketCollection, getLootboxCollection } = require('../utils/database');
const { CURRENCY_NAME, STARTING_BALANCE, DISCORD_INVITE_LINK, ITEMS, TRAITS, MARKET_TAX_RATE, LOOTBOXES } = require('../config');
const { getCurrentGlobalEvent } = require('../utils/tickers');

const YOUR_API_KEY = 'drednot123';

async function handleApiCommand(req, res) {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== YOUR_API_KEY) {
            return res.status(401).send('Error: Invalid API key');
        }

        const { command, username, args } = req.body;
        if (!command || !username) {
            return res.status(400).json({ reply: "Invalid request body." });
        }

        const economyCollection = getEconomyCollection();
        const marketCollection = getMarketCollection();
        const lootboxCollection = getLootboxCollection();
        const verificationsCollection = getVerificationsCollection();

        const identifier = username.toLowerCase();
        let responseMessage = '';

        if (command === 'verify') {
            const code = args[0];
            const verificationData = await verificationsCollection.findOneAndDelete({ _id: code });
            if (!verificationData) { responseMessage = 'That verification code is invalid, expired, or has already been used.'; }
            else if (Date.now() - verificationData.timestamp > 5 * 60 * 1000) { responseMessage = 'That verification code has expired.'; }
            else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) { responseMessage = 'This verification code is for a different Drednot user and has now been invalidated.'; }
            else {
                const mergeResult = await commandHandlers.handleAccountMerge(verificationData.discordId, verificationData.drednotName);
                responseMessage = mergeResult.message;
            }
            return res.json({ reply: responseMessage });
        }

        const { userPaginationData } = require('../utils/utilities');
        if (['n', 'next', 'p', 'previous'].includes(command)) {
            const session = userPaginationData[identifier];
            if (!session) return res.json({ reply: 'You have no active list to navigate.' });
            const pageChange = (command.startsWith('n')) ? 1 : -1;
            const { game } = getPaginatedResponse(identifier, session.type, session.lines, session.title, pageChange);
            return res.json({ reply: game.map(line => cleanText(line)) });
        }

        let account = await getAccount(username);
        if (!account) {
            const conflictingDiscordUser = await economyCollection.findOne({ displayName: new RegExp(`^${username}$`, 'i') });
            if (conflictingDiscordUser) {
                console.log(`[Name Bump] Drednot user "${username}" is claiming a name from Discord user ${conflictingDiscordUser._id}.`);
                await economyCollection.updateOne({ _id: conflictingDiscordUser._id }, { $set: { displayName: null, wasBumped: true } });
            }
            account = await createNewAccount(username, 'drednot');
            const welcomeMessage = [`Welcome! Your new economy account "${username}" has been created...`, `Join the Discord:`, `${DISCORD_INVITE_LINK}`];
            return res.json({ reply: welcomeMessage });
        } else {
            account = await selfHealAccount(account);
        }

        const cleanText = (text) => {
            let processedText = Array.isArray(text) ? text.map(t => String(t)).join('\n') : String(text);
            processedText = processedText.replace(/\*\*([^*]+)\*\*/g, (match, p1) => toBoldFont(p1));
            return processedText.replace(/`|>/g, '').replace(/<a?:.+?:\d+>/g, '').replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, '');
        };
        let result;

        switch (command) {
            case 'clan': {
                const subCommand = args[0]?.toLowerCase() || 'help';
                const clanArgs = args.slice(1);
                let clanResult;

                switch (subCommand) {
                    case 'create':
                        if (clanArgs.length < 1) { clanResult = { message: "Usage: !clan create <name>" }; break; }
                        const clanNameOnly = clanArgs.join(' ');
                        clanResult = await clanHandlers.handleClanCreate(account, clanNameOnly);
                        break;
                    case 'leave': clanResult = await clanHandlers.handleClanLeave(account); break;
                    case 'disband': clanResult = await clanHandlers.handleClanDisband(account); break;
                    case 'kick':
                        if (!clanArgs[0]) { clanResult = { message: "Usage: !clan kick <username>" }; break; }
                        const targetAccKick = await getAccount(clanArgs.join(' '));
                        if (!targetAccKick) clanResult = { message: "Player not found." };
                        else clanResult = await clanHandlers.handleClanKick(account, targetAccKick);
                        break;
                    case 'recruit':
                        if (!clanArgs[0]) { clanResult = { message: "Usage: !clan recruit <1|2>" }; break; }
                        clanResult = await clanHandlers.handleClanRecruit(account, clanArgs[0]);
                        break;
                    case 'upgrade': clanResult = await clanHandlers.handleClanUpgrade(account); break;
                    case 'donate':
                        const amount = parseInt(clanArgs[0], 10);
                        clanResult = await clanHandlers.handleClanDonate(account, amount);
                        break;
                    case 'info':
                        if (!clanArgs[0]) { clanResult = { message: "Usage: !clan info <code>" }; break; }
                        clanResult = await clanHandlers.handleClanInfo(clanArgs[0]);
                        break;
                    case 'list':
                        clanResult = await clanHandlers.handleClanList();
                        if (clanResult.success) {
                            const paginated = getPaginatedResponse(identifier, 'clan_list', clanResult.lines, 'Clan Browser', 0);
                            return res.json({ reply: paginated.game.map(line => cleanText(line)) });
                        }
                        break;
                    case 'war':
                        clanResult = await commandHandlers.handleClanWar();
                        break;
                    case 'join':
                        if (!clanArgs[0]) { clanResult = { message: "Usage: !clan join <code>" }; break; }
                        clanResult = await clanHandlers.handleClanJoin(account, clanArgs[0]);
                        break;
                    case 'invite':
                        const targetName = clanArgs.join(' ');
                        if (targetName) {
                            const targetAccInv = await getAccount(targetName);
                            if (!targetAccInv) clanResult = { message: "Player not found." };
                            else clanResult = await clanHandlers.handleClanInvite(account, targetAccInv);
                        } else {
                            clanResult = await clanHandlers.handleClanInvite(account, account.clanId ? 'view' : null);
                        }
                        break;
                    case 'accept':
                        if (!clanArgs[0]) { clanResult = { message: "Usage: !clan accept <user_or_code>" }; break; }
                        clanResult = await clanHandlers.handleClanAccept(account, clanArgs[0]);
                        break;
                    case 'decline':
                        if (!clanArgs[0]) { clanResult = { message: "Usage: !clan decline <code>" }; break; }
                        clanResult = await clanHandlers.handleClanDecline(account, clanArgs[0]);
                        break;
                    default:
                         clanResult = { message: `Unknown clan command. Use !clan list, !info, etc.` };
                }
                responseMessage = clanResult.message || (clanResult.lines ? clanResult.lines.join('\n') : 'An error occurred.');
                break;
            }
            case 'info':
                if (args.length === 0) { responseMessage = "Usage: !info <item/trait name>"; break; }
                const name = args.join(' ');
                const itemId = getItemIdByName(name);
                const traitId = Object.keys(TRAITS).find(k => TRAITS[k].name.toLowerCase() === name.toLowerCase());
                if (itemId) { responseMessage = cleanText(commandHandlers.handleItemInfo(itemId)); } 
                else if (traitId) {
                    const trait = TRAITS[traitId];
                    let effectText = '';
                    switch (traitId) { case 'scavenger': effectText = `Grants a 5% chance per level to find bonus resources from /work.`; break; case 'prodigy': effectText = `Reduces /work and /gather cooldowns by 5% per level.`; break; case 'wealth': effectText = `Increases Bits earned from /work by 5% per level.`; break; case 'surveyor': effectText = `Grants a 2% chance per level to double your entire haul from /gather.`; break; case 'collector': effectText = `Increases the bonus reward for first-time crafts by 20% per level.`; break; case 'the_addict': effectText = `After losing a gamble, boosts your next /work by a % based on wealth lost, multiplied by 50% per level.`; break; case 'zealot': effectText = `Each 'Zeal' stack boosts rewards by 2.5% per level. Stacks decay after 10 minutes.`; break; default: effectText = trait.description.replace(/{.*?}/g, '...'); }
                    responseMessage = [`Trait: ${trait.name} (${trait.rarity})`, effectText, `Max Level: ${trait.maxLevel}`].join('\n');
                } else { responseMessage = `Could not find an item or trait named "${name}".`; }
                break;
            case 'traits':
                let traitMessage = `Your Traits:\n`;
                if (account.traits && account.traits.slots) {
                    for (const trait of account.traits.slots) { const t = TRAITS[trait.name]; traitMessage += `> ${t.name} (Level ${trait.level}) - ${t.rarity}\n`; }
                } else { traitMessage = "You have no traits yet."; }
                responseMessage = cleanText(traitMessage);
                break;
            case 'traitroll':
                if ((account.inventory['trait_reforger'] || 0) < 1) { responseMessage = `You need a Trait Reforger to do this.`; }
                else {
                    await modifyInventory(username, 'trait_reforger', -1);
                    const newTraits = [rollNewTrait(), rollNewTrait()];
                    await updateAccount(account._id, { 'traits.slots': newTraits });
                    let rollMessage = `You consumed a Trait Reforger and received:\n`;
                    for (const trait of newTraits) { const t = TRAITS[trait.name]; rollMessage += `> ${t.name} (Level ${trait.level}) - ${t.rarity}\n`; }
                    responseMessage = cleanText(rollMessage);
                }
                break;
            case 'eat':
                if (args.length === 0) { responseMessage = "Usage: !eat <food name>"; break; }
                const foodName = args.join(' ');
                result = await commandHandlers.handleEat(account, foodName);
                responseMessage = cleanText(result.message);
                break;
            case 'm': case 'market':
                const marketFilter = args.length > 0 ? args.join(' ') : null;
                result = await commandHandlers.handleMarket(marketFilter);
                if (!result.success) { responseMessage = result.lines[0]; break; }
                const marketPage = getPaginatedResponse(identifier, 'market', result.lines, marketFilter ? `Market (Filter: ${marketFilter})` : "Market", 0);
                responseMessage = marketPage.game.map(line => cleanText(line));
                break;
            case 'lb': case 'leaderboard':
                result = await commandHandlers.handleLeaderboard();
                if (!result.success) { responseMessage = result.lines[0]; break; }
                const lbPage = getPaginatedResponse(identifier, 'leaderboard', result.lines, "Leaderboard", 0);
                responseMessage = lbPage.game.map(line => cleanText(line));
                break;
            case 'recipes':
                const recipeLines = (await commandHandlers.handleRecipes()).split('\n');
                const recipeTitle = recipeLines.shift();
                result = getPaginatedResponse(identifier, 'recipes', recipeLines, recipeTitle, 0);
                responseMessage = result.game.map(line => cleanText(line));
                break;
            case 'bal': case 'balance':
                responseMessage = `Your balance is: **${Math.floor(account.balance)}** ${CURRENCY_NAME}.`;
                break;
            case 'work':
                result = await commandHandlers.handleWork(account);
                responseMessage = result.message;
                break;
            case 'gather':
                result = await commandHandlers.handleGather(account);
                responseMessage = result.message;
                break;
            case 'daily':
                result = await commandHandlers.handleDaily(account);
                responseMessage = result.message;
                break;
            case 'hourly':
                result = await commandHandlers.handleHourly(account);
                responseMessage = result.message;
                break;
            case 'inv': case 'inventory':
                const invFilter = args.length > 0 ? args.join(' ') : null;
                responseMessage = cleanText(commandHandlers.handleInventory(account, invFilter));
                break;
            case 'craft': {
                if (args.length === 0) { responseMessage = "Usage: !craft <item name> [quantity]"; break; }
                let quantity = 1; let itemName;
                const lastArg = args[args.length - 1];
                if (!isNaN(parseInt(lastArg)) && parseInt(lastArg) > 0) {
                    quantity = parseInt(lastArg);
                    itemName = args.slice(0, -1).join(' ');
                } else {
                    itemName = args.join(' ');
                }
                let craftResult = await commandHandlers.handleCraft(account, itemName, quantity);
                responseMessage = craftResult.message.replace('`/recipes`', '`!recipes`');
                break;
            }
            case 'flip':
                if (args.length < 2) { responseMessage = "Usage: !flip <amount> <h/t>"; break; }
                const flipAmount = parseInt(args[0]);
                if (isNaN(flipAmount) || flipAmount <= 0) { responseMessage = "Please enter a valid, positive amount."; break; }
                result = await commandHandlers.handleFlip(account, flipAmount, args[1].toLowerCase());
                responseMessage = result.message;
                break;
            case 'slots':
                if (args.length < 1) { responseMessage = "Usage: !slots <amount>"; break; }
                const slotsAmount = parseInt(args[0]);
                if (isNaN(slotsAmount) || slotsAmount <= 0) { responseMessage = "Please enter a valid, positive amount."; break; }
                result = await commandHandlers.handleSlots(account, slotsAmount);
                responseMessage = result.message;
                break;
            case 'timers':
                result = await commandHandlers.handleTimers(account);
                responseMessage = [`--- ${toBoldFont('Your Cooldowns')} ---`, ...result];
                break;
            case 'smelt':
                if (args.length < 1) { responseMessage = "Usage: !smelt <item name> [quantity]"; break; }
                const quantitySmelt = args.length > 1 && !isNaN(parseInt(args[args.length - 1])) ? parseInt(args.pop()) : 1;
                const itemNameSmelt = args.join(' ');
                result = await commandHandlers.handleSmelt(account, itemNameSmelt, quantitySmelt);
                responseMessage = result.message;
                break;
            case 'pay':
                if (args.length < 2) { responseMessage = "Usage: !pay <username> <amount>"; break; }
                const amountToPay = parseInt(args[args.length - 1]);
                if (!isFinite(account.balance)) { responseMessage = 'Your account balance is corrupted.'; break; }
                if (isNaN(amountToPay) || amountToPay <= 0) { responseMessage = "Please enter a valid, positive amount."; break; }
                const recipientName = args.slice(0, -1).join(' ');
                const recipientAccount = await getAccount(recipientName);
                if (!recipientAccount) { responseMessage = `Could not find a player named "${recipientName}".`; }
                else { result = await commandHandlers.handlePay(account, recipientAccount, amountToPay); responseMessage = result.message; }
                break;
            case 'ms': case 'marketsell':
                if (args.length < 3) { responseMessage = "Usage: !marketsell [item] [qty] [price]"; break; }
                const itemNameMs = args.slice(0, -2).join(' '); const qtyMs = parseInt(args[args.length - 2]); const priceMs = parseFloat(args[args.length - 1]);
                const itemIdMs = getItemIdByName(itemNameMs);
                if (!itemIdMs || isNaN(qtyMs) || isNaN(priceMs) || qtyMs <= 0 || priceMs <= 0) { responseMessage = "Invalid format."; break; }
                const msUpdateResult = await economyCollection.findOneAndUpdate({ _id: account._id, [`inventory.${itemIdMs}`]: { $gte: qtyMs } }, { $inc: { [`inventory.${itemIdMs}`]: -qtyMs } });
                if (!msUpdateResult) { responseMessage = "You don't have enough of that item."; break; }
                try {
                    const newListingId = await findNextAvailableListingId(marketCollection);
                    const sellerName = account.drednotName || account.displayName || account._id;
                    await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: sellerName, itemId: itemIdMs, quantity: qtyMs, price: priceMs });
                    responseMessage = `Listed ${qtyMs}x ${ITEMS[itemIdMs].name}. ID: **${newListingId}**`;
                } catch (error) {
                    await modifyInventory(account._id, itemIdMs, qtyMs);
                    console.error("Failed to list item via in-game command:", error);
                    responseMessage = "An unexpected error occurred. Items returned.";
                }
                break;
            case 'mb': case 'marketbuy':
                if (args.length < 1) { responseMessage = "Usage: !marketbuy [listing_id]"; break; }
                const listingIdMb = parseInt(args[0]);
                if (isNaN(listingIdMb)) { responseMessage = "Listing ID must be a number."; break; }
                const listingToBuyMb = await marketCollection.findOneAndDelete({ listingId: listingIdMb });
                if (!listingToBuyMb) { responseMessage = 'That listing does not exist or was just purchased.'; break; }
                if (listingToBuyMb.sellerId === account._id) { await marketCollection.insertOne(listingToBuyMb); responseMessage = "You can't buy your own listing."; break; }
                const totalCostMb = Math.round(listingToBuyMb.quantity * listingToBuyMb.price);
                const mbPurchaseResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: totalCostMb } }, { $inc: { balance: -totalCostMb } });
                if (mbPurchaseResult.modifiedCount === 0) {
                    await marketCollection.insertOne(listingToBuyMb);
                    responseMessage = "You can't afford this.";
                    break;
                }
                await modifyInventory(account._id, listingToBuyMb.itemId, listingToBuyMb.quantity);
                const sellerAccountMb = await getAccount(listingToBuyMb.sellerId);
                if (sellerAccountMb) {
                    const currentGlobalEvent = getCurrentGlobalEvent();
                    let taxRate = MARKET_TAX_RATE;
                    if (currentGlobalEvent && currentGlobalEvent.effect.type === 'market_tax') { taxRate = currentGlobalEvent.effect.rate; }
                    const earnings = Math.round(totalCostMb * (1 - taxRate));
                    await economyCollection.updateOne({ _id: sellerAccountMb._id }, { $inc: { balance: earnings } });
                }
                const sellerNameMb = sellerAccountMb ? (sellerAccountMb.drednotName || sellerAccountMb.displayName || `User ${sellerAccountMb._id}`) : listingToBuyMb.sellerName;
                responseMessage = `You bought **${listingToBuyMb.quantity}x** ${ITEMS[listingToBuyMb.itemId].name} for **${totalCostMb}** ${CURRENCY_NAME} from ${sellerNameMb}!`;
                break;
            case 'mc': case 'marketcancel':
                if (args.length < 1) { responseMessage = "Usage: !marketcancel [listing_id]"; break; }
                const listingIdMc = parseInt(args[0]);
                if (isNaN(listingIdMc)) { responseMessage = "Listing ID must be a number."; break; }
                const listingToCancel = await marketCollection.findOneAndDelete({ listingId: listingIdMc, sellerId: account._id });
                if (!listingToCancel) { responseMessage = "This is not your listing or it does not exist."; }
                else {
                    await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity);
                    responseMessage = `Cancelled your listing for **${listingToCancel.quantity}x** ${ITEMS[listingToCancel.itemId].name}.`;
                }
                break;
            case 'cs':
                result = await commandHandlers.handleCrateShop();
                if (!result.success) { responseMessage = result.lines[0]; break; }
                const csPage = getPaginatedResponse(identifier, 'crateshop', result.lines, "The Collector's Crates", 0);
                responseMessage = csPage.game.map(line => cleanText(line));
                break;
            case 'csb': case 'crateshopbuy':
                if (args.length < 2) { responseMessage = "Usage: !csb [crate name] [amount]"; break; }
                const amountToOpen = parseInt(args[args.length - 1]);
                const crateNameToOpen = args.slice(0, -1).join(' ');
                if (isNaN(amountToOpen) || amountToOpen <= 0) { responseMessage = "Please enter a valid amount to open."; break; }
                const crateId = Object.keys(LOOTBOXES).find(k => LOOTBOXES[k].name.toLowerCase() === crateNameToOpen.toLowerCase());
                if (!crateId) { responseMessage = `The Collector doesn't sell a crate named "${crateNameToOpen}". Check the !cs shop.`; break; }
                const listingUpdateResult = await lootboxCollection.findOneAndUpdate({ lootboxId: crateId, quantity: { $gte: amountToOpen } }, { $inc: { quantity: -amountToOpen } });
                if (!listingUpdateResult) { responseMessage = `The Collector doesn't have enough of that crate, or it was just purchased.`; break; }
                const listing = listingUpdateResult;
                const totalCostCrate = listing.price * amountToOpen;
                const csbPurchaseResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: totalCostCrate } }, { $inc: { balance: -totalCostCrate } });
                if (csbPurchaseResult.modifiedCount === 0) {
                    await lootboxCollection.updateOne({ _id: listing._id }, { $inc: { quantity: amountToOpen } });
                    responseMessage = `You can't afford that. It costs **${totalCostCrate}** ${CURRENCY_NAME}.`;
                    break;
                }
                const { openLootbox } = require('../utils/utilities');
                let crateUpdates = { $inc: {} };
                let totalRewards = {};
                for (let i = 0; i < amountToOpen; i++) {
                    const reward = openLootbox(listing.lootboxId);
                    if (reward.type === 'bits') { totalRewards.bits = (totalRewards.bits || 0) + reward.amount; }
                    else { totalRewards[reward.id] = (totalRewards[reward.id] || 0) + reward.amount; }
                }
                let rewardMessages = [];
                for (const rewardId in totalRewards) {
                    if (rewardId === 'bits') {
                        crateUpdates.$inc.balance = (crateUpdates.$inc.balance || 0) + totalRewards[rewardId];
                        rewardMessages.push(`**${totalRewards[rewardId]}** ${CURRENCY_NAME}`);
                    } else {
                        crateUpdates.$inc[`inventory.${rewardId}`] = (crateUpdates.$inc[`inventory.${rewardId}`] || 0) + totalRewards[rewardId];
                        rewardMessages.push(`${ITEMS[rewardId].emoji} **${totalRewards[rewardId]}x** ${ITEMS[rewardId].name}`);
                    }
                }
                await economyCollection.updateOne({ _id: account._id }, crateUpdates);
                await lootboxCollection.deleteMany({ quantity: { $lte: 0 } });
                responseMessage = `You opened **${amountToOpen}x** ${LOOTBOXES[listing.lootboxId].name} and received: ${rewardMessages.join(', ')}!`;
                break;
            default:
                responseMessage = `Unknown command: !${command}`;
        }

        res.json({ reply: cleanText(responseMessage) });
    } catch (error) {
        console.error(`[API-ERROR] An error occurred while processing command "${req.body.command}" for user "${req.body.username}":`, error);
        res.status(500).json({ reply: "An internal server error occurred." });
    }
}

module.exports = { handleApiCommand };
