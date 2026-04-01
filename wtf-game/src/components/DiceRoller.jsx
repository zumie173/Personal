import { useState } from 'react'
import { rollDie } from '../utils/dice'

export default function DiceRoller({ sides, label, onRoll, bonus = 0, disabled = false }) {
  const [result, setResult] = useState(null)
  const [rolling, setRolling] = useState(false)
  const [displayNum, setDisplayNum] = useState(null)

  const handleRoll = () => {
    if (rolling || disabled) return
    setRolling(true)

    let count = 0
    const interval = setInterval(() => {
      setDisplayNum(rollDie(sides))
      count++
      if (count >= 6) {
        clearInterval(interval)
        const final = rollDie(sides)
        setDisplayNum(final)
        setResult(final)
        setRolling(false)
        onRoll?.(final, final + bonus)
      }
    }, 80)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <div className="text-sm font-bold text-gray-600">{label}</div>}

      <button
        onClick={handleRoll}
        disabled={disabled || rolling}
        className="w-20 h-20 rounded-2xl text-3xl font-black text-white shadow-lg hover:scale-110 transition-all active:scale-95 disabled:opacity-50"
        style={{ background: rolling ? '#E65100' : '#2E7D32' }}
      >
        {rolling ? displayNum || '?' : result !== null ? result : `D${sides}`}
      </button>

      {result !== null && bonus > 0 && (
        <div className="text-sm font-bold" style={{ color: '#6A1B9A' }}>
          {result} + {bonus} = {result + bonus}
        </div>
      )}
      {rolling && <div className="text-sm animate-pulse text-gray-500">Rolling...</div>}
    </div>
  )
}
