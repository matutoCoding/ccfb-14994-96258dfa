// 分层设计页：剖面分层曲线 + 各层颈/中/切厚度与瓷粉选择，实时 3D 联动
import { tag, toast } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import { LAYER_TYPES, LAYER_LABEL, ZONES, ZONE_LABEL, type LayerType } from '../types'
import { createRenderCanvas, meshForCase } from '../ui/render_canvas'
import { RenderSession } from '../state/view_service'
import { drawProfile } from './profile_draw'

const session = new RenderSession()
const LAYER_COLOR: Record<LayerType, string> = {
  dentin: '#d9a441',
  enamel: '#e8d9b0',
  transparent: '#7dd3fc',
  effect: '#c4b5fd'
}

export function renderLayersPage(): HTMLElement {
  const record = store.currentCase
  if (!record) return noCase()
  const tooth = store.currentTooth ?? record.design.teeth[0]
  const page = tag('div', { class: 'stack' })
  page.append(tag('div', { class: 'page-header' },
    tag('div', {}, tag('h1', {}, '分层设计'), tag('p', { class: 'muted' }, '调整颈/中/切三区厚度，1 秒内 3D 与剖面同步刷新'))))

  const handle = createRenderCanvas(session)
  handle.setMesh(meshForCase(record))
  const canvas2d = tag('canvas', { class: 'profile-canvas' }) as HTMLCanvasElement
  const redraw2d = (): void => drawProfile(canvas2d, tooth)

  const editor = tag('div', { class: 'card stack' },
    tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('layers') }), '瓷层参数'),
    ...LAYER_TYPES.map((layer) => layerBlock(layer, redraw2d))
  )

  page.append(tag('div', { style: 'display:grid;grid-template-columns:minmax(0,1.15fr) minmax(340px,0.85fr);gap:var(--sp-5);align-items:start;' },
    tag('div', { class: 'stack' },
      tag('div', { class: 'card', style: 'min-height:380px;' },
        tag('div', { class: 'canvas-toolbar' }, tag('strong', {}, '剖面分层图'), tag('div', { class: 'spacer' }), legend()),
        canvas2d),
      tag('div', { class: 'card', style: 'min-height:380px;display:flex;flex-direction:column;' },
        tag('div', { class: 'canvas-toolbar' }, tag('strong', {}, '实时 3D 预览'),
          tag('div', { class: 'spacer' }),
          tag('button', { class: 'small', onclick: () => store.updateRender({ mode: 'color' }) }, '真彩'),
          tag('button', { class: 'small', onclick: () => store.updateRender({ mode: 'lab' }) }, 'Lab 伪彩')),
        tag('div', { style: 'flex:1;min-height:320px;' }, handle.el))),
    editor))

  requestAnimationFrame(redraw2d)
  return page
}

function layerBlock(layer: LayerType, redraw: () => void): HTMLElement {
  const tooth = store.currentTooth!
  const lz = tooth.layers.find((l) => l.layer === layer)!
  const box = tag('div', { class: 'layer-block', style: 'border:1px solid var(--border);border-radius:var(--radius);padding:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-3);' })
  const porcelainSel = tag('select', {},
    ...store.state.porcelains.filter((p) => p.layer === layer).map((p) => tag('option', { value: p.id }, `${p.brand} ${p.code} · ${p.name}`))) as HTMLSelectElement
  porcelainSel.value = lz.porcelainId
  porcelainSel.addEventListener('change', async () => {
    lz.porcelainId = porcelainSel.value
    await persist()
    toast('瓷粉已更换，光学 LUT 自动重建')
  })
  const head = tag('div', { class: 'row' },
    tag('span', { class: 'legend-dot', style: `background:${LAYER_COLOR[layer]}` }),
    tag('strong', {}, LAYER_LABEL[layer]),
    tag('div', { class: 'spacer' }),
    tag('span', { class: 'tag' }, `烧结收缩 ${store.porcelainById(lz.porcelainId)?.shrinkPct ?? 0}%`))
  box.append(head, tag('div', {}, tag('label', {}, '瓷粉色号'), porcelainSel))

  for (const zone of ZONES) {
    const value = tag('span', { class: 'mono muted' }, `${lz.thickness[zone].toFixed(2)} mm`)
    const range = tag('input', {
      type: 'range', min: layer === 'transparent' || layer === 'effect' ? '0' : '0.2',
      max: '1.6', step: '0.05', value: String(lz.thickness[zone])
    }) as HTMLInputElement
    range.addEventListener('input', () => {
      lz.thickness[zone] = Number(range.value)
      value.textContent = `${lz.thickness[zone].toFixed(2)} mm`
      redraw()
    })
    range.addEventListener('change', persist)
    box.append(tag('div', {}, tag('label', {}, ZONE_LABEL[zone] + '厚度'), tag('div', { class: 'row' }, range, value)))
  }
  return box
}

function legend(): HTMLElement {
  return tag('div', { class: 'row wrap' }, ...LAYER_TYPES.map((l) =>
    tag('span', { class: 'row', style: 'gap:var(--sp-1);font-size:13px;color:var(--text-muted)' },
      tag('span', { class: 'legend-dot', style: `background:${LAYER_COLOR[l]}` }), LAYER_LABEL[l])))
}

function noCase(): HTMLElement {
  return tag('div', { class: 'empty-state' },
    tag('div', { class: 'icon-wrap' }, tag('span', { html: iconHtml('cases') })),
    tag('h3', {}, '请先选择病例'),
    tag('button', { class: 'primary', style: 'margin-top:var(--sp-4)', onclick: () => (location.hash = '#/cases') }, '去病例列表'))
}

async function persist(): Promise<void> {
  const record = store.currentCase
  if (record) await store.saveCase(record)
}
