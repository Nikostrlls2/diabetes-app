import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ApiServerHandle = {
  server: {
    close: () => void
  }
}

let apiServer: ApiServerHandle | null = null
let apiServerStart: Promise<void> | null = null

async function ensureApiServer() {
  if (apiServer) {
    return
  }

  if (apiServerStart) {
    return apiServerStart
  }

  apiServerStart = import('../server/index.js')
    .then(({ startApiServer }) => {
      apiServer = startApiServer({
        port: 3001,
        enableCors: true,
      })
    })
    .catch((error) => {
      console.error('Failed to start GlucoPilot API server:', error)
    })
    .finally(() => {
      apiServerStart = null
    })

  return apiServerStart
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 760,
    backgroundColor: '#f4efe6',
    icon: path.join(__dirname, '..', '..', 'dist', 'logo.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  })

  window.removeMenu()
  const loadPromise = window.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
  void ensureApiServer()
  await loadPromise
}

app.whenReady().then(async () => {
  app.setAppUserModelId('Clwzy.GlucoPilot')
  Menu.setApplicationMenu(null)
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('before-quit', () => {
  apiServer?.server.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
