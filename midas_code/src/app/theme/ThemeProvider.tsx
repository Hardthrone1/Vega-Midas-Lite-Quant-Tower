// src/app/theme/ThemeProvider.tsx
// Fluent UI v9 theme root. The whole app renders inside a FluentProvider so
// every component (and the legacy CSS remapped in portal.css) picks up the
// Microsoft web design tokens in both light and dark mode.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'vega-theme-mode'

const ThemeModeContext = createContext<{ mode: ThemeMode; toggleMode: () => void }>({
  mode: 'dark',
  toggleMode: () => {},
})

export function useThemeMode() {
  return useContext(ThemeModeContext)
}

function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'dark'
}

export function VegaThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode)
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  const value = useMemo(
    () => ({ mode, toggleMode: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }),
    [mode]
  )

  return (
    <ThemeModeContext.Provider value={value}>
      <FluentProvider
        theme={mode === 'dark' ? webDarkTheme : webLightTheme}
        className="portal-fluent-root"
      >
        {children}
      </FluentProvider>
    </ThemeModeContext.Provider>
  )
}
