// DOM 构建辅助：tag('div', {class, onclick}, '文本'|节点)
export type Child = Node | string | null | undefined | false

type ElMap = HTMLElementTagNameMap

export function tag<K extends keyof ElMap>(
  name: K,
  attrs?: Record<string, unknown>,
  ...children: Child[]
): ElMap[K] {
  const el = document.createElement(name)
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'html') el.innerHTML = String(v)
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    } else if (k === 'value') {
      ;(el as HTMLInputElement).value = String(v)
    } else {
      el.setAttribute(k, String(v))
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}

export function clear(el: HTMLElement): void {
  el.replaceChildren()
}

export function mount(el: HTMLElement, node: Node): void {
  el.replaceChildren(node)
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
export function toast(message: string): void {
  document.querySelectorAll('.toast').forEach((n) => n.remove())
  const el = tag('div', { class: 'toast' }, message)
  document.body.append(el)
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.remove(), 2600)
}

// 数字输入框
export function numberInput(value: number, step: number, min: number, max: number, onChange: (v: number) => void): HTMLInputElement {
  const input = tag('input', { type: 'number', step, min, max, value: String(value) }) as HTMLInputElement
  input.addEventListener('change', () => {
    const v = Number(input.value)
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
  })
  return input
}

// 滑块 + 数值
export function slider(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
  const range = tag('input', { type: 'range', min, max, step, value: String(value) }) as HTMLInputElement
  const num = tag('span', { class: 'mono muted' }, value.toFixed(2))
  range.addEventListener('input', () => {
    const v = Number(range.value)
    num.textContent = v.toFixed(2)
    onChange(v)
  })
  return tag('div', { class: 'row', style: 'gap:var(--sp-3)' }, range, num)
}

export function select(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = tag('select', {}) as HTMLSelectElement
  for (const o of options) {
    const opt = tag('option', { value: o.value }, o.label)
    if (o.value === current) opt.selected = true
    sel.append(opt)
  }
  sel.addEventListener('change', () => onChange(sel.value))
  return sel
}
