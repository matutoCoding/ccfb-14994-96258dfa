// 统一线性图标库（stroke 1.7，无 emoji）
const svg = (paths: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`

export const icons = {
  cases: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>'),
  crown: svg('<path d="M4 8l3 3 5-5 5 5 3-3v10H4z"/><path d="M4 18h16"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  shade: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>'),
  light: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  doc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>'),
  upload: svg('<path d="M12 15V4m0 0L8 8m4-4l4 4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  print: svg('<path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="1"/><path d="M7 14h10v7H7z"/>'),
  check: svg('<path d="M5 12l5 5L20 7"/>'),
  alert: svg('<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 5v6h-6"/>'),
  edit: svg('<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  tooth: svg('<path d="M12 4c-3-2-7-1-7 4 0 3 1 4 1.5 8 .4 3 1.5 5 2.5 5s1-3 1.5-5c.3-1.2 2.2-1.2 2.5 0 .5 2 .5 5 1.5 5s2.1-2 2.5-5C18 12 19 11 19 8c0-5-4-6-7-4z"/>'),
  chart: svg('<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>')
}

export function iconHtml(name: keyof typeof icons): string {
  return icons[name]
}
