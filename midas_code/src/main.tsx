// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { setupDevtools } from './dev/setupDevtools'
import './styles/fonts.css'
import './styles/a11y.css'
import '../src/styles/theme.css'
import './shared/ui/ui.css'
import './styles/app.css'

void setupDevtools()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
