/**
 * sim/index.js — Barrel export for the resource system.
 *
 * Import everything from one place:
 *   import { RESOURCE, COST, ECON } from './sim/index.js';
 *   import { canAfford, trySpend, addResources } from './sim/index.js';
 */

// Config
export { RESOURCE, COST, ECON } from './config.js';

// Policy module
export {
  canAfford,
  trySpend,
  addResources,
  buildResourceHUD,
  getResourceRates,
  checkCaps,
  getAffordablePurchases,
} from './resource.js';

// Engine integration
export {
  initResourceState,
  resetResources,
  resourceTick,
  applyStorageUpgrade,
} from './engine.js';

// Bot integration
export {
  BOT_STATES,
  assignStoneHarvest,
  tickStoneHarvest,
  tickStoneReturn,
  releaseStoneZone,
  hasHigherPriorityWork,
} from './bots.js';

// Enemy integration
export {
  ENEMY_TYPES,
  processCrystalDrop,
  expectedCrystalPerKill,
  validateDropTables,
  estimateWaveCrystalIncome,
} from './enemies.js';

// Labour allocator
export {
  LABOUR_PRIORITY,
  reassignBot,
  getBotPriority,
} from './labour.js';

// World generation
export {
  generateStoneZones,
  removeStoneZone,
  countActiveHarvesters,
} from './world.js';

// Essence abilities
export {
  ESSENCE_ABILITIES,
  useEssenceAbility,
  isShieldActive,
  tickShield,
  checkAbilityAvailable,
  getAbilityCooldown,
} from './behemoth.js';
