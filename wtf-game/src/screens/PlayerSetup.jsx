import { useState } from 'react'
import { PLAYER_COLORS } from '../constants/scoring'

export default function PlayerSetup({ gameState }) {
  const [playerCount, setPlayerCount] = useState(4)
  const [names, setNames] = useState(['', '', '', '', '', ''])

  const handleStart = () => {
    const validNames = names.slice(0, playerCount).map((n, i) => n.trim() || `Player ${i + 1}`)
    const players = validNames.map((name, i) => ({
      id: `p${i}`,
      name,
      color: PLAYER_COLORS[i],
      score: 0,
      peds: 0,
      pedDieSides: 4,
      cardSide: 'front',
      abilityUsedThisTurn: false,
      skipNextTurn: false,
      monkeyStuck: false,
      animal: null,
      animalOptions: [],
      position: 0,
      laps: 0,
      tipped: false,
      terrainPenalty: null,
      bestThrow: -1,
      currentAttempt: 0,
      jumpBonusDice: 0,
      finished: false,
    }))
    gameState.setPlayerCount(playerCount)
    gameState.setPlayers(players)
    gameState.setPhase('animal_select')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
      <h1 className="text-5xl font-black mb-2" style={{ color: '#2E7D32' }}>Player Setup</h1>
      <p className="text-gray-600 mb-8 text-lg">Who's competing today?</p>

      {/* Player Count */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 text-center text-gray-700">Number of Players</h2>
        <div className="flex gap-3 flex-wrap justify-center">
          {[2, 3, 4, 5, 6].map(n => (
            <button
              key={n}
              onClick={() => setPlayerCount(n)}
              className="w-16 h-16 rounded-xl text-2xl font-black transition-all hover:scale-110 active:scale-95 shadow-md"
              style={{
                background: playerCount === n ? '#2E7D32' : 'white',
                color: playerCount === n ? 'white' : '#2E7D32',
                border: `3px solid #2E7D32`,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {playerCount === 6 && (
          <p className="text-center text-sm text-purple-700 mt-2 font-medium">⚠️ 6 players: only 4 random events will be played</p>
        )}
        {playerCount === 2 && (
          <p className="text-center text-sm text-blue-700 mt-2 font-medium">ℹ️ 2 players: No PEDs awarded</p>
        )}
      </div>

      {/* Player Names */}
      <div className="w-full max-w-md mb-8">
        <h2 className="text-xl font-bold mb-4 text-gray-700">Player Names</h2>
        {Array.from({ length: playerCount }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md flex-shrink-0"
              style={{ background: PLAYER_COLORS[i].hex }}
            >
              {i + 1}
            </div>
            <input
              type="text"
              placeholder={`Player ${i + 1}`}
              value={names[i]}
              onChange={e => {
                const next = [...names]
                next[i] = e.target.value
                setNames(next)
              }}
              maxLength={16}
              className="flex-1 py-3 px-4 rounded-xl border-2 text-lg font-medium focus:outline-none focus:ring-2"
              style={{ borderColor: PLAYER_COLORS[i].hex }}
            />
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-4 w-full max-w-md">
        <button
          onClick={() => gameState.setPhase('welcome')}
          className="flex-1 py-4 rounded-xl border-3 font-bold text-lg hover:scale-105 transition-transform"
          style={{ border: '3px solid #607D8B', color: '#607D8B' }}
        >
          ← Back
        </button>
        <button
          onClick={handleStart}
          className="flex-2 py-4 px-8 rounded-xl text-white font-black text-xl hover:scale-105 transition-transform active:scale-95 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #2E7D32, #43A047)' }}
        >
          Pick Animals! →
        </button>
      </div>
    </div>
  )
}
