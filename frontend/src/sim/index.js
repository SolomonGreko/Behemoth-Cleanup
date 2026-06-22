/**
 * sim/index.js — Barrel export for the resource system.
 *
 * Import everything from one place:
 *   import { RESOURCE, COST, ECON } from './sim/index.js';
 *   import { canAfford, trySpend, addResources } from './sim/index.js';
 */

// Config
export { RESOURCE, COST, ECON, ENEMY, WAVE, SWARM, SCALING, BASE, LEVEL, DAY_CYCLE, TURRET, BOT, ARTILLERY } from './config.js';

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
  createSim,
  stepTick,
  getStats,
  getLabourSummary,
  getWavePreview,
  toggleSound,
  setSoundEnabled,
  buyBot,
  buyWatcher,
  buyWall,
  buyWallUpgrade,
  selectTurret,
  deselectTurret,
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
  findArtilleryTarget,
  tickArtilleryEnemy,
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

// Turret system
export {
  createWatcher,
  upgradeToTurret,
  addMortar,
  mountOnWall,
  findTarget,
  tickTurrets,
  getTurretSummary,
  getTurretById,
  findTurretAt,
} from './turrets.js';

// Wall system
export {
  createWall,
  canPlaceWall,
  damageWall,
  destroyWall,
  repairWall,
  findNearestDamagedWall,
  upgradeWall,
  getWallCost,
  tickWalls,
  canMountOnWall,
  findWallAt,
  findBlockingWall,
  isPointInWall,
  getWallSummary,
} from './walls.js';

// Canvas rendering
export {
  hexToRgba,
  formatLabelFont,
  formatLabelText,
  drawBackground,
  drawBase,
  drawEnemies,
  drawDeathParticles,
  drawCrystalDrops,
  drawBossShockwaves,
  drawTurrets,
  drawBots,
  drawWalls,
  drawDayNightOverlay,
  drawSelectionRing,
} from './render.js';
