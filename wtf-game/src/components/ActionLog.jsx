export default function ActionLog({ log }) {
  const recent = log.slice(0, 8)

  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.05)' }}>
      <h4 className="font-bold text-sm text-gray-500 mb-2">📋 Action Log</h4>
      <div className="space-y-1">
        {recent.length === 0 && <p className="text-xs text-gray-400">No actions yet</p>}
        {recent.map((entry, i) => (
          <div key={entry.id} className="text-xs text-gray-600" style={{ opacity: 1 - i * 0.1 }}>
            <span className="text-gray-400 mr-1">{entry.time}</span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  )
}
