import { useReducer, useCallback } from 'react'
import { SCORING, PED_AWARDS } from '../constants/scoring'
import { rollDie } from '../utils/dice'

const initialState = {
  phase: 'welcome', // welcome | setup | animal_select | event_order | game | event_results | final_results
  playerCount: 0,
  players: [],
  game: {
    currentEventIndex: 0,
    eventOrder: [],
    currentTurnIndex: 0,
    turnNumber: 0,
    totalEvents: 6,
  },
  eventState: null,
  eventResults: null,
  actionLog: [],
}

function createPlayer(id, name, color, animal) {
  return {
    id,
    name,
    animal,
    color,
    score: 0,
    peds: 0,
    pedDieSides: 4,
    cardSide: 'front',
    abilityUsedThisTurn: false,
    skipNextTurn: false,
    monkeyStuck: false,
    // event-specific
    position: 0,
    laps: 0,
    tipped: false,
    terrainPenalty: null, // null or 'mud' or 'uphill'
    bestThrow: -1,
    currentAttempt: 0,
    jumpBonusDice: 0,
    finished: false,
  }
}

function initEventState(eventId, players) {
  const playerIds = players.map(p => p.id)
  const byPlayer = (val) => Object.fromEntries(playerIds.map(id => [id, val]))

  switch (eventId) {
    case 0: // Turd Curling
      return {
        eventId,
        cubesOnBoard: {}, // key: "playerId-cubeIdx", val: { position, lane, score, eliminated }
        throwsRemaining: byPlayer(3),
        currentThrowPlayer: players[0].id,
        throwOrder: [...playerIds],
        throwOrderIndex: 0,
        allThrowsDone: false,
        scoring: false,
        selectedLane: null,
        spiralRoll: null,
        throwResult: null,
        boardScores: byPlayer(0),
      }
    case 1: // Heavy Thing Throw
      return {
        eventId,
        spiralPosition: byPlayer(null),
        spiralRolls: byPlayer([]),
        attempts: byPlayer(0),
        maxAttempts: 3,
        bestThrows: byPlayer(-1),
        secondBestThrows: byPlayer(-1),
        thirdBestThrows: byPlayer(-1),
        currentAttemptPhase: 'agility', // agility | strength | done
        agilityRollCount: byPlayer(0),
        currentThrowDistance: byPlayer(null),
        finished: byPlayer(false),
      }
    case 2: // Who Even Likes to Run?
    case 3: // Hurting Hurdles
      return {
        eventId,
        positions: byPlayer(0),
        laps: byPlayer(0),
        finished: [],
        finishOrder: [],
        tipped: byPlayer(false),
        terrainPenalty: byPlayer(null),
        hurdle: byPlayer(null),
        hurdleRemainingMove: byPlayer(0),
      }
    case 4: // Zoomie Dash
      return {
        eventId,
        positions: byPlayer(0),
        diceCount: byPlayer(4), // starts at 4
        zoomieWinners: [],
        finished: [],
        finishOrder: [],
        phase: 'strength', // strength | zoomie | speed | done
        strengthRolls: byPlayer(null),
        diceRolls: byPlayer([]),
        zoomieCalledBy: null,
        roundNumber: 0,
        simplifiedMode: false,
      }
    case 5: // Big Boing
      return {
        eventId,
        runwayPosition: byPlayer(0), // 0 = start
        unusedDice: byPlayer(4),
        attempts: byPlayer(0),
        maxAttempts: 3,
        bestJumps: byPlayer(-1),
        secondBestJumps: byPlayer(-1),
        thirdBestJumps: byPlayer(-1),
        currentPhase: byPlayer('approach'), // approach | jump | done
        speedRollCount: byPlayer(0),
        currentJumpBonus: byPlayer(0),
        finished: byPlayer(false),
      }
    default:
      return { eventId }
  }
}

