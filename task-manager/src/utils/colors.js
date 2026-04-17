const PALETTE = [
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' }, // blue
  { bg: '#dcfce7', text: '#166534', border: '#86efac' }, // green
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, // amber
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' }, // pink
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' }, // violet
  { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' }, // orange
  { bg: '#cffafe', text: '#164e63', border: '#67e8f9' }, // cyan
  { bg: '#f0fdf4', text: '#14532d', border: '#4ade80' }, // emerald
  { bg: '#fdf4ff', text: '#6b21a8', border: '#d8b4fe' }, // purple
  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }, // red
  { bg: '#f1f5f9', text: '#334155', border: '#94a3b8' }, // slate
  { bg: '#fff7ed', text: '#7c2d12', border: '#fdba74' }, // amber-dark
  { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' }, // teal
  { bg: '#fef9c3', text: '#713f12', border: '#fde047' }, // yellow
]

const colorMap = new Map()

export function getColorForKey(key) {
  if (!colorMap.has(key)) {
    const idx = colorMap.size % PALETTE.length
    colorMap.set(key, PALETTE[idx])
  }
  return colorMap.get(key)
}

export function getTailwindDot(priority) {
  if (priority === 'high') return 'bg-red-500'
  if (priority === 'low') return 'bg-gray-300'
  return 'bg-gray-400'
}
