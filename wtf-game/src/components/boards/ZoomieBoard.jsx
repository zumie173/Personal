import { useState } from 'react'
import { rollDie } from '../../utils/dice'
import { FLAVOR_TEXT } from '../../constants/scoring'

const SPRINT_SPACES = 13

function getRandomFlavor(pool, replacements) {
  const template = pool[Math.floor(Math.random() * pool.length)]
  return template.replace(/{(\w+)}/g, (_, key) => replacements[key] || `{${key}}`)
}

export default function ZoomieBoard({
  gameState, eventState, players, currentPlayer, currentPlayerId,
  rolling, rollDieAnimated, pendingAbilityBonus, setPendingAbilityBonus, onEndEvent
}) {
  const [rolling2, setRolling2] = useState(false)
  const [zoomieMsg, setZoomieMsg] = useState(null)
  const [roundPhase, setRoundPhase] = useState('strength') // strength | zoomie_check | speed | done
  const [strengthRolls, setStrengthRolls] = useState({}) // playerId -> roll
  const [allStrengthDone, setAllStrengthDone] = useState(false)
  const [currentZoomieRolls, setCurrentZoomieRolls] = useState({}) // playerId -> [dice]
  const [zoomieWinner, setZoomieWinner] = useState(null) // playerId who called zoomie
  const [zoomieAdvancers, setZoomieAdvancers] = useState([]) // playerIds who advance
  const [speedPhasePlayer, setSpeedPhasePlayer] = useState(0) // index in zoomieAdvancers
  const [lastRollDisplay, setLastRollDisplay] = useState(null)

  const es = eventState || {}
  const positions = es.positions || {}
  const diceCount = es.diceCount || {}
  const finishOrder = es.finishOrder || []
  const simplifiedMode = es.simplifiedMode || false

  const activePlayers = players.filter(p => !finishOrder.includes(p.id))
  const myDice = Math.min(8, Math.max(4, diceCount[currentPlayerId] || 4))
  const isFinished = finishOrder.includes(currentPlayerId)

  // SIMPLIFIED MODE: just compare strength rolls, top 2 advance
  const doSimplifiedRound = async () => {
    if (rolling2) return
    setRolling2(true)
    const rolls = {}
    for (const p of activePlayers) {
      const sides = p.animal?.stats?.st || 6
      rolls[p.id] = rollDie(sides)
    }
    setStrengthRolls(rolls)
    setAllStrengthDone(true)

    // Sort by roll, top 2 (or 1 for 2 players) advance
    const sorted = [...activePlayers].sort((a, b) => (rolls[b.id] || 0) - (rolls[a.id] || 0))
    const advanceCount = players.length <= 2 ? 1 : 2
    const advancers = sorted.slice(0, advanceCount).map(p => p.id)
    setZoomieAdvancers(advancers)
    gameState.addLog(`Simplified Zoomie: ${advancers.map(id => players.find(p => p.id === id)?.name).join(', ')} advance!`)
    setRolling2(false)
    setRoundPhase('speed')
    setSpeedPhasePlayer(0)
  }

  const doStrengthRoll = async () => {
    if (rolling2) return
    setRolling2(true)
    const sides = currentPlayer?.animal?.stats?.st || 6
    const result = await rollDieAnimated(sides)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)

    // Gain 1 die per number rolled (up to max 8 total)
    const gained = Math.min(total, 8 - myDice)
    const newDiceCount = myDice + gained
    gameState.updateEventState({ diceCount: { ...diceCount, [currentPlayerId]: newDiceCount } })
    setLastRollDisplay(`Strength D${sides}: ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total} → +${gained} dice (now ${newDiceCount} dice)`)
    gameState.addLog(`${currentPlayer.name} rolled Strength D${sides}: ${result} → now has ${newDiceCount} dice`)

    const newRolls = { ...strengthRolls, [currentPlayerId]: total }
    setStrengthRolls(newRolls)
    setRolling2(false)
    gameState.endTurn()
  }

  const doZoomieRoll = async (playerId) => {
    if (rolling2) return
    setRolling2(true)
    const p = players.find(pl => pl.id === playerId)
    const count = Math.min(8, Math.max(4, diceCount[playerId] || 4))
    const rolls = Array.from({ length: count }, () => rollDie(6))
    const newZoomieRolls = { ...currentZoomieRolls, [playerId]: rolls }
    setCurrentZoomieRolls(newZoomieRolls)
    gameState.addLog(`${p?.name} rolled ${count} dice: [${rolls.join(', ')}]`)
    setLastRollDisplay(`${p?.name}'s ${count} dice: [${rolls.join(', ')}]`)
    setRolling2(false)

    // Check for 5 matching
    const counts = {}
    rolls.forEach(r => counts[r] = (counts[r] || 0) + 1)
    if (Object.values(counts).some(c => c >= 5)) {
      handleZoomie(playerId, rolls)
    }
  }

  const handleZoomie = (playerId, rolls) => {
    const p = players.find(pl => pl.id === playerId)
    setZoomieWinner(playerId)
    const msg = getRandomFlavor(FLAVOR_TEXT.zoomie, { player: p?.name || '' })
    setZoomieMsg(msg)
    gameState.addLog(`🚀 ZOOMIE! ${p?.name} gets 5 matching!`)

    // Determine advancers: winner + next highest (for 3+ players)
    const advanceCount = players.length <= 2 ? 1 : 2
    const sortedByRolls = [...activePlayers].sort((a, b) => {
      const aMax = Math.max(...(currentZoomieRolls[a.id] || [0]))
      const bMax = Math.max(...(currentZoomieRolls[b.id] || [0]))
      return bMax - aMax
    })
    const advancers = [playerId, ...sortedByRolls.filter(p => p.id !== playerId).map(p => p.id)].slice(0, advanceCount)
    setZoomieAdvancers(advancers)
    setRoundPhase('speed')
    setSpeedPhasePlayer(0)
  }

  const doSpeedRoll = async () => {
    if (rolling2) return
    const advancerId = zoomieAdvancers[speedPhasePlayer]
    const p = players.find(pl => pl.id === advancerId)
    if (!p) return
    setRolling2(true)
    const sides = p.animal?.stats?.sp || 6
    let result
    if (advancerId === currentPlayerId) {
      result = await rollDieAnimated(sides)
    } else {
      result = rollDie(sides)
    }
    const bonus = advancerId === currentPlayerId ? pendingAbilityBonus : 0
    const total = Math.max(1, result + bonus)
    if (advancerId === currentPlayerId && bonus !== 0) setPendingAbilityBonus(0)

    const newPos = Math.min(SPRINT_SPACES, (positions[advancerId] || 0) + total)
    const newPositions = { ...positions, [advancerId]: newPos }
    let newFinishOrder = [...finishOrder]

    if (newPos >= SPRINT_SPACES && !finishOrder.includes(advancerId)) {
      newFinishOrder = [...finishOrder, advancerId]
      gameState.addLog(`🏁 ${p.name} FINISHES at space ${newPos}!`)
    } else {
      gameState.addLog(`${p.name} rolled Speed D${sides}: ${result} → moved to space ${newPos}`)
    }

    gameState.updateEventState({ positions: newPositions, finishOrder: newFinishOrder, finished: newFinishOrder })
    setLastRollDisplay(`${p.name} Speed D${sides}: ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total} → space ${newPos}`)
    setRolling2(false)

    if (speedPhasePlayer + 1 < zoomieAdvancers.length) {
      setSpeedPhasePlayer(speedPhasePlayer + 1)
    } else {
      // Reset for next round
      setRoundPhase('strength')
      setZoomieWinner(null)
      setZoomieMsg(null)
      setCurrentZoomieRolls({})
      setStrengthRolls({})
      setAllStrengthDone(false)
      setSpeedPhasePlayer(0)
    }
  }

  const toggleSimplified = () => {
    gameState.updateEventState({ simplifiedMode: !simplifiedMode })
  }

  const allFinished = players.every(p => finishOrder.includes(p.id)) ||
    (finishOrder.length >= Math.min(players.length, 2))

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-white shadow-md border-2" style={{ borderColor: '#F57F17' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-lg" style={{ color: '#F57F17' }}>💨 Zoomie Dash</h3>
          <button
            onClick={toggleSimplified}
            className="text-xs px-2 py-1 rounded-lg border font-bold"
            style={{ borderColor: '#607D8B', color: '#607D8B' }}
          >
            {simplifiedMode ? '⚡ Simplified ON' : 'Use Simplified Mode'}
          </button>
        </div>

        {/* Sprint Track */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: '#FFF8E1' }}>
          <div className="text-sm font-bold text-gray-600 mb-2">Sprint Track (13 spaces):</div>
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: SPRINT_SPACES }, (_, i) => {
              const space = i + 1
              const playersHere = players.filter(p => (positions[p.id] || 0) === space)
              return (
                <div
                  key={space}
                  className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold border-2 relative"
                  style={{
                    background: space === SPRINT_SPACES ? '#F57F17' : '#FFF8E1',
                    color: space === SPRINT_SPACES ? 'white' : '#333',
                    borderColor: '#ddd',
                  }}
                >
                  {space === SPRINT_SPACES ? '🏁' : space}
                  {playersHere.length > 0 && (
                    <div className="absolute -top-1 -right-1 flex flex-wrap gap-0.5">
                      {playersHere.map(p => (
                        <div key={p.id} className="w-4 h-4 rounded-full border border-white flex items-center justify-center" style={{ background: p.color.hex, fontSize: '7px' }}>
                          {p.animal?.emoji}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Player Status */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {players.map(p => {
            const isFinish = finishOrder.includes(p.id)
            const place = finishOrder.indexOf(p.id) + 1
            const dice = Math.min(8, Math.max(4, diceCount[p.id] || 4))
            return (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: p.id === currentPlayerId ? p.color.hex : '#eee' }}>
                <span className="text-xl">{p.animal?.emoji}</span>
                <div className="flex-1">
                  <div className="font-bold text-sm" style={{ color: p.color.hex }}>{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {isFinish ? `🏁 ${place}${['st','nd','rd'][place-1]||'th'}` : `Space ${positions[p.id] || 0} | 🎲×${dice}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Zoomie Message */}
        {zoomieMsg && (
          <div className="mb-3 p-3 rounded-xl text-center" style={{ background: '#FFF3E0', border: '2px solid #F57F17' }}>
            <p className="font-black text-xl" style={{ color: '#E65100' }}>🚀 {zoomieMsg}</p>
          </div>
        )}

        {/* Last Roll Display */}
        {lastRollDisplay && (
          <div className="mb-3 p-3 rounded-xl text-center font-bold" style={{ background: '#FFF8E1', color: '#E65100' }}>
            {lastRollDisplay}
          </div>
        )}

        {/* Action Area */}
        <div className="p-3 rounded-xl border-2" style={{ borderColor: currentPlayer?.color.hex || '#F57F17', background: '#FFFDE7' }}>

          {roundPhase === 'strength' && !simplifiedMode && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">
                <strong>Step 1:</strong> Roll Strength to gain extra dice. Start with {myDice} dice.
              </p>
              <p className="text-xs text-gray-400 mb-3">Each number rolled = +1 die (max 8 total)</p>
              {!isFinished ? (
                <button
                  onClick={doStrengthRoll}
                  disabled={rolling || rolling2}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                  style={{ background: '#B71C1C' }}
                >
                  💪 Roll Strength D{currentPlayer?.animal?.stats?.st || 6} ({myDice} dice)
                </button>
              ) : (
                <p className="text-green-700 font-bold">✓ Already finished!</p>
              )}
            </div>
          )}

          {roundPhase === 'strength' && simplifiedMode && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">
                <strong>Simplified:</strong> All active players roll Strength. Top {players.length <= 2 ? 1 : 2} advance!
              </p>
              <button
                onClick={doSimplifiedRound}
                disabled={rolling2}
                className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                style={{ background: '#B71C1C' }}
              >
                💪 Roll All Strength!
              </button>
              {Object.keys(strengthRolls).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  {Object.entries(strengthRolls).map(([id, r]) => {
                    const p = players.find(pl => pl.id === id)
                    return <span key={id} className="px-2 py-1 rounded text-sm font-bold text-white" style={{ background: p?.color.hex }}>{p?.name}: {r}</span>
                  })}
                </div>
              )}
            </div>
          )}

          {roundPhase === 'speed' && (
            <div className="text-center">
              {speedPhasePlayer < zoomieAdvancers.length ? (
                (() => {
                  const advancerId = zoomieAdvancers[speedPhasePlayer]
                  const advancer = players.find(p => p.id === advancerId)
                  return (
                    <div>
                      <p className="text-lg font-black mb-1" style={{ color: '#F57F17' }}>
                        🚀 {advancer?.name} ADVANCES!
                      </p>
                      <p className="text-sm text-gray-600 mb-3">Roll Speed to move on the sprint track!</p>
                      <button
                        onClick={doSpeedRoll}
                        disabled={rolling2}
                        className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                        style={{ background: '#F57F17' }}
                      >
                        ⚡ {advancer?.name}: Roll Speed D{advancer?.animal?.stats?.sp || 6}
                      </button>
                    </div>
                  )
                })()
              ) : (
                <p className="text-green-700 font-bold">Round complete! Starting next round...</p>
              )}
            </div>
          )}

          {/* Zoomie Roll Section (for non-simplified mode) */}
          {roundPhase === 'strength' && !simplifiedMode && !isFinished && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-gray-500 mb-2 text-center">Or if everyone has rolled Strength, roll your dice to try for ZOOMIE!</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {activePlayers.map(p => {
                  const pDice = Math.min(8, Math.max(4, diceCount[p.id] || 4))
                  const hasRolled = currentZoomieRolls[p.id]
                  return (
                    <button
                      key={p.id}
                      onClick={() => doZoomieRoll(p.id)}
                      disabled={rolling2 || !!hasRolled}
                      className="py-2 px-4 rounded-xl text-white font-bold text-sm hover:scale-105 transition-transform disabled:opacity-50"
                      style={{ background: hasRolled ? '#607D8B' : p.color.hex }}
                    >
                      {p.animal?.emoji} {p.name}: 🎲×{pDice}
                      {hasRolled && ` [${hasRolled.join(',')}]`}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {allFinished && (
          <button
            onClick={onEndEvent}
            className="mt-3 w-full py-4 rounded-xl text-white font-black text-xl hover:scale-105 transition-transform"
            style={{ background: 'linear-gradient(135deg, #F57F17, #E65100)' }}
          >
            🏁 Score Event!
          </button>
        )}

        {/* Finish Order */}
        {finishOrder.length > 0 && (
          <div className="mt-3 p-2 rounded-xl" style={{ background: '#F3E5F5' }}>
            <div className="text-sm font-bold mb-1" style={{ color: '#6A1B9A' }}>Finish Order:</div>
            <div className="flex gap-2 flex-wrap">
              {finishOrder.map((id, i) => {
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
      </div>
    </div>
  )
}