function addLog(state, message) {
  return {
    ...state,
    actionLog: [{ id: Date.now(), message, time: new Date().toLocaleTimeString() }, ...state.actionLog].slice(0, 50)
  }
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase }

    case 'SET_PLAYER_COUNT':
      return { ...state, playerCount: action.count }

    case 'SET_PLAYERS':
      return { ...state, players: action.players }

    case 'ASSIGN_ANIMAL': {
      const players = state.players.map(p =>
        p.id === action.playerId ? { ...p, animal: action.animal } : p
      )
      return { ...state, players }
    }

    case 'SET_EVENT_ORDER': {
      const totalEvents = action.playerCount === 6 ? 4 : 6
      return {
        ...state,
        game: {
          ...state.game,
          eventOrder: action.order,
          currentEventIndex: 0,
          totalEvents,
        }
      }
    }

    case 'START_EVENT': {
      const eventId = state.game.eventOrder[state.game.currentEventIndex]
      // Randomize turn order
      const shuffled = [...state.players].sort(() => Math.random() - 0.5)
      const players = state.players.map(p => ({
        ...p,
        abilityUsedThisTurn: false,
        position: 0,
        laps: 0,
        tipped: false,
        terrainPenalty: null,
        finished: false,
        jumpBonusDice: 0,
        currentAttempt: 0,
      }))
      return {
        ...state,
        players,
        phase: 'game',
        game: {
          ...state.game,
          currentTurnIndex: 0,
          turnOrder: shuffled.map(p => p.id),
          turnNumber: 1,
        },
        eventState: initEventState(eventId, shuffled),
        actionLog: [],
      }
    }

    case 'END_TURN': {
      const { game, players } = state
      const turnOrder = game.turnOrder || players.map(p => p.id)
      let nextIndex = (game.currentTurnIndex + 1) % turnOrder.length

      // Find next player not finished and not skipping
      let attempts = 0
      while (attempts < turnOrder.length) {
        const nextPlayerId = turnOrder[nextIndex]
        const nextPlayer = players.find(p => p.id === nextPlayerId)
        if (!nextPlayer.finished) {
          if (nextPlayer.skipNextTurn) {
            // Mark them as no longer skipping, but skip their turn
            const updatedPlayers = players.map(p =>
              p.id === nextPlayerId ? { ...p, skipNextTurn: false, abilityUsedThisTurn: false } : p
            )
            return addLog({
              ...state,
              players: updatedPlayers,
              game: { ...game, currentTurnIndex: nextIndex },
            }, `${nextPlayer.name} skips their turn`)
          }
          break
        }
        nextIndex = (nextIndex + 1) % turnOrder.length
        attempts++
      }

      const updatedPlayers = players.map(p => ({ ...p, abilityUsedThisTurn: false }))

      return {
        ...state,
        players: updatedPlayers,
        game: {
          ...game,
          currentTurnIndex: nextIndex,
          turnNumber: game.turnNumber + 1,
        },
      }
    }

    case 'UPDATE_PLAYER': {
      const players = state.players.map(p =>
        p.id === action.playerId ? { ...p, ...action.updates } : p
      )
      return { ...state, players }
    }

    case 'UPDATE_EVENT_STATE': {
      return {
        ...state,
        eventState: { ...state.eventState, ...action.updates },
      }
    }

    case 'ADD_LOG':
      return addLog(state, action.message)

    case 'USE_ABILITY': {
      const players = state.players.map(p =>
        p.id === action.playerId
          ? {
              ...p,
              abilityUsedThisTurn: true,
              cardSide: p.cardSide === 'front' ? 'back' : 'front',
            }
          : p
      )
      return addLog({ ...state, players }, `${action.playerName} used ability: ${action.abilityLabel}`)
    }

    case 'USE_PED': {
      const players = state.players.map(p =>
        p.id === action.playerId ? { ...p, peds: Math.max(0, p.peds - 1) } : p
      )
      return addLog({ ...state, players }, `${action.playerName} used a PED die`)
    }

    case 'AWARD_POINTS': {
      let players = [...state.players]
      for (const { playerId, points } of action.awards) {
        players = players.map(p =>
          p.id === playerId ? { ...p, score: p.score + points } : p
        )
      }
      return { ...state, players }
    }

    case 'AWARD_PEDS': {
      let players = [...state.players]
      for (const { playerId, dieSides } of action.awards) {
        players = players.map(p =>
          p.id === playerId ? { ...p, peds: p.peds + 1, pedDieSides: dieSides } : p
        )
      }
      return { ...state, players }
    }

    case 'SET_EVENT_RESULTS':
      return { ...state, eventResults: action.results, phase: 'event_results' }

    case 'NEXT_EVENT': {
      const nextIndex = state.game.currentEventIndex + 1
      if (nextIndex >= state.game.totalEvents) {
        return { ...state, phase: 'final_results', game: { ...state.game, currentEventIndex: nextIndex } }
      }
      // Initialize the next event immediately
      const nextEventId = state.game.eventOrder[nextIndex]
      const shuffled = [...state.players].sort(() => Math.random() - 0.5)
      const resetPlayers = state.players.map(p => ({
        ...p,
        abilityUsedThisTurn: false,
        position: 0,
        laps: 0,
        tipped: false,
        terrainPenalty: null,
        finished: false,
        jumpBonusDice: 0,
        currentAttempt: 0,
      }))
      return {
        ...state,
        players: resetPlayers,
        phase: 'game',
        game: {
          ...state.game,
          currentEventIndex: nextIndex,
          currentTurnIndex: 0,
          turnOrder: shuffled.map(p => p.id),
          turnNumber: 1,
        },
        eventState: initEventState(nextEventId, shuffled),
        eventResults: null,
        actionLog: [],
      }
    }

    case 'RESET':
      return { ...initialState, phase: 'welcome' }

    default:
      return state
  }
}

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  const setPhase = useCallback((phase) => dispatch({ type: 'SET_PHASE', phase }), [])
  const setPlayerCount = useCallback((count) => dispatch({ type: 'SET_PLAYER_COUNT', count }), [])
  const setPlayers = useCallback((players) => dispatch({ type: 'SET_PLAYERS', players }), [])
  const assignAnimal = useCallback((playerId, animal) => dispatch({ type: 'ASSIGN_ANIMAL', playerId, animal }), [])
  const setEventOrder = useCallback((order, playerCount) => dispatch({ type: 'SET_EVENT_ORDER', order, playerCount }), [])
  const startEvent = useCallback(() => dispatch({ type: 'START_EVENT' }), [])
  const endTurn = useCallback(() => dispatch({ type: 'END_TURN' }), [])
  const updatePlayer = useCallback((playerId, updates) => dispatch({ type: 'UPDATE_PLAYER', playerId, updates }), [])
  const updateEventState = useCallback((updates) => dispatch({ type: 'UPDATE_EVENT_STATE', updates }), [])
  const addLog = useCallback((message) => dispatch({ type: 'ADD_LOG', message }), [])
  const useAbility = useCallback((playerId, playerName, abilityLabel) => dispatch({ type: 'USE_ABILITY', playerId, playerName, abilityLabel }), [])
  const usePed = useCallback((playerId, playerName) => dispatch({ type: 'USE_PED', playerId, playerName }), [])
  const awardPoints = useCallback((awards) => dispatch({ type: 'AWARD_POINTS', awards }), [])
  const awardPeds = useCallback((awards) => dispatch({ type: 'AWARD_PEDS', awards }), [])
  const setEventResults = useCallback((results) => dispatch({ type: 'SET_EVENT_RESULTS', results }), [])
  const nextEvent = useCallback(() => dispatch({ type: 'NEXT_EVENT' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    state,
    setPhase,
    setPlayerCount,
    setPlayers,
    assignAnimal,
    setEventOrder,
    startEvent,
    endTurn,
    updatePlayer,
    updateEventState,
    addLog,
    useAbility,
    usePed,
    awardPoints,
    awardPeds,
    setEventResults,
    nextEvent,
    reset,
    dispatch,
  }
}
