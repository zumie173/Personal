export const ANIMALS = {
  rabbit: {
    id: 'rabbit', name: 'Rabbit', emoji: '🐰',
    stats: { sp: 8, st: 4, ag: 6 }, pip: 1,
    front: {
      description: '+2 to Strength OR +1 to Agility',
      options: [
        { label: '+2 Strength', effect: { type: 'bonus', stat: 'st', value: 2 }},
        { label: '+1 Agility', effect: { type: 'bonus', stat: 'ag', value: 1 }},
      ]
    },
    back: {
      description: 'Lose next turn OR Give 1 point to opponent',
      options: [
        { label: 'Lose next turn', effect: { type: 'skip_turn' }},
        { label: 'Give 1 point to opponent', effect: { type: 'give_point' }},
      ]
    }
  },
  crocodile: {
    id: 'crocodile', name: 'Crocodile', emoji: '🐊',
    stats: { sp: 4, st: 8, ag: 6 }, pip: 1,
    front: {
      description: '+3 to Speed OR +3 to Agility',
      options: [
        { label: '+3 Speed', effect: { type: 'bonus', stat: 'sp', value: 3 }},
        { label: '+3 Agility', effect: { type: 'bonus', stat: 'ag', value: 3 }},
      ]
    },
    back: {
      description: '-2 to one of your own dice rolls',
      options: [
        { label: '-2 to roll', effect: { type: 'penalty', value: -2 }},
      ]
    }
  },
  monkey: {
    id: 'monkey', name: 'Monkey', emoji: '🐒',
    stats: { sp: 6, st: 4, ag: 8 }, pip: 3,
    front: {
      description: '+2 to Strength OR +2 to Speed',
      options: [
        { label: '+2 Strength', effect: { type: 'bonus', stat: 'st', value: 2 }},
        { label: '+2 Speed', effect: { type: 'bonus', stat: 'sp', value: 2 }},
      ]
    },
    back: {
      description: 'Lose next turn OR escape by naturally rolling a 2 on your turn',
      options: [
        { label: 'Lose next turn', effect: { type: 'skip_turn' }},
        { label: 'Watch for natural 2 to escape', effect: { type: 'monkey_watch' }},
      ]
    }
  },
  lizard: {
    id: 'lizard', name: 'Lizard', emoji: '🦎',
    stats: { sp: 8, st: 4, ag: 6 }, pip: 2,
    front: {
      description: 'Reroll Strength OR Agility die',
      options: [
        { label: 'Reroll Strength', effect: { type: 'reroll', stat: 'st' }},
        { label: 'Reroll Agility', effect: { type: 'reroll', stat: 'ag' }},
      ]
    },
    back: {
      description: 'Lose next turn OR Lose 1 point (min 0)',
      options: [
        { label: 'Lose next turn', effect: { type: 'skip_turn' }},
        { label: 'Lose 1 point', effect: { type: 'lose_point' }},
      ]
    }
  },
  raccoon: {
    id: 'raccoon', name: 'Raccoon', emoji: '🦝',
    stats: { sp: 6, st: 4, ag: 8 }, pip: 2,
    front: {
      description: 'Reroll any die OR Steal 1 point (racing only)',
      options: [
        { label: 'Reroll any die', effect: { type: 'reroll', stat: 'any' }},
        { label: 'Steal 1 point (racing only)', effect: { type: 'steal_point', racingOnly: true }},
      ]
    },
    back: {
      description: 'Reduce a die to 0 OR Give 1 point to opponent',
      options: [
        { label: 'Reduce die to 0', effect: { type: 'set_die', value: 0 }},
        { label: 'Give 1 point to opponent', effect: { type: 'give_point' }},
      ]
    }
  },
  bear: {
    id: 'bear', name: 'Bear', emoji: '🐻',
    stats: { sp: 6, st: 8, ag: 4 }, pip: 2,
    front: {
      description: '+3 to Agility OR +2 to Speed',
      options: [
        { label: '+3 Agility', effect: { type: 'bonus', stat: 'ag', value: 3 }},
        { label: '+2 Speed', effect: { type: 'bonus', stat: 'sp', value: 2 }},
      ]
    },
    back: {
      description: '-2 to one of your own dice rolls',
      options: [
        { label: '-2 to roll', effect: { type: 'penalty', value: -2 }},
      ]
    }
  },
  panda: {
    id: 'panda', name: 'Panda', emoji: '🐼',
    stats: { sp: 6, st: 6, ag: 6 }, pip: 2,
    front: {
      description: '+2 to Agility OR +2 to Speed OR Pull all opponents back 2 spaces (racing only)',
      options: [
        { label: '+2 Agility', effect: { type: 'bonus', stat: 'ag', value: 2 }},
        { label: '+2 Speed', effect: { type: 'bonus', stat: 'sp', value: 2 }},
        { label: 'Pull opponents back 2 spaces (racing only)', effect: { type: 'pull_back', value: 2, racingOnly: true }},
      ]
    },
    back: {
      description: '-2 to one of your own dice rolls',
      options: [
        { label: '-2 to roll', effect: { type: 'penalty', value: -2 }},
      ]
    }
  },
  armadillo: {
    id: 'armadillo', name: 'Armadillo', emoji: '🦔',
    stats: { sp: 6, st: 6, ag: 6 }, pip: 2,
    front: {
      description: '+3 to Speed OR +2 to Strength',
      options: [
        { label: '+3 Speed', effect: { type: 'bonus', stat: 'sp', value: 3 }},
        { label: '+2 Strength', effect: { type: 'bonus', stat: 'st', value: 2 }},
      ]
    },
    back: {
      description: 'Reduce one of your own dice rolls to 1',
      options: [
        { label: 'Reduce die to 1', effect: { type: 'set_die', value: 1 }},
      ]
    }
  },
  penguin: {
    id: 'penguin', name: 'Penguin', emoji: '🐧',
    stats: { sp: 6, st: 6, ag: 4 }, pip: 1,
    front: {
      description: 'Double Speed or Agility roll (max 10)',
      options: [
        { label: 'Double Speed (max 10)', effect: { type: 'double', stat: 'sp', cap: 10 }},
        { label: 'Double Agility (max 10)', effect: { type: 'double', stat: 'ag', cap: 10 }},
      ]
    },
    back: {
      description: '-1 to one of your own dice rolls',
      options: [
        { label: '-1 to roll', effect: { type: 'penalty', value: -1 }},
      ]
    }
  },
  sloth: {
    id: 'sloth', name: 'Sloth', emoji: '🦥',
    stats: { sp: 4, st: 6, ag: 6 }, pip: 3,
    front: {
      description: 'Double any die (max 10)',
      options: [
        { label: 'Double any die (max 10)', effect: { type: 'double', stat: 'any', cap: 10 }},
      ]
    },
    back: {
      description: '-1 to a die OR +1 per PED die rolled this turn (3P+ only)',
      options: [
        { label: '-1 to die', effect: { type: 'penalty', value: -1 }},
        { label: '+1 per PED die rolled (3P+ only)', effect: { type: 'ped_bonus', minPlayers: 3 }},
      ]
    }
  },
  turtle: {
    id: 'turtle', name: 'Turtle', emoji: '🐢',
    stats: { sp: 4, st: 6, ag: 6 }, pip: 3,
    front: {
      description: 'Chain roll — keep rolling on 1 or 2, add totals (cap 8)',
      options: [
        { label: 'Chain roll (cap 8)', effect: { type: 'chain_roll', continueOn: [1, 2], cap: 8 }},
      ]
    },
    back: {
      description: '-2 to one of your own dice rolls',
      options: [
        { label: '-2 to roll', effect: { type: 'penalty', value: -2 }},
      ]
    }
  },
  dodo: {
    id: 'dodo', name: 'Dodo', emoji: '🦤',
    stats: { sp: 4, st: 6, ag: 4 }, pip: 3,
    front: {
      description: 'Reroll any die (mandatory) then add +3 (max 8)',
      options: [
        { label: 'Mandatory reroll + 3 (max 8)', effect: { type: 'mandatory_reroll', bonus: 3, cap: 8 }},
      ]
    },
    back: {
      description: '-1 to one of your own dice rolls',
      options: [
        { label: '-1 to roll', effect: { type: 'penalty', value: -1 }},
      ]
    }
  },
}

export const ANIMAL_LIST = Object.values(ANIMALS)
