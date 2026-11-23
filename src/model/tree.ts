// Thao tác bất biến trên cây node.
import { newId } from './defaults'
import type { LayoutNode } from './types'

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root
  for (const c of root.children) {
    const f = findNode(c, id)
    if (f) return f
  }
  return null
}

export function findParent(root: LayoutNode, id: string): LayoutNode | null {
  for (const c of root.children) {
    if (c.id === id) return root
    const f = findParent(c, id)
    if (f) return f
  }
  return null
}

/** Danh sách id từ gốc đến node (gồm cả node). */
export function pathTo(root: LayoutNode, id: string): LayoutNode[] | null {
  if (root.id === id) return [root]
  for (const c of root.children) {
    const p = pathTo(c, id)
    if (p) return [root, ...p]
  }
  return null
}

export function mapNode(root: LayoutNode, id: string, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  if (root.id === id) return fn(root)
  let changed = false
  const children = root.children.map((c) => {
    const r = mapNode(c, id, fn)
    if (r !== c) changed = true
    return r
  })
  return changed ? { ...root, children } : root
}

export function removeNode(root: LayoutNode, id: string): LayoutNode {
  const idx = root.children.findIndex((c) => c.id === id)
  if (idx >= 0) return { ...root, children: root.children.filter((c) => c.id !== id) }
  let changed = false
  const children = root.children.map((c) => {
    const r = removeNode(c, id)
    if (r !== c) changed = true
    return r
  })
  return changed ? { ...root, children } : root
}

export function insertNode(root: LayoutNode, parentId: string, index: number, node: LayoutNode): LayoutNode {
  return mapNode(root, parentId, (p) => {
    const children = [...p.children]
    const i = Math.max(0, Math.min(index, children.length))
    children.splice(i, 0, node)
    return { ...p, children }
  })
}

export function isDescendant(root: LayoutNode, ancestorId: string, id: string): boolean {
  const a = findNode(root, ancestorId)
  return !!a && a.id !== id && !!findNode(a, id)
}

/** Chuyển node sang cha mới tại vị trí index (index tính sau khi đã gỡ node ra). */
export function moveNode(root: LayoutNode, id: string, newParentId: string, index: number): LayoutNode {
  if (id === newParentId || isDescendant(root, id, newParentId)) return root
  const node = findNode(root, id)
  if (!node) return root
  return insertNode(removeNode(root, id), newParentId, index, node)
}

export function cloneWithNewIds(node: LayoutNode): LayoutNode {
  return { ...structuredClone(node), id: newId(), children: node.children.map(cloneWithNewIds) }
}

export function walk(root: LayoutNode, fn: (n: LayoutNode, parent: LayoutNode | null) => void, parent: LayoutNode | null = null) {
  fn(root, parent)
  for (const c of root.children) walk(c, fn, root)
}

/** Danh sách sprite id đang được dùng. */
export function usedSprites(root: LayoutNode): Set<string> {
  const s = new Set<string>()
  walk(root, (n) => {
    if (n.image?.sprite) s.add(n.image.sprite)
  })
  return s
}

/** Áp fn cho mọi node (bất biến). */
export function mapAll(root: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const n = fn(root)
  const children = n.children.map((c) => mapAll(c, fn))
  return children.every((c, i) => c === n.children[i]) ? n : { ...n, children }
}
