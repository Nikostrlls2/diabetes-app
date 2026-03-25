import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

document.documentElement.classList.add('app-ready')

const bootScreen = document.getElementById('boot-screen')
if (bootScreen) {
  window.requestAnimationFrame(() => {
    bootScreen.classList.add('is-hidden')
    window.setTimeout(() => {
      bootScreen.remove()
    }, 260)
  })
}

if ('serviceWorker' in navigator && import.meta.env.PROD && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
