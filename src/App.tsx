import { useEffect, useState } from 'react'
import { createDocument } from './model/defaults'
import { canvasFrame, deviceScreen } from './model/layout'
import { exportZip, openZip, pickFiles, addPngFiles, addFontFiles } from './io'
import { getState, loadProject, redo, setState, toast, undo, updateNode, useStore } from './store'
import { Viewport, isTyping } from './render/Viewport'
import { Hierarchy, deleteSelected, duplicateSelected } from './ui/Hierarchy'
import { Inspector } from './ui/Inspector'
import { AssetsPanel } from './ui/Assets'
import { SettingsDialog } from './ui/Settings'
import { HelpDialog } from './ui/Help'

export default function App() {
  const [settings, setSettings] = useState(false)
  const [help, setHelp] = useState(false)
  const [leftTab, setLeftTab] = useState<'hier' | 'assets'>('hier')
  useShortcuts()
  useWindowDrop()
  return (
    <div className="app">
      <Toolbar onSettings={() => setSettings(true)} onHelp={() => setHelp(true)} />
      <div className="main">
        <aside className="left">
          <div className="tabs">
            <button className={leftTab === 'hier' ? 'on' : ''} onClick={() => setLeftTab('hier')}>
              Hierarchy
            </button>
            <button className={leftTab === 'assets' ? 'on' : ''} onClick={() => setLeftTab('assets')}>
              Assets
            </button>
          </div>
          <div className="left-body">{leftTab === 'hier' ? <Hierarchy /> : <AssetsPanel />}</div>
        </aside>
        <Center />
        <aside className="right">
          <Inspector />
        </aside>
      </div>
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      <Toast />
    </div>
  )
}

function Center() {
  const viewMode = useStore((s) => s.viewMode)
  const devices = useStore((s) => s.devices)
  const active = useStore((s) => s.activeDevice)
  const canvas = useStore((s) => s.doc.canvas)
  const enabled = devices.filter((d) => d.enabled)
  if (viewMode === 'grid') {
    return (
      <div className="center grid">
        {enabled.map((d) => {
          const f = canvasFrame(canvas, deviceScreen(d, canvas))
          return (
            <div key={d.id} className={`cell ${d.id === active ? 'on' : ''}`} onPointerDown={() => setState({ activeDevice: d.id })}>
              <div className="cell-title">
                <b>{d.name}</b> {d.width}×{d.height} · canvas {Math.round(f.size.x)}×{Math.round(f.size.y)}
              </div>
              <Viewport device={d} compact />
            </div>
          )
        })}
      </div>
    )
  }
  const device = devices.find((d) => d.id === active) ?? enabled[0] ?? devices[0]
  return (
    <div className="center single">
      <Viewport key={device.id} device={device} />
    </div>
  )
}

