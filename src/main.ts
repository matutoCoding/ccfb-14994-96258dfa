// 应用入口：hash 路由 + 状态初始化
import './styles.css'
import { store } from './state/store'
import { renderApp, type Route } from './ui/router'

const ROUTES: Route[] = ['cases', 'model', 'layers', 'shade', 'light', 'sheet', 'library']

function currentRoute(): Route {
  const hash = location.hash.replace('#/', '') as Route
  return ROUTES.includes(hash) ? hash : 'cases'
}

async function bootstrap(): Promise<void> {
  await store.init()
  renderApp(currentRoute())
  window.addEventListener('hashchange', () => renderApp(currentRoute()))
  if (!location.hash) location.hash = '#/cases'
}

bootstrap().catch((err) => {
  document.querySelector('#app')!.innerHTML =
    `<div style="padding:48px;font-family:sans-serif;color:#b91c1c;"><h2>启动失败</h2><p>${(err as Error).message}</p></div>`
  console.error(err)
})
