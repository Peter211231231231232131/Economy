// /handlers/clanHandlers.js

const { getClansCollection, getEconomyCollection } = require('../utils/database');
const { getAccount, updateAccount, generateClanCode, formatDuration, toBoldFont } = require('../utils/utilities');
const { CLAN_LEVELS, CLAN_MEMBER_LIMIT, CLAN_JOIN_COOLDOWN_HOURS, CURRENCY_NAME } = require('../config');

// --- HELPER FUNCTIONS ---
async function getClan(identifier) {
    const clans = getClansCollection();
    // Identifier can be the 5-character code
    return await clans.findOne({ code: identifier });
}

async function getClanById(clanId) {
    const clans = getClansCollection();
    return await clans.findOne({ _id: clanId });
}

// --- REPLACE THIS ENTIRE FUNCTION ---
async function handleClanCreate(account, clanName) { // <-- Removed clanTag from parameters
    if (account.clanId) {
        return { success: false, message: "You are already in a clan." };
    }
    if (!clanName || clanName.length < 3 || clanName.length > 24) {
        return { success: false, message: "Clan name must be between 3 and 24 characters." };
    }

    const clans = getClansCollection();

    const existingClan = await clans.findOne({ name: new RegExp(`^${clanName}$`, 'i') });
    if (existingClan) {
        return { success: false, message: "A clan with that name already exists." };
    }

    let uniqueCode;
    let isCodeUnique = false;
    while (!isCodeUnique) {
        uniqueCode = generateClanCode();
        const existingCode = await clans.findOne({ code: uniqueCode });
        if (!existingCode) {
            isCodeUnique = true;
        }
    }

    const newClan = {
        name: clanName,
        code: uniqueCode,
        ownerId: account._id,
        members: [account._id],
        level: 1,
        vaultBalance: 0,
        warPoints: 0,
        recruitment: 1,
        applicants: [],
        pendingInvites: [],
        createdAt: new Date(),
    };

    const result = await clans.insertOne(newClan);
    await updateAccount(account._id, { clanId: result.insertedId });

    return { success: true, message: `You have successfully founded the clan **${clanName}**! Your unique clan code is \`{${uniqueCode}}\`. The clan is currently **Open** for anyone to join.` };
}

async function handleClanLeave(account) {
    if (!account.clanId) {
        return { success: false, message: "You are not in a clan." };
    }
    const clans = getClansCollection();
    const clan = await getClanById(account.clanId);
    if (!clan) {
        await updateAccount(account._id, { clanId: null });
        return { success: false, message: "The clan you were in seems to have been disbanded. You are no longer part of it." };
    }
    if (clan.ownerId === account._id) {
        return { success: false, message: "You cannot leave the clan because you are the owner. You must use `/clan disband` instead." };
    }

    await clans.updateOne({ _id: clan._id }, { $pull: { members: account._id } });
    const cooldownTime = new Date(Date.now() + CLAN_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000);
    await updateAccount(account._id, { clanId: null, clanJoinCooldown: cooldownTime });

    return { success: true, message: `You have left **${clan.name}**. You cannot join another clan for **${CLAN_JOIN_COOLDOWN_HOURS} hour**.` };
}

async function handleClanKick(account, targetAccount) {
    if (!account.clanId) {
        return { success: false, message: "You are not in a clan." };
    }
    const clan = await getClanById(account.clanId);
    if (!clan) { return { success: false, message: "You are not in a valid clan." }; }
    if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can kick members." }; }
    if (targetAccount.clanId?.toString() !== clan._id.toString()) { return { success: false, message: `**${targetAccount.drednotName || targetAccount.displayName}** is not in your clan.` }; }
    if (targetAccount._id === account._id) { return { success: false, message: "You cannot kick yourself." }; }

    const clans = getClansCollection();
    await clans.updateOne({ _id: clan._id }, { $pull: { members: targetAccount._id } });
    const cooldownTime = new Date(Date.now() + CLAN_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000);
    await updateAccount(targetAccount._id, { clanId: null, clanJoinCooldown: cooldownTime });

    return { success: true, message: `You have kicked **${targetAccount.drednotName || targetAccount.displayName}** from the clan. They cannot join another clan for **${CLAN_JOIN_COOLDOWN_HOURS} hour**.` };
}

