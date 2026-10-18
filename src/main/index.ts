import { app, shell, BrowserWindow, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icons/icon.jpg')
  const appIcon = nativeImage.createFromPath(iconPath)
  
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'نظام إدارة استعمال الزمن - OFPPT',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ofppt.emploi-du-temps')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handler: Save PDF to a specific folder on the Desktop
  ipcMain.handle(
    'save-pdf-to-desktop',
    async (_event, payload: { folderName: string; fileName: string; base64Data: string }) => {
      try {
        const { folderName, fileName, base64Data } = payload
        const desktopPath = app.getPath('desktop')

        // Clean folder and file names of forbidden characters (\ / : * ? " < > |)
        const cleanFolder = (folderName || 'Groupe').replace(/[\\/:*?"<>|]/g, '_').trim()
        let cleanFile = (fileName || 'Emploi_du_Temps').replace(/[\\/:*?"<>|]/g, '_').trim()
        if (!cleanFile.toLowerCase().endsWith('.pdf')) {
          cleanFile += '.pdf'
        }

        const targetDir = join(desktopPath, cleanFolder)
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
        }

        const filePath = join(targetDir, cleanFile)
        const buffer = Buffer.from(base64Data, 'base64')
        fs.writeFileSync(filePath, buffer)

        return {
          success: true,
          filePath,
          targetDir,
          folderName: cleanFolder,
          fileName: cleanFile
        }
      } catch (err: any) {
        console.error('save-pdf-to-desktop error:', err)
        return {
          success: false,
          error: err?.message || String(err)
        }
      }
    }
  )

  // IPC Handler: Open folder or file in system file explorer
  ipcMain.handle('open-desktop-folder', async (_event, targetPath: string) => {
    try {
      if (fs.existsSync(targetPath)) {
        await shell.openPath(targetPath)
        return { success: true }
      }
      return { success: false, error: 'Path does not exist' }
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
