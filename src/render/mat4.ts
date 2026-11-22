// 极简 4x4 列主序矩阵工具
export type Mat4 = Float32Array

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

export function mat4Perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

export function mat4LookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]): Mat4 {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2]
  const zl = Math.hypot(zx, zy, zz) || 1
  const z = [zx / zl, zy / zl, zz / zl]
  const xx = up[1] * z[2] - up[2] * z[1]
  const xy = up[2] * z[0] - up[0] * z[2]
  const xz = up[0] * z[1] - up[1] * z[0]
  const xl = Math.hypot(xx, xy, xz) || 1
  const x = [xx / xl, xy / xl, xz / xl]
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
  const m = new Float32Array(16)
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]
  m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2])
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2])
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2])
  m[15] = 1
  return m
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
  }
  return out
}

export function mat4Scale(s: number): Mat4 {
  const m = mat4Identity()
  m[0] = m[5] = m[10] = s
  return m
}

// 轨道相机
export class OrbitCamera {
  yaw = 0.6
  pitch = 0.25
  distance = 26
  target: [number, number, number] = [0, 0, 4.5]

  eye(): [number, number, number] {
    const cp = Math.cos(this.pitch)
    return [
      this.target[0] + this.distance * cp * Math.sin(this.yaw),
      this.target[1] + this.distance * cp * Math.cos(this.yaw),
      this.target[2] + this.distance * Math.sin(this.pitch)
    ]
  }

  view(): Mat4 {
    return mat4LookAt(this.eye(), this.target, [0, 0, 1])
  }

  attach(el: HTMLElement): () => void {
    let dragging = false
    let lx = 0, ly = 0
    const down = (e: PointerEvent) => {
      dragging = true
      lx = e.clientX
      ly = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      this.yaw -= (e.clientX - lx) * 0.008
      this.pitch = Math.max(-1.3, Math.min(1.45, this.pitch + (e.clientY - ly) * 0.008))
      lx = e.clientX
      ly = e.clientY
    }
    const up = () => { dragging = false }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      this.distance = Math.max(10, Math.min(60, this.distance * (1 + Math.sign(e.deltaY) * 0.08)))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }
}
