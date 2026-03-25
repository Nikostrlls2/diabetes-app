export function apiUrl(path: string) {
  const base = window.location.protocol === 'file:' ? 'http://127.0.0.1:3001' : ''
  return `${base}${path}`
}
