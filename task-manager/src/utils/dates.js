import {
  format,
  isToday,
  isPast,
  isThisWeek,
  parseISO,
  startOfDay,
  isBefore,
} from 'date-fns'

export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function formatDisplayDate(isoDate) {
  if (!isoDate) return null
  return format(parseISO(isoDate), 'MMM d')
}

export function formatFullDate(isoDate) {
  if (!isoDate) return null
  return format(parseISO(isoDate), 'EEEE, MMMM d')
}

export function formatMonthYear(date) {
  return format(date, 'MMMM yyyy')
}

export function dueDateStatus(isoDate) {
  if (!isoDate) return 'none'
  const d = parseISO(isoDate)
  if (isToday(d)) return 'today'
  if (isBefore(startOfDay(d), startOfDay(new Date()))) return 'overdue'
  if (isThisWeek(d, { weekStartsOn: 0 })) return 'this-week'
  return 'future'
}

export function isOverdue(isoDate) {
  if (!isoDate) return false
  return dueDateStatus(isoDate) === 'overdue'
}
