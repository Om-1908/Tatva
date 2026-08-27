import React from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import Navbar from '../components/layout/Navbar'
import ConfigStrip from '../components/composer/ConfigStrip'
import SynthesisPanel from '../components/composer/SynthesisPanel'
import ComposerWorkspace from '../components/composer/ComposerWorkspace'

export default function ComposerPage() {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen flex flex-col bg-[#13121b] text-on-surface">
        <Navbar />
        <div className="pt-[64px] flex-1 flex flex-col">
          {/* Configuration strip for selecting qubit count and target state */}
          <ConfigStrip />

          {/* TOP SECTION: Read-Only Synthesis Results (Agent Output) */}
          <SynthesisPanel />

          {/* BOTTOM SECTION: Interactive Validation Composer (Build from scratch) */}
          <ComposerWorkspace />
        </div>
      </div>
    </DndProvider>
  )
}
