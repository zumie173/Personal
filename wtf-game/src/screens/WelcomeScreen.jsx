import { useState } from 'react'
import { EVENTS } from '../constants/events'

const RULES_SUMMARY = `
WTF: Wacky Track and Field — Quick Rules

🎯 GOAL: Score the most points across all events

👥 PLAYERS: 2-6 players, each picks an animal athlete

🎲 ANIMALS: Each animal has Speed, Strength, and Agility dice (D4/D6/D8)

📋 EVENTS (6 total):
• Turd Curling — throw cubes for position points
• Heavy Thing Throw — press your luck on the spiral, throw for distance
• Who Even Likes to Run? — 2-lap race with terrain
• Hurting Hurdles — 2-lap race with hurdles
• Zoomie Dash — load dice, match 5, ZOOMIE!
• Big Boing — long jump with press-your-luck approach

🃏 ABILITIES: Each card has a Front and Back ability. Flips after use. Never resets between events.

💊 PEDs: Last place earns Performance Enhancing Drugs (bonus dice). No PEDs in 2-player games.

🏆 SCORING:
• 2P: 1st=3pts, 2nd=1pt
• 3P: 1st=3, 2nd=2, 3rd=0
• 4P: 1st=3, 2nd=2, 3rd=1, 4th=0
• 5P: 1st=3, 2nd=2, 3rd=1, others=0
• 6P: 1st=3, 2nd=2, 3rd/4th=1, others=0

Ties for last = NO PEDs awarded to anyone.
`

export default function WelcomeScreen({ gameState }) {
  const [showRules, setShowRules] = useState(false)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'linear-gradient(135deg, #FFF8E1 0%, #F3E5AB 100%)' }}>
      {/* Logo/Title */}
      <div className="text-center mb-8">
        <div className="text-8xl mb-4">🏆</div>
        <h1 className="text-6xl font-black mb-2" style={{ color: '#2E7D32', textShadow: '3px 3px 0px #1B5E20' }}>
          WTF
        </h1>
        <h2 className="text-3xl font-bold mb-4" style={{ color: '#E65100' }}>
          Wacky Track & Field
        </h2>
        <p className="text-lg text-gray-600 font-medium max-w-md">
          The party game where animal athletes compete for glory, PEDs, and your entertainment
        </p>
      </div>

      {/* Animal Parade */}
      <div className="text-4xl mb-10 flex gap-3 flex-wrap justify-center">
        {'🐰🐊🐒🦎🦝🐻🐼🦔🐧🦥🐢🦤'.split('').filter(c => c.trim()).join('')
          .match(/\p{Emoji}/gu)?.map((emoji, i) => (
            <span key={i} className="hover:scale-125 transition-transform cursor-default">{emoji}</span>
          ))
        }
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          onClick={() => gameState.setPhase('setup')}
          className="py-5 px-8 text-2xl font-black rounded-2xl text-white shadow-lg hover:scale-105 transition-transform active:scale-95"
          style={{ background: 'linear-gradient(135deg, #2E7D32, #43A047)' }}
        >
          🎮 START GAME
        </button>

        <button
          onClick={() => setShowRules(true)}
          className="py-4 px-8 text-xl font-bold rounded-2xl border-4 hover:scale-105 transition-transform active:scale-95"
          style={{ borderColor: '#1565C0', color: '#1565C0', background: 'white' }}
        >
          📖 How to Play
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-400">2-6 players • Party game • Tablets & laptops</p>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-black" style={{ color: '#2E7D32' }}>Quick Rules</h3>
              <button onClick={() => setShowRules(false)} className="text-3xl leading-none hover:scale-110 transition-transform">✕</button>
            </div>
            <pre className="whitespace-pre-wrap text-sm font-mono text-gray-700 leading-relaxed">{RULES_SUMMARY}</pre>
            <div className="mt-4">
              <h4 className="font-bold text-lg mb-2" style={{ color: '#E65100' }}>Events:</h4>
              {EVENTS.map(e => (
                <div key={e.id} className="mb-2 p-3 rounded-lg bg-gray-50">
                  <span className="font-bold">{e.emoji} {e.name}</span>
                  <p className="text-sm text-gray-600">{e.description}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowRules(false)}
              className="mt-4 w-full py-3 rounded-xl text-white font-bold text-lg"
              style={{ background: '#2E7D32' }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
