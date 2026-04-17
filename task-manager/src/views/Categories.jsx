import { useStore } from '../store'
import { getColorForKey } from '../utils/colors'
import { isOverdue } from '../utils/dates'

export default function Categories({ onViewCategory }) {
  const { state } = useStore()

  return (
    <div className="flex-1 p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Categories</h2>
      {state.categories.length === 0 ? (
        <p className="text-gray-400">No categories. Add some in Settings.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.categories.map(cat => {
            const allTasks = state.tasks.filter(t => t.category === cat)
            const openTasks = allTasks.filter(t => !t.done)
            const overdueTasks = openTasks.filter(t => isOverdue(t.dueDate))
            const done = allTasks.filter(t => t.done).length
            const total = allTasks.length
            const progress = total > 0 ? (done / total) * 100 : 0
            const color = getColorForKey(cat)

            return (
              <div
                key={cat}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{cat}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{openTasks.length} open</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {overdueTasks.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {overdueTasks.length} overdue
                      </span>
                    )}
                    {openTasks.length > 20 && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                        20+ tasks
                      </span>
                    )}
                  </div>
                </div>

                {total > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{done} / {total} done</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, backgroundColor: color.text }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={() => onViewCategory(cat)}
                  className="w-full text-xs font-medium text-blue-600 hover:text-blue-800 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  View tasks →
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
