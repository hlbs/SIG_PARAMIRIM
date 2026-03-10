import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
const papersVirtualModuleId = 'virtual:papers-manifest'
const papersResolvedVirtualModuleId = `\0${papersVirtualModuleId}`

function extractNumericPrefix(fileName: string): number {
  const match = fileName.match(/^(\d+)/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1])
}

function papersManifestPlugin(): Plugin {
  const papersDir = path.resolve(__dirname, 'public/papers')

  const readPapers = () => {
    if (!fs.existsSync(papersDir)) return []

    return fs.readdirSync(papersDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
      .map((entry) => entry.name)
      .sort((a, b) => {
        const numericA = extractNumericPrefix(a)
        const numericB = extractNumericPrefix(b)
        if (numericA !== numericB) return numericA - numericB
        return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
      })
  }

  return {
    name: 'papers-manifest-plugin',
    resolveId(source) {
      if (source === papersVirtualModuleId) return papersResolvedVirtualModuleId
      return null
    },
    load(id) {
      if (id !== papersResolvedVirtualModuleId) return null
      return `export default ${JSON.stringify(readPapers())};`
    },
    handleHotUpdate(context) {
      if (!context.file.startsWith(papersDir)) return
      const module = context.server.moduleGraph.getModuleById(papersResolvedVirtualModuleId)
      if (!module) return
      context.server.moduleGraph.invalidateModule(module)
      return [module]
    }
  }
}

export default defineConfig({
  plugins: [react(), papersManifestPlugin()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } }
})
