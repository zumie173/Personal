import { v4 as uuidv4 } from 'uuid'

export const DEFAULT_CATEGORIES = [
  'Accounting',
  'Building / Construction',
  'Capital Campaign',
  'CARF',
  'Day Hab',
  'DMH',
  'Fulfillment',
  'Printing',
  'Misc / Non-FH Tasks',
  'Recommerce',
]

export const DEFAULT_COMMITTEES = [
  'Safety Committee',
  'Finance Committee',
  'GOAD Committee',
  'Governance / Compensation Committee',
]

const year = new Date().getFullYear()

export function buildDefaultEvents() {
  const events = [
    // Safety Committee
    { committee: 'Safety Committee', title: 'Annual Safety Training Review', month: 1, day: 15 },
    { committee: 'Safety Committee', title: 'Q1 Safety Walkthrough', month: 3, day: 15 },
    { committee: 'Safety Committee', title: 'Mid-Year Incident Report', month: 6, day: 15 },
    { committee: 'Safety Committee', title: 'Q3 Safety Walkthrough', month: 9, day: 15 },
    { committee: 'Safety Committee', title: 'Annual Safety Plan Update', month: 11, day: 15 },

    // Finance Committee
    { committee: 'Finance Committee', title: 'Budget Review — Prior Year Close', month: 1, day: 20 },
    { committee: 'Finance Committee', title: 'Q1 Financial Review', month: 3, day: 20 },
    { committee: 'Finance Committee', title: 'Mid-Year Forecast', month: 6, day: 20 },
    { committee: 'Finance Committee', title: 'Q3 Financial Review', month: 9, day: 20 },
    { committee: 'Finance Committee', title: 'Budget Planning — Next Year', month: 11, day: 20 },

    // GOAD Committee
    { committee: 'GOAD Committee', title: 'Annual Goals Setting Session', month: 2, day: 10 },
    { committee: 'GOAD Committee', title: 'Mid-Year Goals Check-in', month: 5, day: 10 },
    { committee: 'GOAD Committee', title: 'Progress Review', month: 8, day: 10 },
    { committee: 'GOAD Committee', title: 'Year-End Assessment', month: 11, day: 10 },

    // Governance / Compensation Committee
    { committee: 'Governance / Compensation Committee', title: 'Annual Governance Review', month: 1, day: 25 },
    { committee: 'Governance / Compensation Committee', title: 'Compensation Benchmarking', month: 4, day: 25 },
    { committee: 'Governance / Compensation Committee', title: 'Policy Review', month: 7, day: 25 },
    { committee: 'Governance / Compensation Committee', title: 'Board Support Prep', month: 10, day: 25 },
    { committee: 'Governance / Compensation Committee', title: 'Year-End Governance Report', month: 12, day: 25 },
  ]

  return events.map(e => ({
    id: uuidv4(),
    committee: e.committee,
    title: e.title,
    date: `${year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`,
    notes: '',
    done: false,
  }))
}

export function buildInitialState() {
  return {
    tasks: [],
    committeeEvents: buildDefaultEvents(),
    categories: [...DEFAULT_CATEGORIES],
    committees: [...DEFAULT_COMMITTEES],
  }
}
