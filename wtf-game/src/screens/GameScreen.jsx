import { useState, useCallback } from 'react'
import { EVENTS } from '../constants/events'
import { SCORING, PED_AWARDS } from '../constants/scoring'
import PlayerStatusBar from '../components/PlayerStatusBar'
import AbilityModal from '../components/AbilityModal'
import ActionLog from '../components/ActionLog'
import TurdCurlingBoard from '../components/boards/TurdCurlingBoard'
import HeavyThingThrowBoard from '../components/boards/HeavyThingThrowBoard'
import RunningBoard from '../components/boards/RunningBoard'
import HurdlesBoard from '../components/boards/HurdlesBoard'
import ZoomieBoard from '../components/boards/ZoomieBoard'
import BigBoingBoard from '../components/boards/BigBoingBoard'
import { rollDie } from '../utils/dice'

function computeStandings(players, eventId, eventState) {
  // Returns standings array sorted by place
  // Returns { standings: [{playerId, place, points}], tiedForLast: boolean }
  const playerCount = players.length
  const scoring = SCORING[playerCount] || []

  // Generic: use player.score for event-specific score
  // We need event-specific ranking logic
  let ranked = []

  if (eventId === 0) {
    // Turd Curling: ranked by boardScore
    ranked = players.map(p => ({ playerId: p.id, score: eventState?.boardScores?.[p.id] || 0 }))
      .sort((a, b) => b.score - a.score)
  } else if (eventId === 1) {
    // Heavy Thing Throw: ranked by bestThrow
    ranked = players.map(p => ({ playerId: p.id, score: eventState?.bestThrows?.[p.id] ?? -1 }))
      .sort((a, b) => b.score - a.score)
  } else if (eventId === 2 || eventId === 3) {
    // Racing: ranked by finishOrder
    const finishOrder = eventState?.finishOrder || []
    const finished = new Set(finishOrder)
    const unfinished = players.filter(p => !finished.has(p.id))
    // Unfinished ranked by laps then position
    const unfinishedRanked = unfinished.sort((a, b) => {
      const aLaps = eventState?.laps?.[a.id] || 0
      const bLaps = eventState?.laps?.[b.id] || 0
      if (bLaps !== aLaps) return bLaps - aLaps
      return (eventState?.positions?.[b.id] || 0) - (eventState?.positions?.[a.id] || 0)
    })
    ranked = [...finishOrder, ...unfinishedRanked.map(p => p.id)].map(id => ({
      playerId: id, score: finishOrder.indexOf(id) >= 0 ? finishOrder.length - finishOrder.indexOf(id) : 0
    }))
  } else if (eventId === 4) {
    // Zoomie Dash: ranked by finishOrder
    const finishOrder = eventState?.finishOrder || []
    const unfinished = players.filter(p => !finishOrder.includes(p.id))
    const unfinishedRanked = unfinished.sort((a, b) => (eventState?.positions?.[b.id] || 0) - (eventState?.positions?.[a.id] || 0))
    ranked = [...finishOrder, ...unfinishedRanked.map(p => p.id)].map(id => ({ playerId: id, score: 0 }))
  } else if (eventId === 5) {
    // Big Boing: ranked by bestJump
    ranked = players.map(p => ({ playerId: p.id, score: eventState?.bestJumps?.[p.id] ?? -1 }))
      .sort((a, b) => b.score - a.score)
  }

  // Assign points, handling ties
  const standings = []
  let i = 0
  while (i < ranked.length) {
    // Find all players tied at this score
    const tiedGroup = [ranked[i]]
    let j = i + 1
    while (j < ranked.length && ranked[j].score === ranked[i].score && (eventId === 0 || eventId === 1 || eventId === 5)) {
      tiedGroup.push(ranked[j])
      j++
    }
    // Average points for tied group
    const pointsForGroup = tiedGroup.map((_, k) => scoring[i + k] || 0)
    const avgPoints = Math.round(pointsForGroup.reduce((a, b) => a + b, 0) / tiedGroup.length * 10) / 10
    tiedGroup.forEach((r, k) => {
      standings.push({ playerId: r.playerId, place: i + k, points: Math.floor(avgPoints) })
    })
    i = j
  }

  // Check tied for last
  const lastPlace = standings[standings.length - 1]
  const tiedForLast = standings.filter(s => s.place === lastPlace.place).length > 1

  return { standings, tiedForLast }
}

