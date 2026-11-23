// Inspector cho các component layout của uGUI: Layout Group, Layout Element, Content Size Fitter, Mask.
import { defaultLayoutElement, defaultLayoutGroup } from '../model/defaults'
import type { FitMode, LayoutElementData, LayoutGroupData, LayoutNode, TextAnchor } from '../model/types'
import { updateNode } from '../store'
import { Check, Num, Row, Section } from './fields'

const ANCHORS: TextAnchor[] = ['UpperLeft', 'UpperCenter', 'UpperRight', 'MiddleLeft', 'MiddleCenter', 'MiddleRight', 'LowerLeft', 'LowerCenter', 'LowerRight']

type AddKind = 'Horizontal' | 'Vertical' | 'Grid' | 'LayoutElement' | 'ContentSizeFitter' | 'Mask' | 'RectMask2D'

export function LayoutComponents({ node }: { node: LayoutNode }) {
  const upd = (fn: (n: LayoutNode) => LayoutNode, key?: string) => updateNode(node.id, fn, key ? { mergeKey: `${node.id}:${key}` } : undefined)
  const remove = (k: 'layoutGroup' | 'layoutElement' | 'contentSizeFitter' | 'mask') =>
    upd((n) => {
      const c = { ...n }
      delete c[k]
      return c
    })
  const add = (kind: AddKind) => {
    if (kind === 'Horizontal' || kind === 'Vertical' || kind === 'Grid') upd((n) => ({ ...n, layoutGroup: defaultLayoutGroup(kind) }))
    else if (kind === 'LayoutElement') upd((n) => ({ ...n, layoutElement: defaultLayoutElement() }))
    else if (kind === 'ContentSizeFitter') upd((n) => ({ ...n, contentSizeFitter: { horizontalFit: 'Unconstrained', verticalFit: 'Unconstrained' } }))
    else upd((n) => ({ ...n, mask: { type: kind, showMaskGraphic: true } }))
  }
  const options: [AddKind, string][] = []
  if (!node.layoutGroup) options.push(['Horizontal', 'Horizontal Layout Group'], ['Vertical', 'Vertical Layout Group'], ['Grid', 'Grid Layout Group'])
  if (!node.layoutElement) options.push(['LayoutElement', 'Layout Element'])
  if (!node.contentSizeFitter) options.push(['ContentSizeFitter', 'Content Size Fitter'])
  if (!node.mask) {
    if (node.type === 'Image') options.push(['Mask', 'Mask (theo hình sprite)'])
    options.push(['RectMask2D', 'Rect Mask 2D (theo khung)'])
  }
  const x = (label: string, k: 'layoutGroup' | 'layoutElement' | 'contentSizeFitter' | 'mask') => (
    <button className="icon" title={`Gỡ ${label}`} onClick={() => remove(k)}>
      ×
    </button>
  )
  return (
    <>
      {node.layoutGroup && (
        <Section title={`${node.layoutGroup.type} Layout Group`} right={x('Layout Group', 'layoutGroup')}>
          <GroupFields g={node.layoutGroup} set={(g, key) => upd((n) => ({ ...n, layoutGroup: { ...n.layoutGroup!, ...g } }), key)} />
        </Section>
      )}
      {node.layoutElement && (
        <Section title="Layout Element" right={x('Layout Element', 'layoutElement')}>
          <ElementFields e={node.layoutElement} set={(e, key) => upd((n) => ({ ...n, layoutElement: { ...n.layoutElement!, ...e } }), key)} />
        </Section>
      )}
      {node.contentSizeFitter && (
        <Section title="Content Size Fitter" right={x('Content Size Fitter', 'contentSizeFitter')}>
          {(['horizontalFit', 'verticalFit'] as const).map((k) => (
            <Row key={k} label={k === 'horizontalFit' ? 'Horizontal' : 'Vertical'}>
              <select
                value={node.contentSizeFitter![k]}
                onChange={(e) => upd((n) => ({ ...n, contentSizeFitter: { ...n.contentSizeFitter!, [k]: e.target.value as FitMode } }))}
              >
                <option>Unconstrained</option>
                <option>MinSize</option>
                <option>PreferredSize</option>
              </select>
            </Row>
          ))}
        </Section>
      )}
      {node.mask && (
        <Section title={node.mask.type === 'Mask' ? 'Mask' : 'Rect Mask 2D'} right={x('Mask', 'mask')}>
          {node.mask.type === 'Mask' ? (
            <Check label="Show Mask Graphic" checked={node.mask.showMaskGraphic} onChange={(v) => upd((n) => ({ ...n, mask: { ...n.mask!, showMaskGraphic: v } }))} />
          ) : (
            <div className="note small">Cắt con theo khung của node.</div>
          )}
        </Section>
      )}
      {options.length > 0 && (
        <div className="add-comp">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) add(e.target.value as AddKind)
            }}
          >
            <option value="">+ Thêm component…</option>
            {options.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  )
}

