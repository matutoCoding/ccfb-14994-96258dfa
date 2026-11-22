// 叠层 KM 三维 LUT 构建（基于数值稳定的 Rb/T 归一化形式）
// 轴：牙本质厚度 / 切端+效果厚度 / 透明厚度，每轴 LUT_SIZE 档
// 每点输出黑底反射 Rb、漫透射 T（各 41 波段），打包为 RGBA32F 3D 纹理
import type { KMLayerDataLike } from '../types'
import { LUT_SIZE } from '../types'
import { N } from '../core/spectrum'
import { stackRT, type LayerRT } from '../core/optical'

export interface StackLayers {
  dentin: KMLayerDataLike
  enamel: KMLayerDataLike
  transparent: KMLayerDataLike
  effect: KMLayerDataLike
  // 效果层折入切端轴的比例（0~1）
  effectRatio: number
}

export interface OpticalLUT {
  size: number
  maxThickness: [number, number, number]
  // 每个 RGBA 纹理存 4 个波段，共 ceil(N/4) 个，每个 size^3 体素
  reflect: Float32Array[]
  transmit: Float32Array[]
  textureCount: number
}

export const MAX_DENTIN = 1.8
export const MAX_ENAMEL = 1.6
export const MAX_TRANSP = 0.8
export const QUARTERS = Math.ceil(N / 4)

// 单层 (Rb,T) 缓存，按厚度档复用，把构建量压到 O(size²)
function buildRTCache(layer: KMLayerDataLike, max: number, size: number): LayerRT[] {
  const cache: LayerRT[] = []
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * max
    cache.push(stackRT([{ data: layer, thickness: x }]))
  }
  return cache
}

function compose(a: LayerRT, b: LayerRT): LayerRT {
  const Rb = new Float64Array(N)
  const T = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const denom = 1 - a.Rb[i] * b.Rb[i]
    Rb[i] = Math.min(0.999, a.Rb[i] + (a.T[i] * a.T[i] * b.Rb[i]) / denom)
    T[i] = Math.min(0.9999, Math.max(1e-6, (a.T[i] * b.T[i]) / denom))
  }
  return { Rb, T }
}

export function buildOpticalLUT(layers: StackLayers): OpticalLUT {
  const size = LUT_SIZE
  const voxels = size * size * size
  const reflect: Float32Array[] = []
  const transmit: Float32Array[] = []
  for (let q = 0; q < QUARTERS; q++) {
    reflect.push(new Float32Array(voxels * 4))
    transmit.push(new Float32Array(voxels * 4))
  }

  const dentinCache = buildRTCache(layers.dentin, MAX_DENTIN, size)
  const enamelCache = buildRTCache(layers.enamel, MAX_ENAMEL, size)
  const effectCache = buildRTCache(layers.effect, MAX_ENAMEL, size)
  const transpCache = buildRTCache(layers.transparent, MAX_TRANSP, size)

  for (let id = 0; id < size; id++) {
    const dm = dentinCache[id]
    for (let ie = 0; ie < size; ie++) {
      let em = compose(enamelCache[ie], dm)
      const effIdx = Math.round(ie * layers.effectRatio)
      if (effIdx > 0) em = compose(effectCache[effIdx], em)
      for (let it = 0; it < size; it++) {
        const rt = compose(transpCache[it], em)
        const voxel = id * size * size + ie * size + it
        for (let w = 0; w < N; w++) {
          const q = Math.floor(w / 4)
          const comp = w % 4
          const idx = voxel * 4 + comp
          reflect[q][idx] = rt.Rb[w]
          transmit[q][idx] = rt.T[w]
        }
      }
    }
  }
  return { size, maxThickness: [MAX_DENTIN, MAX_ENAMEL, MAX_TRANSP], reflect, transmit, textureCount: QUARTERS }
}
