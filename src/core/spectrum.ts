// 光谱数学：基函数展开、光源 SPD、光谱->XYZ->Lab->sRGB、CIEDE2000
import { CMF, D65_SPD, WL_NM } from './cmf_data'
import type { Illuminant, IlluminantId, SpectralParams } from '../types'
import { SPECTRAL_BINS } from '../types'

export const N = SPECTRAL_BINS

// 普朗克黑体相对辐射（归一化到 560nm=1）
function planck(cct: number): number[] {
  const hc2 = 0.0143877736 // hc/k，单位 m·K
  const ref = Math.pow(560e-9, -5) / (Math.exp(hc2 / (560e-9 * cct)) - 1)
  return WL_NM.map((wl) => {
    const l = wl * 1e-9
    const v = Math.pow(l, -5) / (Math.exp(hc2 / (l * cct)) - 1)
    return v / ref
  })
}

// 高斯峰，用于拼 LED 光谱
function gauss(center: number, width: number, amp: number): number[] {
  return WL_NM.map((wl) => amp * Math.exp(-((wl - center) ** 2) / (2 * width * width)))
}

function normalizeMax(v: number[]): number[] {
  const m = Math.max(...v)
  return v.map((x) => x / m)
}

// 诊室灯：4500K 暖白 LED，带 450nm 强蓝峰 + 荧光绿峰，尖峰结构用于暴露同色异谱
function clinicLed(): number[] {
  const base = planck(4500).map((v) => v * 0.4)
  const blue = gauss(448, 12, 1.2)
  const green = gauss(545, 28, 0.6)
  return normalizeMax(base.map((v, i) => v + blue[i] + green[i]))
}

// 手机闪光灯：高色温 LED 加轻微蓝峰，近似 6000K
function phoneFlash(): number[] {
  const base = planck(6000).map((v) => v * 0.7)
  const blue = gauss(455, 18, 0.55)
  return normalizeMax(base.map((v, i) => v + blue[i]))
}

// D50 用 5003K 普朗克近似
const SPD_TABLE: Record<IlluminantId, number[]> = {
  d65: normalizeMax(D65_SPD),
  d50: normalizeMax(planck(5003)),
  clinic: clinicLed(),
  flash: phoneFlash()
}

export const ILLUMINANTS: Illuminant[] = [
  { id: 'd65', name: '日光 D65 (6500K)', spd: SPD_TABLE.d65 },
  { id: 'd50', name: '标准灯 D50 (5000K)', spd: SPD_TABLE.d50 },
  { id: 'clinic', name: '诊室 LED (4500K 尖峰)', spd: SPD_TABLE.clinic },
  { id: 'flash', name: '手机闪光灯 (6000K LED)', spd: SPD_TABLE.flash }
]

export function getIlluminant(id: IlluminantId): Illuminant {
  return ILLUMINANTS.find((x) => x.id === id) ?? ILLUMINANTS[0]
}

// 光谱基函数展开（标定后形式，ΔE2000 可达 0.3 以内）
// base 长波基线；slope 控制蓝端指数吸收强度（显黄/红）；warm 450nm 蓝谷；blue 绿光谷；scatter 瑞利散射
export function expandSpectrum(p: SpectralParams): number[] {
  return WL_NM.map((wl) => {
    const expAbs = Math.exp(-(wl - 500) / 90)
    const blueDip = Math.exp(-((wl - 450) ** 2) / (2 * 30 * 30))
    const greenDip = Math.exp(-((wl - 560) ** 2) / (2 * 42 * 42))
    const scatterRay = Math.pow(450 / wl, 4) - 0.1
    const v = p.base + p.slope * expAbs + p.warm * blueDip + p.blue * greenDip + p.scatter * 0.3 * scatterRay
    return Math.max(0.0001, v)
  })
}

// D65 白点（由表内 CMF 直接积分得到，保证自洽）
export function d65White(): [number, number, number] {
  return spectrumToXYZ(D65_SPD, SPD_TABLE.d65, 1)
}

