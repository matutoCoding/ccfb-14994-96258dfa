// FDI 两位牙位编号工具
export type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar'

export interface ToothInfo {
  fdi: number
  quadrant: number
  position: number
  arch: 'upper' | 'lower'
  cls: ToothClass
  label: string
  isAnterior: boolean
}

const POS_NAME: Record<number, string> = {
  1: '中切牙', 2: '侧切牙', 3: '尖牙', 4: '第一前磨牙', 5: '第二前磨牙',
  6: '第一磨牙', 7: '第二磨牙', 8: '第三磨牙'
}

export function toothInfo(fdi: number): ToothInfo {
  const quadrant = Math.floor(fdi / 10)
  const position = fdi % 10
  const arch: 'upper' | 'lower' = quadrant <= 2 ? 'upper' : 'lower'
  const cls: ToothClass =
    position <= 2 ? 'incisor' : position === 3 ? 'canine' : position <= 5 ? 'premolar' : 'molar'
  return {
    fdi,
    quadrant,
    position,
    arch,
    cls,
    label: `${fdi} ${POS_NAME[position] ?? '牙'}`,
    isAnterior: position <= 3
  }
}

export function fdiList(): number[] {
  const out: number[] = []
  for (let q = 1; q <= 4; q++) for (let p = 1; p <= 8; p++) out.push(q * 10 + p)
  return out
}

// 邻牙与对颌牙位建议
export function neighborSuggestions(fdi: number): { neighbor: number[]; opposite: number[] } {
  const info = toothInfo(fdi)
  const neighbor = [info.position - 1, info.position + 1]
    .filter((p) => p >= 1 && p <= 8)
    .map((p) => info.quadrant * 10 + p)
  const oppositeQuadrant = info.quadrant <= 2 ? info.quadrant + 2 : info.quadrant - 2
  return { neighbor, opposite: [oppositeQuadrant * 10 + info.position] }
}
