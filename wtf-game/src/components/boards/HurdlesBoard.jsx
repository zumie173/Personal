import { useState } from 'react'

const TOTAL_SPACES = 18
const LAPS = 2

// Hurdles: space number -> agility threshold (must roll HIGHER than this)
const HURDLES = { 4: 2, 10: 3, 14: 2, 18: 4 }

export default function HurdlesBoard({
  gameState, eventState, players, currentPlayer, currentPlayerId,
  rolling, rollDieAnimated, pendingAbilityBonus, setPendingAbilityBonus, onEndEvent
}) {
  const [rolledThisTurn, setRolledThisTurn] = useState(false)
  const [rolling2, setRolling2] = useState(false)
  const [lastRollDisplay, setLastRollDisplay] = useState(null)
  const [hurdlePhase, setHurdlePhase] = useState(false) // currently attempting a hurdle
  const [hurdleSpace, setHurdleSpace] = useState(null)
  const [remainingMove, setRemainingMove] = useState(0)

  const es = eventState || {}
  const positions = es.positions || {}
  const laps = es.laps || {}
  const finished = es.finishOrder || []
  const tipped = es.tipped || {}

  const currentAnimal = currentPlayer?.animal
  const stats = currentAnimal?.stats || { sp: 6, st: 6, ag: 6 }
  const myPos = positions[currentPlayerId] || 0
  const myLaps = laps[currentPlayerId] || 0
  const isTipped = tipped[currentPlayerId]
  const isFinished = finished.includes(currentPlayerId)

  const advancePlayer = (moveSpaces) => {
    let newPos = myPos + moveSpaces
    let newLaps = myLaps
    let remaining = 0

    // Check if hits a hurdle mid-move
    for (let step = 1; step <= moveSpaces; step++) {
      const checkPos = myPos + step
      const effectivePos = checkPos > TOTAL_SPACES ? checkPos - TOTAL_SPACES : checkPos
      const effectiveLaps = checkPos > TOTAL_SPACES ? myLaps + 1 : myLaps
      if (HURDLES[effectivePos] !== undefined && effectiveLaps < LAPS) {
        // Hit hurdle at this position
        remaining = moveSpaces - step
        setHurdleSpace(effectivePos)
        setRemainingMove(remaining)
        setHurdlePhase(true)
        gameState.updateEventState({
          positions: { ...positions, [currentPlayerId]: effectivePos },
          laps: { ...laps, [currentPlayerId]: effectiveLaps },
        })
        gameState.addLog(`${currentPlayer.name} reaches hurdle at space ${effectivePos}! Must roll Agility > ${HURDLES[effectivePos]}`)
        return
      }
    }

    // No hurdles hit, complete move
    while (newPos > TOTAL_SPACES) {
      newPos -= TOTAL_SPACES
      newLaps++
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
    })
    setRolledThisTurn(true)
  }

  const doRollSpeed = async () => {
    if (rolling2 || isFinished || isTipped) return
    setRolling2(true)
    const result = await rollDieAnimated(stats.sp)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)
    setLastRollDisplay(`Speed D${stats.sp}: ${result}${bonus !== 0 ? ` + ${bonus}` : ''} = ${total} spaces`)
    gameState.addLog(`${currentPlayer.name} rolled Speed D${stats.sp}: ${result} → ${total} spaces`)
    setRolling2(false)
    advancePlayer(total)
  }

  const doHurdleAttempt = async () => {
    setRolling2(true)
    const result = await rollDieAnimated(stats.ag)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)
    const threshold = HURDLES[hurdleSpace]
    const cleared = total > threshold
    setLastRollDisplay(`Hurdle Agility D${stats.ag}: ${result}${bonus !== 0 ? ` + ${bonus}` : ''} = ${total} — ${cleared ? '✓ CLEARED!' : '✗ TIPPED!'}`)
    gameState.addLog(`${currentPlayer.name} hurdle at space ${hurdleSpace}: rolled ${total} vs threshold ${threshold} — ${cleared ? 'CLEARED!' : 'FAILED!'}`)
    setHurdlePhase(false)

    if (cleared) {
      // Continue moving
      if (remainingMove > 0) {
        gameState.addLog(`${currentPlayer.name} continues ${remainingMove} more spaces`)
        advancePlayer(remainingMove)
      } else {
        setRolledThisTurn(true)
      }
    } else {
      // Tip over: lose next entire turn
      gameState.updateEventState({
        tipped: { ...tipped, [currentPlayerId]: false }, // reset since they lose NEXT turn
      })
      gameState.updatePlayer(currentPlayerId, { skipNextTurn: true })
      gameState.addLog(`${currentPlayer.name} tipped! Loses next turn.`)
      setRolledThisTurn(true)
    }
    setRolling2(false)
  }

  const handleEndTurn = () => {
    setRolledThisTurn(false)
    setHurdlePhase(false)
    setLastRollDisplay(null)
    gameState.endTurn()
  }

  const allFinished = players.every(p => finished.includes(p.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-white shadow-md border-2" style={{ borderColor: '#E65100' }}>
        <h3 className="font-black text-lg mb-3" style={{ color: '#E65100' }}>🏁 Hurting Hurdles</h3>

        {/* Track Visualization */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: '#FFF3E0' }}>
          <div className="text-sm font-bold text-gray-600 mb-2">Track (18 spaces, 2 laps):</div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: TOTAL_SPACES }, (_, i) => {
              const space = i + 1
              const isHurdle = HURDLES[space] !== undefined
              const playersHere = players.filter(p => (positions[p.id] || 0) === space && !finished.includes(p.id))
              return (
                <div
                  key={space}
                  className="w-10 h-12 rounded-lg flex flex-col items-center justify-center text-xs font-bold border-2 relative"
                  style={{
                    background: isHurdle ? '#F57F17' : '#FFF8E1',
                    color: isHurdle ? 'white' : '#333',
                    borderColor: isHurdle ? '#E65100' : '#ddd',
                  }}
                >
                  <div>{space}</div>
                  {isHurdle && <div style={{ fontSize: '8px' }}>▬ {`>`}{HURDLES[space]}</div>}
                  {playersHere.length > 0 && (
                    <div className="absolute -top-1 -right-1 flex flex-wrap gap-0.5">
                      {playersHere.map(p => (
                        <div key={p.id} className="w-4 h-4 rounded-full border border-white flex items-center justify-center" style={{ background: p.color.hex, fontSize: '8px' }}>
                          {tipped[p.id] ? '😵' : p.animal?.emoji}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="text-xs mt-2 text-orange-700 font-medium">
            ▬ = Hurdle. Number = must roll Agility HIGHER than this to clear. Fail = lose next turn!
          </div>
        </div>

        {/* Player Status */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {players.map(p => {
            const isFinish = finished.includes(p.id)
            const place = finished.indexOf(p.id) + 1
            return (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: p.id === currentPlayerId ? p.color.hex : '#eee', background: isFinish ? '#E8F5E9' : 'white' }}>
                <span className="text-xl">{tipped[p.id] ? '😵' : p.animal?.emoji}</span>
                <div className="flex-1">
                  <div className="font-bold text-sm" style={{ color: p.color.hex }}>{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {isFinish ? `🏁 ${place}${['st','nd','rd'][place-1]||'th'}` : `Lap ${(laps[p.id] || 0) + 1} | Sp ${positions[p.id] || 0}`}
                    {p.skipNextTurn && <span className="ml-1 text-red-500 font-bold">⏭️ Skip</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Last Roll Display */}
        {lastRollDisplay && (
          <div className="mb-3 p-3 rounded-xl text-center font-bold" style={{ background: '#FFF3E0', color: '#E65100' }}>
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
          <div className="p-3 rounded-xl border-2" style={{ borderColor: currentPlayer?.color.hex || '#E65100', background: '#FFF8E1' }}>
            {hurdlePhase ? (
              <div className="text-center">
                <p className="text-lg font-black mb-1" style={{ color: '#E65100' }}>
                  ▬ HURDLE at Space {hurdleSpace}!
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  Must roll Agility D{stats.ag} HIGHER than {HURDLES[hurdleSpace]}. Fail = lose next turn!
                  {remainingMove > 0 && ` (${remainingMove} spaces remain if cleared)`}
                </p>
                <button
                  onClick={doHurdleAttempt}
                  disabled={rolling2}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                  style={{ background: '#E65100' }}
                >
                  🤸 Attempt Hurdle! D{stats.ag}
                </button>
              </div>
            ) : !rolledThisTurn ? (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">
                  Position: Space {myPos}, Lap {myLaps + 1}
                </p>
                <button
                  onClick={doRollSpeed}
                  disabled={rolling || rolling2}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                  style={{ background: '#2E7D32' }}
                >
                  ⚡ Roll Speed D{stats.sp}
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
            style={{ background: 'linear-gradient(135deg, #E65100, #B71C1C)' }}
          >
            🏁 Score Event!
          </button>
        )}
      </div>
    </div>
  )
}
