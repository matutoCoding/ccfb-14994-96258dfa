// 反算推荐：目标色号 -> 各分区各层厚度方案
// 坐标下降 + 多起点，输出保守 / 均衡 / 通透三套方案及预测色差、异谱指数
import type { InversePlan, KMLayerDataLike, LayerType, PlanOption, ShadeTab, ZoneName } from '../types'
import { ZONES, LAYER_TYPES } from '../types'
import { deltaE2000, getIlluminant, reflectanceToLab } from './spectrum'
import { stackReflectance } from './optical'
import { fitShadeSpectrum, metamerismIndex } from './color_fit'

interface SolverLayer {
  type: LayerType
  data: KMLayerDataLike
  thickness: Record<ZoneName, number>
}

interface SolverInput {
  target: ShadeTab
  layers: SolverLayer[]
  substrate: number[]
  // 各分区总瓷层可用厚度上限（mm）
  budget: Record<ZoneName, number>
}

// 厚度上下限
const LIMITS: Record<LayerType, [number, number]> = {
  dentin: [0.3, 1.6],
  enamel: [0.2, 1.2],
  transparent: [0.0, 0.6],
  effect: [0.0, 0.4]
}

function zoneReflectance(input: SolverInput, zone: ZoneName): number[] {
  const ordered: LayerType[] = ['transparent', 'enamel', 'effect', 'dentin']
  const stack = ordered
    .map((type) => input.layers.find((l) => l.type === type))
    .filter((l): l is SolverLayer => !!l)
    .map((l) => ({ data: l.data, thickness: l.thickness[zone] }))
  return stackReflectance(stack, input.substrate)
}

// 目标色差（颈中切加权，中部权重最大）
const ZONE_WEIGHT: Record<ZoneName, number> = { cervical: 0.25, middle: 0.45, incisal: 0.3 }

function objective(input: SolverInput, targetLab: [number, number, number]): number {
  let sum = 0
  for (const zone of ZONES) {
    const refl = zoneReflectance(input, zone)
    const lab = reflectanceToLab(refl, getIlluminant('d65').spd)
    sum += ZONE_WEIGHT[zone] * deltaE2000(lab, targetLab)
  }
  return sum
}

function clampThickness(type: LayerType, v: number): number {
  const [lo, hi] = LIMITS[type]
  return Math.min(hi, Math.max(lo, v))
}

// 坐标下降：逐变量扫描，每次取区间内最优点
function coordinateDescent(input: SolverInput, targetLab: [number, number, number], rounds = 3): number {
  const steps = [0.2, 0.1, 0.05]
  let best = objective(input, targetLab)
  for (let r = 0; r < rounds; r++) {
    const step = steps[Math.min(r, steps.length - 1)]
    for (const layer of input.layers) {
      for (const zone of ZONES) {
        const origin = layer.thickness[zone]
        for (const cand of [origin - step * 2, origin - step, origin + step, origin + step * 2]) {
          const v = clampThickness(layer.type, cand)
          // 分区总厚度预算约束
          const total = input.layers.reduce((s, l) => s + (l === layer ? v : l.thickness[zone]), 0)
          if (total > input.budget[zone]) continue
          layer.thickness[zone] = v
          const score = objective(input, targetLab)
          if (score < best) best = score
          else layer.thickness[zone] = origin
        }
      }
    }
  }
  return best
}

function snapshot(input: SolverInput): Record<LayerType, Record<ZoneName, number>> {
  const out = {} as Record<LayerType, Record<ZoneName, number>>
  for (const type of LAYER_TYPES) {
    const l = input.layers.find((x) => x.type === type)
    out[type] = { ...(l?.thickness ?? { cervical: 0, middle: 0, incisal: 0 }) }
  }
  return out
}

export interface InverseContext {
  layers: { type: LayerType; data: KMLayerDataLike }[]
  substrate: number[]
  budget: Record<ZoneName, number>
}

export function runInverse(target: ShadeTab, ctx: InverseContext): InversePlan {
  const fitted = fitShadeSpectrum(target)
  // 三套初始策略
  const presets: Record<string, Partial<Record<LayerType, Record<ZoneName, number>>>> = {
    conservative: {
      // 遮色保守：牙本质厚、透明薄，适合深色内冠
      dentin: { cervical: 1.2, middle: 1.0, incisal: 0.6 },
      enamel: { cervical: 0.3, middle: 0.5, incisal: 0.9 },
      transparent: { cervical: 0, middle: 0.1, incisal: 0.3 },
      effect: { cervical: 0.1, middle: 0.1, incisal: 0.2 }
    },
    balanced: {
      dentin: { cervical: 0.9, middle: 0.75, incisal: 0.45 },
      enamel: { cervical: 0.35, middle: 0.55, incisal: 0.85 },
      transparent: { cervical: 0.05, middle: 0.2, incisal: 0.4 },
      effect: { cervical: 0.05, middle: 0.1, incisal: 0.2 }
    },
    translucent: {
      // 通透优先：牙本质薄、透明层厚，切端乳光强
      dentin: { cervical: 0.7, middle: 0.55, incisal: 0.3 },
      enamel: { cervical: 0.4, middle: 0.6, incisal: 1.0 },
      transparent: { cervical: 0.1, middle: 0.3, incisal: 0.55 },
      effect: { cervical: 0.05, middle: 0.15, incisal: 0.3 }
    }
  }
  const meta: Record<string, { name: string; description: string }> = {
    conservative: { name: '遮色保守型', description: '牙本质层加厚，压制金属/深色内冠底色，返工风险最低' },
    balanced: { name: '均衡标准型', description: '厚度与通透度平衡，常规病例首选' },
    translucent: { name: '通透美学型', description: '切端透明层加厚，层次感强，适合氧化锆亮底前牙' }
  }

  const options: PlanOption[] = []
  for (const key of Object.keys(presets)) {
    const layers: SolverLayer[] = ctx.layers.map((l) => ({
      type: l.type,
      data: l.data,
      thickness: {
        cervical: presets[key][l.type]?.cervical ?? 0.2,
        middle: presets[key][l.type]?.middle ?? 0.2,
        incisal: presets[key][l.type]?.incisal ?? 0.2
      }
    }))
    const input: SolverInput = { target, layers, substrate: ctx.substrate, budget: ctx.budget }
    const de = coordinateDescent(input, target.lab)
    const midRefl = zoneReflectance(input, 'middle')
    options.push({
      name: meta[key].name,
      description: meta[key].description,
      thickness: snapshot(input),
      predictedDe: Math.round(de * 100) / 100,
      metamerismIndex: Math.round(metamerismIndex(midRefl) * 100) / 100
    })
  }
  options.sort((a, b) => a.predictedDe - b.predictedDe)
  return {
    targetCode: target.code,
    generatedAt: Date.now(),
    options
  }
}

export { fitShadeSpectrum }
