// 病例列表页：按诊所/患者管理，新建病例，FDI 牙位
import { tag, toast } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import type { CaseRecord, LayerType, LayerZone, ZoneName } from '../types'
import { LAYER_TYPES } from '../types'
import { fdiList, toothInfo } from '../core/fdi'
import { ALL_SHADES } from '../core/materials_data'

function defaultLayers(): LayerZone[] {
  const porcelain: Record<LayerType, string> = {
    dentin: 'vt-d-A2', enamel: 'vt-e-T1', transparent: 'vt-c-cl', effect: 'vt-f-op'
  }
  const profile: Record<LayerType, Record<ZoneName, number>> = {
    dentin: { cervical: 0.55, middle: 0.45, incisal: 0.3 },
    enamel: { cervical: 0.35, middle: 0.55, incisal: 0.9 },
    transparent: { cervical: 0.05, middle: 0.2, incisal: 0.4 },
    effect: { cervical: 0.05, middle: 0.1, incisal: 0.25 }
  }
  return LAYER_TYPES.map((layer) => ({
    layer,
    porcelainId: porcelain[layer],
    thickness: { ...profile[layer] },
    opacity: { cervical: 0.9, middle: 0.85, incisal: 0.7 }
  }))
}

function newCaseId(): string {
  return 'c-' + Date.now().toString(36) + Math.floor(performance.now() % 1000)
}

export function renderCasesPage(): HTMLElement {
  const state = store.state
  const page = tag('div', { class: 'stack' })

  const header = tag('div', { class: 'page-header' },
    tag('div', {}, tag('h1', {}, '病例列表'), tag('p', { class: 'muted' }, `共 ${state.cases.length} 个病例，按最近更新排序`)),
    tag('button', { class: 'primary', onclick: () => openCreator() }, tag('span', { html: iconHtml('plus') }), '新建病例')
  )
  page.append(header)

  if (state.cases.length === 0) {
    page.append(tag('div', { class: 'empty-state' },
      tag('div', { class: 'icon-wrap' }, tag('span', { html: iconHtml('cases') })),
      tag('h3', {}, '还没有病例'), tag('p', {}, '新建第一个病例，或检查浏览器本地存储权限')))
    return page
  }

  const table = tag('table', {},
    tag('thead', {}, tag('tr', {},
      tag('th', {}, '诊所 / 患者'), tag('th', {}, '牙位'), tag('th', {}, '内冠'),
      tag('th', {}, '目标色号'), tag('th', {}, '邻牙/对颌'), tag('th', {}, '更新时间'), tag('th', {}, '操作'))),
    tag('tbody', {}, ...state.cases.map((c) => {
      const info = c.design.teeth.map((t) => toothInfo(t.fdi).label).join('、')
      return tag('tr', {},
        tag('td', {}, tag('strong', {}, `${c.patient} `), tag('span', { class: 'muted' }, c.patientCode), tag('br'), tag('span', { class: 'muted' }, c.clinic)),
        tag('td', { class: 'mono' }, info),
        tag('td', {}, tag('span', { class: `tag ${c.design.teeth.some((t) => t.core === 'metal') ? 'danger' : 'primary'}` },
          c.design.teeth.some((t) => t.core === 'metal') ? '金属' : '氧化锆')),
        tag('td', {}, tag('span', { class: 'tag' }, c.targetShade)),
        tag('td', { class: 'muted' }, `${c.design.neighbors.length} 条比色`),
        tag('td', { class: 'muted mono' }, new Date(c.updatedAt).toLocaleString('zh-CN', { hour12: false })),
        tag('td', {}, tag('div', { class: 'row' },
          tag('button', { class: 'small', onclick: () => { store.selectCase(c.id); location.hash = '#/model' } }, '打开'),
          tag('button', { class: 'small danger', onclick: () => removeCase(c) }, tag('span', { html: iconHtml('trash') }), '删除')))
      )
    })))
  page.append(tag('div', { class: 'card', style: 'padding:0;overflow:hidden' }, table))
  return page
}

async function removeCase(c: CaseRecord): Promise<void> {
  if (!confirm(`确认删除病例「${c.patient}」？该操作不可恢复。`)) return
  await store.removeCase(c.id)
  toast('病例已删除')
  location.hash = '#/cases'
}

function openCreator(): void {
  const dialog = tag('div', { class: 'modal-mask' })
  const clinic = tag('input', { placeholder: '例如：微笑口腔诊所', value: '' }) as HTMLInputElement
  const patient = tag('input', { placeholder: '患者姓名' }) as HTMLInputElement
  const code = tag('input', { placeholder: '病历号，如 P-2026-010' }) as HTMLInputElement
  const shade = tag('select', {}, ...ALL_SHADES.map((s) => tag('option', { value: s.code }, `${s.code} (${s.guide})`))) as HTMLSelectElement
  const fdi = tag('select', {}, ...fdiList().map((n) => tag('option', { value: String(n) }, toothInfo(n).label))) as HTMLSelectElement
  fdi.value = '21'
  const core = tag('select', {}, tag('option', { value: 'zirconia' }, '氧化锆'), tag('option', { value: 'metal' }, '金属')) as HTMLSelectElement
  const note = tag('textarea', { rows: '3', placeholder: '临床备注（可选）' }) as HTMLTextAreaElement

  const form = tag('div', { class: 'card modal-card' },
    tag('h2', { style: 'margin-bottom:var(--sp-4)' }, '新建病例'),
    tag('div', { class: 'form-grid' },
      field('诊所名称', clinic), field('患者姓名', patient), field('病历号', code),
      field('目标比色', shade), field('FDI 牙位', fdi), field('内冠材质', core),
      tag('div', { class: 'full' }, field('备注', note))),
    tag('div', { class: 'row', style: 'margin-top:var(--sp-5);justify-content:flex-end' },
      tag('button', { onclick: () => dialog.remove() }, '取消'),
      tag('button', {
        class: 'primary', onclick: async () => {
          if (!clinic.value.trim() || !patient.value.trim()) {
            toast('诊所和患者姓名必填')
            return
          }
          const fdiNum = Number(fdi.value)
          const record: CaseRecord = {
            id: newCaseId(),
            clinic: clinic.value.trim(),
            patient: patient.value.trim(),
            patientCode: code.value.trim() || 'P-' + Date.now().toString().slice(-6),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            targetShade: shade.value,
            note: note.value.trim(),
            design: {
              teeth: [{
                fdi: fdiNum,
                core: core.value as 'zirconia' | 'metal',
                coreThickness: { cervical: 0.6, middle: 0.5, incisal: 0.4 },
                layers: defaultLayers()
              }],
              neighbors: []
            }
          }
          await store.saveCase(record)
          dialog.remove()
          toast('病例已创建')
          store.selectCase(record.id)
          location.hash = '#/model'
        }
      }, '创建病例'))
  )
  dialog.append(form)
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove() })
  document.body.append(dialog)
}

function field(label: string, input: HTMLElement): HTMLElement {
  return tag('div', {}, tag('label', {}, label), input)
}
