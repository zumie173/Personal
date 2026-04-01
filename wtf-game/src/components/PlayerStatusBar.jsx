export default function PlayerStatusBar({ players, currentPlayerId }) {
  return (
    <div className="p-2 flex gap-2 overflow-x-auto" style={{ background: '#1B5E20' }}>
      {players.map(p => {
        const isCurrent = p.id === currentPlayerId
        return (
          <div
            key={p.id}
            className="flex-shrink-0 rounded-xl p-2 flex items-center gap-2 min-w-fit transition-all"
            style={{
              background: isCurrent ? p.color.hex : 'rgba(255,255,255,0.1)',
              border: `2px solid ${isCurrent ? 'white' : 'transparent'}`,
              transform: isCurrent ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <span className="text-xl">{p.animal?.emoji || '?'}</span>
            <div>
              <div className="font-bold text-white text-sm leading-tight">{p.name}</div>
              <div className="text-xs text-white/80 leading-tight">
                {p.score}pts
                {p.peds > 0 && <span className="ml-1 text-purple-300">💊×{p.peds}</span>}
              </div>
            </div>
            {p.cardSide === 'back' && (
              <span className="text-xs text-white/60 bg-white/20 px-1 rounded">◀</span>
            )}
            {p.skipNextTurn && (
              <span className="text-xs text-red-300">⏭️</span>
            )}
            {p.finished && (
              <span className="text-xs text-yellow-300">✓</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