async function handleClanDisband(account) {
    if (!account.clanId) { return { success: false, message: "You are not in a clan." }; }
    const clan = await getClanById(account.clanId);
    if (!clan) { return { success: false, message: "You are not in a valid clan." }; }
    if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can disband the clan." }; }

    await getEconomyCollection().updateMany({ clanId: clan._id }, { $set: { clanId: null } });
    await getClansCollection().deleteOne({ _id: clan._id });

    return { success: true, message: `You have disbanded **${clan.name}**. All members have been removed.` };
}

async function handleClanInfo(clanCode) {
    const clan = await getClan(clanCode);
    if (!clan) { return { success: false, message: "No clan found with that code." }; }

    const ownerAccount = await getAccount(clan.ownerId);
    const ownerName = ownerAccount?.drednotName || ownerAccount?.displayName || 'Unknown';

    const nextLevelInfo = CLAN_LEVELS.find(l => l.level === clan.level + 1);
    const progressText = nextLevelInfo ? `Vault: ${clan.vaultBalance.toLocaleString()} / ${nextLevelInfo.cost.toLocaleString()} to Level ${nextLevelInfo.level}` : 'Max Level Reached';
    
    const status = clan.recruitment === 1 ? 'Open' : 'Closed';
    
    const economyCollection = getEconomyCollection();
    if (!economyCollection) {
        return { success: false, message: "Database connection is not ready. Please try again in a moment." };
    }
    const memberAccounts = await economyCollection.find({ _id: { $in: clan.members } }).toArray();
    const memberNames = memberAccounts.map(m => m.drednotName || m.displayName || 'Unnamed Member').join(', ');

    const info = [
        `**${clan.name}** [Lv ${clan.level}]`, // <-- Removed tag
        `> **Code:** \`{${clan.code}}\``,
        `> **Leader:** ${ownerName}`,
        `> **Recruitment:** ${status}`,
        `> **Members:** ${clan.members.length}/${CLAN_MEMBER_LIMIT}`,
        `> **Progress:** ${progressText}`,
        `> **Members:** ${memberNames}`
    ];
    return { success: true, message: info.join('\n') };
}

async function handleClanList() {
    const clans = getClansCollection();
    const availableClans = await clans.find({ 'members.9': { $exists: false } }).toArray(); // A trick to find arrays with less than 10 elements
    if (availableClans.length === 0) {
        return { success: false, lines: ["There are currently no clans with open slots."] };
    }

    const shuffled = availableClans.sort(() => 0.5 - Math.random());
    const formattedLines = shuffled.map(clan => `**${clan.tag}** [Lv ${clan.level}] \`{${clan.code}}\``);
    return { success: true, lines: formattedLines };
}

async function handleClanRecruit(account, status) {
    if (!account.clanId) { return { success: false, message: "You are not in a clan." }; }
    const clan = await getClanById(account.clanId);
    if (!clan) { return { success: false, message: "You are not in a valid clan." }; }
    if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can change the recruitment status." }; }

    const newStatus = parseInt(status, 10);
    if (newStatus !== 1 && newStatus !== 2) { return { success: false, message: "Invalid status. Use 1 for Open or 2 for Closed." }; }

    await getClansCollection().updateOne({ _id: clan._id }, { $set: { recruitment: newStatus } });
    const statusText = newStatus === 1 ? 'OPEN' : 'CLOSED';
    return { success: true, message: `Your clan's recruitment status has been set to **${statusText}**.` };
}

