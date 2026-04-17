import { useState, useMemo } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths, parseISO, isSameDay, getDaysInMonth, getDate,
} from 'date-fns'
import { useStore } from '../store'
import { getColorForKey } from '../utils/colors'

export default function GanttCalendar() {
  const { state } = useStore()
  const [current, setCurrent] = useState(new Date())
  const [mode, setMode] = useState('calendar') // 'calendar' | 'gantt'
  const [expanded, setExpanded] = useState(null) // day key for "+N more" popup

  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const tasksByDate = useMemo(() => {
    const map = {}
    state.tasks.forEach(t => {
      if (!t.dueDate) return
      const d = t.dueDate
      if (!map[d]) map[d] = []
      map[d].push({ ...t, type: 'task' })
    })
    state.committeeEvents.forEach(e => {
      const d = e.date
      if (!map[d]) map[d] = []
      map[d].push({ ...e, type: 'event' })
    })
    return map
  }, [state.tasks, state.committeeEvents])

  const allKeys = useMemo(() => {
    const keys = new Set()
    state.tasks.forEach(t => keys.add(t.category))
    state.committees.forEach(c => keys.add(c))
    return [...keys]
  }, [state.tasks, state.committees])

  const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Gantt view data
  const ganttTasks = useMemo(() => {
    const inMonth = state.tasks.filter(t => {
      if (!t.dueDate) return false
      return t.dueDate >= format(monthStart, 'yyyy-MM-dd') &&
             t.dueDate <= format(monthEnd, 'yyyy-MM-dd')
    })
    const noDate = state.tasks.filter(t => !t.dueDate)
    return { inMonth, noDate }
  }, [state.tasks, current])

  const daysInMonth = getDaysInMonth(current)
  const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="flex-1 p-6 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrent(subMonths(current, 1))}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >←</button>
          <h2 className="text-xl font-bold text-gray-900 min-w-[160px] text-center">
            {format(current, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrent(addMonths(current, 1))}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >→</button>
          <button
            onClick={() => setCurrent(new Date())}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
          >Today</button>
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setMode('calendar')}
            className={`px-4 py-1.5 text-sm font-medium ${mode === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >Calendar</button>
          <button
            onClick={() => setMode('gantt')}
            className={`px-4 py-1.5 text-sm font-medium ${mode === 'gantt' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >Gantt</button>
        </div>
      </div>

      {mode === 'calendar' ? (
        <>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-l border-t border-gray-200 rounded-lg overflow-hidden">
            {days.map(day => {
              const key = format(day, 'yyyy-MM-dd')
              const items = tasksByDate[key] || []
              const visible = items.slice(0, 3)
              const overflow = items.length - 3
              const isCurrentMonth = isSameMonth(day, current)
              const todayDay = isToday(day)
              const isExpanded = expanded === key

              return (
                <div
                  key={key}
                  className={`min-h-[100px] border-r border-b border-gray-200 p-1.5 ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}`}
                >
                  <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                    todayDay ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map(item => (
                      <Pill key={item.id} item={item} />
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : key)}
                        className="text-xs text-blue-500 hover:text-blue-700 px-1"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                  {isExpanded && items.length > 3 && (
                    <div className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1 min-w-[180px] mt-1">
                      {items.map(item => <Pill key={item.id} item={item} />)}
                      <button onClick={() => setExpanded(null)} className="text-xs text-gray-400 mt-1">Close</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <Legend keys={allKeys} />
        </>
      ) : (
        // Gantt view
        <GanttView tasks={ganttTasks} daysInMonth={daysInMonth} dayNums={dayNums} monthStart={monthStart} />
      )}
    </div>
  )
}

function Pill({ item }) {
  const key = item.type === 'task' ? item.category : item.committee
  const color = getColorForKey(key || 'default')
  return (
    <div
      className="text-xs px-1.5 py-0.5 rounded truncate cursor-default"
      style={{ backgroundColor: color.bg, color: color.text }}
      title={`${item.title} — ${key}${item.priority === 'high' ? ' · High priority' : ''}`}
    >
      {item.title}
    </div>
  )
}

function Legend({ keys }) {
  if (keys.length === 0) return null
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {keys.map(k => {
        const color = getColorForKey(k)
        return (
          <span
            key={k}
            className="text-xs px-2 py-1 rounded-full"
            style={{ backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}` }}
          >
            {k}
          </span>
        )
      })}
    </div>
  )
}

function GanttView({ tasks, daysInMonth, dayNums, monthStart }) {
  const { inMonth, noDate } = tasks

  const grouped = inMonth.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

  function dayOfMonth(isoDate) {
    return getDate(parseISO(isoDate))
  }

  const cellW = `${100 / daysInMonth}%`

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header row */}
        <div className="flex">
          <div className="w-48 shrink-0" />
          <div className="flex-1 flex border-l border-t border-gray-200">
            {dayNums.map(d => {
              const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d)
              const today = isToday(date)
              return (
                <div
                  key={d}
                  className={`flex-1 text-center text-xs py-1 border-r border-gray-200 ${today ? 'bg-blue-50 font-bold text-blue-600' : 'text-gray-400'}`}
                >
                  {d}
                </div>
              )
            })}
          </div>
        </div>

        {inMonth.length === 0 && noDate.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No tasks with due dates this month.</div>
        ) : (
          <>
            {Object.entries(grouped).map(([cat, catTasks]) => (
              <div key={cat}>
                <div className="flex items-center border-t border-gray-200">
                  <div className="w-48 shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-r border-gray-200 truncate">
                    {cat}
                  </div>
                  <div className="flex-1 relative border-gray-200" style={{ height: `${catTasks.length * 32}px` }}>
                    {/* Day grid lines */}
                    {dayNums.map(d => (
                      <div
                        key={d}
                        className="absolute top-0 bottom-0 border-r border-gray-100"
                        style={{ left: `${((d - 1) / daysInMonth) * 100}%`, width: cellW }}
                      />
                    ))}
                    {catTasks.map((task, i) => {
                      const d = dayOfMonth(task.dueDate)
                      const left = `${((d - 1) / daysInMonth) * 100}%`
                      const color = getColorForKey(task.category)
                      return (
                        <div
                          key={task.id}
                          className="absolute flex items-center gap-1"
                          style={{ top: `${i * 32 + 6}px`, left, height: '20px' }}
                          title={`${task.title} — due ${task.dueDate}`}
                        >
                          <div
                            className="w-3 h-3 rotate-45 rounded-sm"
                            style={{ backgroundColor: color.text }}
                          />
                          <span className="text-xs text-gray-700 whitespace-nowrap max-w-[120px] truncate">{task.title}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}

            {noDate.length > 0 && (
              <div className="border-t border-gray-200">
                <div className="flex">
                  <div className="w-48 shrink-0 px-3 py-2 text-xs font-semibold text-gray-400 bg-gray-50 border-r border-gray-200">
                    No date
                  </div>
                  <div className="flex-1 px-3 py-2 space-y-1">
                    {noDate.map(t => (
                      <div key={t.id} className="text-xs text-gray-400 truncate">{t.title}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
