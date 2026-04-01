import { useState, useEffect } from 'react'
import { ANIMAL_LIST } from '../constants/animals'
import { PLAYER_COLORS } from '../constants/scoring'

function AnimalCard({ animal, selected, onSelect, disabled }) {
  const statDie = (val) => `D${val}`

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-2xl p-4 border-4 transition-all text-left w-full ${
        selected ? 'scale-105 shadow-2xl' : disabled ? 'opacity-40 scale-95' : 'hover:scale-102 hover:shadow-xl'
      }`}
      style={{
        background: selected ? '#E8F5E9' : 'white',
        borderColor: selected ? '#2E7D32' : '#ddd',
      }}
    >
      <div className="text-5xl text-center mb-2">{animal.emoji}</div>
      <h3 className="text-xl font-black text-center mb-2">{animal.name}</h3>

      <div className="flex justify-around mb-3 text-sm">
        <div className="text-center">
          <div className="font-bold text-blue-600">{statDie(animal.stats.sp)}</div>
          <div className="text-gray-500">Speed</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-red-600">{statDie(animal.stats.st)}</div>
          <div className="text-gray-500">Strength</div>
        </div>
        <div className="text-center">
          <div className="font-bold text-green-600">{statDie(animal.stats.ag)}</div>
          <div className="text-gray-500">Agility</div>
        </div>
      </div>

      <div className="text-xs space-y-1">
        <div className="rounded-lg p-2" style={{ background: '#E8F5E9' }}>
          <span className="font-bold text-green-800">▶ Front: </span>
          <span className="text-green-700">{animal.front.description}</span>
        </div>
        <div className="rounded-lg p-2" style={{ background: '#ECEFF1' }}>
          <span className="font-bold text-gray-700">◀ Back: </span>
          <span className="text-gray-600">{animal.back.description}</span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span className="text-yellow-600 font-bold text-sm">{'⭐'.repeat(animal.pip)} PIP: {animal.pip}</span>
      </div>
    </button>
  )
}

export default function AnimalSelection({ gameState }) {
  const { state } = gameState
  const [animalPairs, setAnimalPairs] = useState(null)
  const [selections, setSelections] = useState({}) // playerId -> animal
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [showRoster, setShowRoster] = useState(false)

  useEffect(() => {
    // Deal animal pairs randomly
    const shuffled = [...ANIMAL_LIST].sort(() => Math.random() - 0.5)
    const pairs = {}
    state.players.forEach((p, i) => {
      pairs[p.id] = [shuffled[i * 2], shuffled[i * 2 + 1]]
    })
    setAnimalPairs(pairs)
  }, [])

  if (!animalPairs) return null

  const currentPlayer = state.players[currentPlayerIndex]
  const allSelected = Object.keys(selections).length === state.players.length

  const handleSelect = (animal) => {
    const newSelections = { ...selections, [currentPlayer.id]: animal }
    setSelections(newSelections)

    if (currentPlayerIndex < state.players.length - 1) {
      setTimeout(() => setCurrentPlayerIndex(currentPlayerIndex + 1), 300)
    } else {
      // All selected - apply to state
      state.players.forEach(p => {
        gameState.assignAnimal(p.id, newSelections[p.id])
      })
      setTimeout(() => setShowRoster(true), 500)
    }
  }

  if (showRoster) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
        <h1 className="text-4xl font-black mb-2" style={{ color: '#2E7D32' }}>🎉 Meet Your Athletes!</h1>
        <p className="text-gray-600 mb-8">Here are your competitors:</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl mb-8">
          {state.players.map((p, i) => {
            const animal = selections[p.id]
            return (
              <div key={p.id} className="rounded-2xl p-4 text-center shadow-lg border-4" style={{ borderColor: p.color.hex, background: 'white' }}>
                <div className="text-4xl mb-1">{animal?.emoji}</div>
                <div className="font-black text-lg">{p.name}</div>
                <div className="font-bold" style={{ color: p.color.hex }}>{animal?.name}</div>
                <div className="text-sm text-gray-500 mt-1">
                  Sp:D{animal?.stats.sp} St:D{animal?.stats.st} Ag:D{animal?.stats.ag}
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={() => gameState.setPhase('event_order')}
          className="py-5 px-12 text-2xl font-black rounded-2xl text-white shadow-lg hover:scale-105 transition-transform active:scale-95"
          style={{ background: 'linear-gradient(135deg, #E65100, #F57F17)' }}
        >
          🎲 Roll for Events! →
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-8" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
      {/* Progress */}
      <div className="flex gap-2 mb-6 mt-2">
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold transition-all"
            style={{
              background: selections[p.id] ? '#2E7D32' : i === currentPlayerIndex ? p.color.hex : '#ddd',
              transform: i === currentPlayerIndex ? 'scale(1.2)' : 'scale(1)',
            }}
          >
            {selections[p.id] ? '✓' : i + 1}
          </div>
        ))}
      </div>

      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-black mb-2 shadow-lg"
        style={{ background: currentPlayer?.color.hex }}>
        {currentPlayerIndex + 1}
      </div>
      <h1 className="text-3xl font-black mb-1" style={{ color: '#2E7D32' }}>
        {currentPlayer?.name}'s Turn
      </h1>
      <p className="text-gray-600 mb-6">Pick your animal athlete!</p>

      {currentPlayer && animalPairs[currentPlayer.id] && (
        <div className="grid grid-cols-2 gap-6 w-full max-w-xl">
          {animalPairs[currentPlayer.id].map(animal => (
            <AnimalCard
              key={animal.id}
              animal={animal}
              selected={selections[currentPlayer.id]?.id === animal.id}
              onSelect={() => handleSelect(animal)}
              disabled={!!selections[currentPlayer.id] && selections[currentPlayer.id]?.id !== animal.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
