// 比色对照页：渲染结果与比色板并排，分区 Lab/ΔE2000，反算厚度方案
import { tag, toast, select } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import { ALL_SHADES, coreReflectance } from '../core/materials_data'
import { LAYER_TYPES, ZONES, ZONE_LABEL, type LayerType, type ZoneName } from '../types'
import { createRenderCanvas, meshForCase } from '../ui/render_canvas'
import { RenderSession, targetLab, getKM } from '../state/view_service'
import { runInverse } from '../core/solver'
import { xyzToSrgb, labToXyz } from '../core/spectrum'

const session = new RenderSession()

export function renderShadePage(): HTMLElement {
  const record = store.currentCase
  if (!record) return noCase()
  const tooth = store.currentTooth ?? record.design.teeth[0]
  store.updateRender({ mode: 'de2000', targetShade: record.targetShade })
  const page = tag('div', { class: 'stack' })

  page.append(tag('div', { class: 'page-header' },
    tag('div', {}, tag('h1', {}, '比色对照'), tag('p', { class: 'muted' }, '同一套 KM 参数在 D65 下与比色板对比，ΔE2000 大于 2 的区域在模型上标红'))))

  const handle = createRenderCanvas(session)
  handle.setMesh(meshForCase(record))

  const shadeSel = select(
    ALL_SHADES.map((s) => ({ value: s.code, label: `${s.code} · L${s.lab[0].toFixed(1)} a${s.lab[1].toFixed(1)} b${s.lab[2].toFixed(1)}` })),
    record.targetShade,
    (v) => {
      record.targetShade = v
      store.updateRender({ targetShade: v })
      store.saveCase(record)
    }
  )

  const results = session.zoneLabs(record, tooth, store.state.porcelains, record.targetShade)
  const meanDe = results.reduce((s, r) => s + r.de, 0) / results.length
  const maxDe = Math.max(...results.map((r) => r.de))

  const compareCard = tag('div', { class: 'card stack' },
    tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('shade') }), '目标色号'),
    tag('div', {}, tag('label', {}, '比色板色号'), shadeSel),
    swatchRow(targetLab(record.targetShade), '比色板目标'),
    tag('div', { class: 'grid-3' },
      stat('平均 ΔE2000', meanDe.toFixed(2), meanDe <= 2 ? 'success' : 'danger'),
      stat('最大 ΔE2000', maxDe.toFixed(2), maxDe <= 2 ? 'success' : 'danger'),
      stat('异谱指数', results[1].metamerism.toFixed(2), results[1].metamerism <= 2 ? 'success' : 'warning'))
  )

  const zoneCard = tag('div', { class: 'card', style: 'padding:0;overflow:hidden' },
    tag('table', {},
      tag('thead', {}, tag('tr', {}, tag('th', {}, '分区'), tag('th', {}, '渲染 L'), tag('th', {}, 'a'), tag('th', {}, 'b'), tag('th', {}, 'ΔE2000'), tag('th', {}, '判定'))),
      tag('tbody', {}, ...results.map((r) => tag('tr', {},
        tag('td', {}, ZONE_LABEL[r.zone]),
        tag('td', { class: 'mono' }, r.lab[0].toFixed(1)),
        tag('td', { class: 'mono' }, r.lab[1].toFixed(1)),
        tag('td', { class: 'mono' }, r.lab[2].toFixed(1)),
        tag('td', { class: 'mono' }, tag('strong', { style: r.de <= 2 ? 'color:var(--success)' : 'color:var(--danger)' }, r.de.toFixed(2))),
        tag('td', {}, tag('span', { class: `tag ${r.de <= 2 ? 'success' : 'danger'}` }, r.de <= 2 ? '合格' : '需调整')))))))

  const inverseCard = tag('div', { class: 'card stack' },
    tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('refresh') }), '反算厚度推荐'),
    tag('p', { class: 'muted' }, '以目标色号为约束，自动调整四层三分区厚度，给出三套可对比方案'),
    tag('button', {
      class: 'primary', onclick: () => runPlans(inverseCard)
    }, tag('span', { html: iconHtml('refresh') }), '开始反算'))

  page.append(tag('div', { style: 'display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,0.9fr);gap:var(--sp-5);align-items:start;' },
    tag('div', { class: 'stack' },
      tag('div', { class: 'card', style: 'min-height:420px;display:flex;flex-direction:column;' },
        tag('div', { class: 'canvas-toolbar' }, tag('strong', {}, 'ΔE2000 热力图'), tag('div', { class: 'spacer' }),
          tag('div', { class: 'heat-legend' }, tag('span', {}, '0'), tag('span', { class: 'heat-bar' }), tag('span', {}, '4.5+')),
          tag('button', { class: 'small', onclick: () => store.updateRender({ mode: 'color' }) }, '切真彩')),
        tag('div', { style: 'flex:1;min-height:360px;' }, handle.el)),
      zoneCard),
    tag('div', { class: 'stack' }, compareCard, inverseCard)))
  return page
}

