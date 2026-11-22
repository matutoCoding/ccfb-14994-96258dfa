// 渲染会话：管理网格、KM LUT、剖面 uniform 与 CPU 精确 Lab 计算
import type { CaseRecord, KMLayerDataLike, LayerType, RenderParams, ToothDesign, ZoneName, Porcelain } from '../types'
import { LAYER_TYPES, ZONES } from '../types'
import { buildLayerData, stackReflectance } from '../core/optical'
import { buildOpticalLUT, type OpticalLUT, type StackLayers } from '../render/lut_builder'
import type { LayerProfileUniform } from '../render/renderer'
import { ALL_SHADES, coreReflectance } from '../core/materials_data'
import { deltaE2000, getIlluminant, reflectanceToLab } from '../core/spectrum'

// 瓷粉 KM 数据缓存
const kmCache = new Map<string, KMLayerDataLike>()

export function getKM(porcelain: Porcelain): KMLayerDataLike {
  let hit = kmCache.get(porcelain.id)
  if (!hit) {
    hit = buildLayerData(porcelain)
    kmCache.set(porcelain.id, hit)
  }
  return hit
}

const LAYER_ORDER: LayerType[] = ['transparent', 'enamel', 'effect', 'dentin']

export interface ZoneLabResult {
  zone: ZoneName
  lab: [number, number, number]
  de: number
  reflectance: number[]
  metamerism: number
}

export class RenderSession {
  lut: OpticalLUT | null = null
  // 当前 LUT 对应的瓷粉组合签名
  private lutSignature = ''

  // 四层在 LUT 中的固定数据（取当前牙位选中的瓷粉）
  stackFor(tooth: ToothDesign, porcelains: Porcelain[]): StackLayers {
    const find = (layer: LayerType) => {
      const lz = tooth.layers.find((l) => l.layer === layer)
      const p = porcelains.find((x) => x.id === lz?.porcelainId) ?? porcelains[0]
      return getKM(p)
    }
    return {
      dentin: find('dentin'),
      enamel: find('enamel'),
      transparent: find('transparent'),
      effect: find('effect'),
      effectRatio: 0.35
    }
  }

  ensureLUT(tooth: ToothDesign, porcelains: Porcelain[]): OpticalLUT {
    const signature = tooth.layers.map((l) => l.porcelainId).join('|') + ':0.35'
    if (!this.lut || signature !== this.lutSignature) {
      this.lut = buildOpticalLUT(this.stackFor(tooth, porcelains))
      this.lutSignature = signature
    }
    return this.lut
  }

  profileUniform(tooth: ToothDesign): LayerProfileUniform {
    const get = (layer: LayerType): [number, number, number] => {
      const lz = tooth.layers.find((l) => l.layer === layer)
      if (!lz) return [0, 0, 0]
      return [lz.thickness.cervical, lz.thickness.middle, lz.thickness.incisal]
    }
    return {
      layers: LAYER_TYPES.map((l) => get(l)) as [number, number, number][],
      core: [tooth.coreThickness.cervical, tooth.coreThickness.middle, tooth.coreThickness.incisal],
      coreReflectance: coreReflectance(tooth.core, tooth.coreShade)
    }
  }

  // CPU 端逐分区精确 Lab：与 GPU 同一套 KM 模型，作为比色对照的读数来源
  zoneLabs(record: CaseRecord, tooth: ToothDesign, porcelains: Porcelain[], targetCode: string): ZoneLabResult[] {
    const substrate = coreReflectance(tooth.core, tooth.coreShade)
    const target = targetLab(targetCode)
    return ZONES.map((zone) => {
      const stack = LAYER_ORDER.map((type) => {
        const lz = tooth.layers.find((l) => l.layer === type)!
        const p = porcelains.find((x) => x.id === lz.porcelainId)!
        return { data: getKM(p), thickness: lz.thickness[zone] }
      })
      const refl = stackReflectance(stack, substrate)
      const lab = reflectanceToLab(refl, getIlluminant('d65').spd)
      const clinicLab = reflectanceToLab(refl, getIlluminant('clinic').spd)
      return {
        zone,
        lab,
        de: deltaE2000(lab, target),
        reflectance: refl,
        metamerism: deltaE2000(lab, clinicLab)
      }
    })
  }

  // 全光源下的中部 Lab，用于光照页同色异谱对比
  allIlluminantLabs(tooth: ToothDesign, porcelains: Porcelain[]): { id: string; name: string; lab: [number, number, number] }[] {
    const substrate = coreReflectance(tooth.core, tooth.coreShade)
    const stack = LAYER_ORDER.map((type) => {
      const lz = tooth.layers.find((l) => l.layer === type)!
      const p = porcelains.find((x) => x.id === lz.porcelainId)!
      return { data: getKM(p), thickness: lz.thickness.middle }
    })
    const refl = stackReflectance(stack, substrate)
    return (['d65', 'd50', 'clinic', 'flash'] as const).map((id) => ({
      id,
      name: getIlluminant(id).name,
      lab: reflectanceToLab(refl, getIlluminant(id).spd)
    }))
  }
}

export function targetLab(code: string): [number, number, number] {
  return ALL_SHADES.find((s) => s.code === code)?.lab ?? [75, 0, 15]
}

export function defaultRenderParams(): RenderParams {
  return {
    illuminant: 'd65',
    mouthDark: 0.55,
    opalescence: 0.8,
    mode: 'color',
    targetShade: 'A2',
    ambient: 0.22,
    exposure: 1.0
  }
}
