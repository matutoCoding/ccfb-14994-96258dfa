// 应用全局状态与发布订阅
import type { CaseRecord, IlluminantId, Porcelain, RenderMode, RenderParams } from '../types'
import {
  bulkPutPorcelains, deleteCase as dbDeleteCase, deletePorcelain as dbDeletePorcelain,
  getAllCases, getAllPorcelains, saveCase as dbSaveCase, savePorcelain as dbSavePorcelain
} from './storage'
import { DEFAULT_PORCELAINS } from '../core/materials_data'
import { SEED_CASES } from './seed'

export interface AppState {
  cases: CaseRecord[]
  porcelains: Porcelain[]
  currentCaseId: string | null
  currentToothFdi: number | null
  render: RenderParams
  ready: boolean
}

type Listener = (state: AppState) => void

const defaultRender: RenderParams = {
  illuminant: 'd65',
  mouthDark: 0.55,
  opalescence: 0.8,
  mode: 'color',
  targetShade: 'A2',
  ambient: 0.22,
  exposure: 1.0
}

class Store {
  state: AppState = {
    cases: [],
    porcelains: [],
    currentCaseId: null,
    currentToothFdi: null,
    render: { ...defaultRender },
    ready: false
  }

  private listeners = new Set<Listener>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn(this.state))
  }

  // 局部更新，引用变化触发重渲染
  update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  updateRender(patch: Partial<RenderParams>): void {
    this.update({ render: { ...this.state.render, ...patch } })
  }

  async init(): Promise<void> {
    let porcelains = await getAllPorcelains()
    if (porcelains.length === 0) {
      await bulkPutPorcelains(DEFAULT_PORCELAINS)
      porcelains = [...DEFAULT_PORCELAINS]
    }
    let cases = await getAllCases()
    if (cases.length === 0) {
      for (const c of SEED_CASES) await dbSaveCase(c)
      cases = [...SEED_CASES]
    }
    const first = cases[0]
    this.update({
      cases,
      porcelains,
      ready: true,
      currentCaseId: first?.id ?? null,
      currentToothFdi: first?.design.teeth[0]?.fdi ?? null,
      render: { ...defaultRender, targetShade: first?.targetShade ?? 'A2' }
    })
  }

  async saveCase(record: CaseRecord): Promise<void> {
    await dbSaveCase(record)
    const cases = (await getAllCases())
    this.update({ cases, currentCaseId: record.id })
  }

  async removeCase(id: string): Promise<void> {
    await dbDeleteCase(id)
    const cases = this.state.cases.filter((c) => c.id !== id)
    const next = cases[0]
    this.update({
      cases,
      currentCaseId: next?.id ?? null,
      currentToothFdi: next?.design.teeth[0]?.fdi ?? null
    })
  }

  async upsertPorcelain(p: Porcelain): Promise<void> {
    await dbSavePorcelain(p)
    this.update({ porcelains: await getAllPorcelains() })
  }

  async removePorcelain(id: string): Promise<void> {
    await dbDeletePorcelain(id)
    this.update({ porcelains: await getAllPorcelains() })
  }

  selectCase(id: string): void {
    const c = this.state.cases.find((x) => x.id === id)
    this.update({
      currentCaseId: id,
      currentToothFdi: c?.design.teeth[0]?.fdi ?? null,
      render: { ...this.state.render, targetShade: c?.targetShade ?? this.state.render.targetShade }
    })
  }

  selectTooth(fdi: number): void {
    this.update({ currentToothFdi: fdi })
  }

  get currentCase(): CaseRecord | null {
    return this.state.cases.find((c) => c.id === this.state.currentCaseId) ?? null
  }

  get currentTooth() {
    const c = this.currentCase
    return c?.design.teeth.find((t) => t.fdi === this.state.currentToothFdi) ?? null
  }

  porcelainById(id: string): Porcelain | undefined {
    return this.state.porcelains.find((p) => p.id === id)
  }
}

export const store = new Store()

export function renderModeLabel(mode: RenderMode): string {
  return { color: '真彩色', lab: 'Lab 分量', de2000: 'ΔE2000 色差', 'core-thickness': '内冠厚度' }[mode]
}

export function illuminantLabel(id: IlluminantId): string {
  return { d65: '日光 D65', d50: 'D50 标准灯', clinic: '诊室 LED', flash: '手机闪光灯' }[id]
}
