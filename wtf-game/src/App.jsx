import { useGameState } from './hooks/useGameState'
import WelcomeScreen from './screens/WelcomeScreen'
import PlayerSetup from './screens/PlayerSetup'
import AnimalSelection from './screens/AnimalSelection'
import EventOrderSetup from './screens/EventOrderSetup'
import GameScreen from './screens/GameScreen'
import EventResults from './screens/EventResults'
import FinalResults from './screens/FinalResults'

export default function App() {
  const gameState = useGameState()
  const { state } = gameState

  return (
    <div className="min-h-screen" style={{ background: '#FFF8E1' }}>
      {state.phase === 'welcome' && <WelcomeScreen gameState={gameState} />}
      {state.phase === 'setup' && <PlayerSetup gameState={gameState} />}
      {state.phase === 'animal_select' && <AnimalSelection gameState={gameState} />}
      {state.phase === 'event_order' && <EventOrderSetup gameState={gameState} />}
      {state.phase === 'game' && <GameScreen gameState={gameState} />}
      {state.phase === 'event_results' && <EventResults gameState={gameState} />}
      {state.phase === 'final_results' && <FinalResults gameState={gameState} />}
    </div>
  )
}
