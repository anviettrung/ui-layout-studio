// Cây node: chọn, đổi tên (bấm đúp), ẩn/khoá, kéo thả để đổi thứ tự hoặc đổi cha.
import { useState } from 'react'
import type { LayoutNode, NodeType } from '../model/types'
import { createNode } from '../model/defaults'
import { cloneWithNewIds, findNode, findParent, insertNode, isDescendant, moveNode, removeNode } from '../model/tree'
import { getState, setState, toast, updateDoc, updateNode, useStore } from '../store'
import { dropParent } from '../render/Viewport'

type DropPos = 'before' | 'after' | 'inside'

export function Hierarchy() {
  const root = useStore((s) => s.doc.root)
  const selection = useStore((s) => s.selection)
  return (
    <div className="hierarchy">
      <div className="hier-bar">
        <button className="btn" onClick={() => addNode('Image')} title="Thêm Image (ô màu hoặc sprite)">
          + Image
        </button>
        <button className="btn" onClick={() => addNode('Text')} title="Thêm Text (TextMeshPro)">
          + Text
        </button>
        <button className="btn" onClick={() => addNode('Group')} title="Thêm nhóm rỗng">
          + Group
        </button>
      </div>
      <div className="tree" onClick={(e) => e.target === e.currentTarget && setState({ selection: null })}>
        <TreeRow node={root} depth={0} selection={selection} />
      </div>
      {selection && selection !== 'root' && (
        <div className="hier-actions">
          <button className="btn" onClick={duplicateSelected} title="Ctrl+D">
            Nhân bản
          </button>
          <button className="btn" onClick={() => moveSelected(-1)} title="Lên (vẽ dưới)">
            ↑
          </button>
          <button className="btn" onClick={() => moveSelected(1)} title="Xuống (vẽ đè lên)">
            ↓
          </button>
          <button className="btn danger" onClick={deleteSelected} title="Delete">
            Xoá
          </button>
        </div>
      )}
    </div>
  )
}

let dragId: string | null = null

