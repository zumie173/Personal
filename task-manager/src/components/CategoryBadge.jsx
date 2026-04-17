import { getColorForKey } from '../utils/colors'

export default function CategoryBadge({ category }) {
  if (!category) return null
  const color = getColorForKey(category)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}` }}
    >
      {category}
    </span>
  )
}
