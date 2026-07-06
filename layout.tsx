import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Vega Orchestrator v1.5 | Pine Script Engine',
  description: 'Multi-Agent Hive-Mind for Pine Script v5 Validation, Repair & Strategy Generation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col antialiased">

        {/* ── GLOBAL NAV ─────────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 border-b"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="max-w-screen-xl mx-auto px-4 h-12 flex items-center justify-between">

            {/* LEFT: Logo + nav links */}
            <div className="flex items-center gap-6">

              {/* Wordmark */}
              <Link href="/" className="flex items-center gap-2 group">
                <span
                  className="text-xs font-bold tracking-widest uppercase"
                  style={{ color: 'var(--text-dim)' }}
                >
                  v1.5
                </span>
                <span
                  className="text-sm font-bold tracking-tighter"
                  style={{ color: 'var(--text-hi)' }}
                >
                  Vega
                  <span style={{ color: 'var(--signal)' }}>_</span>
                </span>
              </Link>

              {/* Separator */}
              <div
                className="w-px h-5"
                style={{ background: 'var(--border-hi)' }}
              />

              {/* Nav links */}
              <div className="flex items-center gap-1">
                {[
                  { href: '/',            label: 'Command' },
                  { href: '/diagnostics', label: 'Diagnostics' },
                  { href: '/testing',     label: 'Testing' },
                  { href: '/results',     label: 'Vault' },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="label-xs px-3 py-1.5 rounded transition-colors"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* RIGHT: System status pills */}
            <div className="hidden sm:flex items-center gap-3">

              {/* Agent count */}
              <div
                className="label-xs px-2 py-1 rounded"
                style={{
                  background: 'var(--signal-dim)',
                  color: 'var(--signal)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                8 agents
              </div>

              {/* Proxy status */}
              <div
                className="flex items-center gap-1.5 label-xs px-2 py-1 rounded"
                style={{
                  background: 'var(--online-dim)',
                  color: 'var(--online)',
                  border: '1px solid rgba(16,185,129,0.2)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full pulse-dot"
                  style={{ background: 'var(--online)' }}
                />
                Engine Online
              </div>

            </div>
          </div>
        </nav>

        {/* ── MAIN ───────────────────────────────────────────────── */}
        <main className="flex-grow">
          {children}
        </main>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <footer
          className="border-t py-3"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div className="max-w-screen-xl mx-auto px-4 flex items-center justify-between">
            <span className="label-xs" style={{ color: 'var(--muted)' }}>
              Vega Orchestrator v1.5.1 · Pine Script v5 Authority
            </span>
            <span className="label-xs" style={{ color: 'var(--muted)' }}>
              localhost:8001 · OpenRouter proxy
            </span>
          </div>
        </footer>

      </body>
    </html>
  );
}