function TreeRow({ node, depth, selection }: { node: LayoutNode; depth: number; selection: string | null }) {
  const [editing, setEditing] = useState(false)
  const [drop, setDrop] = useState<DropPos | null>(null)
  const isRoot = node.id === 'root'
  const collapsed = !!node.editor?.collapsed
  const canHaveChildren = node.type === 'Group' || node.type === 'SafeArea' || node.type === 'Image' || isRoot
  const icon = { Group: '▢', Image: '▣', Text: 'T', SafeArea: '⛶' }[node.type]
  const setEditor = (patch: NonNullable<LayoutNode['editor']>) =>
    updateNode(node.id, (n) => ({ ...n, editor: { ...n.editor, ...patch } }), { history: 'none' })

  return (
    <>
      <div
        className={`tree-row ${selection === node.id ? 'on' : ''} ${node.editor?.hidden || !node.active ? 'dim' : ''} ${drop ? `drop-${drop}` : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!isRoot && !editing}
        onDragStart={(e) => {
          dragId = node.id
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', node.id)
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === node.id) return
          const root = getState().doc.root
          if (isDescendant(root, dragId, node.id)) return
          e.preventDefault()
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const y = (e.clientY - r.top) / r.height
          setDrop(isRoot ? 'inside' : y < 0.28 ? 'before' : y > 0.72 || !canHaveChildren ? 'after' : 'inside')
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault()
          const pos = drop
          setDrop(null)
          if (!dragId || !pos) return
          const id = dragId
          dragId = null
          dropNode(id, node.id, pos)
        }}
        onDragEnd={() => {
          dragId = null
          setDrop(null)
        }}
        onClick={() => setState({ selection: node.id, selectedSprite: null })}
        onDoubleClick={() => setEditing(true)}
      >
        <span
          className={`twisty ${node.children.length ? '' : 'none'}`}
          onClick={(e) => {
            e.stopPropagation()
            setEditor({ collapsed: !collapsed })
          }}
        >
          {node.children.length ? (collapsed ? '▸' : '▾') : ''}
        </span>
        <span className={`node-icon t-${node.type}`}>{icon}</span>
        {editing ? (
          <input
            autoFocus
            className="rename"
            defaultValue={node.name}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              setEditing(false)
              const name = e.target.value.trim()
              if (name && name !== node.name) {
                updateNode(node.id, (n) => ({ ...n, name }))
                if (isRoot) updateDoc((d) => ({ ...d, name }), { history: 'none' })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className="node-name">{node.name}</span>
        )}
        {!isRoot && (
          <span className="row-tools">
            <button
              className={`icon ${node.editor?.locked ? 'on' : ''}`}
              title="Khoá (không chọn được trong khung nhìn)"
              onClick={(e) => {
                e.stopPropagation()
                setEditor({ locked: !node.editor?.locked })
              }}
            >
              {node.editor?.locked ? '🔒' : '🔓'}
            </button>
            <button
              className={`icon ${node.editor?.hidden ? 'on' : ''}`}
              title="Ẩn trong editor (không ảnh hưởng Unity)"
              onClick={(e) => {
                e.stopPropagation()
                setEditor({ hidden: !node.editor?.hidden })
              }}
            >
              {node.editor?.hidden ? '◌' : '●'}
            </button>
          </span>
        )}
      </div>
      {!collapsed && node.children.map((c) => <TreeRow key={c.id} node={c} depth={depth + 1} selection={selection} />)}
    </>
  )
}

function dropNode(id: string, targetId: string, pos: DropPos) {
  const root = getState().doc.root
  const dragged = findNode(root, id)
  if (!dragged) return
  if (dragged.type === 'SafeArea' && !(pos === 'inside' ? targetId === 'root' : findParent(root, targetId)?.id === 'root')) {
    toast('SafeArea chỉ đặt trực tiếp dưới gốc')
    return
  }
  if (pos === 'inside') {
    const target = findNode(root, targetId)!
    const index = target.children.filter((c) => c.id !== id).length
    updateDoc((d) => ({ ...d, root: moveNode(d.root, id, targetId, index) }))
  } else {
    const parent = findParent(root, targetId)
    if (!parent) return
    const siblings = parent.children.filter((c) => c.id !== id)
    let index = siblings.findIndex((c) => c.id === targetId)
    if (pos === 'after') index++
    updateDoc((d) => ({ ...d, root: moveNode(d.root, id, parent.id, index) }))
  }
  // Lưu ý: giống Unity khi đổi cha với worldPositionStays=false, giá trị RectTransform giữ nguyên.
}

export function addNode(type: NodeType) {
  const s = getState()
  const parentId = dropParent(s.doc.root, s.selection)
  const parent = findNode(s.doc.root, parentId)!
  const node = createNode(type, type === 'Image' ? 'Image' : type === 'Text' ? 'Text' : 'Group')
  if (type === 'Image') node.image!.color = { r: 0.8, g: 0.8, b: 0.85, a: 1 }
  updateDoc((d) => ({ ...d, root: insertNode(d.root, parentId, parent.children.length, node) }))
  setState({ selection: node.id, selectedSprite: null })
}

export function deleteSelected() {
  const s = getState()
  if (!s.selection || s.selection === 'root') return
  const parent = findParent(s.doc.root, s.selection)
  updateDoc((d) => ({ ...d, root: removeNode(d.root, s.selection!) }))
  setState({ selection: parent && parent.id !== 'root' ? parent.id : null })
}

export function duplicateSelected() {
  const s = getState()
  if (!s.selection || s.selection === 'root') return
  const node = findNode(s.doc.root, s.selection)!
  if (node.type === 'SafeArea') return toast('Mỗi màn chỉ cần một SafeArea')
  const parent = findParent(s.doc.root, s.selection)!
  const copy = cloneWithNewIds(node)
  copy.name = node.name + ' (1)'
  copy.rect = { ...copy.rect, anchoredPosition: { x: copy.rect.anchoredPosition.x + 20, y: copy.rect.anchoredPosition.y - 20 } }
  const idx = parent.children.findIndex((c) => c.id === node.id)
  updateDoc((d) => ({ ...d, root: insertNode(d.root, parent.id, idx + 1, copy) }))
  setState({ selection: copy.id })
}

export function moveSelected(dir: -1 | 1) {
  const s = getState()
  if (!s.selection) return
  const parent = findParent(s.doc.root, s.selection)
  if (!parent) return
  const idx = parent.children.findIndex((c) => c.id === s.selection)
  const ni = idx + dir
  if (ni < 0 || ni >= parent.children.length) return
  updateDoc((d) => ({ ...d, root: moveNode(d.root, s.selection!, parent.id, ni) }))
}
