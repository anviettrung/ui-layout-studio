// Nhập/xuất tệp: thêm PNG, font, mở/lưu gói zip, tự lưu vào IndexedDB.
import JSZip from 'jszip'
import { newId } from './model/defaults'
import type { LayoutDocument, SpriteAsset } from './model/types'
import { FORMAT_ID, FORMAT_VERSION } from './model/types'
import { usedSprites } from './model/tree'
import { getState, loadProject, setState, subscribe, toast, updateDoc, type FontAsset, type SpriteImage } from './store'

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Không đọc được ảnh'))
    img.src = url
  })
}

function sanitizeName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\w\-.]+/g, '_')
  return (base || 'sprite') + '.png'
}

/**
 * Thêm PNG. Trùng tên tệp với sprite đã có → thay ảnh tại chỗ (giữ id, giữ viền 9-slice),
 * để artist sửa asset rồi kéo lại vào là layout cập nhật theo.
 */
export async function addPngFiles(files: File[]): Promise<string[]> {
  const ids: string[] = []
  let replaced = 0
  for (const f of files) {
    if (!/\.png$/i.test(f.name) && f.type !== 'image/png') {
      toast(`Bỏ qua ${f.name}: chỉ nhận PNG`)
      continue
    }
    const url = URL.createObjectURL(f)
    let size
    try {
      size = await imageSize(url)
    } catch {
      URL.revokeObjectURL(url)
      toast(`Không đọc được ${f.name}`)
      continue
    }
    const file = sanitizeName(f.name)
    const existing = getState().doc.sprites.find((s) => s.file.toLowerCase() === file.toLowerCase())
    if (existing) {
      const old = getState().images[existing.id]
      if (old) URL.revokeObjectURL(old.url)
      setState((s) => ({ images: { ...s.images, [existing.id]: { url, blob: f } } }))
      updateDoc((d) => ({ ...d, sprites: d.sprites.map((s) => (s.id === existing.id ? { ...s, ...size } : s)) }))
      ids.push(existing.id)
      replaced++
    } else {
      const sprite: SpriteAsset = { id: newId(), file, ...size, border: [0, 0, 0, 0] }
      setState((s) => ({ images: { ...s.images, [sprite.id]: { url, blob: f } } }))
      updateDoc((d) => ({ ...d, sprites: [...d.sprites, sprite] }))
      ids.push(sprite.id)
    }
  }
  if (replaced) toast(`Đã thay ${replaced} ảnh trùng tên`)
  return ids
}

export async function registerFont(font: FontAsset) {
  try {
    const face = new FontFace(font.name, await font.blob.arrayBuffer())
    await face.load()
    document.fonts.add(face)
  } catch {
    toast(`Không nạp được font ${font.file}`)
  }
}

export async function addFontFiles(files: File[]) {
  for (const f of files) {
    if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) {
      toast(`Bỏ qua ${f.name}: cần .ttf/.otf/.woff`)
      continue
    }
    const name = f.name.replace(/\.[^.]+$/, '')
    const font: FontAsset = { name, file: f.name, blob: f }
    await registerFont(font)
    setState((s) => ({ fonts: [...s.fonts.filter((x) => x.name !== name), font] }))
  }
}

// ---------- Gói zip ----------

export async function buildZip(): Promise<Blob> {
  const { doc, images, fonts } = getState()
  const zip = new JSZip()
  zip.file('layout.json', JSON.stringify(doc, null, 2))
  const sprites = zip.folder('sprites')!
  for (const s of doc.sprites) {
    const img = images[s.id]
    if (img) sprites.file(s.file, img.blob)
  }
  if (fonts.length) {
    const fz = zip.folder('fonts')!
    for (const f of fonts) fz.file(f.file, f.blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function exportZip() {
  const { doc } = getState()
  const unused = doc.sprites.length - usedSprites(doc.root).size
  const blob = await buildZip()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${doc.name || 'layout'}.uilayout.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  setState({ dirty: false })
  toast(unused > 0 ? `Đã xuất. Lưu ý: ${unused} sprite chưa dùng vẫn nằm trong gói.` : 'Đã xuất gói layout')
}

export async function openZip(file: Blob) {
  const zip = await JSZip.loadAsync(file)
  const jsonFile = zip.file('layout.json')
  if (!jsonFile) throw new Error('Tệp zip không có layout.json')
  const doc = JSON.parse(await jsonFile.async('string')) as LayoutDocument
  if (doc.format !== FORMAT_ID) throw new Error('layout.json không đúng định dạng')
  if (doc.version > FORMAT_VERSION) throw new Error(`Tệp tạo bằng bản mới hơn (v${doc.version}). Hãy tải lại trang.`)
  const images: Record<string, SpriteImage> = {}
  for (const s of doc.sprites) {
    const f = zip.file(`sprites/${s.file}`)
    if (!f) continue
    const blob = new Blob([await f.async('arraybuffer')], { type: 'image/png' })
    images[s.id] = { blob, url: URL.createObjectURL(blob) }
  }
  const fonts: FontAsset[] = []
  for (const path of Object.keys(zip.files).filter((p) => p.startsWith('fonts/') && !zip.files[p].dir)) {
    const blob = await zip.files[path].async('blob')
    const fileName = path.slice('fonts/'.length)
    const font = { name: fileName.replace(/\.[^.]+$/, ''), file: fileName, blob }
    await registerFont(font)
    fonts.push(font)
  }
  loadProject(doc, images, fonts)
}

// ---------- Tự lưu (IndexedDB) ----------

const DB = 'ui-layout-studio'
const STORE = 'autosave'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, value: unknown) {
  const db = await idb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export async function restoreAutosave(): Promise<boolean> {
  try {
    const blob = await idbGet<Blob>('project')
    if (!blob) return false
    await openZip(blob)
    return true
  } catch {
    return false
  }
}

export function startAutosave() {
  let timer: number | undefined
  let lastDoc = getState().doc
  let lastImages = getState().images
  let lastFonts = getState().fonts
  subscribe(() => {
    const s = getState()
    if (s.doc === lastDoc && s.images === lastImages && s.fonts === lastFonts) return
    lastDoc = s.doc
    lastImages = s.images
    lastFonts = s.fonts
    clearTimeout(timer)
    timer = window.setTimeout(async () => {
      try {
        await idbPut('project', await buildZip())
      } catch {
        /* hết dung lượng hoặc trình duyệt chặn: bỏ qua */
      }
    }, 800)
  })
}

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}
