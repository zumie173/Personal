import { createContext, useContext, useReducer, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { buildInitialState } from './data/defaults'
import { todayStr } from './utils/dates'

const STORAGE_KEY = 'taskmanager_data'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return buildInitialState()
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

function reducer(state, action) {
  switch (action.type) {
    // ── Tasks ──
    case 'ADD_TASK': {
      const task = {
        id: uuidv4(),
        title: action.payload.title,
        category: action.payload.category || state.categories[0] || '',
        priority: action.payload.priority || 'normal',
        dueDate: action.payload.dueDate || null,
        notes: action.payload.notes || '',
        done: false,
        addedToMyDay: false,
        myDayDate: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      }
      return { ...state, tasks: [...state.tasks, task] }
    }
    case 'UPDATE_TASK': {
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.payload.id ? { ...t, ...action.payload } : t
        ),
      }
    }
    case 'DELETE_TASK': {
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.payload) }
    }
    case 'TOGGLE_TASK_DONE': {
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.payload
            ? { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString() : null }
            : t
        ),
      }
    }
    case 'ADD_TO_MY_DAY': {
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.payload
            ? { ...t, addedToMyDay: true, myDayDate: todayStr() }
            : t
        ),
      }
    }
    case 'REMOVE_FROM_MY_DAY': {
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.id === action.payload
            ? { ...t, addedToMyDay: false, myDayDate: null }
            : t
        ),
      }
    }

    // ── Committee Events ──
    case 'ADD_COMMITTEE_EVENT': {
      const event = {
        id: uuidv4(),
        committee: action.payload.committee,
        title: action.payload.title,
        date: action.payload.date,
        notes: action.payload.notes || '',
        done: false,
      }
      return { ...state, committeeEvents: [...state.committeeEvents, event] }
    }
    case 'UPDATE_COMMITTEE_EVENT': {
      return {
        ...state,
        committeeEvents: state.committeeEvents.map(e =>
          e.id === action.payload.id ? { ...e, ...action.payload } : e
        ),
      }
    }
    case 'DELETE_COMMITTEE_EVENT': {
      return {
        ...state,
        committeeEvents: state.committeeEvents.filter(e => e.id !== action.payload),
      }
    }
    case 'TOGGLE_EVENT_DONE': {
      return {
        ...state,
        committeeEvents: state.committeeEvents.map(e =>
          e.id === action.payload ? { ...e, done: !e.done } : e
        ),
      }
    }

    // ── Categories ──
    case 'ADD_CATEGORY': {
      if (state.categories.includes(action.payload)) return state
      return { ...state, categories: [...state.categories, action.payload] }
    }
    case 'DELETE_CATEGORY': {
      const inUse = state.tasks.some(t => t.category === action.payload)
      if (inUse) return state
      return { ...state, categories: state.categories.filter(c => c !== action.payload) }
    }

    // ── Committees ──
    case 'ADD_COMMITTEE': {
      if (state.committees.includes(action.payload)) return state
      return { ...state, committees: [...state.committees, action.payload] }
    }
    case 'DELETE_COMMITTEE': {
      const inUse = state.committeeEvents.some(e => e.committee === action.payload)
      if (inUse) return state
      return { ...state, committees: state.committees.filter(c => c !== action.payload) }
    }

    // ── Data management ──
    case 'IMPORT_DATA': {
      return action.payload
    }
    case 'CLEAR_DATA': {
      return buildInitialState()
    }

    default:
      return state
  }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)

  useEffect(() => {
    saveState(state)
  }, [state])

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  return useContext(StoreContext)
}
