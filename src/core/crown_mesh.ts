// 程序化牙冠网格：前牙切牙 / 尖牙 / 后牙磨牙，毫米单位
// 每个顶点带 t 属性：0=颈部，1=切端/咬合面，供分层厚度插值
import type { CrownMesh, MeshData, ToothClass } from '../types'
import { computeNormalsHelper } from './mesh_util'

export type { CrownMesh }

interface CrownProfile {
  height: number
  // 各高度环的 rx（唇舌向半径）、ry（近远中向半径）
  rings: { t: number; rx: number; ry: number }[]
  // 切端形态：切牙为切嵴（压扁），磨牙为咬合窝
  edge: 'blade' | 'cusp'
}

function profileFor(cls: ToothClass): CrownProfile {
  if (cls === 'incisor') {
    return {
      height: 9.5,
      edge: 'blade',
      rings: [
        { t: 0, rx: 2.7, ry: 2.0 },
        { t: 0.25, rx: 3.0, ry: 2.3 },
        { t: 0.55, rx: 2.9, ry: 2.35 },
        { t: 0.8, rx: 2.4, ry: 2.2 },
        { t: 1, rx: 1.5, ry: 2.05 }
      ]
    }
  }
  if (cls === 'canine') {
    return {
      height: 10.5,
      edge: 'cusp',
      rings: [
        { t: 0, rx: 2.9, ry: 2.4 },
        { t: 0.3, rx: 3.3, ry: 2.7 },
        { t: 0.65, rx: 3.0, ry: 2.5 },
        { t: 0.9, rx: 2.2, ry: 1.9 },
        { t: 1, rx: 0.35, ry: 0.35 }
      ]
    }
  }
  // 前磨牙/磨牙：矮胖，咬合面宽
  const molar = cls === 'molar'
  return {
    height: molar ? 7.6 : 8.2,
    edge: 'cusp',
    rings: [
      { t: 0, rx: molar ? 3.7 : 3.1, ry: molar ? 3.6 : 3.0 },
      { t: 0.3, rx: molar ? 4.1 : 3.5, ry: molar ? 4.0 : 3.4 },
      { t: 0.7, rx: molar ? 4.0 : 3.4, ry: molar ? 3.9 : 3.3 },
      { t: 0.92, rx: molar ? 3.4 : 2.8, ry: molar ? 3.3 : 2.7 },
      { t: 1, rx: molar ? 2.6 : 2.1, ry: molar ? 2.5 : 2.0 }
    ]
  }
}

function interpRadius(profile: CrownProfile, t: number): [number, number] {
  const rings = profile.rings
  if (t <= rings[0].t) return [rings[0].rx, rings[0].ry]
  for (let i = 1; i < rings.length; i++) {
    if (t <= rings[i].t) {
      const a = rings[i - 1], b = rings[i]
      const f = (t - a.t) / (b.t - a.t)
      return [a.rx + (b.rx - a.rx) * f, a.ry + (b.ry - a.ry) * f]
    }
  }
  const last = rings[rings.length - 1]
  return [last.rx, last.ry]
}

const SEG = 40
const ROWS = 26

