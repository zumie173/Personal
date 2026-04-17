import { useStore } from '../store'
import CategoryBadge from './CategoryBadge'
import { formatDisplayDate, dueDateStatus } from '../utils/dates'
import { todayStr } from '../utils/dates'

export default function TaskRow({ task, onEdit, showMyDay = true }) {
  const { dispatch } = useStore()
  const today = todayStr()
  const isMyDay = task.addedToMyDay && task.myDayDate === today

  const status = dueDateStatus(task.dueDate)
  const dueDateClass =
    status === 'overdue' ? 'text-red-600 font-medium' :
    status === 'today' ? 'text-amber-600 font-medium' :
    'text-gray-400'

  const dueDateLabel =
    status === 'today' ? 'Today' :
    task.dueDate ? formatDisplayDate(task.dueDate) : null

  function priorityDot() {
    if (task.priority === 'high') return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="High priority" />
    if (task.priority === 'low') return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="Low priority" />
    return null
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 group ${task.done ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => dispatch({ type: 'TOGGLE_TASK_DONE', payload: task.id })}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
      />
      <span className={`flex-1 text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
        {task.title}
      </span>
      {priorityDot()}
      <CategoryBadge category={task.category} />
      {dueDateLabel && (
        <span className={`text-xs ${dueDateClass} min-w-[48px] text-right`}>
          {status === 'overdue' && <span className="mr-1">⚠</span>}{dueDateLabel}
        </span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {showMyDay && !isMyDay && (
          <button
            title="Add to My Day"
            onClick={() => dispatch({ type: 'ADD_TO_MY_DAY', payload: task.id })}
            className="p-1.5 text-gray-400 hover:text-amber-500 rounded"
          >
            ☀
          </button>
        )}
        {isMyDay && (
          <button
            title="Remove from My Day"
            onClick={() => dispatch({ type: 'REMOVE_FROM_MY_DAY', payload: task.id })}
            className="p-1.5 text-amber-500 rounded"
          >
            ☀
          </button>
        )}
        <button
          title="Edit"
          onClick={() => onEdit(task)}
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
        >
          ✏
        </button>
        <button
          title="Delete"
          onClick={() => {
            if (window.confirm('Delete this task?')) {
              dispatch({ type: 'DELETE_TASK', payload: task.id })
            }
          }}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
        >
          🗑
        </button>
      </div>
    </div>
  )
}
