// WebGL2 全光谱牙冠渲染器
import type { CrownMesh } from '../core/crown_mesh'
import type { IlluminantId, RenderParams } from '../types'
import {
  GEOMETRY_FS, GEOMETRY_VS, SPECTRAL_FS, SPECTRAL_VS, THICKNESS_FS, THICKNESS_VS
} from './shaders'
import { mat4Identity, mat4Multiply, mat4Perspective, mat4Scale, OrbitCamera, type Mat4 } from './mat4'
import type { OpticalLUT } from './lut_builder'
import { QUARTERS } from './lut_builder'
import { getIlluminant, d65White } from '../core/spectrum'
import { MOUTH_BACKDROP } from '../core/materials_data'

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('着色器编译失败: ' + log)
  }
  return sh
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p))
  }
  return p
}

export interface LayerProfileUniform {
  // 四层（dentin/enamel/transparent/effect），每层颈/中/切厚度
  layers: [number, number, number][]
  core: [number, number, number]
  coreReflectance: number[]
}

export class CrownRenderer {
  readonly gl: WebGL2RenderingContext
  private camera = new OrbitCamera()
  private progGeom: WebGLProgram
  private progThick: WebGLProgram
  private progSpectral: WebGLProgram
  private vao: WebGLVertexArrayObject | null = null
  private indexCount = 0
  private backFbo: WebGLFramebuffer
  private backDepth: WebGLTexture
  private thickFbo: WebGLFramebuffer
  private thickTex: WebGLTexture
  private thickDepth: WebGLRenderbuffer
  private lutR: WebGLTexture[] = []
  private lutT: WebGLTexture[] = []
  private lutMax: [number, number, number] = [1.8, 1.6, 0.8]
  private width = 800
  private height = 600
  private model: Mat4 = mat4Identity()
  private detachCam: () => void = () => {}
  needsRender = true

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true })
    if (!gl) throw new Error('当前浏览器不支持 WebGL2')
    this.gl = gl
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('需要 EXT_color_buffer_float 扩展支持浮点渲染')
    }
    gl.getExtension('OES_texture_float_linear')

    this.progGeom = program(gl, GEOMETRY_VS, GEOMETRY_FS)
    this.progThick = program(gl, THICKNESS_VS, THICKNESS_FS)
    this.progSpectral = program(gl, SPECTRAL_VS, SPECTRAL_FS)

    this.backDepth = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.backDepth)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    this.backFbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.backFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.backDepth, 0)
    gl.drawBuffers([gl.NONE])
    gl.readBuffer(gl.NONE)

    this.thickTex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.thickTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.thickFbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.thickFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.thickTex, 0)
    this.thickDepth = gl.createRenderbuffer()!
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.thickDepth)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.thickDepth)

    this.resize()
    this.detachCam = this.camera.attach(canvas)
  }

  getCamera(): OrbitCamera {
    return this.camera
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(320, this.canvas.clientWidth)
    const h = Math.max(320, this.canvas.clientHeight)
    this.width = Math.round(w * dpr)
    this.height = Math.round(h * dpr)
    this.canvas.width = this.width
    this.canvas.height = this.height
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.backDepth)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, this.width, this.height, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null)
    gl.bindTexture(gl.TEXTURE_2D, this.thickTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null)
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.thickDepth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, this.width, this.height)
    this.needsRender = true
  }

  setMesh(mesh: CrownMesh, modelScale = 1): void {
    const gl = this.gl
    if (this.vao) gl.deleteVertexArray(this.vao)
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const posBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    const nBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    const tBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, tBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.tAttr, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0)
    const ibo = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
    this.indexCount = mesh.indices.length
    this.model = mat4Scale(modelScale)
    gl.bindVertexArray(null)
    this.vao = vao
    this.needsRender = true
  }

  // 上传 KM LUT 为 11 个 RGBA32F 3D 纹理（反射 + 透射各一组）
  setOpticalLUT(lut: OpticalLUT): void {
    const gl = this.gl
    this.lutR.forEach((t) => gl.deleteTexture(t))
    this.lutT.forEach((t) => gl.deleteTexture(t))
    this.lutR = []
    this.lutT = []
    this.lutMax = lut.maxThickness
    for (let q = 0; q < QUARTERS; q++) {
      this.lutR.push(this.upload3D(lut.reflect[q], lut.size))
      this.lutT.push(this.upload3D(lut.transmit[q], lut.size))
    }
    this.needsRender = true
  }

  private upload3D(data: Float32Array, size: number): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_3D, tex)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, size, size, size, 0, gl.RGBA, gl.FLOAT, data)
    return tex
  }

  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(p, name)
  }

  render(params: RenderParams, profile: LayerProfileUniform, targetLab: [number, number, number]): void {
    const gl = this.gl
    const aspect = this.width / this.height
    const view = this.camera.view()
    const proj = mat4Perspective((35 * Math.PI) / 180, aspect, 0.5, 200)
    const vp = mat4Multiply(proj, view)
    gl.viewport(0, 0, this.width, this.height)
    gl.enable(gl.DEPTH_TEST)

    // Pass 1：背面深度（剔除正面）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.backFbo)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.FRONT)
    gl.useProgram(this.progGeom)
    this.bindCommon(this.progGeom, vp)
    gl.uniform3f(this.loc(this.progGeom, 'uCamPos'), ...this.camera.eye())
    this.draw()

    // Pass 2：正面厚度
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.thickFbo)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.cullFace(gl.BACK)
    gl.useProgram(this.progThick)
    this.bindCommon(this.progThick, vp, view)
    gl.uniform2f(this.loc(this.progThick, 'uDepthRange'), 0.5, 200)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.backDepth)
    gl.uniform1i(this.loc(this.progThick, 'uBackDepth'), 0)
    this.draw()

    // Pass 3：全光谱着色
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clearColor(0.07, 0.08, 0.1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.disable(gl.CULL_FACE)
    gl.useProgram(this.progSpectral)
    this.bindCommon(this.progSpectral, vp, view)
    const p = this.progSpectral
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.thickTex)
    gl.uniform1i(this.loc(p, 'uThickness'), 0)
    for (let q = 0; q < QUARTERS; q++) {
      gl.activeTexture(gl.TEXTURE1 + q * 2)
      gl.bindTexture(gl.TEXTURE_3D, this.lutR[q])
      gl.uniform1i(this.loc(p, `uLutR[${q}]`), 1 + q * 2)
      gl.activeTexture(gl.TEXTURE2 + q * 2)
      gl.bindTexture(gl.TEXTURE_3D, this.lutT[q])
      gl.uniform1i(this.loc(p, `uLutT[${q}]`), 2 + q * 2)
    }
    gl.uniform3f(this.loc(p, 'uLutMax'), ...this.lutMax)
    gl.uniform4fv(this.loc(p, 'uLayerProfile[0]'), this.profileData(profile))
    gl.uniform4f(this.loc(p, 'uCoreProfile'), ...profile.core, 0)
    gl.uniform1fv(this.loc(p, 'uSpectrum[0]'), getIlluminant(params.illuminant).spd)
    gl.uniform1fv(this.loc(p, 'uCoreR[0]'), profile.coreReflectance)
    gl.uniform1fv(this.loc(p, 'uBackdrop[0]'), MOUTH_BACKDROP)
    gl.uniform3f(this.loc(p, 'uWhiteXYZ'), ...d65White())
    gl.uniform3f(this.loc(p, 'uLightDir'), 0.45, 0.55, 0.7)
    gl.uniform3f(this.loc(p, 'uCamPos'), ...this.camera.eye())
    gl.uniform1f(this.loc(p, 'uMouthDark'), params.mouthDark)
    gl.uniform1f(this.loc(p, 'uOpal'), params.opalescence)
    gl.uniform1f(this.loc(p, 'uAmbient'), params.ambient)
    gl.uniform1f(this.loc(p, 'uExposure'), params.exposure)
    const modeInt = params.mode === 'color' ? 0 : params.mode === 'lab' ? 1 : params.mode === 'de2000' ? 2 : 3
    gl.uniform1i(this.loc(p, 'uMode'), modeInt)
    gl.uniform3f(this.loc(p, 'uTargetLab'), ...targetLab)
    this.draw()
    gl.enable(gl.CULL_FACE)
    this.needsRender = false
  }

  private profileData(profile: LayerProfileUniform): Float32Array {
    const data = new Float32Array(16)
    profile.layers.forEach((l, i) => data.set(l, i * 4))
    return data
  }

  private bindCommon(p: WebGLProgram, vp: Mat4, view?: Mat4): void {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.uniformMatrix4fv(this.loc(p, 'uViewProj'), false, vp)
    gl.uniformMatrix4fv(this.loc(p, 'uModel'), false, this.model)
    if (view) gl.uniformMatrix4fv(this.loc(p, 'uView'), false, view)
  }

  private draw(): void {
    this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_INT, 0)
  }

  dispose(): void {
    this.detachCam()
  }
}
