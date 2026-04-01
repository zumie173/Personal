// Points by position for each player count
export const SCORING = {
  2: [3, 1],
  3: [3, 2, 0],
  4: [3, 2, 1, 0],
  5: [3, 2, 1, 0, 0],
  6: [3, 2, 1, 1, 0, 0],
}

// PED awards: index = position (0-based), value = PED die sides (0 = no PED)
// Only for games with 3+ players
export const PED_AWARDS = {
  2: [], // no PEDs in 2-player
  3: [0, 0, 4], // last place gets D4
  4: [0, 0, 0, 4], // last gets D4
  5: [0, 0, 0, 0, 4], // last gets D4
  6: [0, 0, 0, 0, 4, 6], // 5th gets D4, 6th gets D6
}

export const PLAYER_COLORS = [
  { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500', hex: '#E53935', name: 'Red' },
  { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500', hex: '#1E88E5', name: 'Blue' },
  { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-500', hex: '#43A047', name: 'Green' },
  { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500', hex: '#8E24AA', name: 'Purple' },
  { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500', hex: '#FB8C00', name: 'Orange' },
  { bg: 'bg-teal-500', text: 'text-teal-500', border: 'border-teal-500', hex: '#00897B', name: 'Teal' },
]

export const FLAVOR_TEXT = {
  winner: [
    "{animal} wins! Probably just lucky.",
    "The crowd goes absolutely feral for {animal}!",
    "{animal} claims victory. {animal}'s mom is very proud.",
    "First place goes to {animal}. Nobody saw that coming. Except {animal}.",
    "{animal} obliterates the competition. Steroids? We don't ask.",
  ],
  lastPlace: [
    "{animal} finishes last. Here is a PED. No questions asked.",
    "Last place. {animal} receives a Performance Enhancing Drug. Legally.",
    "{animal} comes in last. The WTF Committee awards a consolation PED.",
    "The crowd feels bad for {animal}. Here is some pharmaceutical assistance.",
  ],
  zoomie: [
    "ZOOMIE! {player} gets there first!",
    "{player} screams ZOOMIE! The table is chaos.",
    "ZOOMIE confirmed! {player} had more dice energy.",
  ],
  ped: [
    "{player} earns a PED. Use it wisely. Or don't. We don't care.",
    "The WTF Anti-Doping Committee has approved this PED for {player}.",
  ],
}
