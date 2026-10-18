import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const customAPI = {
  savePdfToDesktop: (payload: { folderName: string; fileName: string; base64Data: string }) =>
    ipcRenderer.invoke('save-pdf-to-desktop', payload),
  openDesktopFolder: (targetPath: string) =>
    ipcRenderer.invoke('open-desktop-folder', targetPath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', customAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = customAPI
}
