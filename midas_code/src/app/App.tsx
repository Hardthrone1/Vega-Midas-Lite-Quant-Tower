// src/app/App.tsx
import { VegaThemeProvider } from './theme/ThemeProvider'
import { PortalShell } from './layout/PortalShell'

export default function App() {
  return (
    <VegaThemeProvider>
      <PortalShell />
    </VegaThemeProvider>
  )
}
