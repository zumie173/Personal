export default function AbilityModal({ player, onUse, onClose, eventType }) {
  if (!player?.animal) return null
  const side = player.cardSide
  const ability = player.animal[side]

  // Filter options based on event type for racing-only abilities
  const isRacing = eventType === 'race'
  const options = ability.options.filter(opt => {
    if (opt.effect.racingOnly && !isRacing) return false
    return true
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">{player.animal.emoji}</span>
          <div>
            <h3 className="font-black text-xl">{player.animal.name}</h3>
            <span className="px-2 py-1 rounded-full text-xs font-bold text-white" style={{ background: side === 'front' ? '#2E7D32' : '#607D8B' }}>
              {side === 'front' ? '▶ FRONT' : '◀ BACK'}
            </span>
          </div>
        </div>

        <p className="text-gray-600 mb-4 font-medium">{ability.description}</p>

        <div className="space-y-3 mb-4">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onUse(opt)}
              className="w-full py-4 px-4 rounded-xl text-left font-bold hover:scale-102 transition-transform border-2 hover:border-green-500"
              style={{ background: '#F5F5F5', borderColor: '#ddd' }}
            >
              <span className="text-green-700 mr-2">→</span>
              {opt.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-3">Card will flip after use. Can only use once per turn.</p>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-bold text-gray-600 border-2 border-gray-300 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
