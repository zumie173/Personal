import { useState } from 'react'
import { useStore } from '../store'
import { formatDisplayDate, isOverdue, dueDateStatus, todayStr } from '../utils/dates'
import { parseISO, isBefore, startOfDay } from 'date-fns'

function EventModal({ committee, event, onClose }) {
  const { dispatch } = useStore()
  const isEdit = !!event
  const [form, setForm] = useState({
    title: event?.title || '',
    date: event?.date || '',
    notes: event?.notes || '',
  })
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.date) { setError('Date is required'); return }
    if (isEdit) {
      dispatch({ type: 'UPDATE_COMMITTEE_EVENT', payload: { ...event, ...form } })
    } else {
      dispatch({ type: 'ADD_COMMITTEE_EVENT', payload: { committee, ...form } })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Event' : 'Add Event'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              autoFocus
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">{isEdit ? 'Save' : 'Add Event'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CommitteeTab({ committee }) {
  const { state, dispatch } = useStore()
  const [modal, setModal] = useState(null) // null | 'add' | event object
  const today = todayStr()

  const events = state.committeeEvents
    .filter(e => e.committee === committee)
    .sort((a, b) => a.date.localeCompare(b.date))

  const upcoming = events.filter(e => !e.done && !isOverdue(e.date))
  const overdueEvents = events.filter(e => !e.done && isOverdue(e.date))
  const completed = events.filter(e => e.done)

  return (
    <div>
      {modal && (
        <EventModal
          committee={committee}
          event={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4 text-sm">
          <span className="text-blue-600 font-medium">{upcoming.length} upcoming</span>
          {overdueEvents.length > 0 && (
            <span className="text-red-600 font-medium">{overdueEvents.length} overdue</span>
          )}
          <span className="text-gray-400">{completed.length} completed</span>
        </div>
        <button
          onClick={() => setModal('add')}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          + Add Event
        </button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p>No events scheduled. Add your first milestone.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
          {events.map(event => {
            const status = dueDateStatus(event.date)
            const dateClass = event.done ? 'text-gray-400' :
              status === 'overdue' ? 'text-red-600 font-medium' :
              status === 'today' ? 'text-amber-600 font-medium' :
              'text-gray-600'

            return (
              <div key={event.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 group ${event.done ? 'bg-gray-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={event.done}
                  onChange={() => dispatch({ type: 'TOGGLE_EVENT_DONE', payload: event.id })}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${event.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {event.title}
                  </div>
                  {event.notes && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{event.notes}</div>
                  )}
                </div>
                <span className={`text-xs ${dateClass} whitespace-nowrap`}>
                  {!event.done && status === 'overdue' && <span className="mr-1">⚠</span>}
                  {formatDisplayDate(event.date)}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setModal(event)} className="p-1 text-gray-400 hover:text-blue-600 text-sm">✏</button>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this event?')) {
                        dispatch({ type: 'DELETE_COMMITTEE_EVENT', payload: event.id })
                      }
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 text-sm"
                  >🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
