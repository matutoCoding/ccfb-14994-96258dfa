// 制作单页：每层瓷粉、补偿收缩后的堆塑厚度、烧成次数，可打印
import { tag } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import { LAYER_TYPES, LAYER_LABEL, ZONES, ZONE_LABEL } from '../types'
import { toothInfo } from '../core/fdi'

export function renderSheetPage(): HTMLElement {
  const record = store.currentCase
  if (!record) return noCase()
  const page = tag('div', { class: 'stack' })

  const toolbar = tag('div', { class: 'page-header no-print' },
    tag('div', {}, tag('h1', {}, '制作单'), tag('p', { class: 'muted' }, '堆塑厚度已按烧结收缩率补偿，直接打印交给技师')),
    tag('button', { class: 'primary', onclick: () => window.print() }, tag('span', { html: iconHtml('print') }), '打印制作单'))

  const sheets = record.design.teeth.map((tooth) => {
    const info = toothInfo(tooth.fdi)
    const rows = LAYER_TYPES.map((layer) => {
      const lz = tooth.layers.find((l) => l.layer === layer)!
      const porcelain = store.porcelainById(lz.porcelainId)
      const shrink = porcelain?.shrinkPct ?? 0
      const compensate = (v: number): number => v / (1 - shrink / 100)
      const cells = ZONES.map((z) => {
        const final = lz.thickness[z]
        const build = compensate(final)
        return tag('td', { class: 'mono' }, `${build.toFixed(2)}`, tag('br'), tag('span', { class: 'muted', style: 'font-size:12px' }, `成 ${final.toFixed(2)}`))
      })
      return tag('tr', {},
        tag('td', {}, tag('strong', {}, LAYER_LABEL[layer])),
        tag('td', {}, `${porcelain?.brand ?? ''} ${porcelain?.code ?? ''}`),
        tag('td', { class: 'muted' }, porcelain?.name ?? ''),
        tag('td', { class: 'mono' }, `${shrink}%`),
        ...cells)
    })

    return tag('div', { class: 'card', style: 'margin-bottom:var(--sp-5);' },
      tag('div', { class: 'row', style: 'margin-bottom:var(--sp-4)' },
        tag('h2', {}, `牙位 ${info.label}`),
        tag('div', { class: 'spacer' }),
        tag('span', { class: `tag ${tooth.core === 'metal' ? 'danger' : 'primary'}` }, tooth.core === 'metal' ? '金属内冠' : '氧化锆内冠')),
      tag('table', {},
        tag('thead', {}, tag('tr', {},
          tag('th', {}, '瓷层'), tag('th', {}, '品牌色号'), tag('th', {}, '名称'), tag('th', {}, '收缩率'),
          ...ZONES.map((z) => tag('th', {}, `${ZONE_LABEL[z]}堆塑/成品 mm`)))),
        tag('tbody', {}, ...rows)),
      tag('div', { class: 'grid-3', style: 'margin-top:var(--sp-5)' },
        firingCard('1. 遮色/牙本质烧结', '真空烧结，升温至 920℃，速率 55℃/min，保温 1min'),
        firingCard('2. 切端/效果瓷烧结', '堆塑切端瓷与效果瓷，910℃ 二次烧结，自然冷却'),
        firingCard('3. 透明釉烧结', '透明瓷/釉层 900℃ 末次烧结，检查边缘密合')),
      tag('div', { class: 'card', style: 'margin-top:var(--sp-4);background:var(--slate-50);box-shadow:none;' },
        tag('h3', { style: 'margin-bottom:var(--sp-2)' }, '技师备注'),
        tag('ul', { style: 'margin:0;padding-left:var(--sp-5);color:var(--slate-600);line-height:1.9' },
          tag('li', {}, `内冠厚度：颈 ${tooth.coreThickness.cervical} / 中 ${tooth.coreThickness.middle} / 切 ${tooth.coreThickness.incisal} mm`),
          tag('li', {}, tooth.core === 'metal' ? '金属底遮色要求高，牙本质层不得低于设计厚度，防止颈部返黑发灰' : '氧化锆底注意含水量，切端乳光区避免过度堆塑'),
          tag('li', {}, '每次烧结后在 D65 标准光源下与比色板核对，ΔE 控制在 2 以内'),
          tag('li', {}, record.note ? `临床备注：${record.note}` : '无临床备注')))
    )
  })

  const header = tag('div', { class: 'card', style: 'margin-bottom:var(--sp-5);' },
    tag('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:var(--sp-4)' },
      tag('div', {}, tag('h1', { style: 'font-size:var(--fs-xl)' }, '分层堆瓷制作单'),
        tag('p', { class: 'muted', style: 'margin-top:var(--sp-1)' }, `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`)),
      tag('dl', { class: 'kv' },
        tag('dt', {}, '诊所'), tag('dd', {}, record.clinic),
        tag('dt', {}, '患者'), tag('dd', {}, `${record.patient}（${record.patientCode}）`),
        tag('dt', {}, '目标色号'), tag('dd', {}, tag('span', { class: 'tag primary' }, record.targetShade)),
        tag('dt', {}, '牙位数'), tag('dd', {}, `${record.design.teeth.length} 单位`))))

  page.append(toolbar, header, ...sheets)
  return page
}

function firingCard(title: string, desc: string): HTMLElement {
  return tag('div', { style: 'padding:var(--sp-4);border:1px solid var(--border);border-radius:var(--radius);' },
    tag('strong', { style: 'display:block;margin-bottom:var(--sp-2)' }, title),
    tag('p', { class: 'muted', style: 'font-size:13px' }, desc))
}

function noCase(): HTMLElement {
  return tag('div', { class: 'empty-state' },
    tag('div', { class: 'icon-wrap' }, tag('span', { html: iconHtml('cases') })),
    tag('h3', {}, '请先选择病例'),
    tag('button', { class: 'primary', style: 'margin-top:var(--sp-4)', onclick: () => (location.hash = '#/cases') }, '去病例列表'))
}
