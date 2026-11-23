import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { restoreAutosave, startAutosave } from './io'
import { setState } from './store'
import { resetTextMeasureCache } from './render/measureText'

// Font nạp xong thì số đo chữ đổi: tính lại layout
const onFonts = () => {
  resetTextMeasureCache()
  setState((s) => ({ fontsVersion: s.fontsVersion + 1 }))
}
document.fonts.addEventListener('loadingdone', onFonts)
document.fonts.ready.then(onFonts)
document.fonts.load('48px "Kanit-SemiBold"').then(onFonts)

restoreAutosave().finally(() => {
  startAutosave()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
