// 瓷粉库管理：品牌/色号/吸收散射基函数参数/烧结收缩率
import { tag, toast } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import { LAYER_LABEL, type LayerType, type Porcelain, type SpectralParams } from '../types'
import { LAYER_TYPES } from '../types'

export function renderLibraryPage(): HTMLElement {
  const page = tag('div', { class: 'stack' })
  page.append(tag('div', { class: 'page-header' },
    tag('div', {}, tag('h1', {}, '瓷粉库'), tag('p', { class: 'muted' }, '吸收 K / 散射 S 基函数参数决定 KM 光学行为，修改后所有病例实时生效')),
    tag('button', { class: 'primary', onclick: () => openEditor() }, tag('span', { html: iconHtml('plus') }), '新增瓷粉')))

  const groups = LAYER_TYPES.map((layer) => {
    const list = store.state.porcelains.filter((p) => p.layer === layer)
    return tag('div', { class: 'card', style: 'padding:0;overflow:hidden;' },
      tag('div', { class: 'section-title', style: 'padding:var(--sp-4) var(--sp-5) 0;' }, tag('strong', {}, LAYER_LABEL[layer]), tag('span', { class: 'tag' }, `${list.length} 种`)),
      tag('table', {},
        tag('thead', {}, tag('tr', {}, tag('th', {}, '品牌 / 色号'), tag('th', {}, '名称'), tag('th', {}, 'K 基函数'), tag('th', {}, 'S 基函数'), tag('th', {}, '收缩率'), tag('th', {}, '操作'))),
        tag('tbody', {}, ...list.map((p) => tag('tr', {},
          tag('td', {}, tag('strong', {}, p.code), tag('br'), tag('span', { class: 'muted' }, p.brand)),
          tag('td', {}, p.name),
          tag('td', { class: 'lab-value' }, fmtParams(p.k)),
          tag('td', { class: 'lab-value' }, fmtParams(p.s)),
          tag('td', { class: 'mono' }, `${p.shrinkPct}%`),
          tag('td', {}, tag('div', { class: 'row' },
            tag('button', { class: 'small', onclick: () => openEditor(p) }, tag('span', { html: iconHtml('edit') }), '编辑'),
            tag('button', { class: 'small danger', onclick: () => remove(p) }, tag('span', { html: iconHtml('trash') })))))))))
  })
  page.append(...groups)
  return page
}

function fmtParams(p: SpectralParams): string {
  return `${p.base.toFixed(2)} / ${p.slope.toFixed(2)} / ${p.warm.toFixed(2)} / ${p.blue.toFixed(2)} / ${p.scatter.toFixed(2)}`
}

async function remove(p: Porcelain): Promise<void> {
  if (!confirm(`删除瓷粉 ${p.brand} ${p.code}？引用它的病例需要重新选粉。`)) return
  await store.removePorcelain(p.id)
  toast('瓷粉已删除')
}

function openEditor(existing?: Porcelain): void {
  const editing: Porcelain = existing
    ? structuredClone(existing)
    : {
        id: 'p-' + Date.now().toString(36),
        brand: 'Vita VM9',
        code: 'NEW',
        name: '新瓷粉',
        layer: 'dentin',
        k: { base: 0.6, slope: 0.15, warm: 0.15, blue: 0.15, scatter: 0.05 },
        s: { base: 0.45, slope: 0.1, warm: 0, blue: 0, scatter: 0.2 },
        shrinkPct: 17
      }
  const layerSel = tag('select', {}, ...LAYER_TYPES.map((l) => tag('option', { value: l }, LAYER_LABEL[l]))) as HTMLSelectElement
  layerSel.value = editing.layer
  const brand = tag('input', { value: editing.brand }) as HTMLInputElement
  const code = tag('input', { value: editing.code }) as HTMLInputElement
  const name = tag('input', { value: editing.name }) as HTMLInputElement
  const shrink = tag('input', { type: 'number', min: '5', max: '35', step: '0.5', value: String(editing.shrinkPct) }) as HTMLInputElement

  const paramRows = (title: string, target: 'k' | 's'): HTMLElement => {
    const keys: (keyof SpectralParams)[] = ['base', 'slope', 'warm', 'blue', 'scatter']
    const labels: Record<keyof SpectralParams, string> = { base: '基线', slope: '长波倾斜', warm: '暖色吸收谷', blue: '蓝光吸收', scatter: '瑞利散射' }
    return tag('div', { class: 'full' }, tag('label', {}, title),
      tag('div', { class: 'row wrap' }, ...keys.map((key) => {
        const input = tag('input', { type: 'number', step: '0.01', min: '0', max: '2', value: String(editing[target][key]) }) as HTMLInputElement
        input.style.width = '96px'
        input.addEventListener('change', () => { editing[target][key] = Number(input.value) })
        return tag('div', {}, tag('label', { style: 'font-size:12px' }, labels[key]), input)
      })))
  }

  const dialog = tag('div', { class: 'modal-mask' })
  const card = tag('div', { class: 'card modal-card stack' },
    tag('h2', {}, existing ? '编辑瓷粉' : '新增瓷粉'),
    tag('div', { class: 'form-grid' },
      tag('div', {}, tag('label', {}, '品牌'), brand),
      tag('div', {}, tag('label', {}, '色号'), code),
      tag('div', { class: 'full' }, tag('label', {}, '名称'), name),
      tag('div', {}, tag('label', {}, '瓷层类型'), layerSel),
      tag('div', {}, tag('label', {}, '烧结收缩率 %'), shrink),
      paramRows('吸收 K 基函数', 'k'),
      paramRows('散射 S 基函数', 's')),
    tag('div', { class: 'row', style: 'justify-content:flex-end' },
      tag('button', { onclick: () => dialog.remove() }, '取消'),
      tag('button', {
        class: 'primary', onclick: async () => {
          editing.layer = layerSel.value as LayerType
          editing.brand = brand.value.trim()
          editing.code = code.value.trim()
          editing.name = name.value.trim()
          editing.shrinkPct = Number(shrink.value)
          if (!editing.brand || !editing.code) { toast('品牌和色号必填'); return }
          await store.upsertPorcelain(editing)
          dialog.remove()
          toast('瓷粉参数已保存')
        }
      }, '保存')))
  dialog.append(card)
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove() })
  document.body.append(dialog)
}
