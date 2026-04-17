import { useState, useRef } from 'react'
import { useStore } from '../store'

export default function Settings() {
  const { state, dispatch } = useStore()
  const [newCategory, setNewCategory] = useState('')
  const [newCommittee, setNewCommittee] = useState('')
  const [catError, setCatError] = useState('')
  const [comError, setComError] = useState('')
  const fileRef = useRef()

  function addCategory() {
    const val = newCategory.trim()
    if (!val) return
    if (state.categories.includes(val)) { setCatError('Category already exists'); return }
    dispatch({ type: 'ADD_CATEGORY', payload: val })
    setNewCategory('')
    setCatError('')
  }

  function deleteCategory(cat) {
    const inUse = state.tasks.some(t => t.category === cat)
    if (inUse) { setCatError(`Cannot delete "${cat}" — tasks are using it`); return }
    if (window.confirm(`Delete category "${cat}"?`)) {
      dispatch({ type: 'DELETE_CATEGORY', payload: cat })
    }
  }

  function addCommittee() {
    const val = newCommittee.trim()
    if (!val) return
    if (state.committees.includes(val)) { setComError('Committee already exists'); return }
    dispatch({ type: 'ADD_COMMITTEE', payload: val })
    setNewCommittee('')
    setComError('')
  }

  function deleteCommittee(com) {
    const inUse = state.committeeEvents.some(e => e.committee === com)
    if (inUse) { setComError(`Cannot delete "${com}" — events exist`); return }
    if (window.confirm(`Delete committee "${com}"?`)) {
      dispatch({ type: 'DELETE_COMMITTEE', payload: com })
    }
  }

  function exportData() {
    const json = JSON.stringify(state, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taskmanager-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importData(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.tasks || !data.categories) {
          alert('Invalid data file.')
          return
        }
        if (window.confirm('This will replace all current data. Continue?')) {
          dispatch({ type: 'IMPORT_DATA', payload: data })
        }
      } catch {
        alert('Could not parse file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function clearData() {
    if (window.confirm('Are you sure? This will delete ALL tasks, events, and data permanently.')) {
      dispatch({ type: 'CLEAR_DATA' })
    }
  }

  return (
    <div className="flex-1 p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>

      <Section title="Categories">
        <div className="space-y-2 mb-3">
          {state.categories.map(cat => (
            <div key={cat} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-800">{cat}</span>
              <button
                onClick={() => deleteCategory(cat)}
                className="text-xs text-red-400 hover:text-red-600 ml-2"
              >Remove</button>
            </div>
          ))}
        </div>
        {catError && <p className="text-red-500 text-xs mb-2">{catError}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New category name"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newCategory}
            onChange={e => { setNewCategory(e.target.value); setCatError('') }}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
          />
          <button
            onClick={addCategory}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >Add</button>
        </div>
      </Section>

      <Section title="Committees">
        <div className="space-y-2 mb-3">
          {state.committees.map(com => (
            <div key={com} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-800">{com}</span>
              <button
                onClick={() => deleteCommittee(com)}
                className="text-xs text-red-400 hover:text-red-600 ml-2"
              >Remove</button>
            </div>
          ))}
        </div>
        {comError && <p className="text-red-500 text-xs mb-2">{comError}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New committee name"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newCommittee}
            onChange={e => { setNewCommittee(e.target.value); setComError('') }}
            onKeyDown={e => e.key === 'Enter' && addCommittee()}
          />
          <button
            onClick={addCommittee}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >Add</button>
        </div>
      </Section>

      <Section title="Data">
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={exportData}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg"
            >
              ⬇ Export JSON
            </button>
            <button
              onClick={() => fileRef.current.click()}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg"
            >
              ⬆ Import JSON
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importData} />
          </div>
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={clearData}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
            >
              🗑 Clear All Data
            </button>
            <p className="text-xs text-gray-400 mt-1.5">This permanently deletes all tasks, events, and settings.</p>
          </div>
          <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">
            {state.tasks.length} tasks · {state.committeeEvents.length} committee events
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">{title}</h3>
      {children}
    </div>
  )
}
