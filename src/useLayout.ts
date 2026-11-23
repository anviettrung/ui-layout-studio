import { useMemo } from 'react'
import { canvasFrame, deviceScreen } from './model/layout'
import { computeLayout } from './render/Viewport'
import { useStore } from './store'

/** Layout của máy đang chọn: Inspector dùng để giữ nguyên rect khi đổi anchor/pivot. */
export function useActiveLayout() {
  const doc = useStore((s) => s.doc)
  const devices = useStore((s) => s.devices)
  const active = useStore((s) => s.activeDevice)
  const fontsVersion = useStore((s) => s.fontsVersion)
  const device = devices.find((d) => d.id === active) ?? devices[0]
  return useMemo(() => {
    const frame = canvasFrame(doc.canvas, deviceScreen(device, doc.canvas))
    const sprites = Object.fromEntries(doc.sprites.map((s) => [s.id, s]))
    return computeLayout(doc.root, frame, sprites)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.root, doc.canvas, doc.sprites, device, fontsVersion])
}
