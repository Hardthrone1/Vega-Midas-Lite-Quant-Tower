'use client';

import { useState } from 'react';

export default function DiagnosticsPage() {
  const [setupText, setSetupText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<string[]>([
    "[SYSTEM] Diagnostics engine initialized.",
    "[MEMORY] Awaiting session parameters..."
  ]);

  const triggerSwarm = async () => {
    if (!setupText) return;
    setIsExecuting(true);
    setTelemetry(prev => [...prev, `[ORCHESTRATOR] Routing task to localhost:8001...`]);
    setActiveAgent('Qwen (Local)');
    
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup: setupText, type: 'code' })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setTelemetry(prev => [...prev, `[ORCHESTRATOR] ✓ Task complete.`]);
        setActiveAgent('Idle');
      } else {
        setTelemetry(prev => [...prev, `[ERROR] ${data.error}`]);
        setActiveAgent('Error');
      }
    } catch (error) {
      setTelemetry(prev => [...prev, `[SYSTEM ERROR] Failed to reach Next.js API.`]);
      setActiveAgent('Error');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 font-sans">
      
      {/* HEADER */}
      <header className="mb-8 border-b border-neutral-800 pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-white">Diagnostics Engine</h1>
        <p className="text-neutral-500 text-sm mt-1">Swarm Routing & Logic Repair Command Center</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: INPUT & MEMORY (Spans 5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* INPUT BLOCK */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex-grow flex flex-col">
            <label className="block text-sm font-semibold text-neutral-400 tracking-wider uppercase mb-3">
              Trading Setup / Broken Script
            </label>
            <textarea
              className="w-full flex-grow min-h-[250px] bg-neutral-950 border border-neutral-800 rounded-md p-4 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none text-neutral-300 placeholder-neutral-600 resize-none"
              placeholder="// Paste broken Pine Script v5 here, or describe the MTF logic required (e.g., Hull MA / ZLEMA crossover with strict Asian session filtering)..."
              value={setupText}
              onChange={(e) => setSetupText(e.target.value)}
            />
            <button
              onClick={triggerSwarm}
              disabled={isExecuting || !setupText}
              className="mt-6 w-full bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white font-bold py-4 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              {isExecuting ? 'Executing Swarm...' : 'Initialize Analysis'}
            </button>
          </div>

          {/* MEMORY INJECT BLOCK */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-neutral-400 tracking-wider uppercase mb-3 flex items-center">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
              Session Memory Context
            </h3>
            <div className="bg-neutral-950 p-4 rounded-md border border-neutral-800 min-h-[100px]">
              <p className="text-xs font-mono text-neutral-500 mb-1">Last execution error detected:</p>
              <p className="text-sm font-mono text-amber-400">No active compiler errors in current session.</p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TELEMETRY & ROUTING (Spans 7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* ROUTING STATUS BLOCK */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-400 tracking-wider uppercase mb-1">Active Swarm Agent</h3>
              <p className="text-xl font-bold text-white">
                {activeAgent || 'Awaiting Task...'}
              </p>
            </div>
            <div className="flex space-x-3">
              {/* Status Indicators */}
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full mb-1 ${activeAgent?.includes('Local') ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-neutral-700'}`}></div>
                <span className="text-[10px] uppercase text-neutral-500 font-bold">Local</span>
              </div>
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full mb-1 ${activeAgent?.includes('Cloud') ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-neutral-700'}`}></div>
                <span className="text-[10px] uppercase text-neutral-500 font-bold">Cloud</span>
              </div>
            </div>
          </div>

          {/* GRAPHIFY TELEMETRY TERMINAL */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex-grow flex flex-col">
            <h3 className="text-sm font-semibold text-neutral-400 tracking-wider uppercase mb-3">Graphify Execution Telemetry</h3>
            <div className="bg-black p-4 rounded-md border border-neutral-800 flex-grow font-mono text-xs overflow-y-auto max-h-[500px]">
              {telemetry.map((log, index) => (
                <div key={index} className="mb-2">
                  <span className="text-neutral-500">[{new Date().toLocaleTimeString()}]</span>{' '}
                  <span className={
                    log.includes('ERROR') ? 'text-red-400' :
                    log.includes('✓') ? 'text-emerald-400' :
                    log.includes('[API]') ? 'text-blue-400' :
                    'text-neutral-300'
                  }>
                    {log}
                  </span>
                </div>
              ))}
              {isExecuting && (
                <div className="mt-2 animate-pulse text-neutral-500">_</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}