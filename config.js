// config.js

// This file contains all the static configuration and definitions for the game.

// =========================================================================
// --- CORE DEFINITIONS ---
// =========================================================================
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const DISCORD_INVITE_LINK = 'https://discord.gg/SvZe9ytB'

// --- REWARD & STREAK CONSTANTS ---
const DAILY_REWARD_BASE = 1500;
const DAILY_STREAK_BONUS = 250;
const HOURLY_REWARD_BASE = 25;
const HOURLY_STREAK_BONUS = 25;

// --- GAMEPLAY CONSTANTS ---
const WORK_REWARD_MIN = 5, WORK_REWARD_MAX = 35, WORK_COOLDOWN_MINUTES = 1;
const HOURLY_COOLDOWN_MINUTES = 60;
const GATHER_COOLDOWN_MINUTES = 3, MAX_GATHER_TYPES_BASE = 2;
const MARKET_TAX_RATE = 0.05;
const FLIP_MIN_BET = 5, FLIP_MAX_BET = 100;
const SLOTS_MIN_BET = 10, SLOTS_MAX_BET = 1500, SLOTS_COOLDOWN_SECONDS = 5;
const SMELT_COOLDOWN_SECONDS_PER_ORE = 30, SMELT_COAL_COST_PER_ORE = 1;
const MINIMUM_ACTION_COOLDOWN_MS = 1000;

// =========================================================================
// --- EVENTS & TRAITS ---
// =========================================================================
const EVENT_CHANNEL_ID = '1231644783350911006'; // <-- IMPORTANT: SET THIS
const DREDNOT_INVITE_LINK = 'https://drednot.io/invite/KOciB52Quo4z_luxo7zAFKPc';
const EVENT_TICK_INTERVAL_MINUTES = 5;
const EVENT_CHANCE = 0.15;

const EVENTS = {
    BIT_RUSH: { name: "Bit Rush", duration_ms: 5 * 60 * 1000, description: `All Bits earned from **/work** are **DOUBLED**!`, emoji: '💰', effect: { type: 'work', multiplier: 2 } },
    SURGING_RESOURCES: { name: "Surging Resources", duration_ms: 10 * 60 * 1000, description: `The chance to find all common resources from **/gather** is significantly **INCREASED**!`, emoji: '⛏️', effect: { type: 'gather_chance', multiplier: 1.5 } },
    GOLDEN_HOUR: { name: "Golden Hour", duration_ms: 5 * 60 * 1000, description: `The chance to find a **Trait Reforger** from **/gather** is **TRIPLED**!`, emoji: '✨', effect: { type: 'gather_rare_chance', multiplier: 3, item: 'trait_reforger' } },
    MARKET_MADNESS: { name: "Market Madness", duration_ms: 15 * 60 * 1000, description: `The 5% sales tax on the player market has been **REMOVED**! Sell your items tax-free!`, emoji: '💸', effect: { type: 'market_tax', rate: 0 } },
    SUPER_SMELTER: { name: "Super Smelter", duration_ms: 10 * 60 * 1000, description: `All smelting and cooking jobs are **TWICE AS FAST**!`, emoji: '🔥', effect: { type: 'super_smelter' } },
};

const TRAITS = {
    'scavenger': { name: 'Scavenger', rarity: 'Common', weight: 30, maxLevel: 5, description: "Grants a {chance}% chance to find bonus common resources from /work." },
    'prodigy': { name: 'Prodigy', rarity: 'Common', weight: 30, maxLevel: 5, description: "Reduces /work and /gather cooldowns by {reduction}%." },
    'wealth': { name: 'Wealth', rarity: 'Uncommon', weight: 15, maxLevel: 5, description: "Increases Bits earned from /work by {bonus}%." },
    'surveyor': { name: 'Surveyor', rarity: 'Uncommon', weight: 10, maxLevel: 5, description: "Grants a {chance}% chance to double your entire haul from /gather." },
    'collector': { name: 'The Collector', rarity: 'Rare', weight: 7, maxLevel: 5, description: "Increases the bonus reward for first-time crafts by {bonus}%." },
    'the_addict': { name: 'The Addict', rarity: 'Rare', weight: 7, maxLevel: 5, description: "After losing a gamble, gain 'The Rush', buffing your next /work based on the % of wealth lost." },
    'zealot': { name: 'Zealot', rarity: 'Legendary', weight: 1, maxLevel: 5, description: "Gain stacks of 'Zeal' on activity, massively boosting rewards. Stacks decay quickly." },
};

