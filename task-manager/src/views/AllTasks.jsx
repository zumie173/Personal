import { useState, useMemo } from 'react'
import { useStore } from '../store'
import TaskRow from '../components/TaskRow'
import TaskModal from '../components/TaskModal'
import { isOverdue, dueDateStatus, todayStr } from '../utils/dates'
import { isThisWeek, parseISO } from 'date-fns'

export default function AllTasks({ initialCategory }) {
  const { state } = useStore()
  const [modal, setModal] = useState(null) // null | 'new' | task object
  const [groupByCategory, setGroupByCategory] = useState(false)

  const [filters, setFilters] = useState({
    status: 'open',
    priority: 'all',
    due: 'all',
    category: initialCategory || 'all',
  })
  const [sort, setSort] = useState('dueDate')

  const today = todayStr()

  function filterTask(t) {
    if (filters.status === 'open' && t.done) return false
    if (filters.status === 'done' && !t.done) return false
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false
    if (filters.category !== 'all' && t.category !== filters.category) return false
    if (filters.due !== 'all') {
      const status = dueDateStatus(t.dueDate)
      if (filters.due === 'overdue' && status !== 'overdue') return false
      if (filters.due === 'today' && status !== 'today') return false
      if (filters.due === 'this-week' && !['today', 'this-week'].includes(status)) return false
      if (filters.due === 'none' && t.dueDate) return false
    }
    return true
  }

  const filtered = useMemo(() => {
    let tasks = state.tasks.filter(filterTask)
    tasks = tasks.sort((a, b) => {
      if (sort === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt)
      if (sort === 'priority') {
        const p = { high: 0, normal: 1, low: 2 }
        return p[a.priority] - p[b.priority]
      }
      if (sort === 'alpha') return a.title.localeCompare(b.title)
      return 0
    })
    return tasks
  }, [state.tasks, filters, sort])

  const grouped = useMemo(() => {
    if (!groupByCategory) return null
    return filtered.reduce((acc, t) => {
      if (!acc[t.category]) acc[t.category] = []
      acc[t.category].push(t)
      return acc
    }, {})
  }, [filtered, groupByCategory])

  return (
    <div className="flex-1 p-6">
      {modal && (
        <TaskModal
          task={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">All Tasks</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setGroupByCategory(g => !g)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${groupByCategory ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {groupByCategory ? 'Grouped' : 'Flat list'}
          </button>
          <button
            onClick={() => setModal('new')}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            + New Task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <FilterSelect label="Status" value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}
          options={[['all', 'All'], ['open', 'Open'], ['done', 'Done']]}
        />
        <FilterSelect label="Priority" value={filters.priority} onChange={v => setFilters(f => ({ ...f, priority: v }))}
          options={[['all', 'All Priorities'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']]}
        />
        <FilterSelect label="Due" value={filters.due} onChange={v => setFilters(f => ({ ...f, due: v }))}
          options={[['all', 'Any Date'], ['overdue', 'Overdue'], ['today', 'Due Today'], ['this-week', 'This Week'], ['none', 'No Due Date']]}
        />
        <select
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-700 bg-white"
          value={filters.category}
          onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
        >
          <option value="all">All Categories</option>
          {state.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-700 bg-white ml-auto"
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="dueDate">Sort: Due Date</option>
          <option value="created">Sort: Newest</option>
          <option value="priority">Sort: Priority</option>
          <option value="alpha">Sort: A–Z</option>
        </select>
      </div>

      <div className="text-xs text-gray-400 mb-2">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          {state.tasks.length === 0
            ? <p>No tasks yet. Hit <strong>New Task</strong> to add your first one.</p>
            : <p>No tasks match your filters.</p>
          }
        </div>
      ) : groupByCategory && grouped ? (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, tasks]) => (
            <div key={cat}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">{cat} · {tasks.length}</div>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {tasks.map(t => (
                  <TaskRow key={t.id} task={t} onEdit={setModal} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {filtered.map(t => (
            <TaskRow key={t.id} task={t} onEdit={setModal} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-700 bg-white"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
    </select>
  )
}
