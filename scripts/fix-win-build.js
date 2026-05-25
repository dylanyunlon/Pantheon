const path = require('path')
const fs = require('fs')

const cacheDir = path.join(
  process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
  'electron-builder', 'Cache', 'winCodeSign'
)

if (fs.existsSync(cacheDir)) {
  console.log('[fix-win-build] Clearing corrupted winCodeSign cache:', cacheDir)
  fs.rmSync(cacheDir, { recursive: true, force: true })
  console.log('[fix-win-build] Cache cleared. Retry build now.')
} else {
  console.log('[fix-win-build] No winCodeSign cache found, nothing to clear.')
}
