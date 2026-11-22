// 牙冠模型页：STL 导入、内冠材质/厚度、厚度色图模式、多牙位切换
import { tag, toast } from '../ui/dom'
import { iconHtml } from '../ui/icons'
import { store } from '../state/store'
import { toothInfo } from '../core/fdi'
import { parseStl } from '../core/stl'
import { createRenderCanvas, meshForCase } from '../ui/render_canvas'
import { RenderSession } from '../state/view_service'
import type { CoreKind, CrownMesh, MeshData } from '../types'

const session = new RenderSession()

export function renderModelPage(): HTMLElement {
  const record = store.currentCase
  if (!record) return emptyCase()
  const page = tag('div', { class: 'stack' })
  const header = tag('div', { class: 'page-header' },
    tag('div', {},
      tag('h1', {}, '牙冠模型'),
      tag('p', { class: 'muted' }, '导入 STL 或使用程序化模型，内冠厚度在模型上以颜色呈现')),
    tag('div', { class: 'row' },
      tag('button', { onclick: () => store.updateRender({ mode: 'color' }) }, '真彩色'),
      tag('button', { class: 'primary', onclick: () => store.updateRender({ mode: 'core-thickness' }) }, '内冠厚度色图')))
  page.append(header)

  // 牙位切换
  const tabs = tag('div', { class: 'tooth-tabs' })
  for (const t of record.design.teeth) {
    const info = toothInfo(t.fdi)
    const btn = tag('button', {
      class: `tooth-tab ${store.state.currentToothFdi === t.fdi ? 'active' : ''}`,
      onclick: () => store.selectTooth(t.fdi)
    }, info.label, tag('span', { class: `tag ${t.core === 'metal' ? 'danger' : 'primary'}` }, t.core === 'metal' ? '金属' : '氧化锆'))
    tabs.append(btn)
  }

  const handle = createRenderCanvas(session)
  handle.setMesh(meshForCase(record))

  const tooth = store.currentTooth ?? record.design.teeth[0]
  const side = tag('div', { class: 'side-panel' },
    coreCard(),
    stlCard(record, handle),
    tag('div', { class: 'card' },
      tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('tooth') }), '牙位信息'),
      tag('dl', { class: 'kv' },
        tag('dt', {}, 'FDI 编号'), tag('dd', { class: 'mono' }, String(tooth.fdi)),
        tag('dt', {}, '牙位类型'), tag('dd', {}, toothInfo(tooth.fdi).label),
        tag('dt', {}, '颌位'), tag('dd', {}, toothInfo(tooth.fdi).arch === 'upper' ? '上颌' : '下颌'),
        tag('dt', {}, '冠单位'), tag('dd', {}, `${record.design.teeth.length} 单位`)))
  )

  page.append(tabs, tag('div', { class: 'grid-2' },
    tag('div', { class: 'card', style: 'padding:var(--sp-4);min-height:480px;display:flex;flex-direction:column;' },
      tag('div', { class: 'canvas-toolbar' }, tag('span', { class: 'muted' }, '拖拽旋转 · 滚轮缩放'),
        tag('div', { class: 'spacer' }), thicknessLegend()),
      tag('div', { style: 'flex:1;min-height:420px;' }, handle.el)),
    side))
  return page
}

