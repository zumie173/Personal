import { useEffect, useState } from 'react'
import { EVENTS } from '../constants/events'
import { FLAVOR_TEXT } from '../constants/scoring'

function Confetti() {
  const [pieces, setPieces] = useState([])
  useEffect(() => {
    const p = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      color: ['#E53935', '#1E88E5', '#43A047', '#8E24AA', '#FB8C00', '#F57F17', '#00897B'][Math.floor(Math.random() * 7)],
      size: 8 + Math.random() * 8,
    }))
    setPieces(p)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: '-20px',
            width: p.size,
            height: p.size,
            background: p.color,
            animation: `fall ${p.duration}s ${p.delay}s linear infinite`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          from { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          to { transform: translateY(110vh) rotate(720deg); opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

function getRandomFlavor(pool, replacements) {
  const template = pool[Math.floor(Math.random() * pool.length)]
  return template.replace(/{(\w+)}/g, (_, key) => replacements[key] || `{${key}}`)
}

export default function FinalResults({ gameState }) {
  const { state } = gameState
  const { players, game } = state
  const [winnerFlavor, setWinnerFlavor] = useState('')
  const [lastFlavor, setLastFlavor] = useState('')

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const winner = sorted[0]
  const lastPlace = sorted[sorted.length - 1]
  const placeLabels = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th', '5th', '6th']

  useEffect(() => {
    if (winner?.animal) {
      setWinnerFlavor(getRandomFlavor(FLAVOR_TEXT.winner, { animal: winner.animal.name }))
    }
    if (lastPlace?.animal && players.length > 2) {
      setLastFlavor(getRandomFlavor(FLAVOR_TEXT.lastPlace, { animal: lastPlace.animal.name }))
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
      <Confetti />

      <div className="text-7xl mb-2">🏆</div>
      <h1 className="text-5xl font-black mb-2" style={{ color: '#2E7D32', textShadow: '2px 2px 0 #1B5E20' }}>
        GAME OVER!
      </h1>
      <h2 className="text-3xl font-bold mb-2" style={{ color: '#E65100' }}>
        {winner.animal?.emoji} {winner.name} Wins!
      </h2>

      {winnerFlavor && (
        <div className="mb-6 p-4 rounded-2xl text-center max-w-md" style={{ background: '#E8F5E9', border: '2px solid #2E7D32' }}>
          <p className="font-bold text-green-800 text-lg italic">"{winnerFlavor}"</p>
        </div>
      )}

      {/* Final Scoreboard */}
      <div className="w-full max-w-md space-y-3 mb-6">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-4 p-4 rounded-xl shadow-md border-4"
            style={{
              background: i === 0 ? '#E8F5E9' : 'white',
              borderColor: i === 0 ? '#2E7D32' : p.color.hex,
            }}
          >
            <div className="text-2xl font-black w-10 text-center">{placeLabels[i].split(' ')[0]}</div>
            <div className="text-3xl">{p.animal?.emoji}</div>
            <div className="flex-1">
              <div className="font-black text-xl" style={{ color: p.color.hex }}>{p.name}</div>
              <div className="text-sm text-gray-500">{p.animal?.name} • {p.peds} PEDs used</div>
            </div>
            <div className="text-3xl font-black" style={{ color: '#2E7D32' }}>{p.score}pts</div>
          </div>
        ))}
      </div>

      {lastFlavor && players.length > 2 && (
        <div className="mb-6 p-4 rounded-xl text-center max-w-md" style={{ background: '#F3E5F5', border: '2px solid #6A1B9A' }}>
          <p className="font-bold text-purple-800 italic">"{lastFlavor}"</p>
        </div>
      )}

      {/* Event Order Played */}
      <div className="w-full max-w-md mb-6">
        <h3 className="font-bold text-lg mb-2 text-gray-700">Events Played:</h3>
        <div className="flex flex-wrap gap-2">
          {game.eventOrder?.slice(0, game.totalEvents).map((eId, i) => {
            const ev = EVENTS[eId]
            return (
              <span key={i} className="px-3 py-1 rounded-full text-sm font-bold bg-white shadow border" style={{ borderColor: '#2E7D32', color: '#2E7D32' }}>
                {ev.emoji} {ev.name}
              </span>
            )
          })}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-4 w-full max-w-md">
        <button
          onClick={() => gameState.setPhase('setup')}
          className="flex-1 py-4 rounded-xl font-bold text-lg hover:scale-105 transition-transform border-4"
          style={{ borderColor: '#1565C0', color: '#1565C0', background: 'white' }}
        >
          🔄 Same Players
        </button>
        <button
          onClick={() => gameState.reset()}
          className="flex-1 py-4 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform shadow-lg"
          style={{ background: 'linear-gradient(135deg, #2E7D32, #43A047)' }}
        >
          🏠 New Game
        </button>
      </div>
    </div>
  )
}
