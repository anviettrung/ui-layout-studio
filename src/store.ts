// Trạng thái toàn app: tài liệu (có undo/redo), ảnh sprite, lựa chọn, thiết bị, khung nhìn.
import { useSyncExternalStore } from 'react'
import { createDocument, DEFAULT_DEVICES } from './model/defaults'
import type { DeviceProfile, LayoutDocument, LayoutNode } from './model/types'
import { findNode, mapNode } from './model/tree'

export interface SpriteImage {
  url: string
  blob: Blob
}

export interface FontAsset {
  /** Tên logic = family CSS = tên importer dùng để ánh xạ TMP_FontAsset */
  name: string
  file: string
  blob: Blob
}

export interface RefOverlay {
  url: string
  blob: Blob
  opacity: number
  visible: boolean
}

export type ViewMode = 'single' | 'grid'

export interface AppState {
  doc: LayoutDocument
  images: Record<string, SpriteImage>
  fonts: FontAsset[]
  selection: string | null
  selectedSprite: string | null
  devices: DeviceProfile[]
  activeDevice: string
  viewMode: ViewMode
  zoom: number | 'fit'
  showSafeArea: boolean
  showBounds: boolean
  snap: boolean
  overlay: RefOverlay | null
  past: LayoutDocument[]
  future: LayoutDocument[]
  dirty: boolean
  toast: string | null
}

function loadDevices(): DeviceProfile[] {
  try {
    const raw = localStorage.getItem('uls.devices')
    if (raw) {
      const saved = JSON.parse(raw) as DeviceProfile[]
      if (Array.isArray(saved) && saved.length) return saved
    }
  } catch {
    /* bỏ qua */
  }
  return structuredClone(DEFAULT_DEVICES)
}

let state: AppState = {
  doc: createDocument(),
  images: {},
  fonts: [],
  selection: null,
  selectedSprite: null,
  devices: loadDevices(),
  activeDevice: '16x9',
  viewMode: 'single',
  zoom: 'fit',
  showSafeArea: true,
  showBounds: true,
  snap: true,
  overlay: null,
  past: [],
  future: [],
  dirty: false,
  toast: null,
}

const listeners = new Set<() => void>()

export function getState(): AppState {
  return state
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  if ('devices' in p) localStorage.setItem('uls.devices', JSON.stringify(state.devices))
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

// ---------- Lịch sử ----------

const HISTORY_LIMIT = 200
let lastMergeKey: string | null = null
let lastMergeTime = 0

/** Lưu trạng thái hiện tại vào lịch sử (gọi trước một thao tác kéo thả). */
export function checkpoint() {
  lastMergeKey = null
  setState((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT), s.doc], future: [] }))
}

/**
 * Sửa tài liệu.
 * - history: 'push' (mặc định) ghi lịch sử, 'none' không ghi (đang kéo thả sau checkpoint).
 * - mergeKey: các lần sửa liên tiếp cùng key trong 1 giây gộp thành một bước undo (gõ phím trong ô số).
 */
export function updateDoc(fn: (d: LayoutDocument) => LayoutDocument, opts: { history?: 'push' | 'none'; mergeKey?: string } = {}) {
  const next = fn(state.doc)
  if (next === state.doc) return
  const now = Date.now()
  const merge = opts.mergeKey && opts.mergeKey === lastMergeKey && now - lastMergeTime < 1000
  if (opts.history === 'none' || merge) {
    setState({ doc: next, dirty: true })
  } else {
    setState((s) => ({ doc: next, past: [...s.past.slice(-HISTORY_LIMIT), s.doc], future: [], dirty: true }))
  }
  lastMergeKey = opts.mergeKey ?? null
  lastMergeTime = now
}

export function updateNode(id: string, fn: (n: LayoutNode) => LayoutNode, opts?: { history?: 'push' | 'none'; mergeKey?: string }) {
  updateDoc((d) => ({ ...d, root: mapNode(d.root, id, fn) }), opts)
}

export function undo() {
  const s = state
  if (!s.past.length) return
  const prev = s.past[s.past.length - 1]
  lastMergeKey = null
  setState({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: true, selection: fixSelection(prev, s.selection) })
}

export function redo() {
  const s = state
  if (!s.future.length) return
  const next = s.future[0]
  lastMergeKey = null
  setState({ doc: next, future: s.future.slice(1), past: [...s.past, s.doc], dirty: true, selection: fixSelection(next, s.selection) })
}

function fixSelection(doc: LayoutDocument, sel: string | null) {
  return sel && findNode(doc.root, sel) ? sel : null
}

/** Thay toàn bộ dự án (mở tệp, tạo mới). */
export function loadProject(doc: LayoutDocument, images: Record<string, SpriteImage>, fonts: FontAsset[]) {
  Object.values(state.images).forEach((i) => URL.revokeObjectURL(i.url))
  setState({ doc, images, fonts, selection: null, selectedSprite: null, past: [], future: [], dirty: false })
}

let toastTimer: number | undefined
export function toast(msg: string) {
  setState({ toast: msg })
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => setState({ toast: null }), 3500)
}
