// 页面路由与侧边导航
import { tag } from './dom'
import { iconHtml } from './icons'
import { store } from '../state/store'
import { renderCasesPage } from '../pages/cases_page'
import { renderModelPage } from '../pages/model_page'
import { renderLayersPage } from '../pages/layers_page'
import { renderShadePage } from '../pages/shade_page'
import { renderLightPage } from '../pages/light_page'
import { renderSheetPage } from '../pages/sheet_page'
import { renderLibraryPage } from '../pages/library_page'

export type Route = 'cases' | 'model' | 'layers' | 'shade' | 'light' | 'sheet' | 'library'

const NAV: { route: Route; label: string; icon: keyof typeof import('./icons')['icons'] }[] = [
  { route: 'cases', label: '病例列表', icon: 'cases' },
  { route: 'model', label: '牙冠模型', icon: 'crown' },
  { route: 'layers', label: '分层设计', icon: 'layers' },
  { route: 'shade', label: '比色对照', icon: 'shade' },
  { route: 'light', label: '光照预览', icon: 'light' },
  { route: 'sheet', label: '制作单', icon: 'doc' },
  { route: 'library', label: '瓷粉库', icon: 'chart' }
]

export function renderApp(route: Route): void {
  const app = document.querySelector('#app')!
  const nav = tag('nav', { class: 'app-nav', 'aria-label': '主导航' })
  for (const item of NAV) {
    const btn = tag('button', {
      class: `nav-item ${route === item.route ? 'active' : ''}`,
      onclick: () => location.hash = `#/${item.route}`
    }, tag('span', { html: iconHtml(item.icon) }), tag('span', {}, item.label))
    nav.append(btn)
  }
  const brand = tag('div', { class: 'nav-brand' },
    tag('span', { html: iconHtml('tooth'), class: 'brand-icon' }),
    tag('div', {}, tag('strong', {}, '堆瓷配色工作台'), tag('small', { class: 'muted' }, '全光谱 · WebGL2'))
  )
  const sidebar = tag('aside', { class: 'app-sidebar' }, brand, nav, tag('div', { class: 'spacer' }),
    tag('div', { class: 'nav-footer muted' }, '数据仅存本机浏览器'))

  const main = tag('main', { class: 'app-main' })
  const shell = tag('div', { class: 'app-shell' }, sidebar, main)
  app.replaceChildren(tag('header', { class: 'app-header' }, renderHeaderContext(), tag('div', { class: 'spacer' })), shell)

  const pages: Record<Route, () => HTMLElement> = {
    cases: renderCasesPage,
    model: renderModelPage,
    layers: renderLayersPage,
    shade: renderShadePage,
    light: renderLightPage,
    sheet: renderSheetPage,
    library: renderLibraryPage
  }
  main.replaceChildren(pages[route]())
}

function renderHeaderContext(): HTMLElement {
  const record = store.currentCase
  if (!record) {
    return tag('div', { class: 'header-context muted' }, '未选择病例')
  }
  return tag('div', { class: 'header-context' },
    tag('span', { class: 'tag primary' }, record.clinic),
    tag('strong', {}, `${record.patient} · ${record.patientCode}`),
    tag('span', { class: 'tag' }, `目标色号 ${record.targetShade}`),
    tag('span', { class: 'muted' }, `${record.design.teeth.length} 个牙位`)
  )
}
