// 全局领域类型定义

// 瓷层类型：牙本质瓷 / 切端瓷 / 透明瓷 / 效果瓷
export type LayerType = 'dentin' | 'enamel' | 'transparent' | 'effect'

export const LAYER_TYPES: LayerType[] = ['dentin', 'enamel', 'transparent', 'effect']

export const LAYER_LABEL: Record<LayerType, string> = {
  dentin: '牙本质瓷',
  enamel: '切端瓷',
  transparent: '透明瓷',
  effect: '效果瓷'
}

// 内冠材质
export type CoreKind = 'zirconia' | 'metal'

// 光谱参数：在 41 个波段上用少量基函数展开，保证瓷粉库体积小且平滑
export interface SpectralParams {
  base: number
  slope: number
  warm: number
  blue: number
  scatter: number
}

// 瓷粉品牌色号
export interface Porcelain {
  id: string
  brand: string
  code: string
  name: string
  layer: LayerType
  // Kubelka-Munk 吸收/散射基函数参数
  k: SpectralParams
  s: SpectralParams
  // 烧结收缩率（百分比，如 18 表示 18%）
  shrinkPct: number
  note?: string
}

// 剖面分区：颈 / 中 / 切，厚度单位 mm
export type ZoneName = 'cervical' | 'middle' | 'incisal'

export const ZONES: ZoneName[] = ['cervical', 'middle', 'incisal']

export const ZONE_LABEL: Record<ZoneName, string> = {
  cervical: '颈部',
  middle: '中部',
  incisal: '切端'
}

// 某一层在三个分区的厚度设计
export interface LayerZone {
  layer: LayerType
  porcelainId: string
  thickness: Record<ZoneName, number>
  opacity: Record<ZoneName, number>
}

// 牙位上的单颗冠设计
export interface ToothDesign {
  fdi: number
  core: CoreKind
  // 内冠厚度 mm，沿颈到切渐变
  coreThickness: Record<ZoneName, number>
  coreShade?: string
  layers: LayerZone[]
}

// FDI 邻牙 / 对颌比色记录
export interface NeighborColor {
  fdi: number
  arch: 'upper' | 'lower'
  relation: 'neighbor' | 'opposite'
  shadeCode: string
  lab: [number, number, number]
}

export interface DesignDoc {
  teeth: ToothDesign[]
  neighbors: NeighborColor[]
}

// 病例
export interface CaseRecord {
  id: string
  clinic: string
  patient: string
  patientCode: string
  createdAt: number
  updatedAt: number
  targetShade: string
  design: DesignDoc
  stlData?: string
  stlFileName?: string
  stlUnit?: 'mm' | 'cm' | 'inch'
  note?: string
  // 最近一次反算方案
  lastPlan?: InversePlan
}

// 比色板色号
export interface ShadeTab {
  code: string
  guide: string
  lab: [number, number, number]
}

// 反算厚度方案
export interface InversePlan {
  targetCode: string
  generatedAt: number
  options: PlanOption[]
}

export interface PlanOption {
  name: string
  description: string
  thickness: Record<LayerType, Record<ZoneName, number>>
  predictedDe: number
  metamerismIndex: number
}

// 光源
export type IlluminantId = 'd65' | 'd50' | 'clinic' | 'flash'

export interface Illuminant {
  id: IlluminantId
  name: string
  spd: number[]
}

// 渲染模式
export type RenderMode = 'color' | 'lab' | 'de2000' | 'core-thickness'

// 渲染参数
export interface RenderParams {
  illuminant: IlluminantId
  // 口腔暗背景强度 0~1，越小越暗
  mouthDark: number
  // 切端乳光强度
  opalescence: number
  mode: RenderMode
  // de2000 模式下的目标色号
  targetShade?: string
  // 环境光强度
  ambient: number
  exposure: number
}

// Kubelka-Munk 层数据：单位厚度吸收 K 与散射 S（每 mm，41 波段）
export interface KMLayerDataLike {
  porcelainId: string
  K: number[]
  S: number[]
  shrinkPct: number
}

// 牙冠类型：切牙 / 尖牙 / 前磨牙 / 磨牙
export type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar'

// 网格数据（毫米单位）
export interface MeshData {
  positions: Float32Array
  indices: Uint32Array
  normals: Float32Array
}

// 带颈-切参数 t 的牙冠网格
export interface CrownMesh extends MeshData {
  tAttr: Float32Array
}

// LUT 网格尺寸
export const LUT_SIZE = 32
export const SPECTRAL_BINS = 41
export const WL_START = 380
export const WL_STEP = 10
