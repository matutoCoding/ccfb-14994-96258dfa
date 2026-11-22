// 目标 Lab -> 反射光谱拟合器
// 用 6 维光谱基函数系数做阻尼最小二乘，使 D65 下 Lab 收敛到目标，同时得到可用于异谱评估的真实光谱
import { deltaE2000, reflectanceToLab, N, getIlluminant } from './spectrum'
import type { ShadeTab } from '../types'
import { WL_NM } from './cmf_data'

export interface FittedShade {
  code: string
  reflectance: number[]
  labD65: [number, number, number]
  fitError: number
}

// 6 个基函数：常数、线性倾斜、两个高斯吸收谷、两个高斯反射峰
const BASIS: ((t: number, wl: number) => number)[] = [
  () => 1,
  (t) => t - 0.5,
  (_t, wl) => -Math.exp(-((wl - 450) ** 2) / (2 * 35 * 35)),
  (_t, wl) => -Math.exp(-((wl - 580) ** 2) / (2 * 45 * 45)),
  (_t, wl) => Math.exp(-((wl - 540) ** 2) / (2 * 30 * 30)),
  (_t, wl) => Math.exp(-((wl - 620) ** 2) / (2 * 40 * 40))
]

function compose(coef: number[]): number[] {
  return WL_NM.map((wl, i) => {
    const t = i / (N - 1)
    let v = 0.7
    for (let b = 0; b < BASIS.length; b++) v += coef[b] * BASIS[b](t, wl)
    return Math.min(0.97, Math.max(0.02, v))
  })
}

// 数值雅可比的高斯-牛顿求解
function solve(target: [number, number, number]): { coef: number[]; de: number } {
  const d65 = getIlluminant('d65').spd
  let coef = [0, 0.1, 0.1, 0.1, 0, 0]
  let de = 99
  for (let iter = 0; iter < 40; iter++) {
    const refl = compose(coef)
    const lab = reflectanceToLab(refl, d65)
    de = deltaE2000(lab, target)
    if (de < 0.05) break
    const eps = 0.004
    // 3x6 雅可比
    const J: number[][] = []
    for (let b = 0; b < BASIS.length; b++) {
      const c2 = coef.map((v, i) => (i === b ? v + eps : v))
      const lab2 = reflectanceToLab(compose(c2), d65)
      J.push([(lab2[0] - lab[0]) / eps, (lab2[1] - lab[1]) / eps, (lab2[2] - lab[2]) / eps])
    }
    const residual = [target[0] - lab[0], target[1] - lab[1], target[2] - lab[2]]
    // 阻尼最小二乘：(JᵀJ + λI) Δ = Jᵀr
    const lambda = 0.08 * (1 + iter * 0.15)
    const A = Array.from({ length: 6 }, () => new Array(6).fill(0))
    const g = new Array(6).fill(0)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        for (let k = 0; k < 3; k++) A[i][j] += J[i][k] * J[j][k]
      }
      A[i][i] += lambda
      for (let k = 0; k < 3; k++) g[i] += J[i][k] * residual[k]
    }
    const delta = solve6(A, g)
    for (let i = 0; i < 6; i++) coef[i] += delta[i]
  }
  return { coef, de }
}

// 6 阶线性方程组（高斯消元，带主元）
function solve6(A: number[][], b: number[]): number[] {
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < 6; col++) {
    let piv = col
    for (let r = col + 1; r < 6; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const d = M[col][col] || 1e-12
    for (let r = 0; r < 6; r++) {
      if (r === col) continue
      const f = M[r][col] / d
      for (let c = col; c <= 6; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[6] / (row[i] || 1e-12))
}

const cache = new Map<string, FittedShade>()

export function fitShadeSpectrum(shade: ShadeTab): FittedShade {
  const hit = cache.get(shade.code)
  if (hit) return hit
  const solved = solve(shade.lab)
  const refl = compose(solved.coef)
  const fitted: FittedShade = {
    code: shade.code,
    reflectance: refl,
    labD65: reflectanceToLab(refl, getIlluminant('d65').spd),
    fitError: solved.de
  }
  cache.set(shade.code, fitted)
  return fitted
}

// 同色异谱指数：D65 与诊室灯下 Lab 色差
export function metamerismIndex(refl: number[]): number {
  const labD65 = reflectanceToLab(refl, getIlluminant('d65').spd)
  const labClinic = reflectanceToLab(refl, getIlluminant('clinic').spd)
  return deltaE2000(labD65, labClinic)
}
