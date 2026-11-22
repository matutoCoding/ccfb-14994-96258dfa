// 瓷粉库与比色板初始数据
// K/S 参数为经 D65 标定的 Kubelka-Munk 基函数系数，默认叠层 ΔE2000 控制在 2 以内
import type { Porcelain, ShadeTab, SpectralParams } from '../types'

const sp = (base: number, slope: number, warm: number, blue: number, scatter: number): SpectralParams => ({
  base, slope, warm, blue, scatter
})

// 牙本质瓷：低散射 + 指数型短波吸收，色号越深 base 越低、slope 越大
// 标定工作点：dentin 厚 0.4~0.9mm，S≈0.28
function dentin(code: string, name: string, base: number, slope: number, warm = 0): Porcelain {
  return {
    id: `vt-d-${code}`,
    brand: 'Vita VM9',
    code,
    name: `牙本质瓷 ${code} ${name}`,
    layer: 'dentin',
    k: sp(base, slope, warm, 0.02, 0.02),
    s: sp(0.28, 0.04, 0, 0, 0.12),
    shrinkPct: 17
  }
}

// 切端瓷：低吸收、中等散射，瑞利项带来乳光蓝
function enamel(code: string, name: string, warm: number, scatter: number): Porcelain {
  return {
    id: `vt-e-${code}`,
    brand: 'Vita VM9',
    code,
    name: `切端瓷 ${code} ${name}`,
    layer: 'enamel',
    k: sp(0.12, 0.08, warm, 0.02, 0.02),
    s: sp(0.5, 0.04, 0, 0, scatter),
    shrinkPct: 18
  }
}

export const DEFAULT_PORCELAINS: Porcelain[] = [
  dentin('A1', '亮浅黄', 0.03, 0.62, 0),
  dentin('A2', '浅黄', 0.02, 0.87, 0),
  dentin('A3', '中黄', 0.02, 1.05),
  dentin('A3.5', '深黄', 0.015, 1.22),
  dentin('B1', '浅红黄', 0.04, 0.5),
  dentin('C2', '灰黄', 0.02, 0.95, 0.12),
  dentin('D3', '深红黄', 0.015, 1.1, 0.15),
  enamel('T1', '中性切端', 0.04, 0.3),
  enamel('T2', '暖色切端', 0.1, 0.24),
  enamel('T3', '灰色切端', 0.03, 0.4),
  {
    id: 'vt-c-cl',
    brand: 'Vita VM9',
    code: 'CL',
    name: '透明瓷 透明釉',
    layer: 'transparent',
    k: sp(0.04, 0.03, 0.01, 0, 0),
    s: sp(0.3, 0.02, 0, 0, 0.1),
    shrinkPct: 16
  },
  {
    id: 'vt-c-wi',
    brand: 'Vita VM9',
    code: 'WI',
    name: '透明瓷 窗口料',
    layer: 'transparent',
    k: sp(0.03, 0.02, 0.01, 0, 0),
    s: sp(0.22, 0.01, 0, 0, 0.14),
    shrinkPct: 16
  },
  {
    id: 'vt-f-op',
    brand: 'Vita VM9',
    code: 'OP',
    name: '效果瓷 乳光蓝',
    layer: 'effect',
    k: sp(0.15, 0.1, 0.18, 0, 0),
    s: sp(0.7, 0.04, 0, 0, 0.45),
    shrinkPct: 18
  },
  {
    id: 'vt-f-ne',
    brand: 'Vita VM9',
    code: 'NE',
    name: '效果瓷 颈部橙',
    layer: 'effect',
    k: sp(0.08, 0.3, 0.05, 0.2, 0.02),
    s: sp(0.55, 0.06, 0, 0, 0.12),
    shrinkPct: 17
  },
  {
    id: 'vt-f-wh',
    brand: 'Vita VM9',
    code: 'WH',
    name: '效果瓷 美白白',
    layer: 'effect',
    k: sp(0.05, 0.05, 0.02, 0.02, 0),
    s: sp(0.8, 0.05, 0, 0, 0.18),
    shrinkPct: 17
  }
]

// VITA Classical 16 色比色板参考 Lab（D65，行业常用测量均值）
export const VITA_CLASSICAL: ShadeTab[] = [
  { code: 'A1', guide: 'VITA Classical', lab: [80.4, -1.7, 15.4] },
  { code: 'A2', guide: 'VITA Classical', lab: [77.8, 1.2, 17.6] },
  { code: 'A3', guide: 'VITA Classical', lab: [75.5, 2.4, 20.4] },
  { code: 'A3.5', guide: 'VITA Classical', lab: [72.4, 3.6, 22.4] },
  { code: 'A4', guide: 'VITA Classical', lab: [69.6, 4.2, 23.6] },
  { code: 'B1', guide: 'VITA Classical', lab: [79.6, -0.6, 12.4] },
  { code: 'B2', guide: 'VITA Classical', lab: [78.0, 0.6, 16.2] },
  { code: 'B3', guide: 'VITA Classical', lab: [74.6, 2.0, 20.4] },
  { code: 'B4', guide: 'VITA Classical', lab: [71.6, 2.8, 22.6] },
  { code: 'C1', guide: 'VITA Classical', lab: [77.4, -0.8, 13.4] },
  { code: 'C2', guide: 'VITA Classical', lab: [74.4, -0.4, 15.6] },
  { code: 'C3', guide: 'VITA Classical', lab: [71.0, 0.8, 17.8] },
  { code: 'C4', guide: 'VITA Classical', lab: [67.6, 1.6, 19.4] },
  { code: 'D2', guide: 'VITA Classical', lab: [76.4, 1.4, 14.6] },
  { code: 'D3', guide: 'VITA Classical', lab: [73.4, 2.4, 15.8] },
  { code: 'D4', guide: 'VITA Classical', lab: [69.8, 3.4, 17.6] }
]

export const ALL_SHADES: ShadeTab[] = [...VITA_CLASSICAL]

// 内冠基底反射光谱（41 波段）
export function coreReflectance(kind: 'zirconia' | 'metal', shade?: string): number[] {
  if (kind === 'metal') {
    // 深色金属冠：整体低反射，长波略抬，发暗偏暖
    return Array.from({ length: 41 }, (_, i) => {
      const t = i / 40
      return 0.05 + 0.05 * t
    })
  }
  // 氧化锆：高反射漫白，按遮色层色号轻微调整
  const tint = shade && shade.startsWith('A') && shade >= 'A3' ? 0.06 : 0.02
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40
    const wl = 380 + i * 10
    return Math.min(0.95, 0.78 + tint + 0.06 * t - tint * 2 * Math.exp(-(((wl - 460) / 40) ** 2)))
  })
}

// 口腔暗背景：后方组织的微弱红散射
export const MOUTH_BACKDROP: number[] = Array.from({ length: 41 }, (_, i) => {
  const wl = 380 + i * 10
  return 0.02 + 0.07 * Math.exp(-((wl - 620) ** 2) / (2 * 55 * 55))
})
