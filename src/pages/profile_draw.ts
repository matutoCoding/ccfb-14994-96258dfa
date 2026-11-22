// 牙冠剖面 2D 分层图：沿颈-切方向绘制四层厚度分界
import type { ToothDesign, LayerType, ZoneName } from '../types'
import { LAYER_TYPES, LAYER_LABEL } from '../types'

const COLOR: Record<LayerType, string> = {
  dentin: '#d9a441',
  enamel: '#e8d9b0',
  transparent: '#7dd3fc',
  effect: '#c4b5fd'
}

// 冠壁外轮廓（剖面半侧），坐标归一化后映射
function outerProfile(t: number): number {
  // 唇侧外轮廓宽度随高度变化
  return 2.6 + 0.5 * Math.sin(Math.PI * t) - 0.9 * t
}

export function drawProfile(canvas: HTMLCanvasElement, tooth: ToothDesign): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = canvas.clientWidth || 600
  const h = canvas.clientHeight || 260
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const padL = 48, padR = 24, padT = 24, padB = 40
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const totalMax = 2.6 // mm 映射上限

  const xOf = (t: number): number => padL + t * plotW
  const yOf = (depth: number): number => padT + plotH - (depth / totalMax) * plotH

  // 网格与坐标轴
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#64748b'
  for (let mm = 0; mm <= 2.5; mm += 0.5) {
    const y = yOf(mm)
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(w - padR, y)
    ctx.stroke()
    ctx.fillText(`${mm}mm`, 8, y + 4)
  }
  const zoneLabels: [number, ZoneName][] = [[0, 'cervical'], [0.5, 'middle'], [1, 'incisal']]
  for (const [t, label] of zoneLabels) {
    ctx.fillText({ cervical: '颈部', middle: '中部', incisal: '切端' }[label], xOf(t) - 12, h - 14)
  }

  const getT = (layer: LayerType, t: number): number => {
    const lz = tooth.layers.find((l) => l.layer === layer)!
    if (t <= 0.5) return lz.thickness.cervical + (lz.thickness.middle - lz.thickness.cervical) * (t / 0.5)
    return lz.thickness.middle + (lz.thickness.incisal - lz.thickness.middle) * ((t - 0.5) / 0.5)
  }

  // 从内壁向外堆叠：牙本质 -> 效果 -> 切端 -> 透明
  const stackOrder: LayerType[] = ['dentin', 'effect', 'enamel', 'transparent']
  let cumulative = new Array(41).fill(0)
  for (const layer of stackOrder) {
    ctx.beginPath()
    ctx.moveTo(xOf(0), yOf(cumulative[0]))
    const next = [...cumulative]
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      next[i] = cumulative[i] + getT(layer, t)
      ctx.lineTo(xOf(t), yOf(next[i]))
    }
    for (let i = 40; i >= 0; i--) {
      const t = i / 40
      ctx.lineTo(xOf(t), yOf(cumulative[i]))
    }
    ctx.closePath()
    ctx.fillStyle = COLOR[layer] + 'cc'
    ctx.fill()
    ctx.strokeStyle = COLOR[layer]
    ctx.lineWidth = 1.5
    ctx.stroke()
    cumulative = next
  }

  // 内冠底线
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(0))
  ctx.lineTo(xOf(1), yOf(0))
  ctx.strokeStyle = tooth.core === 'metal' ? '#7f1d1d' : '#0e7490'
  ctx.lineWidth = 2
  ctx.stroke()

  // 外轮廓参考线
  ctx.beginPath()
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const y = yOf(Math.min(totalMax, cumulative[i] + 0.15 * outerProfile(t)))
    if (i === 0) ctx.moveTo(xOf(t), y)
    else ctx.lineTo(xOf(t), y)
  }
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.setLineDash([])

  // 层名标注
  ctx.font = '13px sans-serif'
  LAYER_TYPES.forEach((layer, i) => {
    ctx.fillStyle = '#334155'
    ctx.fillText(LAYER_LABEL[layer], padL + 8 + i * 78, padT + 16)
    ctx.fillStyle = COLOR[layer]
    ctx.fillRect(padL - 14 + i * 78, padT + 6, 10, 10)
  })
  ctx.fillStyle = tooth.core === 'metal' ? '#7f1d1d' : '#0e7490'
  ctx.fillText(tooth.core === 'metal' ? '金属内冠' : '氧化锆内冠', w - padR - 78, h - 14)
}
