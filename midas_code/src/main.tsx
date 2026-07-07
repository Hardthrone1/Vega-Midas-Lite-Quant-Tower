// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { setupDevtools } from './dev/setupDevtools'
import './styles/fonts.css'
import './styles/a11y.css'
import './styles/theme.css'
import './shared/ui/ui.css'
import './styles/app.css'
import './styles/portal.css'
import './styles/tailwind.css'

void setupDevtools()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
