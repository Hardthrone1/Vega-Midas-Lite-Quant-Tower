'use client';

// ============================================================
// MIDAS COMMAND CENTER — Homepage
// Matches MIDAS_Orchestrator.js v1.5 identity exactly.
// Agents, pipeline stages, roles, model strings all sourced
// directly from the orchestrator config.
// ============================================================

import { useState, useEffect, useRef } from 'react';

// ── TYPES ────────────────────────────────────────────────────

type AgentStatus = 'online' | 'busy' | 'idle' | 'error';

interface Agent {
  id: string;
  name: string;
  model: string;
  tier: string;
  role: string;
  status: AgentStatus;
  color: string;
}

interface PipelineStage {
  id: string;
  label: string;
  log: string;
  color: string;
}

interface LogLine {
  id: number;
  prefix: string;
  msg: string;
  type: 'success' | 'warn' | 'error' | 'info' | 'dim';
}

// ── DATA (from MIDAS_Orchestrator.js) ────────────────────────

const AGENTS: Agent[] = [
  {
    id: 'hermes',
    name: 'Qwen3-Next 80B',
    model: 'qwen/qwen3-next-80b-a3b-instruct:free',
    tier: 'FREE',
    role: 'Router & Orchestrator',
    status: 'online',
    color: '#6366f1',
  },
  {
    id: 'qwen',
    name: 'Qwen 2.5 72B',
    model: 'meta-llama/llama-3.1-8b-instruct',
    tier: 'FREE',
    role: 'Vision + Reasoning',
    status: 'idle',
    color: '#3b82f6',
  },
  {
    id: 'nemotron',
    name: 'Nemotron 3 Ultra',
    model: 'nousresearch/hermes-3-llama-3.1-405b:free',
    tier: 'FREE',
    role: 'Quant + Logic',
    status: 'idle',
    color: '#8b5cf6',
  },
  {
    id: 'nex',
    name: 'Nex-N2-Pro',
    model: 'nex-agi/nex-n2-pro:free',
    tier: 'FREE',
    role: 'Agentic Coding',
    status: 'idle',
    color: '#06b6d4',
  },
  {
    id: 'gemini',
    name: 'Gemini 3.5 Flash',
    model: 'google/gemma-4-31b-it:free',
    tier: 'FREE',
    role: 'Fast Synthesis',
    status: 'idle',
    color: '#10b981',
  },
  {
    id: 'claude',
    name: 'Claude Haiku',
    model: 'anthropic/claude-haiku-4-5-20251001:free',
    tier: 'FREE',
    role: 'Pine Script Authority',
    status: 'online',
    color: '#f59e0b',
  },
  {
    id: 'gpt',
    name: 'GPT OSS 120B',
    model: 'openai/gpt-oss-120b',
    tier: 'FREE',
    role: 'Open Source Reasoning',
    status: 'idle',
    color: '#ec4899',
  },
  {
    id: 'qwen_fallback',
    name: 'Llama 3.3 70B',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    tier: 'FREE',
    role: 'Router Fallback',
    status: 'idle',
    color: '#64748b',
  },
];

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'route',  label: 'ROUTE',     log: '[ROUTER] Hermes routing task...',     color: '#6366f1' },
  { id: 'swarm',  label: 'SWARM',     log: '[SWARM] Sequential agent execution',   color: '#3b82f6' },
  { id: 'synth',  label: 'SYNTHESIZE',log: '[GEMINI] Synthesizing results...',     color: '#8b5cf6' },
  { id: 'audit',  label: 'AUDIT',     log: '[CLAUDE] Pine Script code generation', color: '#f59e0b' },
  { id: 'vault',  label: 'VAULT',     log: '[VAULT] Saving to Obsidian...',        color: '#10b981' },
  { id: 'write',  label: 'WRITE',     log: '[MCP] Writing .pine to workspace',     color: '#06b6d4' },
];

const LINT_RULES = [
  { id: 'confirmed',  label: 'barstate.isconfirmed guard',   status: 'pass'  },
  { id: 'lookahead',  label: 'No lookahead leakage',          status: 'pass'  },
  { id: 'repaint',    label: 'security() repaint check',      status: 'warn'  },
  { id: 'overfit',    label: 'Indicator stacking ≤ 4',        status: 'pass'  },
  { id: 'slippage',   label: 'Slippage / commission modeled', status: 'fail'  },
  { id: 'atr',        label: 'ATR stops — bar confirmation',  status: 'pass'  },
];

