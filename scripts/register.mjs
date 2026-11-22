// Node 自检用 TS 加载器：Node 24 原生剥离类型，仅补 .ts 扩展解析
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.json')) {
    const base = new URL(specifier, context.parentURL)
    const tsPath = fileURLToPath(base) + '.ts'
    if (existsSync(tsPath)) {
      return { url: base.href + '.ts', shortCircuit: true }
    }
  }
  return nextResolve(specifier, context)
}