async function handleClanDonate(account, amount) {
    if (!account.clanId) { return { success: false, message: "You are not in a clan." }; }
    if (isNaN(amount) || amount <= 0) { return { success: false, message: "Please provide a valid, positive amount to donate." }; }
    if (account.balance < amount) { return { success: false, message: "You do not have enough Bits to donate." }; }

    const updateResult = await getEconomyCollection().updateOne({ _id: account._id, balance: { $gte: amount } }, { $inc: { balance: -amount } });
    if (updateResult.modifiedCount === 0) {
        return { success: false, message: "Failed to donate. You may not have enough Bits." };
    }
    await getClansCollection().updateOne({ _id: account.clanId }, { $inc: { vaultBalance: amount } });
    return { success: true, message: `You have successfully donated **${amount.toLocaleString()} ${CURRENCY_NAME}** to the clan vault!` };
}

async function handleClanUpgrade(account) {
    if (!account.clanId) { return { success: false, message: "You are not in a clan." }; }
    const clan = await getClanById(account.clanId);
    if (!clan) { return { success: false, message: "You are not in a valid clan." }; }
    if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can upgrade the clan." }; }
    
    const nextLevel = clan.level + 1;
    const upgradeInfo = CLAN_LEVELS.find(l => l.level === nextLevel);
    if (!upgradeInfo) { return { success: false, message: "Your clan is already at the maximum level." }; }

    if (clan.vaultBalance < upgradeInfo.cost) {
        return { success: false, message: `Your clan vault does not have enough Bits. You need **${(upgradeInfo.cost - clan.vaultBalance).toLocaleString()}** more.` };
    }

    await getClansCollection().updateOne(
        { _id: clan._id },
        { $inc: { level: 1, vaultBalance: -upgradeInfo.cost } }
    );
    return { success: true, message: `**Congratulations!** Your clan has reached **Level ${nextLevel}**!\n> **New Perk:** ${upgradeInfo.perks}` };
}

async function handleClanJoin(account, clanCode) {
    if (account.clanId) { return { success: false, message: "You are already in a clan." }; }
    if (account.clanJoinCooldown && new Date() < account.clanJoinCooldown) {
        const remaining = formatDuration((account.clanJoinCooldown.getTime() - Date.now()) / 1000);
        return { success: false, message: `You cannot join a new clan yet. Please wait **${remaining}**.` };
    }
    const clan = await getClan(clanCode);
    if (!clan) { return { success: false, message: "No clan found with that code." }; }
    if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "That clan is full." }; }

    const clans = getClansCollection();
    if (clan.recruitment === 1) { // Open
        await clans.updateOne({ _id: clan._id }, { $push: { members: account._id } });
        await updateAccount(account._id, { clanId: clan._id });
        return { success: true, message: `You have joined **${clan.name}**!` };
    } else { // Closed (Applying)
        if(clan.applicants.includes(account._id)) {
            return { success: false, message: "You have already applied to this clan. Please wait for the owner to respond."}
        }
        await clans.updateOne({ _id: clan._id }, { $push: { applicants: account._id } });
        return { success: true, message: `You have applied to join **${clan.name}**. The owner has been notified.` };
    }
}

