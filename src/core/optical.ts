// Kubelka-Munk 双层通量模型（数值稳定归一化形式，经 RK 积分逐点验证）
// 单层输出黑底反射 Rb 与漫透射 T，多层用无限反射级数递推合成
import type { KMLayerDataLike, Porcelain } from '../types'
import { expandSpectrum, N } from './spectrum'

export interface KMLayerData extends KMLayerDataLike {}

export function buildLayerData(p: Porcelain): KMLayerData {
  const kRaw = expandSpectrum(p.k)
  const sRaw = expandSpectrum(p.s)
  // 标定后物理量级（每 mm）：K 0.02~1.5 指数型短波吸收，S 0.1~1.0 低散射
  // 基函数输出直接作为物理系数，仅加极小正底避免除零
  const K = kRaw.map((v) => Math.max(0.01, v))
  const S = sRaw.map((v) => Math.max(0.05, v))
  return { porcelainId: p.id, K, S, shrinkPct: p.shrinkPct }
}

// 单层 (Rb, T)，Wyszecki 稳定形式：
// a = 1 + K/S，b = sqrt(a²-1)，arg = b·S·X
// Rb = sinh(arg) / (a·sinh(arg) + b·cosh(arg))
// T  = b / (a·sinh(arg) + b·cosh(arg))
export interface LayerRT {
  Rb: Float64Array
  T: Float64Array
}

function layerRT(layer: KMLayerData, x: number): LayerRT {
  const Rb = new Float64Array(N)
  const T = new Float64Array(N)
  if (x <= 1e-5) return { Rb, T: new Float64Array(N).fill(1) }
  for (let i = 0; i < N; i++) {
    const K = layer.K[i]
    const S = layer.S[i]
    const a = 1 + K / S
    const b = Math.sqrt(Math.max(1e-8, a * a - 1))
    const arg = b * S * x
    // 厚层用指数形式防溢出
    const ep = Math.exp(arg)
    const em = 1 / ep
    const sinh = (ep - em) / 2
    const cosh = (ep + em) / 2
    const denom = a * sinh + b * cosh
    Rb[i] = Math.min(0.999, sinh / denom)
    T[i] = Math.min(0.9999, Math.max(1e-6, b / denom))
  }
  return { Rb, T }
}

// 两层无限反射级数合成：
// R12 = R1 + T1²R2 / (1 - R1R2)
// T12 = T1T2 / (1 - R1R2)
function composeRT(acc: LayerRT, next: LayerRT): LayerRT {
  const Rb = new Float64Array(N)
  const T = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const denom = 1 - acc.Rb[i] * next.Rb[i]
    Rb[i] = Math.min(0.999, acc.Rb[i] + (acc.T[i] * acc.T[i] * next.Rb[i]) / denom)
    T[i] = Math.min(0.9999, Math.max(1e-6, (acc.T[i] * next.T[i]) / denom))
  }
  return { Rb, T }
}

// 叠层顺序：入射侧先传的层放前面（透明瓷 -> 切端瓷 -> 效果瓷 -> 牙本质瓷）
export function stackRT(layers: { data: KMLayerData; thickness: number }[]): LayerRT {
  let acc: LayerRT | null = null
  for (const l of layers) {
    const rt = layerRT(l.data, l.thickness)
    acc = acc ? composeRT(acc, rt) : rt
  }
  return acc ?? { Rb: new Float64Array(N), T: new Float64Array(N).fill(1) }
}

// 叠层 + 基底反射率 Rg -> 总反射光谱
export function stackReflectance(
  layers: { data: KMLayerData; thickness: number }[],
  Rg: number[]
): number[] {
  const { Rb, T } = stackRT(layers)
  const R = new Array<number>(N)
  for (let i = 0; i < N; i++) {
    const r = Rb[i] + (T[i] * T[i] * Rg[i]) / (1 - Rb[i] * Rg[i])
    R[i] = Math.min(0.985, Math.max(0.0001, r))
  }
  return R
}

// 供 LUT 构建器使用的黑底反射与透射
export function blackReflectance(rt: LayerRT): number[] {
  return Array.from(rt.Rb, (v) => Math.min(0.98, Math.max(0.001, v)))
}

export function transmittance(rt: LayerRT): number[] {
  return Array.from(rt.T)
}
