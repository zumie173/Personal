export default function DiceDisplay({ result, label, color = '#2E7D32', rolling = false }) {
  if (!result && !rolling) return null

  return (
    <div className="flex flex-col items-center">
      {label && <div className="text-sm font-bold text-gray-600 mb-1">{label}</div>}
      <div
        className="rounded-2xl flex items-center justify-center font-black shadow-lg"
        style={{
          width: 80,
          height: 80,
          fontSize: 36,
          background: rolling ? '#E65100' : color,
          color: 'white',
          animation: rolling ? 'wiggle 0.1s infinite' : 'none',
          transition: 'background 0.2s',
        }}
      >
        {rolling ? '?' : result}
      </div>
      <style>{`
        @keyframes wiggle {
          0% { transform: rotate(-5deg) scale(1.1); }
          50% { transform: rotate(5deg) scale(1.1); }
          100% { transform: rotate(-5deg) scale(1.1); }
        }
      `}</style>
    </div>
  )
}