// =========================================================================
// --- ITEMS & RECIPES ---
// =========================================================================
const ITEMS = {
    'trait_reforger': { name: "Trait Reforger", emoji: "✨", description: "A mysterious artifact that allows you to reshape your innate abilities." },
    'iron_ore': { name: "Iron Ore", emoji: "🔩" }, 'copper_ore': { name: "Copper Ore", emoji: "🟤" }, 'wood': { name: "Wood", emoji: "🪵" }, 'stone': { name: "Stone", emoji: "🪨" }, 'coal': { name: "Coal", emoji: "⚫" }, 'raw_crystal':{ name: "Raw Crystal", emoji: "💎" }, 'iron_ingot': { name: "Iron Ingot", emoji: "⛓️" }, 'copper_ingot':{ name: "Copper Ingot", emoji: "🟧" }, 'basic_pickaxe': { name: "Basic Pickaxe", emoji: "⛏️", type: "tool", effects: { work_bonus_flat: 1 }, craftable: true, recipe: { 'stone': 5, 'wood': 2 } }, 'sturdy_pickaxe': { name: "Sturdy Pickaxe", emoji: "⚒️", type: "tool", effects: { work_bonus_percent: 0.10 }, craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } }, 'iron_pickaxe': { name: "Iron Pickaxe", emoji: "🦾", type: "tool", effects: { work_bonus_flat: 5 }, craftable: true, recipe: { 'iron_ingot': 5, 'wood': 2} },
    'copper_pickaxe': { name: "Copper Pickaxe", emoji: "🧡", type: "tool", effects: { work_bonus_percent: 0.05, work_cooldown_reduction_percent: 5 }, craftable: true, recipe: { 'copper_ingot': 8, 'wood': 3 }, description: "A pickaxe made of conductive copper that feels lighter and works faster." },
    'advanced_smelter': { name: "Advanced Smelter", emoji: "🔥", type: "tool", craftable: true, recipe: { 'smelter': 1, 'copper_ingot': 15, 'iron_ingot': 5 }, description: "An upgraded smelter that processes materials twice as fast as a basic one." },
    'crystal_pickaxe': { name: "Crystal Pickaxe", emoji: "💠", type: "tool", effects: { work_bonus_percent: 0.30 }, craftable: true, recipe: { 'sturdy_pickaxe': 1, 'raw_crystal': 3, 'iron_ore': 5 } }, 'gathering_basket': { name: "Gathering Basket", emoji: "🧺", type: "tool", craftable: true, recipe: { 'wood': 15, 'stone': 5 } }, 'smelter': { name: "Smelter", emoji: "🏭", type: "tool", craftable: true, recipe: { 'stone': 9 } }, 'wild_berries': { name: "Wild Berries", emoji: "🫐", type: "food", buff: { duration_ms: 5 * 60 * 1000, effects: { gather_cooldown_reduction_ms: 10 * 1000 } } }, 'glow_mushroom': { name: "Glow Mushroom", emoji: "🍄", type: "food", buff: { duration_ms: 10 * 60 * 1000, effects: { gather_cooldown_reduction_ms: 5 * 1000 } } }, 'raw_meat': { name: "Raw Meat", emoji: "🍖", type: "food" }, 'smoked_meat': { name: "Smoked Meat", emoji: "🥩", type: "food", buff: { duration_ms: 5 * 60 * 1000, effects: { work_cooldown_reduction_ms: 15 * 1000 } } }, 'spicy_pepper': { name: "Spicy Pepper", emoji: "🌶️", type: "food", buff: { duration_ms: 3 * 60 * 1000, effects: { work_double_or_nothing: true } } },
};

