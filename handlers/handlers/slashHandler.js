// /handlers/slashHandler.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAccount, createNewAccount, selfHealAccount, modifyInventory, getItemIdByName, getPaginatedResponse, rollNewTrait, openLootbox } = require('../utils/utilities');
const commandHandlers = require('./commandHandlers');
const { getEconomyCollection, getMarketCollection, getLootboxCollection, getVerificationsCollection } = require('../utils/database');
const { ITEMS, TRAITS, STARTING_BALANCE, DREDNOT_INVITE_LINK, MARKET_TAX_RATE } = require('../config');
const { getCurrentGlobalEvent } = require('../utils/tickers');

async function handleButtonInteraction(interaction) {
    if (interaction.customId.startsWith('paginate_')) {
        const [action, type, userId] = interaction.customId.split('_');
        if (interaction.user.id !== userId) {
            return interaction.reply({ content: "You cannot use these buttons.", ephemeral: true });
        }
        const { userPaginationData } = require('../utils/utilities'); // re-require to get current state
        const session = userPaginationData[userId];
        if (!session) {
            return interaction.update({ content: 'This interactive message has expired or is invalid.', components: [] });
        }
        const pageChange = (type === 'next') ? 1 : -1;
        const { discord } = getPaginatedResponse(userId, session.type, session.lines, session.title, pageChange);
        await interaction.update(discord);
        return;
    }
    if (interaction.customId === 'guide_link_account') {
        const guideMessage = "To link your account, please type `/link` in the chat, select the command, and then enter your exact in-game Drednot name in the `drednot_name` option.";
        await interaction.reply({ content: guideMessage, ephemeral: true });
        return;
    }
}

async function handleAutocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    let choices = [];

    if (interaction.commandName === 'craft') {
        choices = Object.values(ITEMS).filter(i => i.craftable).map(i => i.name);
    } else if (interaction.commandName === 'eat') {
        choices = Object.values(ITEMS).filter(i => i.type === 'food' && i.buff).map(i => i.name);
    } else if (interaction.commandName === 'info') {
        const itemNames = Object.values(ITEMS).map(i => i.name);
        const traitNames = Object.values(TRAITS).map(t => t.name);
        choices = [...itemNames, ...traitNames];
    } else if (interaction.commandName === 'marketsell' || interaction.commandName === 'smelt') {
        choices = Object.values(ITEMS).map(i => i.name);
    } else if (interaction.commandName === 'crateshopbuy' && focusedOption.name === 'crate_name') {
        const lootboxCollection = getLootboxCollection();
        const currentListings = await lootboxCollection.find({}).toArray();
        const availableCrateIds = new Set(currentListings.map(l => l.lootboxId));
        choices = Object.keys(LOOTBOXES).filter(id => availableCrateIds.has(id)).map(id => LOOTBOXES[id].name);
    }

    const filtered = choices.filter(choice => choice.toLowerCase().startsWith(focusedOption.value.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map(choice => ({ name: choice, value: choice })));
}

