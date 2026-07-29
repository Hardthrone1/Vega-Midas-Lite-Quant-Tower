// src/app/theme/ThemeProvider.tsx
// Fluent UI v9 theme root. Everything renders inside a FluentProvider so
// Fluent's own controls follow the same brand ramp and typography as the
// hand-authored CSS.
//
// The control tower is a dark instrument panel by design — its surfaces and
// ink are fixed values in theme.css rather than a light/dark ramp — so there
// is no theme switch to honour here.
import { createDarkTheme, FluentProvider, type Theme } from '@fluentui/react-components'
import { vegaBrand } from './brandRamp'

const ARCHIVO = "'Archivo', system-ui, sans-serif"

// Fluent's own radii top out at 8px; the design's cards sit at 14px, so the
// large tiers are literal values rather than a remap.
function applyVegaIdentity(base: Theme): Theme {
  return {
    ...base,
    fontFamilyBase: ARCHIVO,
    borderRadiusSmall: '3px',
    borderRadiusMedium: '7px',
    borderRadiusLarge: '9px',
    borderRadiusXLarge: '11px',
  }
}

const vegaTheme = applyVegaIdentity(createDarkTheme(vegaBrand))

export function VegaThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <FluentProvider theme={vegaTheme} className="portal-fluent-root">
      {children}
    </FluentProvider>
  )
}
