import { useState, useEffect } from 'react'
import { EVENTS } from '../constants/events'
import { rollDie } from '../utils/dice'

export default function EventOrderSetup({ gameState }) {
  const { state } = gameState
  const [rolling, setRolling] = useState(false)
  const [d6Result, setD6Result] = useState(null)
  const [eventOrder, setEventOrder] = useState(null)
  const [showAnimation, setShowAnimation] = useState(false)

  const playerCount = state.playerCount || state.players.length
  const totalEvents = playerCount === 6 ? 4 : 6

  const handleRoll = () => {
    setRolling(true)
    setShowAnimation(true)

    // Animate D6
    let count = 0
    const interval = setInterval(() => {
      setD6Result(rollDie(6))
      count++
      if (count >= 8) {
        clearInterval(interval)
        const finalRoll = rollDie(6)
        setD6Result(finalRoll)
        setRolling(false)

        // Build event order starting from finalRoll-1 (0-indexed) going forward
        const startIdx = finalRoll - 1
        let order
        if (playerCount === 6) {
          // Pick 4 random events from 6
          const all = [0, 1, 2, 3, 4, 5]
          const shuffled = all.sort(() => Math.random() - 0.5)
          order = shuffled.slice(0, 4)
        } else {
          order = []
          for (let i = 0; i < 6; i++) {
            order.push((startIdx + i) % 6)
          }
        }
        setEventOrder(order)
        gameState.setEventOrder(order, playerCount)
      }
    }, 150)
  }

  const allEvents = EVENTS

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
      <h1 className="text-4xl font-black mb-2" style={{ color: '#2E7D32' }}>🎲 Event Order</h1>
      <p className="text-gray-600 mb-8">Roll a D6 to determine the starting event!</p>

      {/* D6 Display */}
      <div
        className="w-32 h-32 rounded-2xl border-8 flex items-center justify-center text-6xl font-black shadow-2xl mb-8 cursor-pointer hover:scale-105 transition-transform"
        style={{
          background: rolling ? '#E65100' : d6Result ? '#2E7D32' : '#1565C0',
          borderColor: rolling ? '#F57F17' : d6Result ? '#1B5E20' : '#0D47A1',
          color: 'white',
          animation: rolling ? 'spin 0.3s linear infinite' : 'none',
        }}
        onClick={!rolling && !eventOrder ? handleRoll : undefined}
      >
        {d6Result || '?'}
      </div>

      {!eventOrder && !rolling && (
        <button
          onClick={handleRoll}
          className="py-5 px-12 text-2xl font-black rounded-2xl text-white shadow-lg hover:scale-105 transition-transform active:scale-95 mb-8"
          style={{ background: 'linear-gradient(135deg, #E65100, #F57F17)' }}
        >
          🎲 Roll D6!
        </button>
      )}

      {rolling && (
        <p className="text-2xl font-bold text-gray-600 animate-pulse mb-8">Rolling...</p>
      )}

      {/* Event Order Display */}
      {eventOrder && (
        <div className="w-full max-w-lg">
          <h2 className="text-2xl font-black text-center mb-4" style={{ color: '#1565C0' }}>
            {playerCount === 6 ? '🎯 4 Random Events Selected!' : `🏁 Starting at Event ${d6Result}!`}
          </h2>

          <div className="space-y-3 mb-8">
            {eventOrder.map((eventIdx, i) => {
              const event = allEvents[eventIdx]
              return (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-xl shadow-md border-2"
                  style={{
                    background: i === 0 ? '#E8F5E9' : 'white',
                    borderColor: i === 0 ? '#2E7D32' : '#ddd',
                    animation: `slideIn ${0.1 + i * 0.1}s ease-out`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg shadow-md"
                    style={{ background: i === 0 ? '#2E7D32' : '#607D8B' }}
                  >
                    {i + 1}
                  </div>
                  <div className="text-2xl">{event.emoji}</div>
                  <div>
                    <div className="font-black text-lg">{event.name}</div>
                    <div className="text-sm text-gray-500">{event.attrNames.join(' + ')}</div>
                  </div>
                  {i === 0 && <div className="ml-auto text-green-700 font-bold">← FIRST!</div>}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => gameState.startEvent()}
            className="w-full py-5 text-2xl font-black rounded-2xl text-white shadow-lg hover:scale-105 transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #2E7D32, #43A047)' }}
          >
            🏁 Start First Event!
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
