/// <reference types="vite/client" />

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module 'html2canvas' {
  import html2canvas from 'html2canvas'
  export default html2canvas
}

interface Window {
  electron?: any
  api?: {
    savePdfToDesktop: (payload: { folderName: string; fileName: string; base64Data: string }) => Promise<{
      success: boolean
      filePath?: string
      targetDir?: string
      folderName?: string
      fileName?: string
      error?: string
    }>
    openDesktopFolder: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  }
}