function runPlans(container: HTMLElement): void {
  const record = store.currentCase!
  const tooth = store.currentTooth!
  const target = ALL_SHADES.find((s) => s.code === record.targetShade)!
  const ctx = {
    layers: LAYER_TYPES.map((type) => ({
      type,
      data: getKM(store.state.porcelains.find((p) => p.id === tooth.layers.find((l) => l.layer === type)!.porcelainId)!)
    })),
    substrate: coreReflectance(tooth.core, tooth.coreShade),
    budget: { cervical: 2.2, middle: 2.0, incisal: 1.8 }
  }
  const plan = runInverse(target, ctx)
  record.lastPlan = plan
  store.saveCase(record)
  toast(`反算完成，最优方案预测 ΔE ${plan.options[0].predictedDe}`)

  const wrap = tag('div', { class: 'stack', style: 'margin-top:var(--sp-4)' },
    ...plan.options.map((opt, i) => {
      const card = tag('div', { class: `card plan-card ${i === 0 ? '' : 'dim'}`, style: 'padding:var(--sp-4);' },
        tag('div', { class: 'row' }, tag('strong', {}, opt.name), tag('div', { class: 'spacer' }),
          tag('span', { class: `tag ${opt.predictedDe <= 2 ? 'success' : 'danger'}` }, `ΔE ${opt.predictedDe}`)),
        tag('p', { class: 'muted', style: 'margin:var(--sp-2) 0' }, opt.description),
        tag('div', { class: 'kv' },
          tag('dt', {}, '异谱指数'), tag('dd', { class: 'mono' }, String(opt.metamerismIndex)),
          tag('dt', {}, '颈/中/切牙本质'), tag('dd', { class: 'mono' }, fmt(opt.thickness.dentin)),
          tag('dt', {}, '颈/中/切切端'), tag('dd', { class: 'mono' }, fmt(opt.thickness.enamel)),
          tag('dt', {}, '颈/中/切透明'), tag('dd', { class: 'mono' }, fmt(opt.thickness.transparent)),
          tag('dt', {}, '颈/中/切效果'), tag('dd', { class: 'mono' }, fmt(opt.thickness.effect))),
        tag('button', {
          class: i === 0 ? 'primary small' : 'small', style: 'margin-top:var(--sp-3)',
          onclick: () => applyPlan(opt.thickness)
        }, tag('span', { html: iconHtml('check') }), '应用到分层设计'))
      return card
    }))
  const old = container.querySelector('.plan-results')
  old?.remove()
  wrap.className = 'stack plan-results'
  container.append(wrap)
}

function applyPlan(thickness: Record<LayerType, Record<ZoneName, number>>): void {
  const tooth = store.currentTooth!
  for (const layer of LAYER_TYPES) {
    const lz = tooth.layers.find((l) => l.layer === layer)!
    lz.thickness = { ...thickness[layer] }
  }
  store.saveCase(store.currentCase!)
  toast('方案已应用，可到分层设计页查看')
}

function fmt(t: Record<ZoneName, number>): string {
  return `${t.cervical.toFixed(2)} / ${t.middle.toFixed(2)} / ${t.incisal.toFixed(2)} mm`
}

function stat(label: string, value: string, tone: 'success' | 'danger' | 'warning'): HTMLElement {
  return tag('div', { style: 'padding:var(--sp-4);border:1px solid var(--border);border-radius:var(--radius);background:var(--slate-50)' },
    tag('div', { class: 'muted', style: 'margin-bottom:var(--sp-1)' }, label),
    tag('div', { class: 'stat-num', style: `color:var(--${tone === 'warning' ? 'warning' : tone})` }, value))
}

function swatchRow(lab: [number, number, number], label: string): HTMLElement {
  const [r, g, b] = xyzToSrgb(labToXyz(lab))
  const color = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
  return tag('div', { class: 'shade-card target' },
    tag('div', { class: 'color-swatch', style: `background:${color}` }),
    tag('div', {}, tag('strong', {}, label),
      tag('p', { class: 'lab-value' }, `L* ${lab[0].toFixed(1)}  a* ${lab[1].toFixed(1)}  b* ${lab[2].toFixed(1)}`),
      tag('p', { class: 'muted', style: 'font-size:13px' }, '由 Lab 经 XYZ 转换显示，浏览器间可能略有差异')))
}

function noCase(): HTMLElement {
  return tag('div', { class: 'empty-state' },
    tag('div', { class: 'icon-wrap' }, tag('span', { html: iconHtml('cases') })),
    tag('h3', {}, '请先选择病例'),
    tag('button', { class: 'primary', style: 'margin-top:var(--sp-4)', onclick: () => (location.hash = '#/cases') }, '去病例列表'))
}