async function handleSlashCommand(interaction) {
    try {
        if (interaction.isButton()) return handleButtonInteraction(interaction);
        if (interaction.isAutocomplete()) return handleAutocomplete(interaction);
        if (!interaction.isChatInputCommand()) return;

        const { commandName, user, options } = interaction;
        const privateCommands = ['link', 'name', 'timers', 'inventory', 'balance', 'traits', 'marketcancel'];
        if (privateCommands.includes(commandName)) {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.deferReply();
        }

        let account = await getAccount(user.id);
        let isNewUser = false;
        if (!account) {
            account = await createNewAccount(user.id, 'discord');
            isNewUser = true;
        } else {
            account = await selfHealAccount(account);
        }

        if (account.wasBumped) {
            await updateAccount(user.id, { wasBumped: false });
            const bumpedEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('Display Name Reset!')
                .setDescription("A player from Drednot has registered with the name you were using. Since Drednot names have priority, your display name has been reset.\nPlease use the `/name` command to choose a new, unique display name, or use `/link` to connect your own Drednot account.");
            return interaction.editReply({ embeds: [bumpedEmbed] });
        }

        // --- Command Handling Switch ---
        let result, amount, choice, itemName, quantity, price, listingId;

        switch (commandName) {
            case 'info': {
                const name = options.getString('name');
                const itemId = getItemIdByName(name);
                const traitId = Object.keys(TRAITS).find(k => TRAITS[k].name.toLowerCase() === name.toLowerCase());
                const infoEmbed = new EmbedBuilder().setColor('#3498DB');

                if (itemId) {
                    const itemDef = ITEMS[itemId];
                    infoEmbed.setTitle(`${itemDef.emoji || '📦'} ${itemDef.name}`);
                    if (itemDef.description) infoEmbed.setDescription(itemDef.description);
                    if (itemDef.type) infoEmbed.addFields({ name: 'Type', value: itemDef.type.charAt(0).toUpperCase() + itemDef.type.slice(1), inline: true });
                    if (itemDef.craftable) {
                        const recipeParts = Object.entries(itemDef.recipe).map(([resId, qty]) => `${ITEMS[resId].emoji} ${qty}x ${ITEMS[resId].name}`);
                        infoEmbed.addFields({ name: 'Recipe', value: recipeParts.join('\n'), inline: false });
                    }
                } else if (traitId) {
                    const trait = TRAITS[traitId];
                    let effectText = '';
                    switch (traitId) {
                        case 'scavenger': effectText = `Grants a **5%** chance per level to find bonus resources from /work.`; break;
                        case 'prodigy': effectText = `Reduces /work and /gather cooldowns by **5%** per level.`; break;
                        case 'wealth': effectText = `Increases Bits earned from /work by **5%** per level.`; break;
                        case 'surveyor': effectText = `Grants a **2%** chance per level to double your entire haul from /gather.`; break;
                        case 'collector': effectText = `Increases the bonus reward for first-time crafts by **20%** per level.`; break;
                        case 'the_addict': effectText = `After losing a gamble, boosts your next /work by a % based on wealth lost, multiplied by **50%** per level.`; break;
                        case 'zealot': effectText = `Each 'Zeal' stack boosts rewards by **2.5%** per level. Stacks decay after 10 minutes.`; break;
                        default: effectText = trait.description.replace(/{.*?}/g, '...');
                    }
                    infoEmbed.setTitle(`🧬 ${trait.name} (${trait.rarity})`)
                        .setDescription(effectText)
                        .addFields({ name: 'Max Level', value: String(trait.maxLevel), inline: true });
                } else {
                    infoEmbed.setColor('#ED4245').setTitle('Not Found').setDescription(`Could not find an item or trait named "${name}".`);
                }
                return interaction.editReply({ embeds: [infoEmbed] });
            }
            case 'traits': {
                const sub = options.getSubcommand();
                if (sub === 'view') {
                    const traitEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('🧬 Your Traits').setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });
                    if (account.traits && account.traits.slots) {
                        const traitFields = account.traits.slots.map(trait => {
                            const t = TRAITS[trait.name];
                            return { name: `${t.name} (Level ${trait.level})`, value: `*${t.rarity}*` };
                        });
                        traitEmbed.addFields(traitFields);
                    } else {
                        traitEmbed.setDescription("You have no traits yet.");
                    }
                    return interaction.editReply({ embeds: [traitEmbed] });
                }
                if (sub === 'reroll') {
                    if ((account.inventory['trait_reforger'] || 0) < 1) {
                        const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Missing Item').setDescription('You need a ✨ Trait Reforger to do this. Get them from `/gather`!');
                        return interaction.editReply({ embeds: [errorEmbed] });
                    }
                    await modifyInventory(user.id, 'trait_reforger', -1);
                    const newTraits = [rollNewTrait(), rollNewTrait()];
                    await updateAccount(account._id, { 'traits.slots': newTraits });

                    const successEmbed = new EmbedBuilder().setColor('#57F287').setTitle('✨ Traits Reforged!');
                    const traitFields = newTraits.map(trait => {
                        const t = TRAITS[trait.name];
                        return { name: `${t.name} (Level ${trait.level})`, value: `*${t.rarity}*` };
                    });
                    successEmbed.setDescription('You consumed a Trait Reforger and received:').addFields(traitFields);

                    return interaction.editReply({ embeds: [successEmbed] });
                }
                break;
            }
            case 'market':
            case 'recipes':
            case 'crateshop':
            case 'leaderboard': {
                let handlerResult, title, type;
                if (commandName === 'market') { const filter = options.getString('filter'); handlerResult = await commandHandlers.handleMarket(filter); title = filter ? `Market (Filter: ${filter})` : "Market"; type = 'market'; }
                if (commandName === 'recipes') { const recipeLines = (await commandHandlers.handleRecipes()).split('\n'); title = recipeLines.shift(); handlerResult = { success: true, lines: recipeLines }; type = 'recipes'; }
                if (commandName === 'crateshop') { handlerResult = await commandHandlers.handleCrateShop(); title = "The Collector's Crates"; type = 'crateshop'; }
                if (commandName === 'leaderboard') { handlerResult = await commandHandlers.handleLeaderboard(); title = "Leaderboard"; type = 'leaderboard'; }

                if (!handlerResult.success) return interaction.editReply({ content: handlerResult.lines[0], components: [] });
                const { discord } = getPaginatedResponse(user.id, type, handlerResult.lines, title, 0);
                await interaction.editReply(discord);
                return;
            }
            case 'link': {
                const drednotNameToLink = options.getString('drednot_name');
                if (account.drednotName) {
                    return interaction.editReply({ content: `Your Discord account is already linked to the Drednot account **${account.drednotName}**.` });
                }
                const targetDrednotAccount = await getAccount(drednotNameToLink);
                if (targetDrednotAccount && targetDrednotAccount.discordId) {
                    return interaction.editReply({ content: `The Drednot account **${drednotNameToLink}** is already linked to another Discord user.` });
                }
                const verificationsCollection = getVerificationsCollection();
                const verificationCode = `${Math.floor(1000 + Math.random() * 9000)}`;
                await verificationsCollection.insertOne({ _id: verificationCode, discordId: user.id, drednotName: drednotNameToLink, timestamp: Date.now() });

                let replyMessage = `**Account Verification Started!**\n\n` +
                    `1. **[Click here to join the verification ship!](${DREDNOT_INVITE_LINK})**\n\n` +
                    `2. Once in-game, copy and paste the following command into the chat:\n` +
                    `\`\`\`\n` +
                    `!verify ${verificationCode}\n` +
                    `\`\`\`\n` +
                    `This code expires in 5 minutes.`;

                if (!isNewUser) {
                    replyMessage += `\n\n**Note:** You have progress on this Discord account. Verifying will merge it with your **${drednotNameToLink}** account.`
                }
                await interaction.editReply({ content: replyMessage });
                return;
            }
            case 'name': {
                if (account.drednotName) {
                    return interaction.editReply({ content: `You cannot set a display name because your account is already linked to **${account.drednotName}**. That name is used on the leaderboard.` });
                }
                const newName = options.getString('new_name');
                if (newName.length < 3 || newName.length > 16) {
                    return interaction.editReply({ content: 'Your name must be between 3 and 16 characters long.' });
                }
                const economyCollection = getEconomyCollection();
                const existingNameAccount = await economyCollection.findOne({ $or: [{ drednotName: new RegExp(`^${newName}$`, 'i') }, { displayName: new RegExp(`^${newName}$`, 'i') }] });
                if (existingNameAccount) {
                    return interaction.editReply({ content: `That name is already in use by another player. Please choose a different name.` });
                }
                await updateAccount(user.id, { displayName: newName });
                return interaction.editReply({ content: `Success! Your display name has been set to **${newName}**.` });
            }
            case 'balance': {
                const balanceEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('💰 Your Wallet').setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }).addFields({ name: 'Current Balance', value: `**${Math.floor(account.balance)}** ${require('../config').CURRENCY_NAME}` });
                await interaction.editReply({ embeds: [balanceEmbed] });
                break;
            }
            case 'inventory': {
                itemName = options.getString('item_name');
                const inventoryContent = commandHandlers.handleInventory(account, itemName);
                const inventoryEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(itemName ? `🎒 Inventory (Filtered by: ${itemName})` : '🎒 Your Inventory').setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }).setDescription(inventoryContent);
                await interaction.editReply({ embeds: [inventoryEmbed] });
                break;
            }
            case 'timers': {
                const timerLines = await commandHandlers.handleTimers(account);
                const timerEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('⏳ Your Cooldowns').setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }).setDescription(timerLines.join('\n'));
                await interaction.editReply({ embeds: [timerEmbed] });
                break;
            }
            // --- Action Commands ---
            case 'work': result = await commandHandlers.handleWork(account); break;
            case 'daily': result = await commandHandlers.handleDaily(account); break;
            case 'hourly': result = await commandHandlers.handleHourly(account); break;
            case 'gather': result = await commandHandlers.handleGather(account); break;
            case 'eat': itemName = options.getString('food_name'); result = await commandHandlers.handleEat(account, itemName); break;
            case 'smelt': itemName = options.getString('ore_name'); quantity = options.getInteger('quantity'); result = await commandHandlers.handleSmelt(account, itemName, quantity); break;
            case 'flip': amount = options.getInteger('amount'); choice = options.getString('choice'); result = await commandHandlers.handleFlip(account, amount, choice); break;
            case 'slots': amount = options.getInteger('amount'); result = await commandHandlers.handleSlots(account, amount); break;
            case 'craft': itemName = options.getString('item_name'); quantity = options.getInteger('quantity') || 1; result = await commandHandlers.handleCraft(account, itemName, quantity); break;
            case 'pay': {
                const recipientUser = options.getUser('user');
                amount = options.getInteger('amount');
                if (recipientUser.bot) { result = { success: false, message: "You can't pay bots." }; }
                else if (!isFinite(account.balance)) { result = { success: false, message: 'Your account balance is corrupted. Please contact an admin.' }; }
                else if (!isFinite(amount) || amount <= 0) { result = { success: false, message: 'Please enter a valid, positive amount.' }; }
                else {
                    const recipientAccount = await getAccount(recipientUser.id);
                    if (!recipientAccount) { result = { success: false, message: `That user doesn't have an economy account yet.` }; }
                    else { result = await commandHandlers.handlePay(account, recipientAccount, amount); }
                }
                break;
            }
            // --- Market Commands ---
            case 'marketsell': {
                itemName = options.getString('item_name');
                quantity = options.getInteger('quantity');
                price = options.getNumber('price');
                const itemIdToSell = getItemIdByName(itemName);
                if (!itemIdToSell || quantity <= 0 || price <= 0) return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('Invalid input.')] });
                const economyCollection = getEconomyCollection();
                const sellUpdateResult = await economyCollection.findOneAndUpdate({ _id: account._id, [`inventory.${itemIdToSell}`]: { $gte: quantity } }, { $inc: { [`inventory.${itemIdToSell}`]: -quantity } });
                if (!sellUpdateResult) { return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription("You do not have enough of that item to sell.")] }); }

                try {
                    const marketCollection = getMarketCollection();
                    const newListingId = await findNextAvailableListingId(marketCollection);
                    const sellerName = account.drednotName || account.displayName || `User ${account._id}`;
                    await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: sellerName, itemId: itemIdToSell, quantity, price });
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#57F287').setDescription(`You listed **${quantity}x** ${ITEMS[itemIdToSell].name} for sale. Listing ID: **${newListingId}**`)] });
                } catch (error) {
                    await modifyInventory(account._id, itemIdToSell, quantity); // Refund
                    console.error("Failed to list item, refunding inventory:", error);
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('An unexpected error occurred while listing your item. Your items have been returned.')] });
                }
            }
            case 'marketbuy': {
                listingId = options.getInteger('listing_id');
                const marketCollection = getMarketCollection();
                const listingToBuy = await marketCollection.findOneAndDelete({ listingId: listingId });
                if (!listingToBuy) return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('That listing does not exist or was just purchased by someone else.')] });
                if (listingToBuy.sellerId === account._id) { await marketCollection.insertOne(listingToBuy); return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription("You can't buy your own listing.")] }); }

                if (!isFinite(account.balance)) { await marketCollection.insertOne(listingToBuy); return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('Your account balance is corrupted. Please contact an admin.')] }); }
                const totalCost = Math.round(listingToBuy.quantity * listingToBuy.price);

                const economyCollection = getEconomyCollection();
                const purchaseUpdateResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: totalCost } }, { $inc: { balance: -totalCost } });
                if (purchaseUpdateResult.modifiedCount === 0) {
                    await marketCollection.insertOne(listingToBuy); // Refund listing
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(`You can't afford this. It costs **${totalCost} ${require('../config').CURRENCY_NAME}**.`)] });
                }

                await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity);
                const sellerAccount = await getAccount(listingToBuy.sellerId);
                if (sellerAccount) {
                    const currentGlobalEvent = getCurrentGlobalEvent();
                    let taxRate = MARKET_TAX_RATE;
                    if (currentGlobalEvent && currentGlobalEvent.effect.type === 'market_tax') { taxRate = currentGlobalEvent.effect.rate; }
                    const earnings = Math.round(totalCost * (1 - taxRate));
                    await economyCollection.updateOne({ _id: sellerAccount._id }, { $inc: { balance: earnings } });
                }
                const sellerName = sellerAccount ? (sellerAccount.drednotName || sellerAccount.displayName || `User ${sellerAccount._id}`) : listingToBuy.sellerName;
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#57F287').setDescription(`You bought **${listingToBuy.quantity}x** ${ITEMS[listingToBuy.itemId].name} for **${totalCost} ${require('../config').CURRENCY_NAME}** from *${sellerName}*!`)] });
            }
            case 'marketcancel': {
                const listingIdToCancel = options.getInteger('listing_id');
                const marketCollection = getMarketCollection();
                const listingToCancel = await marketCollection.findOneAndDelete({ listingId: listingIdToCancel, sellerId: account._id });
                if (!listingToCancel) { return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('This is not your listing, it does not exist, or it has already been cancelled.')] }); }
                await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#57F287').setDescription(`You cancelled your listing for **${listingToCancel.quantity}x** ${ITEMS[listingToCancel.itemId].name}. The items have been returned.`)] });
            }
            case 'crateshopbuy': {
                const crateNameToOpen = options.getString('crate_name');
                const amountToOpen = options.getInteger('amount');
                if (amountToOpen <= 0) return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription("Please enter a valid amount to open.")] });
                const crateId = Object.keys(LOOTBOXES).find(k => LOOTBOXES[k].name.toLowerCase() === crateNameToOpen.toLowerCase());
                if (!crateId) return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(`The Collector doesn't sell a crate named "${crateNameToOpen}". Check the /crateshop.`)] });
                
                const lootboxCollection = getLootboxCollection();
                const listingUpdateResult = await lootboxCollection.findOneAndUpdate( { lootboxId: crateId, quantity: { $gte: amountToOpen } }, { $inc: { quantity: -amountToOpen } } );
                if (!listingUpdateResult) return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(`The Collector doesn't have enough of that crate, or it was just purchased.`)] });

                const listing = listingUpdateResult;
                const totalCost = listing.price * amountToOpen;
                const economyCollection = getEconomyCollection();
                const purchaseResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: totalCost } }, { $inc: { balance: -totalCost } });
                if(purchaseResult.modifiedCount === 0) {
                    await lootboxCollection.updateOne({ _id: listing._id }, { $inc: { quantity: amountToOpen } }); // Refund crate stock
                    return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(`You can't afford that. It costs **${totalCost} ${require('../config').CURRENCY_NAME}**.`)] });
                }

                let updates = { $inc: {} };
                let totalRewards = {};
                for (let i = 0; i < amountToOpen; i++) {
                    const reward = openLootbox(listing.lootboxId);
                    if (reward.type === 'bits') { totalRewards.bits = (totalRewards.bits || 0) + reward.amount; }
                    else { totalRewards[reward.id] = (totalRewards[reward.id] || 0) + reward.amount; }
                }

                let rewardMessages = [];
                for (const rewardId in totalRewards) {
                    if (rewardId === 'bits') {
                        updates.$inc.balance = (updates.$inc.balance || 0) + totalRewards[rewardId];
                        rewardMessages.push(`**${totalRewards[rewardId]}** ${require('../config').CURRENCY_NAME}`);
                    } else {
                        updates.$inc[`inventory.${rewardId}`] = (updates.$inc[`inventory.${rewardId}`] || 0) + totalRewards[rewardId];
                        rewardMessages.push(`${ITEMS[rewardId].emoji} **${totalRewards[rewardId]}x** ${ITEMS[rewardId].name}`);
                    }
                }

                await economyCollection.updateOne({ _id: account._id }, updates);
                await lootboxCollection.deleteMany({ quantity: { $lte: 0 } });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#57F287').setTitle(`Opened ${amountToOpen}x ${LOOTBOXES[listing.lootboxId].name}`).setDescription(`You received: ${rewardMessages.join(', ')}!`)] });
            }
        }
        
        // Default handler for simple commands
        if (result) {
            const responseEmbed = new EmbedBuilder()
                .setColor(result.success ? '#57F287' : '#ED4245')
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setDescription(result.message);
            await interaction.editReply({ embeds: [responseEmbed] });
        }

        // --- New User Welcome Message ---
        if (isNewUser) {
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('👋 Welcome!')
                .setDescription(`I've created a temporary economy account for you with a starting balance of **${STARTING_BALANCE} ${require('../config').CURRENCY_NAME}** and two random traits.\n\nUse \`/traits view\` to see what you got! You can use \`/name\` to set a custom name for the leaderboard if you don't plan on linking a Drednot account.\n\nAlternatively, click the button below to start the process of linking your Drednot.io account.`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guide_link_account').setLabel('Link Drednot Account').setStyle(ButtonStyle.Success).setEmoji('🔗'));
            await interaction.followUp({ embeds: [welcomeEmbed], components: [row], ephemeral: true });
        }
    } catch (error) {
        console.error("Error handling slash command:", error);
        try {
            const errorReply = { content: 'An unexpected error occurred!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorReply);
            } else {
                await interaction.reply(errorReply);
            }
        } catch (e) {
            console.error("CRITICAL: Could not send error reply to interaction.", e);
        }
    }
}

module.exports = { handleSlashCommand };
