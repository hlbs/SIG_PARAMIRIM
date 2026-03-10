import paperFileNames from 'virtual:papers-manifest'

export type PaperItem = {
  id: string
  code: string
  fileName: string
  title: string
  url: string
}

const BASE_URL = import.meta.env.BASE_URL

function resolvePublicPath(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, '')}`
}

function extractNumericPrefix(fileName: string): number {
  const match = fileName.match(/^(\d+)/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1])
}

function toCode(fileName: string, index: number): string {
  const match = fileName.match(/^(\d+)/)
  if (match) return match[1].padStart(2, '0')
  return String(index + 1).padStart(2, '0')
}

function toTitle(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/^\d+[_-]?/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const orderedFiles = [...paperFileNames].sort((a, b) => {
  const numericA = extractNumericPrefix(a)
  const numericB = extractNumericPrefix(b)
  if (numericA !== numericB) return numericA - numericB
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
})

export const papers: PaperItem[] = orderedFiles.map((fileName, index) => ({
  id: `paper-${index + 1}`,
  code: toCode(fileName, index),
  fileName,
  title: toTitle(fileName),
  url: resolvePublicPath(`/papers/${encodeURIComponent(fileName)}`)
}))
