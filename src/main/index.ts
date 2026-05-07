import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { openDb } from './db'
import { registerIpcHandlers } from './ipc'

let db: Awaited<ReturnType<typeof openDb>>

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  db = await openDb()
  registerIpcHandlers(db, win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  db?.close()
  app.quit()
})