export default function GameScreen({ gameState }) {
  const { state } = gameState
  const { players, game, eventState, actionLog } = state
  const [showAbility, setShowAbility] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [lastRollResult, setLastRollResult] = useState(null)
  const [pendingAbilityBonus, setPendingAbilityBonus] = useState(0)
  const [showEndEventConfirm, setShowEndEventConfirm] = useState(false)

  const eventId = game.eventOrder?.[game.currentEventIndex]
  const event = EVENTS[eventId]
  const turnOrder = game.turnOrder || players.map(p => p.id)
  const currentPlayerId = turnOrder[game.currentTurnIndex % turnOrder.length]
  const currentPlayer = players.find(p => p.id === currentPlayerId)

  const rollDieAnimated = useCallback((sides) => {
    return new Promise(resolve => {
      setRolling(true)
      let count = 0
      setLastRollResult({ rolling: true, sides, result: null })
      const interval = setInterval(() => {
        setLastRollResult({ rolling: true, sides, result: rollDie(sides) })
        count++
        if (count >= 6) {
          clearInterval(interval)
          const final = rollDie(sides)
          setLastRollResult({ rolling: false, sides, result: final })
          setRolling(false)
          resolve(final)
        }
      }, 80)
    })
  }, [])

  const handleAbilityUse = (option) => {
    setShowAbility(false)
    gameState.useAbility(currentPlayer.id, currentPlayer.name, option.label)

    const effect = option.effect
    if (effect.type === 'bonus') {
      setPendingAbilityBonus(b => b + effect.value)
      gameState.addLog(`${currentPlayer.name} gets +${effect.value} to next roll`)
    } else if (effect.type === 'skip_turn') {
      gameState.updatePlayer(currentPlayer.id, { skipNextTurn: true })
      gameState.addLog(`${currentPlayer.name} will skip next turn`)
    } else if (effect.type === 'give_point') {
      // Give 1 point to the first other player with fewest points
      const others = players.filter(p => p.id !== currentPlayer.id)
      const target = others.reduce((min, p) => p.score < min.score ? p : min, others[0])
      gameState.updatePlayer(target.id, { score: target.score + 1 })
      gameState.addLog(`${currentPlayer.name} gives 1 point to ${target.name}`)
    } else if (effect.type === 'lose_point') {
      gameState.updatePlayer(currentPlayer.id, { score: Math.max(0, currentPlayer.score - 1) })
      gameState.addLog(`${currentPlayer.name} loses 1 point`)
    } else if (effect.type === 'steal_point') {
      const others = players.filter(p => p.id !== currentPlayer.id && p.score > 0)
      if (others.length > 0) {
        const target = others.reduce((max, p) => p.score > max.score ? p : max, others[0])
        gameState.updatePlayer(target.id, { score: target.score - 1 })
        gameState.updatePlayer(currentPlayer.id, { score: currentPlayer.score + 1 })
        gameState.addLog(`${currentPlayer.name} steals 1 point from ${target.name}`)
      }
    } else if (effect.type === 'pull_back') {
      players.filter(p => p.id !== currentPlayer.id).forEach(p => {
        const newPos = Math.max(0, (eventState?.positions?.[p.id] || 0) - effect.value)
        gameState.updateEventState({ positions: { ...eventState.positions, [p.id]: newPos } })
      })
      gameState.addLog(`${currentPlayer.name} pulls all opponents back ${effect.value} spaces`)
    } else if (effect.type === 'set_die') {
      gameState.addLog(`${currentPlayer.name} sets a die to ${effect.value}`)
    } else if (effect.type === 'penalty') {
      setPendingAbilityBonus(b => b + effect.value)
      gameState.addLog(`${currentPlayer.name} applies ${effect.value} to next roll`)
    } else if (effect.type === 'monkey_watch') {
      gameState.updatePlayer(currentPlayer.id, { monkeyStuck: true })
      gameState.addLog(`${currentPlayer.name} watches for a natural 2 to escape`)
    } else if (effect.type === 'double') {
      gameState.addLog(`${currentPlayer.name} will double next ${effect.stat === 'any' ? 'die' : effect.stat} roll (max ${effect.cap})`)
    } else if (effect.type === 'reroll') {
      gameState.addLog(`${currentPlayer.name} will reroll their ${effect.stat === 'any' ? 'next die' : effect.stat}`)
    } else if (effect.type === 'chain_roll') {
      gameState.addLog(`${currentPlayer.name} uses chain roll!`)
    } else if (effect.type === 'mandatory_reroll') {
      gameState.addLog(`${currentPlayer.name} gets mandatory reroll + ${effect.bonus}`)
    } else if (effect.type === 'ped_bonus') {
      gameState.addLog(`${currentPlayer.name} gains +1 per PED die this turn`)
    }
  }

  const handleEndEvent = () => {
    const { standings, tiedForLast } = computeStandings(players, eventId, eventState)
    gameState.setEventResults({ standings, tiedForLast })
  }

  const currentEventNumber = game.currentEventIndex + 1
  const totalEvents = game.totalEvents || 6

  const boardProps = {
    gameState,
    event,
    eventState,
    players,
    currentPlayer,
    currentPlayerId,
    rolling,
    rollDieAnimated,
    pendingAbilityBonus,
    setPendingAbilityBonus,
    lastRollResult,
    onEndEvent: handleEndEvent,
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FFF8E1' }}>
      {/* Top Bar */}
      <PlayerStatusBar players={players} currentPlayerId={currentPlayerId} game={game} />

      {/* Event Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b-2" style={{ background: '#1565C0', borderColor: '#0D47A1' }}>
        <div className="flex items-center gap-2">
          <span className="text-3xl">{event?.emoji}</span>
          <div>
            <h2 className="font-black text-white text-lg leading-tight">{event?.name}</h2>
            <p className="text-blue-200 text-xs">{event?.attrNames?.join(' + ')}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-bold text-sm">Event {currentEventNumber}/{totalEvents}</div>
          <div className="text-blue-200 text-xs">Turn {game.turnNumber}</div>
        </div>
      </div>

      {/* Current Player Indicator */}
      <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ background: currentPlayer?.color.hex, borderColor: 'rgba(0,0,0,0.1)' }}>
        <span className="text-3xl">{currentPlayer?.animal?.emoji}</span>
        <div className="flex-1">
          <span className="font-black text-white text-xl">{currentPlayer?.name}'s Turn</span>
          <span className="ml-2 text-white/80 text-sm">{currentPlayer?.animal?.name}</span>
          {currentPlayer?.peds > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: '#6A1B9A' }}>
              💊 {currentPlayer.peds} PEDs
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!currentPlayer?.abilityUsedThisTurn && (
            <button
              onClick={() => setShowAbility(true)}
              className="py-2 px-3 rounded-xl text-white font-bold text-sm hover:scale-105 transition-transform"
              style={{ background: currentPlayer?.cardSide === 'front' ? '#2E7D32' : '#607D8B' }}
            >
              {currentPlayer?.cardSide === 'front' ? '▶' : '◀'} Ability
            </button>
          )}
          {currentPlayer?.abilityUsedThisTurn && (
            <span className="py-2 px-3 rounded-xl bg-gray-400 text-white font-bold text-sm opacity-60">✓ Used</span>
          )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col p-3 gap-3 overflow-auto">
        {/* Event Board */}
        <div className="flex-1">
          {eventId === 0 && <TurdCurlingBoard {...boardProps} />}
          {eventId === 1 && <HeavyThingThrowBoard {...boardProps} />}
          {eventId === 2 && <RunningBoard {...boardProps} />}
          {eventId === 3 && <HurdlesBoard {...boardProps} />}
          {eventId === 4 && <ZoomieBoard {...boardProps} />}
          {eventId === 5 && <BigBoingBoard {...boardProps} />}
        </div>

        {/* Action Log */}
        <ActionLog log={actionLog} />

        {/* End Event Button */}
        <button
          onClick={() => setShowEndEventConfirm(true)}
          className="w-full py-3 rounded-xl font-bold text-sm border-2 hover:bg-red-50 transition-colors"
          style={{ borderColor: '#B71C1C', color: '#B71C1C' }}
        >
          🏁 End Event & Score
        </button>
      </div>

      {/* Ability Modal */}
      {showAbility && currentPlayer && (
        <AbilityModal
          player={currentPlayer}
          eventType={event?.type}
          onUse={handleAbilityUse}
          onClose={() => setShowAbility(false)}
        />
      )}

      {/* End Event Confirm */}
      {showEndEventConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="text-5xl mb-3">🏁</div>
            <h3 className="text-2xl font-black mb-2">End this event?</h3>
            <p className="text-gray-600 mb-6">Current positions will determine the rankings and point awards.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndEventConfirm(false)}
                className="flex-1 py-3 rounded-xl border-2 font-bold text-gray-600"
                style={{ borderColor: '#ccc' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowEndEventConfirm(false); handleEndEvent() }}
                className="flex-1 py-3 rounded-xl text-white font-black"
                style={{ background: '#B71C1C' }}
              >
                End Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
