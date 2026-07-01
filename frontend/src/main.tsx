import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted typefaces: B612 is the instrument-panel face commissioned by
// Airbus for cockpit displays; Barlow Condensed stands in for flight-strip
// gothic on callsigns and headings.
import '@fontsource/b612/400.css'
import '@fontsource/b612/700.css'
import '@fontsource/b612-mono/400.css'
import '@fontsource/b612-mono/700.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