export function buildCrown(cls: ToothClass): CrownMesh {
  const profile = profileFor(cls)
  const positions: number[] = []
  const tAttr: number[] = []
  const indices: number[] = []

  for (let r = 0; r <= ROWS; r++) {
    const t = r / ROWS
    const [rx, ry] = interpRadius(profile, t)
    const z = t * profile.height
    for (let s = 0; s < SEG; s++) {
      const theta = (s / SEG) * Math.PI * 2
      let px = rx * Math.cos(theta)
      let py = ry * Math.sin(theta)
      // 切牙切嵴：顶部沿 y 方向压扁拉宽
      if (profile.edge === 'blade' && t > 0.85) {
        const f = (t - 0.85) / 0.15
        px *= 1 - 0.55 * f
        py *= 1 + 0.12 * f
      }
      // 轻微发育沟：唇侧 theta=0 处做浅凹
      const groove = 1 - 0.03 * Math.cos(theta * 2) * Math.sin(Math.PI * t)
      px *= groove
      positions.push(px, py, z)
      tAttr.push(t)
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = r * SEG + s
      const b = r * SEG + ((s + 1) % SEG)
      const c = (r + 1) * SEG + s
      const d = (r + 1) * SEG + ((s + 1) % SEG)
      indices.push(a, c, b, b, c, d)
    }
  }
  // 顶部封口（切端/咬合面）
  const topCenter = positions.length / 3
  positions.push(0, 0, profile.height)
  tAttr.push(1)
  const topStart = ROWS * SEG
  for (let s = 0; s < SEG; s++) {
    indices.push(topCenter, topStart + ((s + 1) % SEG), topStart + s)
  }
  // 底部内冠开口封口（颈缘平面）
  const bottomCenter = positions.length / 3
  positions.push(0, 0, 0)
  tAttr.push(0)
  for (let s = 0; s < SEG; s++) {
    indices.push(bottomCenter, s, (s + 1) % SEG)
  }

  const pos = Float32Array.from(positions)
  const idx = Uint32Array.from(indices)
  return {
    positions: pos,
    indices: idx,
    normals: computeNormalsHelper(pos, idx),
    tAttr: Float32Array.from(tAttr)
  }
}

// 连冠连接体：在两颗冠之间生成椭球连接体
export function buildConnector(centerX: number, height: number): MeshData {
  const positions: number[] = []
  const indices: number[] = []
  const lat = 12, lon = 20
  const ax = 1.7, ay = 2.4, az = 2.6
  const zc = height * 0.42
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI
    for (let j = 0; j <= lon; j++) {
      const theta = (j / lon) * Math.PI * 2
      positions.push(
        centerX + ax * Math.sin(phi) * Math.cos(theta),
        ay * Math.sin(phi) * Math.sin(theta),
        zc + az * Math.cos(phi)
      )
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j
      const b = a + 1
      const c = (i + 1) * (lon + 1) + j
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }
  const pos = Float32Array.from(positions)
  const idx = Uint32Array.from(indices)
  return { positions: pos, indices: idx, normals: computeNormalsHelper(pos, idx) }
}

// 多单位连冠：按牙位间距摆开，相邻单位间加连接体，合并为一张网格
export function buildBridge(units: { cls: ToothClass; gap: number }[]): CrownMesh {
  const meshes: { mesh: CrownMesh; offsetX: number }[] = []
  let cursor = 0
  for (const u of units) {
    meshes.push({ mesh: buildCrown(u.cls), offsetX: cursor })
    cursor += u.gap
  }
  const totalW = cursor - (units[units.length - 1]?.gap ?? 0)
  const centerShift = totalW / 2
  const allPos: number[] = []
  const allT: number[] = []
  const allIdx: number[] = []
  for (const { mesh, offsetX } of meshes) {
    const base = allPos.length / 3
    for (let i = 0; i < mesh.positions.length; i += 3) {
      allPos.push(mesh.positions[i] + offsetX - centerShift, mesh.positions[i + 1], mesh.positions[i + 2])
      allT.push(mesh.tAttr[i / 3])
    }
    for (let i = 0; i < mesh.indices.length; i++) allIdx.push(mesh.indices[i] + base)
  }
  // 相邻单位间连接体
  for (let u = 0; u < units.length - 1; u++) {
    const x = meshes[u].offsetX + units[u].gap / 2 - centerShift
    const conn = buildConnector(x, 8.5)
    const base = allPos.length / 3
    for (let i = 0; i < conn.positions.length; i += 3) {
      allPos.push(conn.positions[i], conn.positions[i + 1], conn.positions[i + 2])
      allT.push(0.4)
    }
    for (let i = 0; i < conn.indices.length; i++) allIdx.push(conn.indices[i] + base)
  }
  const pos = Float32Array.from(allPos)
  const idx = Uint32Array.from(allIdx)
  return { positions: pos, indices: idx, normals: computeNormalsHelper(pos, idx), tAttr: Float32Array.from(allT) }
}
