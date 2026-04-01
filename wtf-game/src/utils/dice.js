export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1
}

export function rollDice(count, sides) {
  return Array.from({ length: count }, () => rollDie(sides))
}

export function getDieSides(stat, playerStats) {
  // stat is 'sp', 'st', or 'ag', playerStats is { sp: 8, st: 4, ag: 6 }
  return playerStats[stat]
}

export function rollStat(stat, animalStats) {
  const sides = animalStats[stat]
  return rollDie(sides)
}

// Get stat name
export const STAT_NAMES = {
  sp: 'Speed',
  st: 'Strength',
  ag: 'Agility',
}

// Get die label
export function getDieLabel(sides) {
  return `D${sides}`
}
