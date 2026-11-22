// 光照预览页：四种光源切换、暗口腔背景、乳光强度，暴露同色异谱
import { tag } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import { ILLUMINANTS } from '../core/spectrum'
import type { IlluminantId } from '../types'
import { createRenderCanvas, meshForCase } from '../ui/render_canvas'
import { RenderSession } from '../state/view_service'
import { xyzToSrgb, labToXyz, deltaE2000 } from '../core/spectrum'
import { slider } from '../ui/dom'

const session = new RenderSession()

export function renderLightPage(): HTMLElement {
  const record = store.currentCase
  if (!record) return noCase()
  const tooth = store.currentTooth ?? record.design.teeth[0]
  store.updateRender({ mode: 'color' })
  const page = tag('div', { class: 'stack' })
  page.append(tag('div', { class: 'page-header' },
    tag('div', {}, tag('h1', {}, '光照预览'), tag('p', { class: 'muted' }, '同一牙冠在不同光源下的表现，重点观察诊室 LED 与日光的同色异谱'))))

  const handle = createRenderCanvas(session)
  handle.setMesh(meshForCase(record))
  const labs = session.allIlluminantLabs(tooth, store.state.porcelains)
  const d65 = labs.find((l) => l.id === 'd65')!.lab

  const lightButtons = tag('div', { class: 'row wrap' }, ...ILLUMINANTS.map((ilm) =>
    tag('button', {
      class: store.state.render.illuminant === ilm.id ? 'active' : '',
      onclick: () => store.updateRender({ illuminant: ilm.id as IlluminantId })
    }, ilm.name)))

  const controlCard = tag('div', { class: 'card stack' },
    tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('light') }), '光源与环境'),
    tag('div', {}, tag('label', {}, '标准光源'), lightButtons),
    tag('div', {}, tag('label', {}, `口腔暗背景（当前 ${Math.round(store.state.render.mouthDark * 100)}% 暗）`),
      slider(store.state.render.mouthDark, 0, 1, 0.05, (v) => store.updateRender({ mouthDark: v }))),
    tag('div', {}, tag('label', {}, `切端乳光强度（当前 ${store.state.render.opalescence.toFixed(2)}）`),
      slider(store.state.render.opalescence, 0, 1.5, 0.05, (v) => store.updateRender({ opalescence: v }))),
    tag('div', {}, tag('label', {}, `曝光（当前 ${store.state.render.exposure.toFixed(2)}）`),
      slider(store.state.render.exposure, 0.6, 1.6, 0.02, (v) => store.updateRender({ exposure: v }))))

  const metamerCard = tag('div', { class: 'card stack' },
    tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('chart') }), '各光源中部颜色读数'),
    tag('table', {},
      tag('thead', {}, tag('tr', {}, tag('th', {}, '光源'), tag('th', {}, '色块'), tag('th', {}, 'L*a*b*'), tag('th', {}, '相对 D65 ΔE'))),
      tag('tbody', {}, ...labs.map((l) => {
        const [r, g, b] = xyzToSrgb(labToXyz(l.lab))
        const de = deltaE2000(d65, l.lab)
        return tag('tr', {},
          tag('td', {}, l.name),
          tag('td', {}, tag('div', { class: 'color-swatch', style: `width:36px;height:36px;background:rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})` })),
          tag('td', { class: 'lab-value' }, `${l.lab[0].toFixed(1)} / ${l.lab[1].toFixed(1)} / ${l.lab[2].toFixed(1)}`),
          tag('td', {}, tag('span', { class: `tag ${de <= 2 ? 'success' : 'danger'}` }, de.toFixed(2))))
      }))),
    tag('p', { class: 'muted', style: 'font-size:13px' }, '相对 D65 色差大于 2 即存在临床可见的同色异谱风险，建议回比色页调整切端瓷与效果瓷配比'))

  page.append(tag('div', { style: 'display:grid;grid-template-columns:minmax(0,1.15fr) minmax(340px,0.85fr);gap:var(--sp-5);align-items:start;' },
    tag('div', { class: 'card', style: 'min-height:480px;display:flex;flex-direction:column;' },
      tag('div', { class: 'canvas-toolbar' }, tag('strong', {}, '实时渲染'), tag('div', { class: 'spacer' }),
        tag('button', { class: 'small', onclick: () => store.updateRender({ mode: 'color' }) }, '真彩'),
        tag('button', { class: 'small', onclick: () => store.updateRender({ mode: 'lab' }) }, 'Lab 伪彩')),
      tag('div', { style: 'flex:1;min-height:420px;' }, handle.el)),
    tag('div', { class: 'stack' }, controlCard, metamerCard)))
  return page
}

function noCase(): HTMLElement {
  return tag('div', { class: 'empty-state' },
    tag('div', { class: 'icon-wrap' }, tag('span', { html: iconHtml('cases') })),
    tag('h3', {}, '请先选择病例'),
    tag('button', { class: 'primary', style: 'margin-top:var(--sp-4)', onclick: () => (location.hash = '#/cases') }, '去病例列表'))
}
