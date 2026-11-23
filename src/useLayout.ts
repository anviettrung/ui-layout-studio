import { useMemo } from 'react'
import { canvasFrame, deviceScreen } from './model/layout'
import { computeLayout } from './render/Viewport'
import { useStore } from './store'

/** Layout của máy đang chọn: Inspector dùng để giữ nguyên rect khi đổi anchor/pivot. */
export function useActiveLayout() {
  const doc = useStore((s) => s.doc)
  const devices = useStore((s) => s.devices)
  const active = useStore((s) => s.activeDevice)
  const device = devices.find((d) => d.id === active) ?? devices[0]
  return useMemo(() => {
    const frame = canvasFrame(doc.canvas, deviceScreen(device, doc.canvas))
    return computeLayout(doc.root, frame)
  }, [doc.root, doc.canvas, device])
}
