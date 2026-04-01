import { useState } from 'react'
import { rollDie } from '../../utils/dice'

const SPIRAL = [
  null,          // 0 - unused
  'scratch',     // 1
  'scratch',     // 2
  -3,            // 3
  -2,            // 4
  -1,            // 5
  0,             // 6
  +1,            // 7
  +2,            // 8
  0,             // 9
  -2,            // 10
  -3,            // 11
  -4,            // 12
  'scratch',     // 13+
]

function getSpiralMod(pos) {
  if (pos < 1) return 'scratch'
  if (pos >= 13) return 'scratch'
  return SPIRAL[pos]
}

function spiralLabel(pos) {
  const mod = getSpiralMod(pos)
  if (mod === 'scratch') return 'SCRATCH'
  if (mod > 0) return `+${mod}`
  if (mod === 0) return '±0'
  return `${mod}`
}

function spiralColor(pos) {
  const mod = getSpiralMod(pos)
  if (mod === 'scratch') return '#B71C1C'
  if (mod > 0) return '#2E7D32'
  if (mod === 0) return '#607D8B'
  return '#E65100'
}

export default function HeavyThingThrowBoard({
  gameState, eventState, players, currentPlayer, currentPlayerId,
  rolling, rollDieAnimated, pendingAbilityBonus, setPendingAbilityBonus, onEndEvent
}) {
  const [phase, setPhase] = useState('agility') // agility | strength | result | done
  const [spiralPos, setSpiralPos] = useState(null)
  const [agilityRollCount, setAgilityRollCount] = useState(0)
  const [throwDist, setThrowDist] = useState(null)
  const [attemptNum, setAttemptNum] = useState(1)
  const [rolling2, setRolling2] = useState(false)
  const [lastRollDisplay, setLastRollDisplay] = useState(null)

  const es = eventState || {}
  const bestThrows = es.bestThrows || {}
  const attempts = es.attempts || {}

  const currentAnimal = currentPlayer?.animal
  const stats = currentAnimal?.stats || { sp: 6, st: 6, ag: 6 }
  const myAttempts = attempts[currentPlayerId] || 0
  const myBest = bestThrows[currentPlayerId] ?? -1

  const doRollAgility = async () => {
    if (rolling2) return
    setRolling2(true)
    const result = await rollDieAnimated(stats.ag)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)
    setSpiralPos(total)
    setAgilityRollCount(c => c + 1)
    setLastRollDisplay(`Agility D${stats.ag}: ${result}${bonus !== 0 ? ` + ${bonus}` : ''} = pos ${total}`)
    gameState.addLog(`${currentPlayer.name} rolled Agility D${stats.ag}: ${result} → spiral pos ${total}`)
    setPhase('agility_result')
    setRolling2(false)
  }

  const doRollStrength = async () => {
    if (rolling2) return
    setRolling2(true)
    const mod = getSpiralMod(spiralPos)
    const result = await rollDieAnimated(stats.st)
    const bonus = pendingAbilityBonus
    const raw = result + bonus
    if (bonus !== 0) setPendingAbilityBonus(0)
    const total = Math.max(0, raw + (typeof mod === 'number' ? mod : 0))
    setThrowDist(total)
    setLastRollDisplay(`Strength D${stats.st}: ${result}${bonus !== 0 ? ` + ${bonus}` : ''}${typeof mod === 'number' && mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod}` : ''} = ${total}`)
    gameState.addLog(`${currentPlayer.name} threw ${total} spaces!`)

    // Update best throw
    const prevBest = bestThrows[currentPlayerId] ?? -1
    const prevSecond = es.secondBestThrows?.[currentPlayerId] ?? -1
    const prevThird = es.thirdBestThrows?.[currentPlayerId] ?? -1
    let newBest = prevBest, newSecond = prevSecond, newThird = prevThird
    if (total > prevBest) { newThird = newSecond; newSecond = newBest; newBest = total }
    else if (total > prevSecond) { newThird = newSecond; newSecond = total }
    else if (total > prevThird) { newThird = total }

    gameState.updateEventState({
      bestThrows: { ...bestThrows, [currentPlayerId]: newBest },
      secondBestThrows: { ...(es.secondBestThrows || {}), [currentPlayerId]: newSecond },
      thirdBestThrows: { ...(es.thirdBestThrows || {}), [currentPlayerId]: newThird },
      attempts: { ...attempts, [currentPlayerId]: myAttempts + 1 },
    })
    setPhase('result')
    setRolling2(false)
  }

  const nextAttemptOrEnd = () => {
    const newAttemptNum = myAttempts + 1
    if (newAttemptNum >= 3) {
      // Mark this player done
      const newFinished = { ...(es.finished || {}), [currentPlayerId]: true }
      gameState.updateEventState({ finished: newFinished })
      gameState.endTurn()
    } else {
      setAttemptNum(newAttemptNum + 1)
      setSpiralPos(null)
      setThrowDist(null)
      setAgilityRollCount(0)
      setPhase('agility')
    }
    setLastRollDisplay(null)
  }

  const allDone = players.every(p => (attempts[p.id] || 0) >= 3)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-white shadow-md border-2" style={{ borderColor: '#1565C0' }}>
        <h3 className="font-black text-lg mb-3" style={{ color: '#1565C0' }}>🏋️ Heavy Thing Throw</h3>

        {/* Spiral Display */}
        <div className="mb-4">
          <div className="text-sm font-bold text-gray-600 mb-2">Spiral Positions:</div>
          <div className="flex flex-wrap gap-1">
            {[1,2,3,4,5,6,7,8,9,10,11,12,13].map(pos => (
              <div
                key={pos}
                className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-white text-xs font-bold border-4 transition-all"
                style={{
                  background: spiralColor(pos),
                  borderColor: spiralPos === pos ? '#F57F17' : 'transparent',
                  transform: spiralPos === pos ? 'scale(1.2)' : 'scale(1)',
                }}
              >
                <div>{pos}</div>
                <div style={{ fontSize: '9px' }}>{spiralLabel(pos)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Distance Track */}
        <div className="mb-4">
          <div className="text-sm font-bold text-gray-600 mb-2">Distance Track (1–16):</div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 16 }, (_, i) => i + 1).map(sp => {
              const best = bestThrows[currentPlayerId] ?? -1
              return (
                <div
                  key={sp}
                  className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold border-2 transition-all"
                  style={{
                    background: sp === best ? '#2E7D32' : sp <= best ? '#C8E6C9' : sp === throwDist && phase === 'result' ? '#F57F17' : '#F5F5F5',
                    color: sp <= best || sp === throwDist ? 'white' : '#333',
                    borderColor: sp === throwDist && phase === 'result' ? '#F57F17' : '#ddd',
                    transform: sp === throwDist && phase === 'result' ? 'scale(1.2)' : 'scale(1)',
                  }}
                >
                  {sp}
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
                <div className="text-xs text-gray-500">
                  Att: {attempts[p.id] || 0}/3
                </div>
              </div>
              <div className="font-black text-lg" style={{ color: '#2E7D32' }}>
                {(bestThrows[p.id] ?? -1) >= 0 ? `${bestThrows[p.id]}m` : '—'}
              </div>
            </div>
          ))}
        </div>

        {/* Last Roll Display */}
        {lastRollDisplay && (
          <div className="mb-3 p-3 rounded-xl text-center font-bold" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
            {lastRollDisplay}
          </div>
        )}

        {/* Action Area */}
        <div className="p-3 rounded-xl border-2" style={{ borderColor: currentPlayer?.color.hex || '#2E7D32', background: '#F9FBE7' }}>
          <div className="font-bold mb-2 text-center">
            {currentPlayer?.name} — Attempt {Math.min((attempts[currentPlayerId] || 0) + 1, 3)}/3
          </div>

          {phase === 'agility' && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">Roll Agility to find your position on the spiral. Must land on 3–12 to throw.</p>
              <button
                onClick={doRollAgility}
                disabled={rolling || rolling2}
                className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                style={{ background: '#1565C0' }}
              >
                🎯 Roll Agility D{stats.ag}
              </button>
            </div>
          )}

          {phase === 'agility_result' && spiralPos !== null && (
            <div className="text-center">
              <p className="text-sm font-bold mb-2">
                Landed on space {spiralPos}: <span style={{ color: spiralColor(spiralPos) }}>{spiralLabel(spiralPos)}</span>
              </p>
              {getSpiralMod(spiralPos) === 'scratch' ? (
                <div>
                  <p className="text-red-600 font-bold mb-3">SCRATCH! No throw this attempt.</p>
                  <button onClick={nextAttemptOrEnd} className="py-3 px-6 rounded-xl text-white font-bold" style={{ background: '#607D8B' }}>
                    Next Attempt
                  </button>
                </div>
              ) : (
                <div>
                  {agilityRollCount < 2 && (
                    <div className="flex gap-3 justify-center mb-3">
                      <button
                        onClick={doRollAgility}
                        disabled={rolling2}
                        className="py-3 px-4 rounded-xl text-white font-bold hover:scale-105 transition-transform"
                        style={{ background: '#E65100' }}
                      >
                        🎲 Reroll Agility (press luck)
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setPhase('strength')}
                    className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform"
                    style={{ background: '#2E7D32' }}
                  >
                    💪 Roll Strength D{stats.st}
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'strength' && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">
                Spiral pos {spiralPos} ({spiralLabel(spiralPos)}). Roll Strength to determine throw distance!
              </p>
              <button
                onClick={doRollStrength}
                disabled={rolling || rolling2}
                className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                style={{ background: '#B71C1C' }}
              >
                💪 Roll Strength D{stats.st}
              </button>
            </div>
          )}

          {phase === 'result' && (
            <div className="text-center">
              <p className="text-2xl font-black mb-1" style={{ color: '#2E7D32' }}>Threw {throwDist} spaces!</p>
              {throwDist === myBest && throwDist > (myAttempts > 0 ? -1 : -2) && <p className="text-sm text-green-600 font-bold">🎉 New personal best!</p>}
              <button
                onClick={nextAttemptOrEnd}
                className="mt-3 py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform"
                style={{ background: (attempts[currentPlayerId] || 0) >= 2 ? '#607D8B' : '#1565C0' }}
              >
                {(attempts[currentPlayerId] || 0) >= 2 ? '✓ Done (End Turn)' : 'Next Attempt →'}
              </button>
            </div>
          )}
        </div>

        {allDone && (
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
