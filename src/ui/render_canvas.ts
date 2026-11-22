// 共享 3D 渲染画布：RAF 循环，状态变化自动重绘
import { tag } from './dom'
import { CrownRenderer } from '../render/renderer'
import { store } from '../state/store'
import { RenderSession, targetLab } from '../state/view_service'
import type { CrownMesh } from '../core/crown_mesh'
import type { CaseRecord } from '../types'

export interface CanvasHandle {
  el: HTMLElement
  renderer: CrownRenderer
  session: RenderSession
  setMesh: (mesh: CrownMesh) => void
  refresh: () => void
}

export function createRenderCanvas(session: RenderSession): CanvasHandle {
  const canvas = tag('canvas', { style: 'width:100%;height:100%;display:block;border-radius:var(--radius);' }) as HTMLCanvasElement
  const wrap = tag('div', { style: 'position:relative;width:100%;height:100%;min-height:420px;background:var(--slate-900);border-radius:var(--radius);overflow:hidden;' }, canvas)
  let renderer: CrownRenderer | null = null
  let mesh: CrownMesh | null = null
  let lastLutSig = ''
  let lastCaseId = ''
  let raf = 0

  const init = (): void => {
    if (renderer) return
    try {
      renderer = new CrownRenderer(canvas)
    } catch (e) {
      wrap.replaceChildren(tag('div', { class: 'empty-state', style: 'margin:var(--sp-6)' },
        tag('h3', {}, 'WebGL2 不可用'), tag('p', {}, (e as Error).message)))
      return
    }
    if (mesh) renderer.setMesh(mesh)
    const ro = new ResizeObserver(() => renderer?.resize())
    ro.observe(canvas)
    loop()
  }

  const loop = (): void => {
    raf = requestAnimationFrame(loop)
    if (!renderer) return
    const state = store.state
    const record = store.currentCase
    const tooth = store.currentTooth
    if (!record || !tooth) return
    try {
      const sig = tooth.layers.map((l) => l.porcelainId).join('|') + `:${tooth.fdi}`
      if (sig !== lastLutSig) {
        const lut = session.ensureLUT(tooth, state.porcelains)
        renderer.setOpticalLUT(lut)
        lastLutSig = sig
      }
      const profile = session.profileUniform(tooth)
      const target = targetLab(state.render.targetShade ?? record.targetShade)
      renderer.render(state.render, profile, target)
    } catch (e) {
      console.error(e)
    }
  }

  // 等画布挂载后再初始化 GL 上下文
  requestAnimationFrame(init)

  return {
    el: wrap,
    get renderer(): CrownRenderer {
      if (!renderer) throw new Error('渲染器尚未初始化')
      return renderer
    },
    session,
    setMesh(m: CrownMesh): void {
      mesh = m
      renderer?.setMesh(m)
    },
    refresh(): void {
      if (renderer) renderer.needsRender = true
    }
  }
}

// 按病例牙位生成或复用程序化网格
import { buildBridge, buildCrown, type CrownMesh as Mesh } from '../core/crown_mesh'
import { toothInfo } from '../core/fdi'

export function meshForCase(record: CaseRecord): Mesh {
  const teeth = record.design.teeth
  if (teeth.length === 1) {
    return buildCrown(toothInfo(teeth[0].fdi).cls)
  }
  return buildBridge(teeth.map((t) => ({ cls: toothInfo(t.fdi).cls, gap: 7.4 })))
}
