import { useStore } from '../store'
import { todayStr } from '../utils/dates'

const NAV_ITEMS = [
  { id: 'myday', label: 'My Day', icon: '☀️' },
  { id: 'alltasks', label: 'All Tasks', icon: '📋' },
  { id: 'categories', label: 'Categories', icon: '🗂️' },
  { id: 'committees', label: 'Committees', icon: '👥' },
  { id: 'gantt', label: 'Calendar / Gantt', icon: '📅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar({ view, setView }) {
  const { state } = useStore()
  const today = todayStr()
  const myDayCount = state.tasks.filter(
    t => t.addedToMyDay && t.myDayDate === today && !t.done
  ).length

  return (
    <aside className="w-56 shrink-0 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white tracking-tight">Task Manager</h1>
      </div>
      <nav className="flex-1 py-3">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              view === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === 'myday' && myDayCount > 0 && (
              <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {myDayCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  )
}