function Toolbar({ onSettings, onHelp }: { onSettings: () => void; onHelp: () => void }) {
  const s = useStore((x) => x)
  const enabled = s.devices.filter((d) => d.enabled)
  const device = s.devices.find((d) => d.id === s.activeDevice)
  const frame = device ? canvasFrame(s.doc.canvas, deviceScreen(device, s.doc.canvas)) : null
  return (
    <header className="toolbar">
      <div className="brand">UI Layout Studio</div>
      <div className="tb-group">
        <button
          className="btn"
          onClick={() => {
            if (s.dirty && !confirm('Tạo màn mới? Màn hiện tại chưa xuất sẽ mất (bản tự lưu cũng bị thay).')) return
            loadProject(createDocument(), {}, getState().fonts)
          }}
        >
          Mới
        </button>
        <button
          className="btn"
          onClick={async () => {
            const [f] = await pickFiles('.zip', false)
            if (!f) return
            if (s.dirty && !confirm('Mở tệp khác? Thay đổi chưa xuất của màn hiện tại sẽ mất.')) return
            try {
              await openZip(f)
              toast(`Đã mở ${f.name}`)
            } catch (e) {
              toast(String((e as Error).message))
            }
          }}
        >
          Mở…
        </button>
        <button className="btn primary" onClick={exportZip} title="Ctrl+S — xuất .uilayout.zip cho dev (cũng là tệp để mở lại sửa tiếp)">
          Xuất zip{s.dirty ? ' •' : ''}
        </button>
      </div>
      <div className="tb-group">
        <button className="btn" disabled={!s.past.length} onClick={undo} title="Ctrl+Z">
          ↶
        </button>
        <button className="btn" disabled={!s.future.length} onClick={redo} title="Ctrl+Y / Ctrl+Shift+Z">
          ↷
        </button>
      </div>
      <div className="tb-group">
        <div className="seg">
          <button className={s.viewMode === 'single' ? 'on' : ''} onClick={() => setState({ viewMode: 'single' })} title="Một máy, sửa chi tiết">
            Một máy
          </button>
          <button className={s.viewMode === 'grid' ? 'on' : ''} onClick={() => setState({ viewMode: 'grid' })} title="Xem mọi máy cùng lúc (G)">
            Mọi máy
          </button>
        </div>
        <select value={s.activeDevice} onChange={(e) => setState({ activeDevice: e.target.value })}>
          {enabled.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {frame && s.viewMode === 'single' && (
          <span className="mono small dim">
            canvas {Math.round(frame.size.x)}×{Math.round(frame.size.y)}
          </span>
        )}
        {s.viewMode === 'single' && (
          <>
            <button className="btn" onClick={() => setState({ zoom: 'fit' })} title="Vừa khung (F)">
              Vừa
            </button>
            <button className="btn" onClick={() => setState({ zoom: 1 })} title="1 đơn vị canvas = 1 px màn hình">
              100%
            </button>
            <span className="mono small dim">{s.zoom === 'fit' ? 'fit' : `${Math.round(s.zoom * 100)}%`}</span>
          </>
        )}
      </div>
      <div className="tb-group">
        <label className="check">
          <input type="checkbox" checked={s.showSafeArea} onChange={(e) => setState({ showSafeArea: e.target.checked })} />
          Safe area
        </label>
        <label className="check">
          <input type="checkbox" checked={s.showBounds} onChange={(e) => setState({ showBounds: e.target.checked })} />
          Khung
        </label>
        <label className="check" title="Giữ Alt khi kéo để tạm tắt">
          <input type="checkbox" checked={s.snap} onChange={(e) => setState({ snap: e.target.checked })} />
          Snap
        </label>
        <OverlayControl />
      </div>
      <div className="tb-group tb-end">
        <button className="btn" onClick={onSettings}>
          Cài đặt
        </button>
        <button className="btn" onClick={onHelp}>
          ?
        </button>
      </div>
    </header>
  )
}

/** Ảnh mẫu (bản demo từ Photoshop) phủ mờ lên để xếp theo. */
function OverlayControl() {
  const overlay = useStore((s) => s.overlay)
  return (
    <span className="overlay-ctl">
      <button
        className="btn"
        title="Phủ ảnh demo (vd ảnh xuất từ Photoshop) lên khung nhìn để xếp theo. Ảnh co theo reference resolution, đặt giữa."
        onClick={async () => {
          if (overlay) {
            setState({ overlay: { ...overlay, visible: !overlay.visible } })
            return
          }
          const [f] = await pickFiles('image/*', false)
          if (f) setState({ overlay: { url: URL.createObjectURL(f), blob: f, opacity: 0.5, visible: true } })
        }}
      >
        {overlay ? (overlay.visible ? 'Ẩn ảnh mẫu' : 'Hiện ảnh mẫu') : 'Ảnh mẫu…'}
      </button>
      {overlay && (
        <>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={overlay.opacity}
            onChange={(e) => setState({ overlay: { ...overlay, opacity: Number(e.target.value) } })}
          />
          <button
            className="icon"
            title="Gỡ ảnh mẫu"
            onClick={() => {
              URL.revokeObjectURL(overlay.url)
              setState({ overlay: null })
            }}
          >
            ×
          </button>
        </>
      )}
    </span>
  )
}

function Toast() {
  const t = useStore((s) => s.toast)
  return t ? <div className="toast">{t}</div> : null
}

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        exportZip()
        return
      }
      if (isTyping(e)) return
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
      if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return }
      if (e.key === 'Escape') { setState({ selection: null, selectedSprite: null }); return }
      if (!mod && k === 'f') { setState({ zoom: 'fit' }); return }
      if (!mod && k === 'g') { setState((s) => ({ viewMode: s.viewMode === 'grid' ? 'single' : 'grid' })); return }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      const a = arrows[e.key]
      const sel = getState().selection
      if (a && sel && sel !== 'root') {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        updateNode(
          sel,
          (n) => n.type === 'SafeArea' ? n : ({ ...n, rect: { ...n.rect, anchoredPosition: { x: n.rect.anchoredPosition.x + a[0] * step, y: n.rect.anchoredPosition.y + a[1] * step } } }),
          { mergeKey: `${sel}:nudge` },
        )
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}

/** Thả PNG/font/zip vào bất kỳ đâu trong cửa sổ. */
function useWindowDrop() {
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      const zip = files.find((f) => /\.zip$/i.test(f.name))
      if (zip) {
        if (getState().dirty && !confirm(`Mở ${zip.name}? Thay đổi chưa xuất sẽ mất.`)) return
        try {
          await openZip(zip)
          toast(`Đã mở ${zip.name}`)
        } catch (err) {
          toast(String((err as Error).message))
        }
        return
      }
      await addPngFiles(files.filter((f) => /\.png$/i.test(f.name)))
      await addFontFiles(files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f.name)))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
}
