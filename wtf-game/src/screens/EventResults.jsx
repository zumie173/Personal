import { useState, useEffect } from 'react'
import { EVENTS } from '../constants/events'
import { SCORING, PED_AWARDS, FLAVOR_TEXT } from '../constants/scoring'

function getRandomFlavor(pool, replacements) {
  const template = pool[Math.floor(Math.random() * pool.length)]
  return template.replace(/{(\w+)}/g, (_, key) => replacements[key] || `{${key}}`)
}

export default function EventResults({ gameState }) {
  const { state } = gameState
  const { eventResults, players, game } = state
  const playerCount = players.length
  const eventId = game.eventOrder?.[game.currentEventIndex] ?? game.eventOrder?.[0]
  const event = EVENTS[eventId] ?? EVENTS[0]

  const [animStep, setAnimStep] = useState(0)
  const [flavorText, setFlavorText] = useState('')
  const [pedFlavorText, setPedFlavorText] = useState('')

  const scoring = SCORING[playerCount] || []
  const pedAwards = PED_AWARDS[playerCount] || []

  // eventResults: { standings: [{playerId, place, points}], tiedForLast: boolean }
  const standings = eventResults?.standings || []
  const tiedForLast = eventResults?.tiedForLast || false

  useEffect(() => {
    const winner = standings[0]
    const winnerPlayer = players.find(p => p.id === winner?.playerId)
    if (winnerPlayer?.animal) {
      setFlavorText(getRandomFlavor(FLAVOR_TEXT.winner, { animal: winnerPlayer.animal.name }))
    }
    const lastPlace = standings[standings.length - 1]
    const lastPlayer = players.find(p => p.id === lastPlace?.playerId)
    if (lastPlayer?.animal && !tiedForLast && playerCount > 2) {
      setPedFlavorText(getRandomFlavor(FLAVOR_TEXT.ped, { player: lastPlayer.name }))
    }
    const timer = setInterval(() => setAnimStep(s => s + 1), 300)
    return () => clearInterval(timer)
  }, [])

  const handleNext = () => {
    // Award points based on standings
    const pointAwards = standings.map(s => ({ playerId: s.playerId, points: s.points }))
    gameState.awardPoints(pointAwards)

    // Award PEDs (only if not tied for last, only 3+ players)
    if (!tiedForLast && playerCount > 2) {
      const pedPlayers = []
      standings.forEach((s, i) => {
        if (pedAwards[i] > 0) {
          pedPlayers.push({ playerId: s.playerId, dieSides: pedAwards[i] })
        }
      })
      if (pedPlayers.length > 0) gameState.awardPeds(pedPlayers)
    }

    gameState.nextEvent()
  }

  const placeLabel = ['1st', '2nd', '3rd', '4th', '5th', '6th']
  const placeMedals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣']

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
      <div className="text-5xl mb-2">{event.emoji}</div>
      <h1 className="text-4xl font-black mb-1" style={{ color: '#2E7D32' }}>{event.name}</h1>
      <h2 className="text-2xl font-bold mb-6" style={{ color: '#E65100' }}>Results!</h2>

      {flavorText && (
        <div className="mb-6 p-4 rounded-2xl text-center max-w-md" style={{ background: '#E8F5E9', border: '2px solid #2E7D32' }}>
          <p className="font-bold text-green-800 text-lg italic">"{flavorText}"</p>
        </div>
      )}

      {/* Standings */}
      <div className="w-full max-w-md space-y-3 mb-6">
        {standings.map((s, i) => {
          const player = players.find(p => p.id === s.playerId)
          const pedDie = !tiedForLast && pedAwards[i] > 0 ? pedAwards[i] : null
          const visible = animStep > i

          return (
            <div
              key={s.playerId}
              className="flex items-center gap-4 p-4 rounded-xl shadow-md border-2 transition-all"
              style={{
                background: i === 0 ? '#E8F5E9' : 'white',
                borderColor: i === 0 ? '#2E7D32' : '#ddd',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-30px)',
                transition: 'all 0.3s ease-out',
              }}
            >
              <div className="text-3xl">{placeMedals[i]}</div>
              <div className="text-2xl">{player?.animal?.emoji}</div>
              <div className="flex-1">
                <div className="font-black text-lg">{player?.name}</div>
                <div className="text-sm text-gray-500">{player?.animal?.name}</div>
              </div>
              <div className="text-right">
                <div className="font-black text-2xl" style={{ color: '#2E7D32' }}>+{s.points}pts</div>
                {pedDie && (
                  <div className="text-sm font-bold" style={{ color: '#6A1B9A' }}>
                    💊 +PED D{pedDie}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {tiedForLast && playerCount > 2 && (
        <div className="mb-4 p-3 rounded-xl text-center" style={{ background: '#FFF3E0', border: '2px solid #E65100' }}>
          <p className="font-bold text-orange-800">⚖️ Tie for last place — no PEDs awarded!</p>
        </div>
      )}

      {pedFlavorText && !tiedForLast && playerCount > 2 && (
        <div className="mb-6 p-3 rounded-xl text-center max-w-md" style={{ background: '#F3E5F5', border: '2px solid #6A1B9A' }}>
          <p className="font-bold text-purple-800 italic">"{pedFlavorText}"</p>
        </div>
      )}

      {/* Updated Scores Preview */}
      <div className="w-full max-w-md mb-6">
        <h3 className="font-bold text-lg mb-2 text-gray-700">Current Totals (after this event):</h3>
        <div className="flex gap-2 flex-wrap">
          {[...players]
            .map(p => {
              const standing = standings.find(s => s.playerId === p.id)
              return { ...p, eventPoints: standing?.points || 0 }
            })
            .sort((a, b) => (b.score + b.eventPoints) - (a.score + a.eventPoints))
            .map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white shadow border" style={{ borderColor: p.color.hex }}>
                <span>{p.animal?.emoji}</span>
                <span className="font-bold" style={{ color: p.color.hex }}>{p.name}</span>
                <span className="font-black" style={{ color: '#2E7D32' }}>{p.score + p.eventPoints}pts</span>
              </div>
            ))}
        </div>
      </div>

      <button
        onClick={handleNext}
        className="py-5 px-12 text-2xl font-black rounded-2xl text-white shadow-lg hover:scale-105 transition-transform active:scale-95"
        style={{ background: 'linear-gradient(135deg, #1565C0, #1E88E5)' }}
      >
        {game.currentEventIndex >= game.totalEvents - 1 ? '🏆 See Final Results!' : '→ Next Event!'}
      </button>
    </div>
  )
}