// ── HELPERS ──────────────────────────────────────────────────

function statusColor(s: AgentStatus) {
  return s === 'online' ? 'var(--online)'
       : s === 'busy'   ? 'var(--warn)'
       : s === 'error'  ? 'var(--danger)'
       :                  'var(--muted)';
}

function lintColor(s: string) {
  return s === 'pass' ? 'var(--online)'
       : s === 'warn' ? 'var(--warn)'
       :                'var(--danger)';
}

function lintIcon(s: string) {
  return s === 'pass' ? '✓' : s === 'warn' ? '⚠' : '✗';
}

// ── COMPONENT: AgentCard ─────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div
      className="card card-interactive p-3 flex flex-col gap-2 fade-up"
      style={{ animationDelay: `${AGENTS.indexOf(agent) * 40}ms` }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
            style={{
              background: statusColor(agent.status),
              boxShadow: agent.status === 'online'
                ? `0 0 6px ${agent.color}66`
                : 'none',
            }}
          />
          {/* Agent name */}
          <span
            className="text-xs font-bold truncate"
            style={{ color: 'var(--text-hi)' }}
          >
            {agent.name}
          </span>
        </div>
        <span className="badge-free flex-shrink-0">{agent.tier}</span>
      </div>

      {/* Role */}
      <div
        className="label-xs"
        style={{ color: agent.color }}
      >
        {agent.role}
      </div>

      {/* Model string */}
      <div
        className="mono truncate"
        style={{ color: 'var(--text-dim)', fontSize: '10px' }}
        title={agent.model}
      >
        {agent.model}
      </div>

      {/* Color accent strip */}
      <div
        className="h-px w-full mt-1 rounded"
        style={{ background: `${agent.color}30` }}
      />
    </div>
  );
}

// ── COMPONENT: PipelineBar ───────────────────────────────────