function GroupFields({ g, set }: { g: LayoutGroupData; set: (g: Partial<LayoutGroupData>, key?: string) => void }) {
  const p = g.padding
  const pad = (k: keyof typeof p, v: number) => set({ padding: { ...p, [k]: v } }, `pad${k}`)
  return (
    <>
      <Row label="Padding">
        <Num label="L" value={p.left} onChange={(v) => pad('left', v)} />
        <Num label="R" value={p.right} onChange={(v) => pad('right', v)} />
      </Row>
      <Row label="">
        <Num label="T" value={p.top} onChange={(v) => pad('top', v)} />
        <Num label="B" value={p.bottom} onChange={(v) => pad('bottom', v)} />
      </Row>
      {g.type === 'Grid' ? (
        <>
          <Row label="Cell Size">
            <Num label="X" value={g.cellSize.x} onChange={(v) => set({ cellSize: { ...g.cellSize, x: v } }, 'csx')} />
            <Num label="Y" value={g.cellSize.y} onChange={(v) => set({ cellSize: { ...g.cellSize, y: v } }, 'csy')} />
          </Row>
          <Row label="Spacing">
            <Num label="X" value={g.gridSpacing.x} onChange={(v) => set({ gridSpacing: { ...g.gridSpacing, x: v } }, 'gsx')} />
            <Num label="Y" value={g.gridSpacing.y} onChange={(v) => set({ gridSpacing: { ...g.gridSpacing, y: v } }, 'gsy')} />
          </Row>
          <Row label="Start Corner">
            <select value={g.startCorner} onChange={(e) => set({ startCorner: e.target.value as LayoutGroupData['startCorner'] })}>
              {['UpperLeft', 'UpperRight', 'LowerLeft', 'LowerRight'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Row>
          <Row label="Start Axis">
            <select value={g.startAxis} onChange={(e) => set({ startAxis: e.target.value as LayoutGroupData['startAxis'] })}>
              <option>Horizontal</option>
              <option>Vertical</option>
            </select>
          </Row>
        </>
      ) : (
        <Row label="Spacing">
          <Num value={g.spacing} onChange={(v) => set({ spacing: v }, 'sp')} />
        </Row>
      )}
      <Row label="Child Align">
        <select value={g.childAlignment} onChange={(e) => set({ childAlignment: e.target.value as TextAnchor })}>
          {ANCHORS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Row>
      {g.type === 'Grid' ? (
        <>
          <Row label="Constraint">
            <select value={g.constraint} onChange={(e) => set({ constraint: e.target.value as LayoutGroupData['constraint'] })}>
              <option>Flexible</option>
              <option>FixedColumnCount</option>
              <option>FixedRowCount</option>
            </select>
          </Row>
          {g.constraint !== 'Flexible' && (
            <Row label="Count">
              <Num value={g.constraintCount} min={1} onChange={(v) => set({ constraintCount: Math.max(1, Math.round(v)) }, 'cc')} />
            </Row>
          )}
        </>
      ) : (
        <>
          <Check label="Reverse Arrangement" checked={g.reverseArrangement} onChange={(v) => set({ reverseArrangement: v })} />
          <table className="lg-table">
            <thead>
              <tr>
                <th></th>
                <th>Width</th>
                <th>Height</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Control Child Size', 'childControlWidth', 'childControlHeight'],
                  ['Use Child Scale', 'childScaleWidth', 'childScaleHeight'],
                  ['Child Force Expand', 'childForceExpandWidth', 'childForceExpandHeight'],
                ] as const
              ).map(([label, w, h]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    <input type="checkbox" checked={g[w]} onChange={(e) => set({ [w]: e.target.checked })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={g[h]} onChange={(e) => set({ [h]: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

function ElementFields({ e, set }: { e: LayoutElementData; set: (e: Partial<LayoutElementData>, key?: string) => void }) {
  // -1 = không đặt (ô tắt), như checkbox trong Inspector của Unity
  const field = (label: string, k: keyof Omit<LayoutElementData, 'ignoreLayout' | 'layoutPriority'>) => (
    <Row key={k} label={label}>
      <input type="checkbox" checked={e[k] >= 0} onChange={(ev) => set({ [k]: ev.target.checked ? (k.startsWith('flexible') ? 1 : 0) : -1 })} />
      <Num value={e[k] >= 0 ? e[k] : 0} disabled={e[k] < 0} onChange={(v) => set({ [k]: Math.max(0, v) }, k)} />
    </Row>
  )
  return (
    <>
      <Check label="Ignore Layout" checked={e.ignoreLayout} onChange={(v) => set({ ignoreLayout: v })} />
      {!e.ignoreLayout && (
        <>
          {field('Min Width', 'minWidth')}
          {field('Min Height', 'minHeight')}
          {field('Preferred W', 'preferredWidth')}
          {field('Preferred H', 'preferredHeight')}
          {field('Flexible W', 'flexibleWidth')}
          {field('Flexible H', 'flexibleHeight')}
          <Row label="Priority">
            <Num value={e.layoutPriority} onChange={(v) => set({ layoutPriority: Math.round(v) }, 'prio')} />
          </Row>
        </>
      )}
    </>
  )
}
