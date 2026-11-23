import type { DeviceProfile, ScreenMatchMode } from '../model/types'
import { DEFAULT_DEVICES, newId } from '../model/defaults'
import { canvasFrame, deviceScreen } from '../model/layout'
import { setState, updateDoc, useStore } from '../store'
import { Num, Row, Section } from './fields'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const canvas = useStore((s) => s.doc.canvas)
  const devices = useStore((s) => s.devices)
  const setCanvas = (patch: Partial<typeof canvas>) => updateDoc((d) => ({ ...d, canvas: { ...d.canvas, ...patch } }))
  const setDevice = (id: string, patch: Partial<DeviceProfile>) =>
    setState((s) => ({ devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) }))
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header>
          <h2>Cài đặt</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </header>
        <Section title="Canvas Scaler (phải giống Canvas trong Unity)">
          <Row label="Reference">
            <Num label="X" value={canvas.referenceResolution.x} min={1} onChange={(x) => setCanvas({ referenceResolution: { ...canvas.referenceResolution, x } })} />
            <Num label="Y" value={canvas.referenceResolution.y} min={1} onChange={(y) => setCanvas({ referenceResolution: { ...canvas.referenceResolution, y } })} />
          </Row>
          <Row label="Screen Match">
            <select value={canvas.screenMatchMode} onChange={(e) => setCanvas({ screenMatchMode: e.target.value as ScreenMatchMode })}>
              <option value="MatchWidthOrHeight">Match Width Or Height</option>
              <option value="Expand">Expand</option>
              <option value="Shrink">Shrink</option>
            </select>
          </Row>
          {canvas.screenMatchMode === 'MatchWidthOrHeight' && (
            <Row label="Match">
              <input type="range" min={0} max={1} step={0.05} value={canvas.match} onChange={(e) => setCanvas({ match: Number(e.target.value) })} />
              <span className="mono">{canvas.match.toFixed(2)}</span>
            </Row>
          )}
          <div className="note small">
            Mặc định theo MSO: 1080×1920, Expand. Canvas ngang (X &gt; Y) thì mọi máy tự xoay ngang.
          </div>
        </Section>
        <Section
          title="Thiết bị xem trước"
          right={
            <span className="btn-row">
              <button
                className="btn"
                onClick={() =>
                  setState((s) => ({
                    devices: [...s.devices, { id: newId(), name: 'Máy mới', width: 1080, height: 2340, safeInsets: { top: 0, bottom: 0, left: 0, right: 0 }, enabled: true }],
                  }))
                }
              >
                + Thêm
              </button>
              <button className="btn" onClick={() => confirm('Khôi phục danh sách máy mặc định?') && setState({ devices: structuredClone(DEFAULT_DEVICES) })}>
                Mặc định
              </button>
            </span>
          }
        >
          <table className="device-table">
            <thead>
              <tr>
                <th></th>
                <th>Tên</th>
                <th>Rộng</th>
                <th>Cao</th>
                <th title="Safe area: lẹm trên">Lẹm trên</th>
                <th title="Safe area: lẹm dưới">Lẹm dưới</th>
                <th>Canvas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const f = canvasFrame(canvas, deviceScreen(d, canvas))
                return (
                  <tr key={d.id}>
                    <td>
                      <input type="checkbox" checked={d.enabled} onChange={(e) => setDevice(d.id, { enabled: e.target.checked })} />
                    </td>
                    <td>
                      <input value={d.name} onChange={(e) => setDevice(d.id, { name: e.target.value })} />
                    </td>
                    <td>
                      <Num value={d.width} min={1} onChange={(width) => setDevice(d.id, { width })} />
                    </td>
                    <td>
                      <Num value={d.height} min={1} onChange={(height) => setDevice(d.id, { height })} />
                    </td>
                    <td>
                      <Num value={d.safeInsets.top} min={0} onChange={(top) => setDevice(d.id, { safeInsets: { ...d.safeInsets, top } })} />
                    </td>
                    <td>
                      <Num value={d.safeInsets.bottom} min={0} onChange={(bottom) => setDevice(d.id, { safeInsets: { ...d.safeInsets, bottom } })} />
                    </td>
                    <td className="mono small">
                      {Math.round(f.size.x)}×{Math.round(f.size.y)}
                    </td>
                    <td>
                      <button className="icon" title="Xoá" onClick={() => setState((s) => ({ devices: s.devices.filter((x) => x.id !== d.id) }))}>
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="note small">
            Kích thước theo pixel màn hình thật, hướng dọc. Lẹm = phần safe area bị tai thỏ / home indicator chiếm, pixel. Cột Canvas là kích thước
            canvas Unity sẽ có trên máy đó.
          </div>
        </Section>
      </div>
    </div>
  )
}
