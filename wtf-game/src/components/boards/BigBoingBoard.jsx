import { useState } from 'react'
import { rollDie } from '../../utils/dice'

// Board: 5 Start spaces, 2 Blank spaces, Runway 6→1 (6 spaces), SCRATCH LINE, Landing 1→12
// Position 0 = Start zone, positions 1-5 = start, 6-7 = blank, 8-13 = runway (6-1), 14+ = scratch
// Actually let's track position as steps taken toward scratch line:
// 0 = haven't moved yet
// 1-5 = Start zone (scratch if landing here after jump attempt)
// 6-7 = Blank (scratch)
// 8-13 = Runway 6-1 (8=runway6, 13=runway1) → VALID JUMP ZONE
// 14 = crossing scratch line = scratch
// Unused dice = 4 - rolls taken

const APPROACH_MAX_ROLLS = 4

function getApproachZone(pos) {
  if (pos === 0) return { label: 'Start', color: '#607D8B', valid: false }
  if (pos <= 5) return { label: 'Start', color: '#607D8B', valid: false }
  if (pos <= 7) return { label: 'Blank', color: '#9E9E9E', valid: false }
  if (pos <= 13) return { label: `Runway ${14 - pos}`, color: '#2E7D32', valid: true }
  return { label: 'SCRATCH!', color: '#B71C1C', valid: false }
}

