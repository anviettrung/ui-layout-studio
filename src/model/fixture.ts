// Layout mẫu phủ đủ các trường hợp khó (anchor kéo giãn, pivot lệch, lồng nhau, xoay, scale, SafeArea).
// Dùng cho unit test và để kiểm chứng với Unity thật (unity-verify/).
import { createNode, defaultRect, DEFAULT_CANVAS } from './defaults'
import type { LayoutDocument, LayoutNode } from './types'
import { FORMAT_ID, FORMAT_VERSION } from './types'

function n(id: string, type: LayoutNode['type'], patch: Partial<LayoutNode['rect']>, children: LayoutNode[] = []): LayoutNode {
  const node = createNode(type, id)
  node.id = id
  node.rect = { ...defaultRect(), ...patch }
  node.children = children
  return node
}

export function fixtureDocument(): LayoutDocument {
  const safe = createNode('SafeArea', 'SafeArea')
  safe.id = 'safe'
  safe.children = [
    n('topBar', 'Image', { anchorMin: { x: 0, y: 1 }, anchorMax: { x: 1, y: 1 }, pivot: { x: 0.5, y: 1 }, anchoredPosition: { x: 0, y: 0 }, sizeDelta: { x: -40, y: 160 } }, [
      n('avatar', 'Image', { anchorMin: { x: 0, y: 0.5 }, anchorMax: { x: 0, y: 0.5 }, pivot: { x: 0, y: 0.5 }, anchoredPosition: { x: 24, y: 0 }, sizeDelta: { x: 120, y: 120 } }),
      n('gold', 'Text', { anchorMin: { x: 1, y: 0.5 }, anchorMax: { x: 1, y: 0.5 }, pivot: { x: 1, y: 0.5 }, anchoredPosition: { x: -24, y: 0 }, sizeDelta: { x: 300, y: 80 } }),
    ]),
    n('bottomNav', 'Image', { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 0 }, pivot: { x: 0.5, y: 0 }, anchoredPosition: { x: 0, y: 0 }, sizeDelta: { x: 0, y: 200 } }, [
      n('tab1', 'Image', { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 0.25, y: 1 }, pivot: { x: 0.5, y: 0.5 }, anchoredPosition: { x: 0, y: 0 }, sizeDelta: { x: -16, y: -16 } }),
      n('tab2', 'Image', { anchorMin: { x: 0.25, y: 0 }, anchorMax: { x: 0.5, y: 1 }, pivot: { x: 0.2, y: 0.8 }, anchoredPosition: { x: 5, y: -7 }, sizeDelta: { x: -16, y: -16 } }),
    ]),
    n('playBtn', 'Image', { anchorMin: { x: 0.5, y: 0.3 }, anchorMax: { x: 0.5, y: 0.3 }, pivot: { x: 0.5, y: 0.5 }, anchoredPosition: { x: 0, y: 0 }, sizeDelta: { x: 420, y: 160 }, rotation: 15, scale: { x: 1.2, y: 0.9 } }, [
      n('playLabel', 'Text', { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, pivot: { x: 0.5, y: 0.5 }, anchoredPosition: { x: 0, y: 4 }, sizeDelta: { x: -40, y: -20 } }),
    ]),
  ]
  const bg = n('bg', 'Image', { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, sizeDelta: { x: 0, y: 0 } })
  const deco = n('deco', 'Image', { anchorMin: { x: 1, y: 0 }, anchorMax: { x: 1, y: 0 }, pivot: { x: 1, y: 0 }, anchoredPosition: { x: 0, y: 0 }, sizeDelta: { x: 333.5, y: 211.25 } })
  const root: LayoutNode = { ...createNode('Group', 'Fixture'), id: 'root', rect: { ...defaultRect(0, 0), anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 } }, children: [bg, deco, safe] }
  return { format: FORMAT_ID, version: FORMAT_VERSION, name: 'Fixture', canvas: { ...DEFAULT_CANVAS }, sprites: [], root }
}
