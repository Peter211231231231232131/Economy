// /handlers/apiHandler.js (Corrected Final Version)

const commandHandlers = require('./commandHandlers');
const clanHandlers = require('./clanHandlers');
const { getAccount, createNewAccount, selfHealAccount, getPaginatedResponse, toBoldFont, getItemIdByName, modifyInventory, findNextAvailableListingId, rollNewTrait, secureRandomFloat } = require('../utils/utilities');
const { getEconomyCollection, getVerificationsCollection, getMarketCollection, getLootboxCollection } = require('../utils/database');
const { CURRENCY_NAME, STARTING_BALANCE, DISCORD_INVITE_LINK, ITEMS, TRAITS, MARKET_TAX_RATE, LOOTBOXES } = require('../config');
const { getCurrentGlobalEvent } = require('../utils/tickers');

const YOUR_API_KEY = 'drednot123';

// --- THIS IS NOW A TOP-LEVEL FUNCTION ---
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
            if (!verificationData) {
                responseMessage = 'That verification code is invalid, expired, or has already been used.';
            } else if (Date.now() - verificationData.timestamp > 5 * 60 * 1000) {
                responseMessage = 'That verification code has expired.';
            } else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) {
                responseMessage = 'This verification code is for a different Drednot user and has now been invalidated.';
            } else {
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
            const welcomeMessage = [`Welcome! Your new economy account "${username}" has been created with ${STARTING_BALANCE} Bits...`, `Join the Discord:`, `${DISCORD_INVITE_LINK}`];
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

        if (command === 'clan') {
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
            return res.json({ reply: cleanText(responseMessage) });
        }

        switch (command) {
            case 'info':
                if (args.length === 0) { responseMessage = "Usage: !info <item/trait name>"; break; }
                const name = args.join(' ');
                const itemId = getItemIdByName(name);
                const traitId = Object.keys(TRAITS).find(k => TRAITS[k].name.toLowerCase() === name.toLowerCase());
                if (itemId) { responseMessage = cleanText(commandHandlers.handleItemInfo(itemId)); } 
                else if (traitId) {
                    const trait = TRAITS[traitId];
                    let effectText = '';
                    switch (traitId) { case 'scavenger': effectText = `Grants a 5% chance per level...`; break; default: effectText = trait.description.replace(/{.*?}/g, '...'); }
                    responseMessage = [`Trait: ${trait.name} (${trait.rarity})`, effectText, `Max Level: ${trait.maxLevel}`].join('\n');
                } else { responseMessage = `Could not find an item or trait named "${name}".`; }
                break;
            // ... (All other command cases remain the same) ...
            default:
                responseMessage = `Unknown command: !${command}`;
        }
        
        // This handles simple cases where 'result' is set
        if (result) {
            responseMessage = result.message;
        }

        res.json({ reply: cleanText(responseMessage) });
    } catch (error) {
        console.error(`[API-ERROR] An error occurred while processing command "${req.body.command}" for user "${req.body.username}":`, error);
        res.status(500).json({ reply: "An internal server error occurred." });
    }
}

// THIS IS THE CRITICAL LINE THAT WAS MISSING/WRONG
module.exports = { handleApiCommand };
