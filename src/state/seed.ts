// 测试病例种子数据：单颗前牙 / 三连冠 / 深色金属内冠
import type { CaseRecord, LayerType, LayerZone, ZoneName } from '../types'
import { LAYER_TYPES } from '../types'

const now = Date.now()

function defaultLayers(dentinCode: string): LayerZone[] {
  const porcelain: Record<LayerType, string> = {
    dentin: `vt-d-${dentinCode}`,
    enamel: 'vt-e-T1',
    transparent: 'vt-c-cl',
    effect: 'vt-f-op'
  }
  const profile: Record<LayerType, Record<ZoneName, number>> = {
    dentin: { cervical: 0.55, middle: 0.45, incisal: 0.3 },
    enamel: { cervical: 0.35, middle: 0.55, incisal: 0.9 },
    transparent: { cervical: 0.05, middle: 0.2, incisal: 0.4 },
    effect: { cervical: 0.05, middle: 0.1, incisal: 0.25 }
  }
  return LAYER_TYPES.map((layer) => ({
    layer,
    porcelainId: porcelain[layer],
    thickness: { ...profile[layer] },
    opacity: { cervical: 0.9, middle: 0.85, incisal: 0.7 }
  }))
}

export const SEED_CASES: CaseRecord[] = [
  {
    id: 'seed-anterior-21',
    clinic: '微笑口腔诊所',
    patient: '林晓',
    patientCode: 'P-2026-001',
    createdAt: now - 86400000 * 3,
    updatedAt: now - 86400000 * 3,
    targetShade: 'A2',
    note: '21 外伤变色根管治疗后全瓷冠，患者要求自然通透',
    design: {
      teeth: [
        {
          fdi: 21,
          core: 'zirconia',
          coreThickness: { cervical: 0.6, middle: 0.5, incisal: 0.4 },
          layers: defaultLayers('A2')
        }
      ],
      neighbors: [
        { fdi: 22, arch: 'upper', relation: 'neighbor', shadeCode: 'A2', lab: [77.8, 1.2, 17.6] },
        { fdi: 11, arch: 'upper', relation: 'neighbor', shadeCode: 'A1', lab: [80.4, -1.7, 15.4] },
        { fdi: 41, arch: 'lower', relation: 'opposite', shadeCode: 'A2', lab: [77.8, 1.2, 17.6] }
      ]
    }
  },
  {
    id: 'seed-bridge-14',
    clinic: '仁和齿科',
    patient: '周建国',
    patientCode: 'P-2026-002',
    createdAt: now - 86400000 * 2,
    updatedAt: now - 86400000 * 2,
    targetShade: 'A3',
    note: '14-16 缺失三连冠桥，氧化锆支架，咬合空间偏紧',
    design: {
      teeth: [14, 15, 16].map((fdi) => ({
        fdi,
        core: 'zirconia',
        coreThickness: { cervical: 0.7, middle: 0.6, incisal: 0.5 },
        layers: defaultLayers('A3')
      })),
      neighbors: [
        { fdi: 13, arch: 'upper', relation: 'neighbor', shadeCode: 'A3', lab: [75.5, 2.4, 20.4] },
        { fdi: 17, arch: 'upper', relation: 'neighbor', shadeCode: 'A3.5', lab: [72.4, 3.6, 22.4] }
      ]
    }
  },
  {
    id: 'seed-metal-36',
    clinic: '永康口腔门诊部',
    patient: '陈桂芳',
    patientCode: 'P-2026-003',
    createdAt: now - 86400000,
    updatedAt: now - 86400000,
    targetShade: 'B2',
    note: '36 金属烤瓷冠，钴铬内冠颜色很深，重点防发灰返黑',
    design: {
      teeth: [
        {
          fdi: 36,
          core: 'metal',
          coreThickness: { cervical: 0.5, middle: 0.45, incisal: 0.4 },
          layers: (() => {
            const layers = defaultLayers('B1')
            // 金属底需要更厚牙本质遮色
            const dentin = layers.find((l) => l.layer === 'dentin')!
            dentin.thickness = { cervical: 1.4, middle: 1.2, incisal: 0.7 }
            return layers
          })()
        }
      ],
      neighbors: [
        { fdi: 35, arch: 'lower', relation: 'neighbor', shadeCode: 'B2', lab: [78.0, 0.6, 16.2] },
        { fdi: 37, arch: 'lower', relation: 'neighbor', shadeCode: 'B3', lab: [74.6, 2.0, 20.4] }
      ]
    }
  }
]