function coreCard(): HTMLElement {
  const tooth = store.currentTooth
  if (!tooth) return tag('div', {})
  const card = tag('div', { class: 'card stack' })
  card.append(tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('crown') }), '内冠设置'))
  const coreSel = tag('select', {},
    tag('option', { value: 'zirconia' }, '氧化锆（高反射亮底）'),
    tag('option', { value: 'metal' }, '金属（深色暗底）')) as HTMLSelectElement
  coreSel.value = tooth.core
  coreSel.addEventListener('change', () => {
    tooth.core = coreSel.value as CoreKind
    persist()
  })
  card.append(tag('div', {}, tag('label', {}, '内冠材质'), coreSel))
  for (const zone of ['cervical', 'middle', 'incisal'] as const) {
    const label = { cervical: '颈部厚度', middle: '中部厚度', incisal: '切端厚度' }[zone]
    const val = tag('span', { class: 'mono muted' }, `${tooth.coreThickness[zone].toFixed(2)} mm`)
    const range = tag('input', { type: 'range', min: '0.2', max: '1.0', step: '0.05', value: String(tooth.coreThickness[zone]) }) as HTMLInputElement
    range.addEventListener('input', () => {
      tooth.coreThickness[zone] = Number(range.value)
      val.textContent = `${tooth.coreThickness[zone].toFixed(2)} mm`
    })
    range.addEventListener('change', persist)
    card.append(tag('div', {}, tag('label', {}, label), tag('div', { class: 'row' }, range, val)))
  }
  return card
}

function stlCard(record: { id: string; stlFileName?: string }, handle: { setMesh: (m: CrownMesh) => void }): HTMLElement {
  const fileInput = tag('input', { type: 'file', accept: '.stl', style: 'display:none' }) as HTMLInputElement
  const unitSel = tag('select', {},
    tag('option', { value: 'mm' }, '毫米 mm'),
    tag('option', { value: 'cm' }, '厘米 cm'),
    tag('option', { value: 'inch' }, '英寸 inch')) as HTMLSelectElement
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const mesh = parseStl(buf, unitSel.value as 'mm' | 'cm' | 'inch')
      const withT: CrownMesh = { ...mesh, tAttr: deriveT(mesh) }
      handle.setMesh(withT)
      const rec = store.currentCase
      if (rec) {
        rec.stlData = '' // STL 二进制不直接入库，保留文件名；需要持久化时由用户重新导入
        rec.stlFileName = file.name
        rec.stlUnit = unitSel.value as 'mm' | 'cm' | 'inch'
        await store.saveCase(rec)
      }
      toast(`STL 已加载：${file.name}`)
    } catch (e) {
      toast('STL 解析失败：' + (e as Error).message)
    }
  })
  return tag('div', { class: 'card stack' },
    tag('h3', { class: 'section-title' }, tag('span', { html: iconHtml('upload') }), 'STL 模型导入'),
    tag('p', { class: 'muted' }, record.stlFileName ? `当前文件：${record.stlFileName}` : '未导入外部 STL，当前为程序化牙冠'),
    tag('div', { class: 'row' }, tag('div', { style: 'flex:1' }, tag('label', {}, '文件单位'), unitSel),
      tag('button', { class: 'primary', style: 'align-self:flex-end', onclick: () => fileInput.click() }, tag('span', { html: iconHtml('upload') }), '选择 STL'),
      fileInput))
}

// 导入网格缺少 t 属性时，按包围盒 z 归一化生成颈-切参数
function deriveT(mesh: MeshData): Float32Array {
  const p = mesh.positions
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 2; i < p.length; i += 3) {
    minZ = Math.min(minZ, p[i])
    maxZ = Math.max(maxZ, p[i])
  }
  const span = maxZ - minZ || 1
  const out = new Float32Array(p.length / 3)
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (p[i * 3 + 2] - minZ) / span))
  return out
}

function thicknessLegend(): HTMLElement {
  return tag('div', { class: 'heat-legend' },
    tag('span', {}, '薄 0.2mm'),
    tag('span', { class: 'heat-bar' }),
    tag('span', {}, '厚 1.0mm'))
}

function emptyCase(): HTMLElement {
  return tag('div', { class: 'empty-state' },
    tag('div', { class: 'icon-wrap' }, tag('span', { html: iconHtml('cases') })),
    tag('h3', {}, '请先选择或新建病例'),
    tag('p', {}, '没有可用病例时无法进入模型页'),
    tag('button', { class: 'primary', style: 'margin-top:var(--sp-4)', onclick: () => (location.hash = '#/cases') }, '去病例列表'))
}

async function persist(): Promise<void> {
  const record = store.currentCase
  if (record) await store.saveCase(record)
}