export default function BigBoingBoard({
  gameState, eventState, players, currentPlayer, currentPlayerId,
  rolling, rollDieAnimated, pendingAbilityBonus, setPendingAbilityBonus, onEndEvent
}) {
  const [rolling2, setRolling2] = useState(false)
  const [phase, setPhase] = useState('approach') // approach | jump | result | done
  const [currentPos, setCurrentPos] = useState(0)
  const [rollsTaken, setRollsTaken] = useState(0)
  const [jumpDistance, setJumpDistance] = useState(null)
  const [isScratch, setIsScratch] = useState(false)
  const [lastRollDisplay, setLastRollDisplay] = useState(null)

  const es = eventState || {}
  const bestJumps = es.bestJumps || {}
  const attempts = es.attempts || {}

  const currentAnimal = currentPlayer?.animal
  const stats = currentAnimal?.stats || { sp: 6, st: 6, ag: 6 }
  const myAttempts = attempts[currentPlayerId] || 0
  const myBest = bestJumps[currentPlayerId] ?? -1
  const unusedDice = APPROACH_MAX_ROLLS - rollsTaken

  const doApproachRoll = async () => {
    if (rolling2 || rollsTaken >= APPROACH_MAX_ROLLS) return
    setRolling2(true)
    const result = await rollDieAnimated(stats.sp)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)

    const newPos = currentPos + total
    const newRolls = rollsTaken + 1
    setRollsTaken(newRolls)
    setCurrentPos(newPos)
    setLastRollDisplay(`Speed D${stats.sp}: ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total} → now at position ${newPos}`)
    gameState.addLog(`${currentPlayer.name} approach roll ${newRolls}: +${total} → position ${newPos}`)

    if (newPos >= 14) {
      // Crossed scratch line
      setIsScratch(true)
      setPhase('scratch')
      gameState.addLog(`${currentPlayer.name} crossed the scratch line! SCRATCH!`)
      finishAttempt(-1)
    } else {
      setRolling2(false)
    }
    if (newPos < 14) setRolling2(false)
  }

  const doStopAndJump = async () => {
    const zone = getApproachZone(currentPos)
    if (!zone.valid) {
      // Scratch
      setIsScratch(true)
      setPhase('scratch')
      gameState.addLog(`${currentPlayer.name} is in ${zone.label} — SCRATCH!`)
      finishAttempt(-1)
      return
    }
    // Jump!
    setPhase('jump')
    setRolling2(true)
    const bonus = pendingAbilityBonus + unusedDice // each unused die = +1
    if (pendingAbilityBonus !== 0) setPendingAbilityBonus(0)
    const result = await rollDieAnimated(stats.ag)
    const total = Math.min(12, result + bonus)
    setJumpDistance(total)
    setLastRollDisplay(`Agility D${stats.ag}: ${result} + ${unusedDice} unused dice${pendingAbilityBonus > 0 ? ` + ${pendingAbilityBonus}` : ''} = ${total} meters!`)
    gameState.addLog(`${currentPlayer.name} JUMPED! Agility ${result} + ${unusedDice} unused = ${total}m!`)

    finishAttempt(total)
    setPhase('result')
    setRolling2(false)
  }

  const finishAttempt = (dist) => {
    const prevBest = bestJumps[currentPlayerId] ?? -1
    const prevSecond = es.secondBestJumps?.[currentPlayerId] ?? -1
    const prevThird = es.thirdBestJumps?.[currentPlayerId] ?? -1
    let newBest = prevBest, newSecond = prevSecond, newThird = prevThird
    if (dist > newBest) { newThird = newSecond; newSecond = newBest; newBest = dist }
    else if (dist > newSecond) { newThird = newSecond; newSecond = dist }
    else if (dist > newThird) { newThird = dist }

    gameState.updateEventState({
      bestJumps: { ...bestJumps, [currentPlayerId]: Math.max(0, newBest) },
      secondBestJumps: { ...(es.secondBestJumps || {}), [currentPlayerId]: Math.max(0, newSecond) },
      thirdBestJumps: { ...(es.thirdBestJumps || {}), [currentPlayerId]: Math.max(0, newThird) },
      attempts: { ...attempts, [currentPlayerId]: myAttempts + 1 },
    })
    setRolling2(false)
  }

  const nextAttemptOrEnd = () => {
    const newCount = myAttempts + 1
    if (newCount >= 3) {
      const newFinished = { ...(es.finished || {}), [currentPlayerId]: true }
      gameState.updateEventState({ finished: newFinished })
      gameState.endTurn()
    } else {
      setPhase('approach')
      setCurrentPos(0)
      setRollsTaken(0)
      setJumpDistance(null)
      setIsScratch(false)
      setLastRollDisplay(null)
    }
  }

  const zone = getApproachZone(currentPos)
  const allDone = players.every(p => (attempts[p.id] || 0) >= 3)

  // Build visual approach track
  const trackSpaces = [
    { label: 'S', sub: 'Start', bg: '#607D8B' },
    { label: 'S', sub: 'Start', bg: '#607D8B' },
    { label: 'S', sub: 'Start', bg: '#607D8B' },
    { label: 'S', sub: 'Start', bg: '#607D8B' },
    { label: 'S', sub: 'Start', bg: '#607D8B' },
    { label: '_', sub: 'Blank', bg: '#9E9E9E' },
    { label: '_', sub: 'Blank', bg: '#9E9E9E' },
    { label: '6', sub: 'Run', bg: '#2E7D32' },
    { label: '5', sub: 'Run', bg: '#43A047' },
    { label: '4', sub: 'Run', bg: '#66BB6A' },
    { label: '3', sub: 'Run', bg: '#81C784' },
    { label: '2', sub: 'Run', bg: '#A5D6A7' },
    { label: '1', sub: 'Run', bg: '#C8E6C9' },
    { label: '✗', sub: 'SCRATCH', bg: '#B71C1C' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-white shadow-md border-2" style={{ borderColor: '#1565C0' }}>
        <h3 className="font-black text-lg mb-3" style={{ color: '#1565C0' }}>🦘 Big Boing — Long Jump</h3>

        {/* Approach Track */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: '#E3F2FD' }}>
          <div className="text-sm font-bold text-gray-600 mb-2">Approach Track → Jump!</div>
          <div className="flex gap-1 flex-wrap items-end">
            {trackSpaces.map((sp, i) => {
              const trackPos = i + 1
              const isCurrentPos = currentPos === trackPos
              return (
                <div
                  key={i}
                  className="w-9 h-10 rounded flex flex-col items-center justify-center text-white font-bold border-4 transition-all text-xs"
                  style={{
                    background: sp.bg,
                    borderColor: isCurrentPos ? '#F57F17' : 'transparent',
                    transform: isCurrentPos ? 'scale(1.2)' : 'scale(1)',
                  }}
                >
                  <div>{sp.label}</div>
                  <div style={{ fontSize: '7px' }}>{sp.sub}</div>
                </div>
              )
            })}
            <div className="text-gray-400 font-bold mx-1">→</div>
            {/* Landing track */}
            {Array.from({ length: 12 }, (_, i) => {
              const dist = i + 1
              const isBest = myBest === dist
              return (
                <div
                  key={`l${i}`}
                  className="w-8 h-10 rounded flex flex-col items-center justify-center font-bold border-2 text-xs transition-all"
                  style={{
                    background: isBest ? '#F57F17' : jumpDistance === dist && phase === 'result' ? '#E65100' : '#FFF8E1',
                    color: isBest || jumpDistance === dist ? 'white' : '#333',
                    borderColor: jumpDistance === dist ? '#F57F17' : '#ddd',
                    transform: jumpDistance === dist && phase === 'result' ? 'scale(1.2)' : 'scale(1)',
                  }}
                >
                  {dist}
                  {isBest && <div style={{ fontSize: '7px' }}>best</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Player Bests */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border" style={{ borderColor: p.id === currentPlayerId ? p.color.hex : '#eee' }}>
              <span>{p.animal?.emoji}</span>
              <div className="flex-1">
                <div className="font-bold text-sm" style={{ color: p.color.hex }}>{p.name}</div>
                <div className="text-xs text-gray-500">Att: {attempts[p.id] || 0}/3</div>
              </div>
              <div className="font-black text-lg" style={{ color: '#1565C0' }}>
                {(bestJumps[p.id] ?? -1) >= 0 ? `${bestJumps[p.id]}m` : '—'}
              </div>
            </div>
          ))}
        </div>

        {/* Last Roll Display */}
        {lastRollDisplay && (
          <div className="mb-3 p-3 rounded-xl text-center font-bold" style={{ background: '#E3F2FD', color: '#1565C0' }}>
            {lastRollDisplay}
          </div>
        )}

        {/* Action Area */}
        <div className="p-3 rounded-xl border-2" style={{ borderColor: currentPlayer?.color.hex || '#1565C0', background: '#F0F4FF' }}>
          <div className="font-bold text-center mb-2">
            {currentPlayer?.name} — Attempt {Math.min(myAttempts + 1, 3)}/3 &nbsp;|&nbsp;
            Unused dice bonus: +{unusedDice}
          </div>

          {phase === 'approach' && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">
                Current position: <span className="font-bold" style={{ color: zone.color }}>{zone.label}</span>
                {currentPos > 0 && !zone.valid && ' (Scratch zone!)'}
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Rolls left: {APPROACH_MAX_ROLLS - rollsTaken}. Land on Runway (green) to jump. Each unused die = +1 to jump!
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                {rollsTaken < APPROACH_MAX_ROLLS && (
                  <button
                    onClick={doApproachRoll}
                    disabled={rolling || rolling2}
                    className="py-4 px-6 rounded-xl text-white font-black text-base hover:scale-105 transition-transform disabled:opacity-50"
                    style={{ background: '#1565C0' }}
                  >
                    ⚡ Roll Speed D{stats.sp} ({APPROACH_MAX_ROLLS - rollsTaken} left)
                  </button>
                )}
                {currentPos > 0 && zone.valid && (
                  <button
                    onClick={doStopAndJump}
                    disabled={rolling2}
                    className="py-4 px-6 rounded-xl text-white font-black text-base hover:scale-105 transition-transform disabled:opacity-50"
                    style={{ background: '#2E7D32' }}
                  >
                    🦘 STOP & JUMP! (+{unusedDice} bonus)
                  </button>
                )}
                {rollsTaken >= APPROACH_MAX_ROLLS && zone.valid && (
                  <button
                    onClick={doStopAndJump}
                    disabled={rolling2}
                    className="py-4 px-6 rounded-xl text-white font-black text-base hover:scale-105 transition-transform"
                    style={{ background: '#2E7D32' }}
                  >
                    🦘 JUMP NOW! (no more approach rolls)
                  </button>
                )}
                {rollsTaken >= APPROACH_MAX_ROLLS && !zone.valid && (
                  <div>
                    <p className="text-red-600 font-bold">Out of rolls and not on runway — SCRATCH!</p>
                    <button onClick={() => { finishAttempt(-1); setPhase('result'); setIsScratch(true) }} className="mt-2 py-3 px-6 rounded-xl text-white font-bold" style={{ background: '#B71C1C' }}>
                      Accept Scratch
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === 'jump' && (
            <div className="text-center">
              <p className="text-lg font-black animate-bounce" style={{ color: '#2E7D32' }}>🦘 BOING!</p>
            </div>
          )}

          {phase === 'result' && (
            <div className="text-center">
              {isScratch ? (
                <p className="text-2xl font-black mb-3" style={{ color: '#B71C1C' }}>💥 SCRATCH!</p>
              ) : (
                <p className="text-2xl font-black mb-1" style={{ color: '#1565C0' }}>🦘 Jumped {jumpDistance}m!</p>
              )}
              {jumpDistance === myBest && jumpDistance >= 0 && <p className="text-sm text-green-600 font-bold">🎉 New personal best!</p>}
              <button
                onClick={nextAttemptOrEnd}
                className="mt-3 py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform"
                style={{ background: myAttempts >= 2 ? '#607D8B' : '#1565C0' }}
              >
                {myAttempts >= 2 ? '✓ Done (End Turn)' : 'Next Attempt →'}
              </button>
            </div>
          )}

          {phase === 'scratch' && (
            <div className="text-center">
              <p className="text-2xl font-black mb-3" style={{ color: '#B71C1C' }}>💥 SCRATCH!</p>
              <button
                onClick={nextAttemptOrEnd}
                className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform"
                style={{ background: myAttempts >= 2 ? '#607D8B' : '#1565C0' }}
              >
                {myAttempts >= 2 ? '✓ Done (End Turn)' : 'Next Attempt →'}
              </button>
            </div>
          )}
        </div>

        {allDone && (
          <button
            onClick={onEndEvent}
            className="mt-3 w-full py-4 rounded-xl text-white font-black text-xl hover:scale-105 transition-transform"
            style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
          >
            🏁 Score Event!
          </button>
        )}
      </div>
    </div>
  )
}
