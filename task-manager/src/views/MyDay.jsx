import { useState } from 'react'
import { useStore } from '../store'
import { todayStr, formatFullDate } from '../utils/dates'
import CategoryBadge from '../components/CategoryBadge'
import { formatDisplayDate, dueDateStatus } from '../utils/dates'

export default function MyDay() {
  const { state, dispatch } = useStore()
  const today = todayStr()
  const [search, setSearch] = useState('')

  const myDayTasks = state.tasks.filter(t => t.addedToMyDay && t.myDayDate === today)
  const doneTasks = myDayTasks.filter(t => t.done)
  const openTasks = myDayTasks.filter(t => !t.done)

  const eligibleToAdd = state.tasks.filter(
    t => !t.addedToMyDay || t.myDayDate !== today
  )

  const searchFiltered = search.trim()
    ? eligibleToAdd.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase())
      )
    : eligibleToAdd

  const byCategory = searchFiltered.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

  function DueDateBadge({ isoDate, done }) {
    if (!isoDate) return null
    const status = dueDateStatus(isoDate)
    const cls = done ? 'text-gray-400' :
      status === 'overdue' ? 'text-red-600' :
      status === 'today' ? 'text-amber-600' : 'text-gray-400'
    const label = status === 'today' ? 'Today' : formatDisplayDate(isoDate)
    return <span className={`text-xs ${cls}`}>{status === 'overdue' && '⚠ '}{label}</span>
  }

  return (
    <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{formatFullDate(today)}</h2>
        {myDayTasks.length > 0 && (
          <p className="text-sm text-gray-500 mt-1">
            {doneTasks.length} of {myDayTasks.length} tasks done
          </p>
        )}
      </div>

      {myDayTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl mb-8">
          <div className="text-5xl mb-3">☀️</div>
          <p className="font-medium text-gray-500">Nothing on your list for today.</p>
          <p className="text-sm">Add tasks below to get started.</p>
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-gray-200 overflow-hidden">
          {openTasks.map(task => (
            <MyDayTaskRow key={task.id} task={task} dispatch={dispatch} today={today} />
          ))}
          {doneTasks.length > 0 && (
            <>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
                Completed
              </div>
              {doneTasks.map(task => (
                <MyDayTaskRow key={task.id} task={task} dispatch={dispatch} today={today} />
              ))}
            </>
          )}
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add tasks to My Day</h3>
        <input
          type="text"
          placeholder="Search tasks…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {eligibleToAdd.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">All tasks are already in My Day.</p>
        ) : searchFiltered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No tasks match your search.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(byCategory).map(([cat, tasks]) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">{cat}</div>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {tasks.filter(t => !t.done).concat(tasks.filter(t => t.done)).map(task => (
                    <button
                      key={task.id}
                      onClick={() => dispatch({ type: 'ADD_TO_MY_DAY', payload: task.id })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 text-left group"
                    >
                      <span className="flex-1 text-sm text-gray-800">{task.title}</span>
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">{formatDisplayDate(task.dueDate)}</span>
                      )}
                      {task.priority === 'high' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                      <span className="text-blue-500 text-xs opacity-0 group-hover:opacity-100">+ Add</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MyDayTaskRow({ task, dispatch, today }) {
  const status = dueDateStatus(task.dueDate)
  const dueDateClass =
    status === 'overdue' ? 'text-red-600' :
    status === 'today' ? 'text-amber-600' : 'text-gray-400'
  const dueDateLabel =
    status === 'today' ? 'Today' :
    task.dueDate ? formatDisplayDate(task.dueDate) : null

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 group ${task.done ? 'bg-gray-50' : ''}`}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => dispatch({ type: 'TOGGLE_TASK_DONE', payload: task.id })}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
      />
      <span className={`flex-1 text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
        {task.title}
      </span>
      {task.priority === 'high' && !task.done && (
        <span className="w-2 h-2 rounded-full bg-red-500" title="High priority" />
      )}
      <CategoryBadge category={task.category} />
      {dueDateLabel && (
        <span className={`text-xs ${dueDateClass}`}>
          {status === 'overdue' && '⚠ '}{dueDateLabel}
        </span>
      )}
      <button
        onClick={() => dispatch({ type: 'REMOVE_FROM_MY_DAY', payload: task.id })}
        title="Remove from My Day"
        className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
