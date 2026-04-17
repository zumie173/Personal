import { useState, useEffect } from 'react'
import { StoreProvider } from './store'
import Sidebar from './components/Sidebar'
import MyDay from './views/MyDay'
import AllTasks from './views/AllTasks'
import Categories from './views/Categories'
import Committees from './views/Committees'
import GanttCalendar from './views/GanttCalendar'
import Settings from './views/Settings'
import TaskModal from './components/TaskModal'

function AppInner() {
  const [view, setView] = useState('myday')
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [showNewTask, setShowNewTask] = useState(false)

  function handleViewCategory(cat) {
    setCategoryFilter(cat)
    setView('alltasks')
  }

  function handleSetView(v) {
    setView(v)
    if (v !== 'alltasks') setCategoryFilter(null)
  }

  // Global keyboard shortcut: N = New Task
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return
        setShowNewTask(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar view={view} setView={handleSetView} />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {view === 'myday' && <MyDay />}
        {view === 'alltasks' && <AllTasks key={categoryFilter} initialCategory={categoryFilter} />}
        {view === 'categories' && <Categories onViewCategory={handleViewCategory} />}
        {view === 'committees' && <Committees />}
        {view === 'gantt' && <GanttCalendar />}
        {view === 'settings' && <Settings />}
      </main>
      {showNewTask && <TaskModal task={null} onClose={() => setShowNewTask(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  )
}