function PipelineBar({ activeStage }: { activeStage: number }) {
  return (
    <div className="card p-4">
      <div className="label-xs mb-4" style={{ color: 'var(--text-dim)' }}>
        Execution Pipeline
      </div>
      <div className="flex items-center gap-0">
        {PIPELINE_STAGES.map((stage, i) => {
          const isActive  = i === activeStage;
          const isDone    = i < activeStage;
          const isPending = i > activeStage;
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              {/* Stage node */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold transition-all duration-500"
                  style={{
                    background: isActive
                      ? `${stage.color}22`
                      : isDone
                        ? `${stage.color}11`
                        : 'var(--border)',
                    border: `1px solid ${isActive ? stage.color : isDone ? `${stage.color}44` : 'var(--border-hi)'}`,
                    color: isActive ? stage.color : isDone ? `${stage.color}88` : 'var(--muted)',
                    boxShadow: isActive ? `0 0 10px ${stage.color}44` : 'none',
                  }}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <span
                  className="label-xs"
                  style={{
                    fontSize: '8px',
                    color: isActive ? stage.color : isPending ? 'var(--muted)' : `${stage.color}88`,
                  }}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector — skip last */}
              {i < PIPELINE_STAGES.length - 1 && (
                <div
                  className="flex-1 h-px mx-1 relative overflow-hidden"
                  style={{ background: 'var(--border-hi)' }}
                >
                  {isDone && (
                    <div
                      className="absolute inset-0"
                      style={{ background: `${stage.color}66` }}
                    />
                  )}
                  {isActive && (
                    <div
                      className="absolute inset-y-0 w-1/2 scan-line"
                      style={{ background: `linear-gradient(90deg, transparent, ${stage.color}, transparent)` }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── COMPONENT: ConsoleLog ────────────────────────────────────

function ConsoleLog({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      className="card p-3 overflow-y-auto"
      style={{ height: '220px', background: '#08080c' }}
    >
      <div className="label-xs mb-2" style={{ color: 'var(--text-dim)' }}>
        Console
      </div>
      {lines.map((line) => (
        <div key={line.id} className="log-line">
          <span className="log-prefix">{line.prefix}</span>
          <span className={`log-${line.type}`}>{line.msg}</span>
        </div>
      ))}
      {/* Cursor */}
      <div className="log-line">
        <span className="log-prefix">{'>'}</span>
        <span style={{ color: 'var(--signal)' }}>
          _<span className="cursor-blink">█</span>
        </span>
      </div>
    </div>
  );
}

// ── COMPONENT: LintPanel ─────────────────────────────────────

function LintPanel() {
  return (
    <div className="card p-3">
      <div className="label-xs mb-3" style={{ color: 'var(--text-dim)' }}>
        Anti-Cheat Linter
      </div>
      <div className="flex flex-col gap-1.5">
        {LINT_RULES.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-3">
            <span className="mono" style={{ color: 'var(--text-body)', fontSize: '11px' }}>
              {rule.label}
            </span>
            <span
              className="font-bold"
              style={{ color: lintColor(rule.status), fontSize: '11px', minWidth: '14px' }}
            >
              {lintIcon(rule.status)}
            </span>
          </div>
        ))}
      </div>
      <div
        className="mt-3 pt-2 label-xs"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}
      >
        4 pass · 1 warn · 1 fail
      </div>
    </div>
  );
}

// ── COMPONENT: TaskLauncher ──────────────────────────────────

function TaskLauncher({
  onRun,
  running,
}: {
  onRun: (setup: string, type: string) => void;
  running: boolean;
}) {
  const [setup, setSetup]     = useState('');
  const [taskType, setType]   = useState('setup-analysis');

  const TASK_TYPES = [
    { id: 'setup-analysis',    label: 'Setup Analysis' },
    { id: 'strategy-analysis', label: 'Strategy Analysis' },
    { id: 'backtest',          label: 'Backtest Review' },
    { id: 'code',              label: 'Code Generation' },
    { id: 'vision',            label: 'Vision' },
  ];

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="label-xs" style={{ color: 'var(--text-dim)' }}>
        Task Launcher
      </div>

      {/* Setup textarea */}
      <textarea
        className="w-full rounded p-2 mono resize-none outline-none transition-colors"
        style={{
          background: '#08080c',
          border: '1px solid var(--border-hi)',
          color: 'var(--text-hi)',
          fontSize: '12px',
          height: '80px',
        }}
        placeholder="Describe the trading setup or paste Pine Script..."
        value={setup}
        onChange={(e) => setSetup(e.target.value)}
        onFocus={(e) => (e.target.style.borderColor = 'var(--signal)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--border-hi)')}
      />

      {/* Task type selector */}
      <div className="flex flex-wrap gap-1.5">
        {TASK_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className="label-xs px-2.5 py-1 rounded transition-colors"
            style={{
              background: taskType === t.id ? 'var(--signal-mid)' : 'var(--border)',
              color: taskType === t.id ? 'var(--signal)' : 'var(--text-dim)',
              border: `1px solid ${taskType === t.id ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={() => onRun(setup, taskType)}
        disabled={running || !setup.trim()}
        className="w-full py-2.5 rounded font-bold text-xs tracking-widest uppercase transition-all"
        style={{
          background: running
            ? 'var(--border)'
            : setup.trim()
              ? 'var(--signal)'
              : 'var(--border)',
          color: running || !setup.trim() ? 'var(--muted)' : '#fff',
          cursor: running || !setup.trim() ? 'not-allowed' : 'pointer',
          letterSpacing: '0.14em',
        }}
      >
        {running ? '⟳  Running Pipeline...' : '▶  Execute Analysis'}
      </button>
    </div>
  );
}

// ── COMPONENT: StatsRow ──────────────────────────────────────

function StatsRow({ taskCount, confidence }: { taskCount: number; confidence: number }) {
  const stats = [
    { value: taskCount.toString(), label: 'Tasks Run',      color: 'var(--text-hi)' },
    { value: '8',                  label: 'Agents Online',  color: 'var(--signal)'  },
    { value: `${Math.round(confidence * 100)}%`, label: 'Last Confidence', color: 'var(--online)' },
    { value: '$0.000',             label: 'Cost This Run',  color: 'var(--warn)'    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="card p-3 stat-block">
          <span className="stat-value" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────

const BOOT_LOGS: LogLine[] = [
  { id: 1,  prefix: '[BOOT]',       msg: '✓ MIDAS Orchestrator v1.5 initialized',         type: 'success' },
  { id: 2,  prefix: '[VAULT]',      msg: '✓ Vault bridge initialized',                     type: 'success' },
  { id: 3,  prefix: '[ROUTER]',     msg: 'Hermes (Qwen3-Next 80B) ready',                  type: 'info'    },
  { id: 4,  prefix: '[AGENTS]',     msg: '8 models registered on OpenRouter',              type: 'info'    },
  { id: 5,  prefix: '[PROXY]',      msg: 'localhost:8001 → OpenRouter API',                type: 'info'    },
  { id: 6,  prefix: '[LINT]',       msg: 'Anti-cheat linter armed (6 rules)',              type: 'success' },
  { id: 7,  prefix: '[GRAPHIFY]',   msg: 'Swarm topology graph ready',                     type: 'success' },
  { id: 8,  prefix: '[MEMORY]',     msg: 'No prior heuristics recorded yet.',              type: 'dim'     },
  { id: 9,  prefix: '[SYSTEM]',     msg: '⚠ Vault persistence deferred (v1.5.2)',         type: 'warn'    },
  { id: 10, prefix: '[SYSTEM]',     msg: 'Awaiting task input...',                         type: 'dim'     },
];

export default function CommandCenter() {
  const [logs,          setLogs]          = useState<LogLine[]>(BOOT_LOGS);
  const [activeStage,   setActiveStage]   = useState(-1);
  const [running,       setRunning]       = useState(false);
  const [taskCount,     setTaskCount]     = useState(0);
  const [lastConf,      setLastConf]      = useState(0.82);
  const logIdRef = useRef(100);

  function addLog(prefix: string, msg: string, type: LogLine['type'] = 'info') {
    setLogs((prev) => [
      ...prev.slice(-60), // keep last 60 lines
      { id: ++logIdRef.current, prefix, msg, type },
    ]);
  }

  async function handleRun(setup: string, taskType: string) {
    if (running || !setup.trim()) return;
    setRunning(true);
    setTaskCount((n) => n + 1);

    const taskId = `task_${Date.now()}`;
    addLog('[ORCHESTRATOR]', `Starting analysis: ${taskType} (${taskId})`, 'info');

    // Simulate pipeline stages with realistic timing + log output
    const stageLogs: Array<[string, string, LogLine['type']][]> = [
      [
        ['[ROUTER]',   'Routing task (5s initial cooldown)...', 'dim'],
        ['[ROUTER]',   'Testing Hermes (Qwen3-Next 80B)...', 'info'],
        ['[ROUTER]',   `Final agents: qwen, nemotron`, 'success'],
      ],
      [
        ['[SWARM]',    '→ Calling Qwen 2.5 72B sequentially...', 'info'],
        ['[SWARM]',    '✓ Qwen finished. Cooling down 5s...', 'success'],
        ['[SWARM]',    '→ Calling Nemotron 3 Ultra...', 'info'],
        ['[SWARM]',    '✓ Nemotron finished. Cooling down...', 'success'],
      ],
      [
        ['[SYNTHESIS]','Gemini synthesizing swarm results...', 'info'],
        ['[SYNTHESIS]','Confidence: 0.82', 'success'],
      ],
      [
        ['[AUDIT]',    'Hybrid code generation starting...', 'info'],
        ['[AUDIT 1/3]','Trying Nemotron...', 'info'],
        ['[AUDIT]',    '✓ Nemotron succeeded (2847 chars)', 'success'],
        ['[AUDIT LINT]','passed=false, violations=1, warnings=2', 'warn'],
        ['[AUDIT LINT]','⚠ No slippage/commission modeled', 'warn'],
      ],
      [
        ['[VAULT]',    'Queuing analysis write...', 'dim'],
        ['[VAULT]',    'Processing write 1/1', 'dim'],
        ['[VAULT]',    '⚠ Browser context: vault sync deferred to v1.5.2', 'warn'],
      ],
      [
        ['[MCP]',      `Code ready: strategy_${taskId}.pine`, 'success'],
        ['[MCP]',      '⚠ Browser context: fs write unavailable', 'warn'],
        ['[REFLEXION]','Lesson extracted.', 'dim'],
        ['[LOG]',      `Task ${taskId} completed`, 'success'],
      ],
    ];

    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
      setActiveStage(i);
      for (const [prefix, msg, type] of stageLogs[i]) {
        await delay(280 + Math.random() * 240);
        addLog(prefix, msg, type);
      }
      await delay(400);
    }

    setActiveStage(PIPELINE_STAGES.length); // all done
    addLog('[ORCHESTRATOR]', '✓ Analysis complete — result in window.midasResults', 'success');
    setLastConf(0.78 + Math.random() * 0.18);
    setRunning(false);

    // Reset pipeline after 3s
    setTimeout(() => setActiveStage(-1), 3000);
  }

  return (
    <div
      className="min-h-screen p-4 sm:p-6"
      style={{ background: 'var(--void)' }}
    >
      <div className="max-w-screen-xl mx-auto flex flex-col gap-5">

        {/* ── HERO ──────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="label-xs mb-2" style={{ color: 'var(--hermes)' }}>
              Multi-Agent Hive-Mind · Pine Script v5
            </div>
            <h1
              className="display"
              style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}
            >
              Command Center
            </h1>
            <p
              className="mt-2 mono"
              style={{ color: 'var(--text-dim)', fontSize: '12px' }}
            >
              Route → Swarm → Synthesize → Audit → Vault → Write
            </p>
          </div>
          <div
            className="label-xs px-3 py-1.5 rounded self-start sm:self-auto"
            style={{
              background: 'var(--hermes-dim)',
              color: 'var(--hermes)',
              border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            Hermes Orchestrating
          </div>
        </div>

        {/* ── PIPELINE BAR ──────────────────────────────────── */}
        <PipelineBar activeStage={activeStage} />

        {/* ── STATS ROW ─────────────────────────────────────── */}
        <StatsRow taskCount={taskCount} confidence={lastConf} />

        {/* ── MAIN GRID: Launcher + Console + Lint ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Launcher */}
          <div className="lg:col-span-1">
            <TaskLauncher onRun={handleRun} running={running} />
          </div>

          {/* Console */}
          <div className="lg:col-span-1">
            <ConsoleLog lines={logs} />
          </div>

          {/* Lint */}
          <div className="lg:col-span-1">
            <LintPanel />
          </div>

        </div>

        {/* ── AGENT ROSTER ──────────────────────────────────── */}
        <div>
          <div
            className="label-xs mb-3"
            style={{ color: 'var(--text-dim)' }}
          >
            Agent Roster — 8 Models · OpenRouter Free Tier
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {AGENTS.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>

        {/* ── MARKET FOCUS ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { sym: 'MGC1!', name: 'Micro Gold',       tf: '5m / 13m', color: '#f59e0b' },
            { sym: 'MNQ',   name: 'Micro Nasdaq',     tf: '5m / 13m', color: '#3b82f6' },
            { sym: 'NAS100',name: 'Nasdaq 100',       tf: 'intraday', color: '#6366f1' },
            { sym: 'XAUUSD',name: 'Gold Spot',        tf: 'swing',    color: '#f59e0b' },
            { sym: 'US30',  name: 'Dow Jones',        tf: 'swing',    color: '#10b981' },
            { sym: 'USOIL', name: 'Crude Oil',        tf: 'swing',    color: '#64748b' },
          ].map(({ sym, name, tf, color }) => (
            <div
              key={sym}
              className="card card-interactive p-3 flex flex-col gap-1"
            >
              <span
                className="font-bold mono"
                style={{ color, fontSize: '13px' }}
              >
                {sym}
              </span>
              <span
                className="label-xs"
                style={{ color: 'var(--text-dim)', fontSize: '9px' }}
              >
                {name}
              </span>
              <span
                className="label-xs"
                style={{ color: 'var(--muted)', fontSize: '9px' }}
              >
                {tf}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── UTIL ─────────────────────────────────────────────────────
function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
