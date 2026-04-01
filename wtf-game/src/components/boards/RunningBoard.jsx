import { useState } from 'react'

const TOTAL_SPACES = 16
const LAPS = 2

// Terrain: which spaces trigger what effect (0-indexed: space 1 = index 0)
// Spaces 3-4 = MUD, 10-11 = UPHILL, 13 = DOWNHILL
function getTerrainForSpace(space) {
  if (space === 3 || space === 4) return 'mud'
  if (space === 10 || space === 11) return 'uphill'
  if (space === 13) return 'downhill'
  return null
}

const TERRAIN_STYLES = {
  mud: { bg: '#795548', label: 'MUD', desc: 'Roll Strength next turn instead of Speed' },
  uphill: { bg: '#E65100', label: '↑HILL', desc: 'Roll Strength next turn instead of Speed' },
  downhill: { bg: '#2E7D32', label: '↓HILL', desc: '+1 to Speed roll this turn' },
}

export default function RunningBoard({
  gameState, eventState, players, currentPlayer, currentPlayerId,
  rolling, rollDieAnimated, pendingAbilityBonus, setPendingAbilityBonus, onEndEvent
}) {
  const [rolledThisTurn, setRolledThisTurn] = useState(false)
  const [rolling2, setRolling2] = useState(false)
  const [lastRollDisplay, setLastRollDisplay] = useState(null)

  const es = eventState || {}
  const positions = es.positions || {}
  const laps = es.laps || {}
  const finished = es.finishOrder || []
  const terrainPenalty = es.terrainPenalty || {}

  const currentAnimal = currentPlayer?.animal
  const stats = currentAnimal?.stats || { sp: 6, st: 6, ag: 6 }
  const myPos = positions[currentPlayerId] || 0
  const myLaps = laps[currentPlayerId] || 0
  const myTerrain = terrainPenalty[currentPlayerId]
  const isFinished = finished.includes(currentPlayerId)

  const doRoll = async () => {
    if (rolling2 || isFinished) return
    setRolling2(true)

    const useStrength = myTerrain === 'mud' || myTerrain === 'uphill'
    const stat = useStrength ? 'st' : 'sp'
    const sides = stats[stat]
    let result = await rollDieAnimated(sides)

    // Downhill bonus: if currently ON downhill space, +1
    const currentTerrain = getTerrainForSpace(myPos)
    if (currentTerrain === 'downhill') result += 1

    const bonus = pendingAbilityBonus
    result = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)

    setLastRollDisplay(`${useStrength ? 'Strength' : 'Speed'} D${sides}: rolled ${result - (currentTerrain === 'downhill' ? 1 : 0) - bonus}${bonus !== 0 ? ` +${bonus}` : ''}${currentTerrain === 'downhill' ? ' +1 downhill' : ''} = ${result}`)
    gameState.addLog(`${currentPlayer.name} rolled ${useStrength ? 'Strength' : 'Speed'} D${sides}: moved ${result} spaces`)

    // Move player
    let newPos = myPos + result
    let newLaps = myLaps
    let newTerrain = null

    // Clear terrain penalty after use
    const newTerrainMap = { ...terrainPenalty, [currentPlayerId]: null }

    // Check if crosses lap boundary
    while (newPos > TOTAL_SPACES) {
      newPos -= TOTAL_SPACES
      newLaps++
    }

    // Check terrain on landing spot
    if (newLaps < LAPS) {
      const landedTerrain = getTerrainForSpace(newPos)
      if (landedTerrain === 'mud' || landedTerrain === 'uphill') {
        newTerrain = landedTerrain
        newTerrainMap[currentPlayerId] = landedTerrain
        gameState.addLog(`${currentPlayer.name} lands on ${landedTerrain.toUpperCase()}! Roll Strength next turn.`)
      } else {
        newTerrainMap[currentPlayerId] = null
      }
    } else {
      newTerrainMap[currentPlayerId] = null
    }

    const newPositions = { ...positions, [currentPlayerId]: newPos }
    const newLapsMap = { ...laps, [currentPlayerId]: newLaps }
    let newFinishOrder = [...finished]

    if (newLaps >= LAPS && !finished.includes(currentPlayerId)) {
      newFinishOrder = [...finished, currentPlayerId]
      gameState.addLog(`🏁 ${currentPlayer.name} FINISHES in position ${newFinishOrder.length}!`)
    }

    gameState.updateEventState({
      positions: newPositions,
      laps: newLapsMap,
      finishOrder: newFinishOrder,
      finished: newFinishOrder,
      terrainPenalty: newTerrainMap,
    })

    setRolledThisTurn(true)
    setRolling2(false)
  }

  const handleEndTurn = () => {
    setRolledThisTurn(false)
    setLastRollDisplay(null)
    gameState.endTurn()
  }

  const allFinished = players.every(p => finished.includes(p.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-white shadow-md border-2" style={{ borderColor: '#2E7D32' }}>
        <h3 className="font-black text-lg mb-3" style={{ color: '#2E7D32' }}>🏃 Who Even Likes to Run?</h3>

        {/* Track Visualization */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: '#F1F8E9' }}>
          <div className="text-sm font-bold text-gray-600 mb-2">Track (16 spaces, 2 laps):</div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: TOTAL_SPACES }, (_, i) => {
              const space = i + 1
              const terrain = getTerrainForSpace(space)
              const playersHere = players.filter(p => (positions[p.id] || 0) === space && !finished.includes(p.id))

              return (
                <div
                  key={space}
                  className="w-12 h-12 rounded-lg flex flex-col items-center justify-center text-xs font-bold border-2 relative"
                  style={{
                    background: terrain ? TERRAIN_STYLES[terrain].bg : '#E8F5E9',
                    color: terrain ? 'white' : '#333',
                    borderColor: '#aaa',
                  }}
                >
                  <div>{space}</div>
                  {terrain && <div style={{ fontSize: '8px' }}>{TERRAIN_STYLES[terrain].label}</div>}
                  {playersHere.length > 0 && (
                    <div className="absolute -top-1 -right-1 flex flex-wrap gap-0.5">
                      {playersHere.map(p => (
                        <div key={p.id} className="w-4 h-4 rounded-full border border-white flex items-center justify-center" style={{ background: p.color.hex, fontSize: '8px' }}>
                          {p.animal?.emoji}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-3 mt-2 flex-wrap">
            <span className="text-xs flex items-center gap-1"><span className="w-4 h-4 rounded inline-block" style={{ background: '#795548' }}></span> MUD (Strength next)</span>
            <span className="text-xs flex items-center gap-1"><span className="w-4 h-4 rounded inline-block" style={{ background: '#E65100' }}></span> UPHILL (Strength next)</span>
            <span className="text-xs flex items-center gap-1"><span className="w-4 h-4 rounded inline-block" style={{ background: '#2E7D32' }}></span> DOWNHILL (+1 Speed)</span>
          </div>
        </div>

        {/* Player Status */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {players.map(p => {
            const isFinish = finished.includes(p.id)
            const place = finished.indexOf(p.id) + 1
            const terrain = terrainPenalty[p.id]
            return (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: p.id === currentPlayerId ? p.color.hex : '#eee', background: isFinish ? '#E8F5E9' : 'white' }}>
                <span className="text-xl">{p.animal?.emoji}</span>
                <div className="flex-1">
                  <div className="font-bold text-sm" style={{ color: p.color.hex }}>{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {isFinish ? `🏁 Finished ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}` : `Lap ${laps[p.id] || 0 + 1} | Space ${positions[p.id] || 0}`}
                    {terrain && <span className="ml-1 font-bold" style={{ color: TERRAIN_STYLES[terrain]?.bg }}>({TERRAIN_STYLES[terrain]?.label})</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Last Roll Display */}
        {lastRollDisplay && (
          <div className="mb-3 p-3 rounded-xl text-center font-bold" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
            {lastRollDisplay}
          </div>
        )}

        {/* Finish Order */}
        {finished.length > 0 && (
          <div className="mb-3 p-2 rounded-xl" style={{ background: '#F3E5F5' }}>
            <div className="text-sm font-bold mb-1" style={{ color: '#6A1B9A' }}>Finish Order:</div>
            <div className="flex gap-2 flex-wrap">
              {finished.map((id, i) => {
                const p = players.find(pl => pl.id === id)
                return (
                  <span key={id} className="px-2 py-1 rounded-full text-xs font-bold text-white" style={{ background: p?.color.hex }}>
                    {i + 1}. {p?.animal?.emoji} {p?.name}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Action */}
        {!isFinished ? (
          <div className="p-3 rounded-xl border-2" style={{ borderColor: currentPlayer?.color.hex || '#2E7D32', background: '#F9FBE7' }}>
            {myTerrain && (
              <div className="text-sm font-bold mb-2 p-2 rounded" style={{ background: TERRAIN_STYLES[myTerrain]?.bg, color: 'white' }}>
                ⚠️ {TERRAIN_STYLES[myTerrain]?.desc}
              </div>
            )}
            {!rolledThisTurn ? (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">
                  Position: Space {myPos}, Lap {myLaps + 1}
                  {myTerrain ? ` — Rolling Strength D${stats.st}` : ` — Rolling Speed D${stats.sp}`}
                </p>
                <button
                  onClick={doRoll}
                  disabled={rolling || rolling2}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                  style={{ background: myTerrain ? '#B71C1C' : '#2E7D32' }}
                >
                  {myTerrain ? `💪 Roll Strength D${stats.st}` : `⚡ Roll Speed D${stats.sp}`}
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Now at Space {myPos}, Lap {myLaps + 1}</p>
                <button
                  onClick={handleEndTurn}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform"
                  style={{ background: '#1565C0' }}
                >
                  End Turn →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-xl text-center" style={{ background: '#E8F5E9' }}>
            <p className="font-bold text-green-700">🏁 {currentPlayer?.name} has finished!</p>
            <button onClick={handleEndTurn} className="mt-2 py-3 px-6 rounded-xl text-white font-bold" style={{ background: '#607D8B' }}>
              Next Player →
            </button>
          </div>
        )}

        {allFinished && (
          <button
            onClick={onEndEvent}
            className="mt-3 w-full py-4 rounded-xl text-white font-black text-xl hover:scale-105 transition-transform"
            style={{ background: 'linear-gradient(135deg, #2E7D32, #1565C0)' }}
          >
            🏁 Score Event!
          </button>
        )}
      </div>
    </div>
  )
}
