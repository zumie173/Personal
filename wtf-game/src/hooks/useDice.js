import { useState, useCallback } from 'react'
import { rollDie } from '../utils/dice'

export function useDice() {
  const [rolling, setRolling] = useState(false)
  const [lastRoll, setLastRoll] = useState(null)

  const roll = useCallback((sides, count = 1) => {
    return new Promise((resolve) => {
      setRolling(true)
      setTimeout(() => {
        const results = Array.from({ length: count }, () => rollDie(sides))
        const result = count === 1 ? results[0] : results
        setLastRoll({ sides, count, result, results })
        setRolling(false)
        resolve(result)
      }, 400)
    })
  }, [])

  const rollMultiple = useCallback((dice) => {
    // dice = [{sides, count, label}]
    return new Promise((resolve) => {
      setRolling(true)
      setTimeout(() => {
        const results = dice.map(d => ({
          ...d,
          results: Array.from({ length: d.count || 1 }, () => rollDie(d.sides)),
        }))
        setRolling(false)
        resolve(results)
      }, 400)
    })
  }, [])

  return { rolling, lastRoll, roll, rollMultiple }
}
