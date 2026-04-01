import { useState } from 'react'
import { rollDie } from '../../utils/dice'

// Board layout: Left lane / Right lane
// Each lane: outer edge (1-2), middle of side (3), center lane (4+)
// 5 rows deep, scoring:
// Row 1-2 = outer ring (1pt), row 3-4 = middle (2pt), row 5 = center (4pt)

const BOARD_ROWS = 5
const SCORING_ZONES = {
  center: { label: 'CENTER', pts: 4, color: '#F57F17' },
  middle: { label: 'MIDDLE', pts: 2, color: '#2E7D32' },
  outer: { label: 'OUTER', pts: 1, color: '#1565C0' },
  off: { label: 'OFF', pts: 0, color: '#607D8B' },
}

function getZone(row, lane) {
  // lane: 'center' (4+), 'middle' (3), 'outer' (1-2)
  // row 5 = back, row 1 = front
  if (lane === 'center' && row >= 4) return 'center'
  if (lane === 'center' || lane === 'middle') return row >= 3 ? 'middle' : 'outer'
  return row >= 2 ? 'outer' : 'outer'
}

function getAgilityLane(roll) {
  if (roll <= 2) return 'outer'
  if (roll === 3) return 'middle'
  return 'center'
}

export default function TurdCurlingBoard({
  gameState, eventState, players, currentPlayer, currentPlayerId,
  rolling, rollDieAnimated, pendingAbilityBonus, setPendingAbilityBonus, onEndEvent
}) {
  const [rolling2, setRolling2] = useState(false)
  const [phase, setPhase] = useState('pick_lane') // pick_lane | agility | strength | placed
  const [selectedLane, setSelectedLane] = useState(null) // 'left' | 'right'
  const [agilityResult, setAgilityResult] = useState(null)
  const [lanePosResult, setLanePosResult] = useState(null) // 'outer'|'middle'|'center'
  const [canJump, setCanJump] = useState(false)
  const [lastRollDisplay, setLastRollDisplay] = useState(null)

  const es = eventState || {}
  const cubesOnBoard = es.cubesOnBoard || {}
  const throwsRemaining = es.throwsRemaining || {}
  const boardScores = es.boardScores || {}

  const currentAnimal = currentPlayer?.animal
  const stats = currentAnimal?.stats || { sp: 6, st: 6, ag: 6 }
  const myThrows = throwsRemaining[currentPlayerId] ?? 3

  // Calculate scores from cubes on board
  const calcScores = (cubes) => {
    const scores = {}
    players.forEach(p => { scores[p.id] = 0 })
    Object.entries(cubes).forEach(([key, cube]) => {
      if (!cube.eliminated && cube.row > 0) {
        const zone = getZone(cube.row, cube.lanePos)
        scores[cube.playerId] = (scores[cube.playerId] || 0) + SCORING_ZONES[zone].pts
      }
    })
    return scores
  }

  const doAgilityRoll = async () => {
    if (rolling2) return
    setRolling2(true)
    const result = await rollDieAnimated(stats.ag)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)
    const lanePos = getAgilityLane(total)
    const canJumpOver = total >= 5
    setAgilityResult(total)
    setLanePosResult(lanePos)
    setCanJump(canJumpOver)
    setLastRollDisplay(`Agility D${stats.ag}: ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total} → ${lanePos.toUpperCase()} lane${canJumpOver ? ' (can jump over cubes!)' : ''}`)
    gameState.addLog(`${currentPlayer.name} rolled Agility D${stats.ag}: ${result} → ${lanePos} lane`)
    setPhase('strength')
    setRolling2(false)
  }

  const doStrengthRoll = async () => {
    if (rolling2) return
    setRolling2(true)
    const result = await rollDieAnimated(stats.st)
    const bonus = pendingAbilityBonus
    const total = Math.max(1, result + bonus)
    if (bonus !== 0) setPendingAbilityBonus(0)

    gameState.addLog(`${currentPlayer.name} rolled Strength D${stats.st}: ${result} → cube travels ${total} rows`)

    // Place cube on board
    const cubeKey = `${currentPlayerId}-${3 - myThrows + 1}`
    let row = total
    let eliminated = false

    // Cap row at BOARD_ROWS, if over = cube pushed off
    if (row > BOARD_ROWS) { eliminated = true; row = BOARD_ROWS + 1 }

    // Check for cubes in path and push them (simplified: just place cube)
    const newCubes = {
      ...cubesOnBoard,
      [cubeKey]: {
        playerId: currentPlayerId,
        playerName: currentPlayer.name,
        playerColor: currentPlayer.color.hex,
        playerEmoji: currentAnimal.emoji,
        lane: selectedLane,
        lanePos: lanePosResult,
        row,
        eliminated,
      }
    }

    // Calculate push logic: any cube in same lane/lanePos with lower row gets pushed
    const pushResult = pushCubes(newCubes, cubeKey, selectedLane, lanePosResult, row)

    const newScores = calcScores(pushResult)
    const newThrowsRemaining = { ...throwsRemaining, [currentPlayerId]: myThrows - 1 }

    setLastRollDisplay(`Strength D${stats.st}: ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total} rows${eliminated ? ' — ELIMINATED!' : ''}`)
    gameState.updateEventState({
      cubesOnBoard: pushResult,
      throwsRemaining: newThrowsRemaining,
      boardScores: newScores,
    })
    setPhase('placed')
    setRolling2(false)
  }

  function pushCubes(cubes, newCubeKey, lane, lanePos, newRow) {
    if (newRow > BOARD_ROWS) return cubes // off the board, no push needed
    const result = { ...cubes }
    // Find cubes in same lane/lanePos with lower row
    Object.keys(result).forEach(key => {
      if (key === newCubeKey) return
      const cube = result[key]
      if (cube.lane === lane && cube.lanePos === lanePos && !cube.eliminated) {
        // If the pushed cube is at same or higher row, push it further
        if (cube.row >= newRow) {
          const newPushedRow = cube.row + 1
          if (newPushedRow > BOARD_ROWS) {
            result[key] = { ...cube, eliminated: true, row: BOARD_ROWS + 1 }
            gameState.addLog(`Cube pushed off the board! (${cube.playerName}'s cube eliminated)`)
          } else {
            result[key] = { ...cube, row: newPushedRow }
          }
        }
      }
    })
    return result
  }

  const handleEndThrow = () => {
    setPhase('pick_lane')
    setSelectedLane(null)
    setAgilityResult(null)
    setLanePosResult(null)
    setLastRollDisplay(null)
    if (myThrows <= 1) {
      gameState.endTurn()
    }
    // Next turn in rotation handled by throw order
  }

  const allThrowsDone = players.every(p => (throwsRemaining[p.id] ?? 3) <= 0)

  // Render board as grid
  const renderBoard = () => {
    const lanes = ['left', 'right']
    const lanePositions = ['outer', 'middle', 'center']

    return (
      <div className="flex gap-4 justify-center">
        {lanes.map(lane => (
          <div key={lane} className="flex-1">
            <div className="text-center font-bold text-sm mb-1 capitalize">{lane} Lane</div>
            <div className="flex gap-1 justify-center">
              {lanePositions.map(lp => (
                <div key={lp} className="flex flex-col gap-1">
                  <div className="text-xs text-center text-gray-500 capitalize w-10">{lp[0]}</div>
                  {Array.from({ length: BOARD_ROWS }, (_, i) => {
                    const row = BOARD_ROWS - i // row 5 at top, row 1 at bottom
                    const zone = getZone(row, lp)
                    const cubesHere = Object.values(cubesOnBoard).filter(
                      c => c.lane === lane && c.lanePos === lp && c.row === row && !c.eliminated
                    )
                    return (
                      <div
                        key={row}
                        className="w-10 h-10 rounded border-2 flex items-center justify-center relative"
                        style={{
                          background: SCORING_ZONES[zone].color + '33',
                          borderColor: SCORING_ZONES[zone].color,
                        }}
                      >
                        {row <= 1 && <span className="text-xs font-bold" style={{ color: SCORING_ZONES[zone].color }}>{SCORING_ZONES[zone].pts}</span>}
                        {cubesHere.map((c, ci) => (
                          <div
                            key={ci}
                            className="w-6 h-6 rounded-sm border border-white flex items-center justify-center text-xs absolute"
                            style={{ background: c.playerColor, top: ci * 2, left: ci * 2 }}
                          >
                            {c.playerEmoji}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  <div className="text-xs text-center font-bold" style={{ color: SCORING_ZONES[getZone(1, lp)].color }}>
                    {SCORING_ZONES[getZone(BOARD_ROWS, lp)].pts}→{SCORING_ZONES[getZone(1, lp)].pts}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const currentScores = calcScores(cubesOnBoard)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 bg-white shadow-md border-2" style={{ borderColor: '#795548' }}>
        <h3 className="font-black text-lg mb-3" style={{ color: '#795548' }}>💩 Turd Curling</h3>

        {/* Board */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: '#EFEBE9' }}>
          <div className="text-sm font-bold text-gray-600 mb-2">Board (throwing toward top):</div>
          {renderBoard()}
          <div className="flex gap-3 mt-2 text-xs justify-center flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: '#F57F17' }}></span> CENTER (4pts)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: '#2E7D32' }}></span> MIDDLE (2pts)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: '#1565C0' }}></span> OUTER (1pt)</span>
          </div>
        </div>

        {/* Current Scores */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: p.id === currentPlayerId ? p.color.hex : '#eee' }}>
              <span>{p.animal?.emoji}</span>
              <div className="flex-1">
                <div className="font-bold text-sm" style={{ color: p.color.hex }}>{p.name}</div>
                <div className="text-xs text-gray-500">Throws left: {throwsRemaining[p.id] ?? 3}</div>
              </div>
              <div className="font-black text-xl" style={{ color: '#795548' }}>{currentScores[p.id] || 0}pts</div>
            </div>
          ))}
        </div>

        {/* Last Roll Display */}
        {lastRollDisplay && (
          <div className="mb-3 p-3 rounded-xl text-center font-bold" style={{ background: '#EFEBE9', color: '#795548' }}>
            {lastRollDisplay}
          </div>
        )}

        {/* Action Area */}
        {myThrows > 0 ? (
          <div className="p-3 rounded-xl border-2" style={{ borderColor: currentPlayer?.color.hex || '#795548', background: '#FFF8F6' }}>
            <div className="font-bold text-center mb-2">{currentPlayer?.name} — {myThrows} throw{myThrows !== 1 ? 's' : ''} remaining</div>

            {phase === 'pick_lane' && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Choose a lane (locked for this throw):</p>
                <div className="flex gap-3 justify-center">
                  {['left', 'right'].map(ln => (
                    <button
                      key={ln}
                      onClick={() => { setSelectedLane(ln); setPhase('agility') }}
                      className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform capitalize"
                      style={{ background: ln === 'left' ? '#1565C0' : '#2E7D32' }}
                    >
                      {ln === 'left' ? '← Left Lane' : 'Right Lane →'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase === 'agility' && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Lane: <strong className="capitalize">{selectedLane}</strong></p>
                <p className="text-sm text-gray-600 mb-3">Roll Agility to find your lane position (1-2=outer, 3=middle, 4+=center)</p>
                <button
                  onClick={doAgilityRoll}
                  disabled={rolling || rolling2}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                  style={{ background: '#E65100' }}
                >
                  🎯 Roll Agility D{stats.ag}
                </button>
              </div>
            )}

            {phase === 'strength' && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">
                  Lane position: <strong style={{ color: '#E65100' }}>{lanePosResult?.toUpperCase()}</strong>
                  {canJump && <span className="ml-2 text-green-600 font-bold">⚡ Can jump over cubes!</span>}
                </p>
                <p className="text-sm text-gray-600 mb-3">Roll Strength to determine how far your cube travels!</p>
                <button
                  onClick={doStrengthRoll}
                  disabled={rolling || rolling2}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform disabled:opacity-50"
                  style={{ background: '#795548' }}
                >
                  💪 Roll Strength D{stats.st}
                </button>
              </div>
            )}

            {phase === 'placed' && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Cube placed! Board score: <strong>{currentScores[currentPlayerId] || 0} pts</strong></p>
                <button
                  onClick={handleEndThrow}
                  className="py-4 px-8 rounded-xl text-white font-black text-lg hover:scale-105 transition-transform"
                  style={{ background: '#607D8B' }}
                >
                  {myThrows <= 1 ? '✓ End Turn' : 'Next Throw →'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-xl text-center" style={{ background: '#E8F5E9' }}>
            <p className="font-bold text-green-700">✓ {currentPlayer?.name} is done throwing!</p>
            <button onClick={() => gameState.endTurn()} className="mt-2 py-3 px-6 rounded-xl text-white font-bold" style={{ background: '#607D8B' }}>
              Next Player →
            </button>
          </div>
        )}

        {allThrowsDone && (
          <button
            onClick={onEndEvent}
            className="mt-3 w-full py-4 rounded-xl text-white font-black text-xl hover:scale-105 transition-transform"
            style={{ background: 'linear-gradient(135deg, #795548, #4E342E)' }}
          >
            💩 Score Event!
          </button>
        )}
      </div>
    </div>
  )
}