// 反射率光谱 -> XYZ（对指定光源积分），scale 为整体增益
export function spectrumToXYZ(
  reflectance: number[],
  spd: number[],
  scale = 1
): [number, number, number] {
  let x = 0, y = 0, z = 0, n = 0
  for (let i = 0; i < N; i++) {
    const e = spd[i]
    x += e * CMF[i][0] * reflectance[i]
    y += e * CMF[i][1] * reflectance[i]
    z += e * CMF[i][2] * reflectance[i]
    n += e * CMF[i][1]
  }
  const k = (100 * scale) / n
  return [x * k, y * k, z * k]
}

// XYZ(D65) -> Lab，使用表内自洽白点
const WHITE = (() => {
  let x = 0, y = 0, z = 0, n = 0
  for (let i = 0; i < N; i++) {
    const e = SPD_TABLE.d65[i]
    x += e * CMF[i][0]
    y += e * CMF[i][1]
    z += e * CMF[i][2]
    n += e * CMF[i][1]
  }
  return [x / n, y / n, z / n]
})()

function labF(t: number): number {
  const d = 216 / 24389
  return t > d ? Math.cbrt(t) : (841 / 108) * t + 16 / 116
}

export function xyzToLab(xyz: [number, number, number]): [number, number, number] {
  const fx = labF(xyz[0] / 100 / WHITE[0])
  const fy = labF(xyz[1] / 100 / WHITE[1])
  const fz = labF(xyz[2] / 100 / WHITE[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function reflectanceToLab(reflectance: number[], spd: number[]): [number, number, number] {
  return xyzToLab(spectrumToXYZ(reflectance, spd))
}

// Lab -> XYZ，供着色器目标色与比色板渲染共用
export function labToXyz(lab: [number, number, number]): [number, number, number] {
  const fy = (lab[0] + 16) / 116
  const fx = fy + lab[1] / 500
  const fz = fy - lab[2] / 200
  const d3 = 6 / 29
  const finv = (f: number) => (f > d3 ? f * f * f : 3 * d3 * d3 * (f - 16 / 116))
  return [100 * WHITE[0] * finv(fx), 100 * WHITE[1] * finv(fy), 100 * WHITE[2] * finv(fz)]
}

function srgbEnc(c: number): number {
  const v = Math.min(1, Math.max(0, c))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

// XYZ -> 线性 sRGB
export function xyzToLinearSrgb(xyz: [number, number, number]): [number, number, number] {
  const x = xyz[0] / 100, y = xyz[1] / 100, z = xyz[2] / 100
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z
  ]
}

export function xyzToSrgb(xyz: [number, number, number]): [number, number, number] {
  const [r, g, b] = xyzToLinearSrgb(xyz)
  return [srgbEnc(r), srgbEnc(g), srgbEnc(b)]
}

// CIEDE2000 色差
export function deltaE2000(
  lab1: [number, number, number],
  lab2: [number, number, number]
): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2
  const avgL = (L1 + L2) / 2
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const avgC = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const avgCp = (C1p + C2p) / 2
  const h1p = C1p === 0 ? 0 : ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360
  const h2p = C2p === 0 ? ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360 : h1p
  let avghp: number
  if (C1p === 0 && C2p === 0) avghp = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) avghp = (h1p + h2p) / 2
  else avghp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2
  const T =
    1 -
    0.17 * Math.cos(((avghp - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * avghp) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avghp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avghp - 63) * Math.PI) / 180)
  let dhp: number
  if (C1p === 0 || C2p === 0) dhp = 0
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p
  else dhp = h2p - h1p + (h2p > h1p ? -360 : 360)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * (Math.PI / 180))
  const Sl = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2)
  const Sc = 1 + 0.045 * avgCp
  const Sh = 1 + 0.015 * avgCp * T
  const dTheta = 30 * Math.exp(-(((avghp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7))
  const Rt = -Math.sin((2 * dTheta * Math.PI) / 180) * Rc
  const kL = 1, kC = 1, kH = 1
  return Math.sqrt(
    (dLp / (kL * Sl)) ** 2 +
      (dCp / (kC * Sc)) ** 2 +
      (dHp / (kH * Sh)) ** 2 +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
  )
}
