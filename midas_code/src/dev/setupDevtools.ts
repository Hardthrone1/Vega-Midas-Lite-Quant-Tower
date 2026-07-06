/**
 * Dev-only helpers for React DevTools (standalone) and Redux DevTools (browser extension).
 *
 * Standalone React DevTools only connects when using `npm run dev:all` — not plain `npm run dev`.
 * Browser extensions work without any code here.
 */
export async function setupDevtools(): Promise<void> {
  if (!import.meta.env.DEV) return
  if (import.meta.env.VITE_STANDALONE_REACT_DEVTOOLS !== 'true') return

  try {
    const { connectToDevTools } = await import('react-devtools-core')
    connectToDevTools({
      host: 'localhost',
      port: 8097,
    })
  } catch {
    // react-devtools standalone not running
  }
}

export function hasReduxDevtoolsExtension(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as Window & { __REDUX_DEVTOOLS_EXTENSION__?: unknown }).__REDUX_DEVTOOLS_EXTENSION__)
  )
}