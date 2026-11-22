// STL 解析（二进制 / ASCII）与网格工具
import type { MeshData } from '../types'

function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3
    const ux = positions[ib] - positions[ia], uy = positions[ib + 1] - positions[ia + 1], uz = positions[ib + 2] - positions[ia + 2]
    const vx = positions[ic] - positions[ia], vy = positions[ic + 1] - positions[ia + 1], vz = positions[ic + 2] - positions[ia + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const idx of [ia, ib, ic]) {
      normals[idx] += nx
      normals[idx + 1] += ny
      normals[idx + 2] += nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= len
    normals[i + 1] /= len
    normals[i + 2] /= len
  }
  return normals
}

// 解析 STL，返回毫米单位网格（自动居中到原点、底面贴 z=0）
export function parseStl(buffer: ArrayBuffer, unit: 'mm' | 'cm' | 'inch' = 'mm'): MeshData {
  const bytes = new Uint8Array(buffer)
  const isAscii = bytes.length > 84 && new TextDecoder().decode(bytes.slice(0, 5)) === 'solid' && hasAsciiFacets(bytes)
  const scale = unit === 'cm' ? 10 : unit === 'inch' ? 25.4 : 1
  if (isAscii) return normalize(parseAscii(bytes), scale)
  return normalize(parseBinary(buffer), scale)
}

function hasAsciiFacets(bytes: Uint8Array): boolean {
  // 二进制 STL 头部可能也以 solid 开头，用是否出现 facet 文本区分
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 2048)))
  return head.includes('facet')
}

function parseBinary(buffer: ArrayBuffer): MeshData {
  const dv = new DataView(buffer)
  const triCount = dv.getUint32(80, true)
  const positions: number[] = []
  const indices: number[] = []
  let offset = 84
  for (let t = 0; t < triCount; t++) {
    offset += 12 // 法向量，忽略后重算
    const base = positions.length / 3
    for (let v = 0; v < 3; v++) {
      positions.push(dv.getFloat32(offset, true), dv.getFloat32(offset + 4, true), dv.getFloat32(offset + 8, true))
      offset += 12
    }
    indices.push(base, base + 1, base + 2)
    offset += 2 // 属性字节
  }
  const pos = Float32Array.from(positions)
  const idx = Uint32Array.from(indices)
  return { positions: pos, indices: idx, normals: computeNormals(pos, idx) }
}

function parseAscii(bytes: Uint8Array): MeshData {
  const text = new TextDecoder().decode(bytes)
  const nums = text.match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) ?? []
  const values = nums.map(Number)
  const positions: number[] = []
  const indices: number[] = []
  let i = 0
  while (i + 9 <= values.length) {
    // 每三角：法向量 3 + 顶点 9
    i += 3
    const base = positions.length / 3
    for (let v = 0; v < 3; v++) {
      positions.push(values[i], values[i + 1], values[i + 2])
      i += 3
    }
    indices.push(base, base + 1, base + 2)
  }
  const pos = Float32Array.from(positions)
  const idx = Uint32Array.from(indices)
  return { positions: pos, indices: idx, normals: computeNormals(pos, idx) }
}

// 单位换算 + 居中：xy 中心归零，z 底面归零
function normalize(mesh: MeshData, scale: number): MeshData {
  const p = mesh.positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i])
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1])
    minZ = Math.min(minZ, p[i + 2])
  }
  const cx = ((minX + maxX) / 2) * scale
  const cy = ((minY + maxY) / 2) * scale
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i] * scale - cx
    p[i + 1] = p[i + 1] * scale - cy
    p[i + 2] = p[i + 2] * scale - minZ * scale
  }
  return mesh
}

export function meshBounds(mesh: MeshData): { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.positions[i + k])
      max[k] = Math.max(max[k], mesh.positions[i + k])
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}