const GATHER_TABLE = {
    'iron_ore': { baseChance: 0.60, minQty: 1, maxQty: 3 }, 'copper_ore': { baseChance: 0.40, minQty: 1, maxQty: 2 }, 'stone': { baseChance: 0.70, minQty: 2, maxQty: 5 }, 'wood': { baseChance: 0.50, minQty: 1, maxQty: 4 }, 'coal': { baseChance: 0.30, minQty: 1, maxQty: 2 }, 'raw_crystal':{ baseChance: 0.05, minQty: 1, maxQty: 1 }, 'wild_berries': { baseChance: 0.15, minQty: 1, maxQty: 1 }, 'glow_mushroom': { baseChance: 0.10, minQty: 1, maxQty: 1 }, 'raw_meat': { baseChance: 0.20, minQty: 1, maxQty: 1 }, 'spicy_pepper': { baseChance: 0.03, minQty: 1, maxQty: 1 },
    'trait_reforger': { baseChance: 0.015, minQty: 1, maxQty: 1 },
};
const SMELTABLE_ORES = { 'iron_ore': 'iron_ingot', 'copper_ore': 'copper_ingot' };
const COOKABLE_FOODS = { 'raw_meat': 'smoked_meat' };

// =========================================================================
// --- VENDORS & LOOTBOXES ---
// =========================================================================
const SLOT_REELS = [ ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔']];
const SLOTS_PAYOUTS = { three_of_a_kind: 15, two_of_a_kind: 3.5, jackpot_symbol: '💎', jackpot_multiplier: 50 };
const VENDOR_TICK_INTERVAL_MINUTES = 1;
const VENDORS = [ { name: "TerraNova Exports", sellerId: "NPC_TERRA", stock: [ { itemId: 'wood', quantity: 20 }, { itemId: 'stone', quantity: 20 } ], chance: 0.5 }, { name: "Nexus Logistics", sellerId: "NPC_NEXUS", stock: [ { itemId: 'basic_pickaxe', quantity: 1, price: 15 }, { itemId: 'sturdy_pickaxe', quantity: 1, price: 75 } ], chance: 0.3 }, { name: "Blackrock Mining Co.", sellerId: "NPC_BLACKROCK", stock: [ { itemId: 'coal', quantity: 15 }, { itemId: 'iron_ore', quantity: 10 } ], chance: 0.4 }, { name: "Copperline Inc.", sellerId: "NPC_COPPER", stock: [ { itemId: 'copper_ore', quantity: 10 } ], chance: 0.2 }, { name: "Junk Peddler", sellerId: "NPC_JUNK", stock: [ { itemId: 'stone', quantity: 5 }, { itemId: 'wood', quantity: 5 } ], chance: 0.6 } ];
const FALLBACK_PRICES = { 'wood': { min: 1, max: 5 }, 'stone': { min: 1, max: 5 }, 'coal': { min: 2, max: 8 }, 'iron_ore': { min: 3, max: 10 }, 'copper_ore': { min: 4, max: 12 }, 'raw_crystal': { min: 50, max: 150 }, 'raw_meat': { min: 2, max: 6 }, 'default': { min: 1, max: 50 } };
const LOOTBOX_VENDOR_NAME = "The Collector";
const LOOTBOX_VENDOR_ID = "NPC_COLLECTOR";
const LOOTBOX_TICK_INTERVAL_MINUTES = 1;
const MAX_LOOTBOX_LISTINGS = 5;

const LOOTBOXES = {
    'miners_crate': { name: "Miner's Crate", emoji: '📦', price: 250, contents: [ { type: 'item', id: 'iron_ore', min: 10, max: 25, weight: 40 }, { type: 'item', id: 'copper_ore', min: 8, max: 20, weight: 30 }, { type: 'item', id: 'coal', min: 15, max: 30, weight: 20 }, { type: 'item', id: 'basic_pickaxe', min: 1, max: 1, weight: 9 }, { type: 'item', id: 'sturdy_pickaxe', min: 1, max: 1, weight: 1 } ] },
    'builders_crate': { name: "Builder's Crate", emoji: '🧱', price: 300, contents: [ { type: 'item', id: 'wood', min: 20, max: 50, weight: 50 }, { type: 'item', id: 'stone', min: 20, max: 50, weight: 45 }, { type: 'item', id: 'smelter', min: 1, max: 1, weight: 5 } ] },
    'gamblers_crate': { name: "Gambler's Crate", emoji: '💰', price: 400, contents: [ { type: 'bits', id: null, min: 1, max: 200, weight: 60 }, { type: 'bits', id: null, min: 201, max: 600, weight: 35 }, { type: 'bits', id: null, min: 601, max: 1500, weight: 5 } ] },
    'crystal_crate': { name: "Crystal Crate", emoji: '💎', price: 500, contents: [ { type: 'item', id: 'raw_crystal', min: 1, max: 3, weight: 80 }, { type: 'item', id: 'raw_crystal', min: 4, max: 8, weight: 18 }, { type: 'item', id: 'crystal_pickaxe', min: 1, max: 1, weight: 2 } ] },
    'dna_crate': { name: "DNA Crate", emoji: '🧬', price: 100, contents: [ { type: 'item', id: 'trait_reforger', min: 2, max: 15, weight: 100 } ] }
};

// =========================================================================
// --- CLAN & WAR DEFINITIONS ---
// =========================================================================
const CLAN_MEMBER_LIMIT = 10;
const CLAN_JOIN_COOLDOWN_HOURS = 1;
const CLAN_WAR_DURATION_DAYS = 3;

const CLAN_LEVELS = [
    { level: 1, cost: 0, cumulative: 0, perks: "Founding" },
    { level: 2, cost: 1000, cumulative: 1000, perks: "Productivity I: +5% Bits from /work." },
    { level: 3, cost: 5000, cumulative: 6000, perks: "Momentum I: 2.5% chance to reset /work & /gather cooldown." },
    { level: 4, cost: 7500, cumulative: 13500, perks: "Productivity II: /work bonus increases to +10%." },
    { level: 5, cost: 15000, cumulative: 28500, perks: "High Roller I: Max /slots bet doubles to 3,000." },
    { level: 6, cost: 25000, cumulative: 53500, perks: "Abundance I: +1 flat bonus to gathered resources." },
    { level: 7, cost: 35000, cumulative: 88500, perks: "Momentum II: Cooldown reset chance doubles to 5%." },
    { level: 8, cost: 50000, cumulative: 138500, perks: "Productivity III: /work bonus increases to +15%." },
    { level: 9, cost: 75000, cumulative: 213500, perks: "Abundance II: /gather bonus increases to +2." },
    { level: 10, cost: 125000, cumulative: 338500, perks: "Legacy: /gather bonus increases to +5 & a golden name color." },
];

const CLAN_WAR_REWARDS = {
    1: { bits: 0, items: [{ itemId: 'crystal_pickaxe', quantity: 5 }] },
    2: { bits: 0, items: [{ itemId: 'crystal_pickaxe', quantity: 2 }] },
    3: { bits: 0, items: [{ itemId: 'crystal_pickaxe', quantity: 1 }] },
};


module.exports = {
    CURRENCY_NAME, STARTING_BALANCE, DISCORD_INVITE_LINK,
    DAILY_REWARD_BASE, DAILY_STREAK_BONUS, HOURLY_REWARD_BASE, HOURLY_STREAK_BONUS,
    WORK_REWARD_MIN, WORK_REWARD_MAX, WORK_COOLDOWN_MINUTES,
    HOURLY_COOLDOWN_MINUTES, GATHER_COOLDOWN_MINUTES, MAX_GATHER_TYPES_BASE,
    MARKET_TAX_RATE, FLIP_MIN_BET, FLIP_MAX_BET,
    SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_COOLDOWN_SECONDS,
    SMELT_COOLDOWN_SECONDS_PER_ORE, SMELT_COAL_COST_PER_ORE,
    MINIMUM_ACTION_COOLDOWN_MS, EVENT_CHANNEL_ID, DREDNOT_INVITE_LINK,
    EVENT_TICK_INTERVAL_MINUTES, EVENT_CHANCE, EVENTS, TRAITS, ITEMS,
    GATHER_TABLE, SMELTABLE_ORES, COOKABLE_FOODS, SLOT_REELS, SLOTS_PAYOUTS,
    VENDOR_TICK_INTERVAL_MINUTES, VENDORS, FALLBACK_PRICES,
    LOOTBOX_VENDOR_NAME, LOOTBOX_VENDOR_ID, LOOTBOX_TICK_INTERVAL_MINUTES,
    MAX_LOOTBOX_LISTINGS, LOOTBOXES,
    CLAN_MEMBER_LIMIT, CLAN_JOIN_COOLDOWN_HOURS, CLAN_WAR_DURATION_DAYS,
    CLAN_LEVELS, CLAN_WAR_REWARDS,
};