async function handleClanInvite(account, targetAccount) {
    // This function now has dual purpose
    const clans = getClansCollection();
    
    // Case 1: Player checking their own invites
    if (!targetAccount) {
        if (account.clanId) { return { success: false, message: "You are already in a clan." }; }
        const invitedClans = await clans.find({ pendingInvites: account._id }).toArray();
        if (invitedClans.length === 0) {
            return { success: false, message: "You have no pending clan invitations." };
        }
        const inviteList = invitedClans.map(c => `- **${c.name}** [${c.tag}] \`{${c.code}}\``);
        return { success: true, message: `You have pending invitations from:\n${inviteList.join('\n')}\nUse \`/clan accept <code>\` to join.` };
    }

    // Case 2: Clan owner viewing applicants or inviting a player
    if (!account.clanId) { return { success: false, message: "You must be in a clan to invite players." }; }
    const clan = await getClanById(account.clanId);
    if (!clan) { return { success: false, message: "You are not in a valid clan." }; }
    if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can manage invitations." }; }

    // Owner viewing applicants
    if(targetAccount === 'view') {
        if (clan.applicants.length === 0) {
            return { success: false, message: "Your clan has no pending applications." };
        }
        const applicantAccounts = await getEconomyCollection().find({ _id: { $in: clan.applicants } }).toArray();
        const applicantNames = applicantAccounts.map(a => a.drednotName || a.displayName || 'Unknown User');
        return { success: true, message: `**Applicants:** ${applicantNames.join(', ')}\nUse \`/clan accept <username>\` to approve.` };
    }

    // Owner inviting a player
    if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "Your clan is full." }; }
    if (targetAccount.clanId) { return { success: false, message: `**${targetAccount.drednotName || targetAccount.displayName}** is already in a clan.` }; }
    if(clan.pendingInvites.includes(targetAccount._id)) { return { success: false, message: "You have already invited that player." } }

    await clans.updateOne({ _id: clan._id }, { $push: { pendingInvites: targetAccount._id } });
    return { success: true, message: `An invitation has been sent to **${targetAccount.drednotName || targetAccount.displayName}**. They can see it by using \`/clan invite\`.` };
}

async function handleClanAccept(account, identifier) {
    const clans = getClansCollection();

    // Case 1: Player accepting an invite via code
    if (identifier.length === 5) {
        if (account.clanId) { return { success: false, message: "You are already in a clan." }; }
        const clan = await getClan(identifier);
        if (!clan) { return { success: false, message: "Invalid clan code." }; }
        if (!clan.pendingInvites.includes(account._id)) { return { success: false, message: "You have not been invited to this clan." }; }
        if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "That clan is now full." }; }

        await clans.updateMany({}, { $pull: { pendingInvites: account._id, applicants: account._id } }); // Clear all other invites/apps
        await clans.updateOne({ _id: clan._id }, { $push: { members: account._id } });
        await updateAccount(account._id, { clanId: clan._id });
        return { success: true, message: `You have accepted the invitation and joined **${clan.name}**!` };
    }

    // Case 2: Clan owner accepting an applicant via username
    const clan = await getClanById(account.clanId);
    const targetAccount = await getAccount(identifier);
    if (!clan) { return { success: false, message: "You are not in a clan." }; }
    if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can accept applications." }; }
    if (!targetAccount) { return { success: false, message: `Could not find a player named "${identifier}".` }; }
    if (!clan.applicants.includes(targetAccount._id)) { return { success: false, message: `That player has not applied to your clan.` }; }
    if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "Your clan is full." }; }

    await clans.updateMany({}, { $pull: { pendingInvites: targetAccount._id, applicants: targetAccount._id } });
    await clans.updateOne({ _id: clan._id }, { $push: { members: targetAccount._id } });
    await updateAccount(targetAccount._id, { clanId: clan._id });
    return { success: true, message: `You have accepted **${targetAccount.drednotName || targetAccount.displayName}** into the clan!` };
}

async function handleClanDecline(account, clanCode) {
    if (account.clanId) { return { success: false, message: "This command is for players who are not in a clan." }; }
    const clan = await getClan(clanCode);
    if (!clan) { return { success: false, message: "Invalid clan code." }; }
    
    const clans = getClansCollection();
    const updateResult = await clans.updateOne(
        { _id: clan._id }, 
        { $pull: { pendingInvites: account._id, applicants: account._id } }
    );

    if (updateResult.modifiedCount > 0) {
        return { success: true, message: `You have declined the invitation/application for **${clan.name}**.` };
    } else {
        return { success: false, message: `You do not have a pending invitation or application for **${clan.name}**.` };
    }
}


module.exports = {
    getClan,
    getClanById,
    handleClanCreate,
    handleClanLeave,
    handleClanKick,
    handleClanDisband,
    handleClanInfo,
    handleClanList,
    handleClanRecruit,
    getClanById,
    handleClanDonate,
    handleClanUpgrade,
    handleClanJoin,
    handleClanInvite,
    handleClanAccept,
    handleClanDecline,
};
