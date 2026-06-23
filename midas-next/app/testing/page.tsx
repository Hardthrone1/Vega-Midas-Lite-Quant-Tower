'use client';

import { useState } from 'react';

export default function TestingValidatorPage() {
  // Constraints State
  const [strictBarstate, setStrictBarstate] = useState(true);
  const [useAtrRisk, setUseAtrRisk] = useState(true);
  const [spreadPoints, setSpreadPoints] = useState('2.0');
  const [slippageTicks, setSlippageTicks] = useState('1'); 
  
  // Data Ingestion State
  const [replayLog, setReplayLog] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const injectConstraints = async () => {
    setIsProcessing(true);
    
    try {
      const res = await fetch('/api/test-constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strictBarstate,
          useAtrRisk,
          spreadPoints: parseFloat(spreadPoints),
          slippageTicks: parseInt(slippageTicks),
          replayLog
        })
      });
      
      const data = await res.json();
      if (!data.success) {
        console.error('Constraint injection failed:', data.error);
      }
    } catch (error) {
      console.error('Failed to reach constraint API:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 font-sans">
      
      {/* HEADER */}
      <header className="mb-8 border-b border-neutral-800 pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-white">Real-Market Validator</h1>
        <p className="text-neutral-500 text-sm mt-1">Enforce strict execution constraints and ingest replay data.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: SWARM CONSTRAINTS (Spans 4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-neutral-400 tracking-wider uppercase mb-5">
              Code Generation Constraints
            </h3>
            
            <div className="space-y-6">
              {/* Toggle 1 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-neutral-200">Strict Bar Confirmation</p>
                  <p className="text-xs text-neutral-500">Force barstate.isconfirmed</p>
                </div>
                <button 
                  onClick={() => setStrictBarstate(!strictBarstate)}
                  className={`w-14 h-8 rounded-full p-1 transition-colors ${strictBarstate ? 'bg-emerald-600' : 'bg-neutral-700'}`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white transition-transform ${strictBarstate ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {/* Toggle 2 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-neutral-200">Dynamic Risk Engine</p>
                  <p className="text-xs text-neutral-500">Require ATR-based Stop Logic</p>
                </div>
                <button 
                  onClick={() => setUseAtrRisk(!useAtrRisk)}
                  className={`w-14 h-8 rounded-full p-1 transition-colors ${useAtrRisk ? 'bg-emerald-600' : 'bg-neutral-700'}`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white transition-transform ${useAtrRisk ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

              <hr className="border-neutral-800" />

              {/* Spread & Slippage Inputs */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Simulated Spread (Points/Pips)</label>
                <input 
                  type="number"
                  value={spreadPoints}
                  onChange={(e) => setSpreadPoints(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none text-neutral-300 placeholder-neutral-600"
                  placeholder="e.g., 2.0"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Slippage Penalty (Ticks)</label>
                <input 
                  type="number"
                  value={slippageTicks}
                  onChange={(e) => setSlippageTicks(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none text-neutral-300 placeholder-neutral-600"
                  placeholder="e.g., 1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DATA INGESTION (Spans 8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex-grow flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-neutral-400 tracking-wider uppercase">
                Failure Logs & Market Data
              </h3>
              <span className="bg-neutral-800 text-neutral-400 text-xs px-2 py-1 rounded font-mono">Clipboard Ready</span>
            </div>
            
            <p className="text-sm text-neutral-400 mb-4">
              Paste TradingView Bar Replay logs, CSV export data, or live execution mismatch notes here. The swarm will analyze this data to identify repainting logic or slippage failures.
            </p>

            <textarea
              className="w-full flex-grow min-h-[300px] bg-neutral-950 border border-neutral-800 rounded-md p-4 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none text-neutral-300 placeholder-neutral-600 resize-none"
              placeholder="e.g., [14:30 NY Open] Long triggered on 5m chart but immediately stopped out by XAUUSD spread spike. Logic failed to account for volatility..."
              value={replayLog}
              onChange={(e) => setReplayLog(e.target.value)}
            />

            <button
              onClick={injectConstraints}
              disabled={isProcessing}
              className="mt-6 w-full bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-bold py-4 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              {isProcessing ? 'Locking Constraints...' : 'Inject Logic to Swarm'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}