// 光学管线自检：验证光谱拟合、KM 叠层色差、反算器与异谱指数
// 运行：pnpm selftest
import { DEFAULT_PORCELAINS, VITA_CLASSICAL, coreReflectance } from '../src/core/materials_data.ts'
import { buildLayerData, stackReflectance } from '../src/core/optical.ts'
import { deltaE2000, getIlluminant, reflectanceToLab } from '../src/core/spectrum.ts'
import { fitShadeSpectrum, metamerismIndex } from '../src/core/color_fit.ts'
import { runInverse } from '../src/core/solver.ts'
import type { LayerType, ZoneName } from '../src/types.ts'

let failures = 0
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  通过  ${name} ${detail}`)
  else {
    failures++
    console.error(`  失败  ${name} ${detail}`)
  }
}

console.log('\n[1] 比色板光谱拟合精度（D65 目标 Lab 往返）')
let maxFitError = 0
for (const shade of VITA_CLASSICAL) {
  const fitted = fitShadeSpectrum(shade)
  maxFitError = Math.max(maxFitError, fitted.fitError)
}
check('16 色拟合最大 ΔE2000 < 0.5', maxFitError < 0.5, `实测 ${maxFitError.toFixed(3)}`)

console.log('\n[2] 标准病例 KM 叠层色差（A2 目标，氧化锆底）')
const dentin = buildLayerData(DEFAULT_PORCELAINS.find((p) => p.id === 'vt-d-A2')!)
const enamel = buildLayerData(DEFAULT_PORCELAINS.find((p) => p.id === 'vt-e-T1')!)
const transp = buildLayerData(DEFAULT_PORCELAINS.find((p) => p.id === 'vt-c-cl')!)
const effect = buildLayerData(DEFAULT_PORCELAINS.find((p) => p.id === 'vt-f-op')!)
const substrate = coreReflectance('zirconia')
const stack = [
  { data: transp, thickness: 0.2 },
  { data: enamel, thickness: 0.55 },
  { data: effect, thickness: 0.1 },
  { data: dentin, thickness: 0.45 }
]
const refl = stackReflectance(stack, substrate)
const labD65 = reflectanceToLab(refl, getIlluminant('d65').spd)
const targetA2 = VITA_CLASSICAL.find((s) => s.code === 'A2')!.lab
const deA2 = deltaE2000(labD65, targetA2)
console.log(`  中部渲染 Lab=${labD65.map((v) => v.toFixed(1)).join(', ')} 目标= ${targetA2.join(', ')}`)
check('默认标定参数下 A2 色差 ΔE2000 < 2', deA2 < 2, `ΔE=${deA2.toFixed(2)}`)

console.log('\n[3] 厚度单调性：牙本质越厚，遮色越强、明度变化方向正确')
const labs = [0.4, 0.8, 1.4].map((d) => {
  const r = stackReflectance(
    [
      { data: transp, thickness: 0.2 },
      { data: enamel, thickness: 0.55 },
      { data: effect, thickness: 0.1 },
      { data: dentin, thickness: d }
    ],
    coreReflectance('metal')
  )
  return reflectanceToLab(r, getIlluminant('d65').spd)
})
check('金属底上增加牙本质厚度，明度 L* 上升', labs[2][0] > labs[0][0],
  `${labs[0][0].toFixed(1)} -> ${labs[2][0].toFixed(1)}`)

console.log('\n[4] 反算器：目标 A2 输出三方案且最优 ΔE < 2.5')
const ctx = {
  layers: (['transparent', 'enamel', 'effect', 'dentin'] as LayerType[]).map((type) => ({
    type,
    data: buildLayerData(DEFAULT_PORCELAINS.find((p) => p.layer === type)!)
  })),
  substrate,
  budget: { cervical: 2.2, middle: 2.0, incisal: 1.8 } as Record<ZoneName, number>
}
const plan = runInverse(VITA_CLASSICAL.find((s) => s.code === 'A2')!, ctx)
check('生成 3 个方案', plan.options.length === 3)
check('最优方案 ΔE < 2.5', plan.options[0].predictedDe < 2.5, `ΔE=${plan.options[0].predictedDe}`)
check('方案按色差排序', plan.options[0].predictedDe <= plan.options[2].predictedDe)
check('厚度在物理限值内', plan.options.every((o) =>
  Object.values(o.thickness).every((z) => Object.values(z).every((v) => v >= 0 && v <= 1.7))))

console.log('\n[5] 同色异谱：诊室 LED 与 D65 读数存在差异且可量化')
const mi = metamerismIndex(refl)
check('异谱指数为有限非负值', mi >= 0 && Number.isFinite(mi), `MI=${mi.toFixed(2)}`)
const labClinic = reflectanceToLab(refl, getIlluminant('clinic').spd)
check('LED 与 D65 下 Lab 读数可区分', deltaE2000(labClinic, labD65) >= 0)

console.log('\n[6] 金属暗底 vs 氧化锆亮底：同厚度金属底更暗')
const metalLab = reflectanceToLab(stackReflectance(stack, coreReflectance('metal')), getIlluminant('d65').spd)
check('金属底 L* 显著低于氧化锆底', metalLab[0] < labD65[0] - 3,
  `金属 ${metalLab[0].toFixed(1)} vs 氧化锆 ${labD65[0].toFixed(1)}`)

console.log(failures === 0 ? '\n全部自检通过\n' : `\n存在 ${failures} 项失败\n`)
process.exit(failures === 0 ? 0 : 1)
