import { useState } from 'react'
import { useStore } from '../store'
import CommitteeTab from '../components/CommitteeTab'

export default function Committees() {
  const { state } = useStore()
  const [active, setActive] = useState(state.committees[0] || '')

  if (state.committees.length === 0) {
    return (
      <div className="flex-1 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Committees</h2>
        <p className="text-gray-400">No committees. Add some in Settings.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Committees</h2>
      <div className="flex gap-1 flex-wrap mb-6 border-b border-gray-200">
        {state.committees.map(c => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active === c
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {active && <CommitteeTab committee={active} key={active} />}
    </div>
  )
}
