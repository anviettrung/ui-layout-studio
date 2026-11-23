import { useRef, useState } from 'react'
import { addFontFiles, addPngFiles, pickFiles } from '../io'
import { mapAll, usedSprites, walk } from '../model/tree'
import { setState, toast, updateDoc, useStore } from '../store'
import { Num, Row, Section } from './fields'

export function AssetsPanel() {
  const sprites = useStore((s) => s.doc.sprites)
  const images = useStore((s) => s.images)
  const fonts = useStore((s) => s.fonts)
  const selected = useStore((s) => s.selectedSprite)
  const root = useStore((s) => s.doc.root)
  const [filter, setFilter] = useState('')
  const [over, setOver] = useState(false)
  const used = usedSprites(root)
  const list = sprites.filter((s) => s.file.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div
      className={`assets ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const files = Array.from(e.dataTransfer.files)
        addPngFiles(files.filter((f) => /\.png$/i.test(f.name)))
        addFontFiles(files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f.name)))
      }}
    >
      <div className="assets-bar">
        <button className="btn primary" onClick={async () => addPngFiles(await pickFiles('image/png'))}>
          + PNG
        </button>
        <input placeholder="Lọc…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {sprites.length === 0 && (
        <div className="drop-hint">
          Kéo thả các tệp PNG vào đây (hoặc thẳng vào khung nhìn).
          <br />
          Thả lại PNG trùng tên để thay ảnh, layout giữ nguyên.
        </div>
      )}
      <div className="sprite-grid">
        {list.map((s) => (
          <div
            key={s.id}
            className={`sprite-cell ${selected === s.id ? 'on' : ''} ${used.has(s.id) ? '' : 'unused'}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-uls-sprite', s.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => setState({ selectedSprite: s.id, selection: null })}
            title={`${s.file} — ${s.width}×${s.height}${used.has(s.id) ? '' : ' (chưa dùng)'}\nKéo vào khung nhìn để đặt`}
          >
            <div className="thumb">{images[s.id] ? <img src={images[s.id].url} alt="" draggable={false} /> : <span>?</span>}</div>
            <div className="sprite-name">{s.file.replace(/\.png$/i, '')}</div>
            <div className="sprite-size">
              {s.width}×{s.height}
              {s.border.some((b) => b > 0) && <span className="badge">9</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="fonts">
        <div className="fonts-head">
          <span>Font xem trước</span>
          <button className="btn" onClick={async () => addFontFiles(await pickFiles('.ttf,.otf,.woff,.woff2'))}>
            + Font
          </button>
        </div>
        <div className="note small">
          Tên font (bỏ đuôi tệp) là tên dev ánh xạ sang TMP_FontAsset. Kanit-SemiBold có sẵn.
        </div>
        {fonts.map((f) => (
          <div key={f.name} className="font-row" style={{ fontFamily: `"${f.name}"` }}>
            {f.name}
            <button className="icon" title="Gỡ" onClick={() => setState((s) => ({ fonts: s.fonts.filter((x) => x.name !== f.name) }))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SpriteInspector({ id }: { id: string }) {
  const sprite = useStore((s) => s.doc.sprites.find((x) => x.id === id))
  const img = useStore((s) => s.images[id])
  const root = useStore((s) => s.doc.root)
  const replaceRef = useRef<HTMLInputElement>(null)
  if (!sprite) return null
  const [l, b, r, t] = sprite.border
  const setBorder = (i: number, v: number) => {
    const border = [...sprite.border] as typeof sprite.border
    border[i] = Math.max(0, Math.round(v))
    updateDoc((d) => ({ ...d, sprites: d.sprites.map((s) => (s.id === id ? { ...s, border } : s)) }), { mergeKey: `${id}:border` })
  }
  const users: string[] = []
  walk(root, (n) => {
    if (n.image?.sprite === id) users.push(n.name)
  })
  // khung xem trước 9-slice: vừa 220px
  const k = Math.min(220 / sprite.width, 220 / sprite.height, 4)
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="name-input static">{sprite.file}</span>
        <span className="type-badge">Sprite</span>
      </div>
      <Section title="Ảnh">
        <div className="slice-preview" style={{ width: sprite.width * k, height: sprite.height * k }}>
          {img && <img src={img.url} alt="" style={{ width: '100%', height: '100%' }} />}
          {l > 0 && <div className="slice-line v" style={{ left: l * k }} />}
          {r > 0 && <div className="slice-line v" style={{ right: r * k }} />}
          {t > 0 && <div className="slice-line h" style={{ top: t * k }} />}
          {b > 0 && <div className="slice-line h" style={{ bottom: b * k }} />}
        </div>
        <Row label="Kích thước">
          <span>
            {sprite.width} × {sprite.height} px
          </span>
        </Row>
      </Section>
      <Section title="Viền 9-slice (Sprite Border)">
        <Row label="L / R">
          <Num label="L" value={l} min={0} max={sprite.width} onChange={(v) => setBorder(0, v)} />
          <Num label="R" value={r} min={0} max={sprite.width} onChange={(v) => setBorder(2, v)} />
        </Row>
        <Row label="T / B">
          <Num label="T" value={t} min={0} max={sprite.height} onChange={(v) => setBorder(3, v)} />
          <Num label="B" value={b} min={0} max={sprite.height} onChange={(v) => setBorder(1, v)} />
        </Row>
        <div className="note small">Có viền thì Image dùng kiểu Sliced sẽ giãn phần giữa, giữ nguyên góc. Unity nhận viền này khi import.</div>
      </Section>
      <Section title="Đang dùng ở">
        {users.length ? <div className="users">{users.join(', ')}</div> : <div className="note small">Chưa node nào dùng.</div>}
        <div className="btn-row">
          <button className="btn" onClick={() => replaceRef.current?.click()}>
            Thay ảnh…
          </button>
          <input
            ref={replaceRef}
            type="file"
            accept="image/png"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              // đổi tên tệp mới thành tên sprite hiện tại để thay tại chỗ
              await addPngFiles([new File([f], sprite.file, { type: 'image/png' })])
              e.target.value = ''
            }}
          />
          <button
            className="btn danger"
            onClick={() => {
              if (users.length && !confirm(`Sprite đang dùng ở ${users.length} node. Xoá thì các node đó thành ô màu. Tiếp tục?`)) return
              updateDoc((d) => ({
                ...d,
                sprites: d.sprites.filter((s) => s.id !== id),
                root: mapAll(d.root, (n) => (n.image?.sprite === id ? { ...n, image: { ...n.image, sprite: null } } : n)),
              }))
              setState({ selectedSprite: null })
              toast(`Đã xoá ${sprite.file}`)
            }}
          >
            Xoá sprite
          </button>
        </div>
      </Section>
    </div>
  )
}
