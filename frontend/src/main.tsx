import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './StoreApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
