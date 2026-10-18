import React, { useState, useEffect } from 'react'
import { FileDown, Users, UsersRound, Search, FolderOpen, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import {
  formateursService,
  groupesService,
  sallesService,
  filieresService,
  planningSallesService,
  seancesService
} from '../services/firebaseService'
import type { Formateur, Groupe, Salle, Filiere, Seance } from '../types'
import { useTranslation } from '../lib/i18n'
import ofpptLogo from '../assets/ofppt_logo.jpg'

interface TimetableSlotData {
  module: string
  formateur: string
  salle: string
  groupe: string
}

const JOURS_LIST = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const TS_LABELS = ['08H30 - 11H00', '11H00 - 13H30', '13H30 - 16H00', '16H00 - 18H30']

// Preload OFPPT logo
let cachedLogoImg: HTMLImageElement | null = null
try {
  const img = new Image()
  img.src = ofpptLogo
  img.onload = () => { cachedLogoImg = img }
} catch (e) {
  console.warn('Could not preload ofpptLogo', e)
}

export default function ExportPage(): React.ReactElement {
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [salles, setSalles] = useState<Salle[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [planningSallesMap, setPlanningSallesMap] = useState<Record<string, any>>({})
  const [seancesList, setSeancesList] = useState<Seance[]>([])

  const [loading, setLoading] = useState(true)
  const [searchFormateur, setSearchFormateur] = useState('')
  const [searchGroupe, setSearchGroupe] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [lastExportPath, setLastExportPath] = useState<{ folderName: string; targetDir: string; filePath: string } | null>(null)
  const [isIpcAvailable, setIsIpcAvailable] = useState<boolean>(true)

  const { lang } = useTranslation()

  // Load all necessary data from Firebase
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [fData, gData, sData, filData, psData, seancesData] = await Promise.all([
          formateursService.getAll().catch(() => []),
          groupesService.getAll().catch(() => []),
          sallesService.getAll().catch(() => []),
          filieresService.getAll().catch(() => []),
          planningSallesService.getAll().catch(() => ({} as Record<string, any>)),
          seancesService.getAll().catch(() => [])
        ])

        setFormateurs(fData)
        setGroupes(gData.filter(g => !g.en_stage).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe)))
        setSalles(sData)
        setFilieres(filData)
        setPlanningSallesMap(psData || {})
        setSeancesList(seancesData || [])
      } catch (error) {
        console.error(error)
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Erreur lors du chargement des données')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [lang])

  // Helper: Build schedule for a specific Groupe
  function buildGroupeSchedule(targetGroupe: Groupe): Record<string, TimetableSlotData | null> {
    const grid: Record<string, TimetableSlotData | null> = {}
    const grpCodeNorm = targetGroupe.code_groupe.toUpperCase().replace(/\s+/g, '')

    JOURS_LIST.forEach(jour => {
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        grid[`${jour}__${sIdx}`] = null
      }
    })

    // 1. From planning_salles
    for (const [key, cell] of Object.entries(planningSallesMap)) {
      if (!cell || !cell.groupeId) continue
      const parts = key.split('__')
      if (parts.length < 3) continue
      const cellJour = parts[0].toUpperCase()
      const salleNom = parts[1].toUpperCase()
      const tsIdx = parseInt(parts[2], 10)
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 3) continue

      const cellGrp = String(cell.groupeId).toUpperCase().replace(/\s+/g, '')
      const matchesGroup = (targetGroupe.id && targetGroupe.id === cell.groupeId) || cellGrp === grpCodeNorm

      if (matchesGroup) {
        const formateur = formateurs.find(f =>
          (f.id && f.id === cell.formateurId) ||
          (f.nom_prenom && f.nom_prenom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
          (f.nom && f.nom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
          String(cell.formateurId).toUpperCase().includes((f.nom_prenom || '').toUpperCase())
        )
        const profName = formateur
          ? (formateur.nom && formateur.prenom ? `${formateur.nom} ${formateur.prenom}` : formateur.nom_prenom || formateur.nom || cell.formateurId).toUpperCase()
          : String(cell.formateurId).toUpperCase()

        grid[`${cellJour}__${tsIdx}`] = {
          module: cell.module || 'M',
          formateur: profName,
          salle: salleNom,
          groupe: targetGroupe.code_groupe
        }
      }
    }

    // 2. From seances (fallback/secondary)
    for (const seance of seancesList) {
      const seanceGrp = String(seance.code_groupe || seance.id_groupe || '').toUpperCase().replace(/\s+/g, '')
      const matchesGroup = (targetGroupe.id && targetGroupe.id === seance.id_groupe) || seanceGrp === grpCodeNorm
      if (!matchesGroup) continue

      const tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut)
      if (tsIdx === -1) continue

      const cellJour = (seance.jour || '').toUpperCase()
      const gridKey = `${cellJour}__${tsIdx}`

      if (!grid[gridKey]) {
        const formateur = formateurs.find(f => f.id === seance.id_formateur)
        const salle = salles.find(s => s.id === seance.id_salle)
        grid[gridKey] = {
          module: seance.module_code || 'M',
          formateur: (formateur?.nom_prenom || seance.nom_formateur || 'FORMATEUR').toUpperCase(),
          salle: (salle?.nom_salle || seance.nom_salle || 'SALLE').toUpperCase(),
          groupe: targetGroupe.code_groupe
        }
      }
    }

    return grid
  }

  // Helper: Build schedule for a specific Formateur
  function buildFormateurSchedule(targetFormateur: Formateur): Record<string, TimetableSlotData | null> {
    const grid: Record<string, TimetableSlotData | null> = {}
    const profNameNorm = (targetFormateur.nom_prenom || `${targetFormateur.nom || ''} ${targetFormateur.prenom || ''}`).toUpperCase().trim()

    JOURS_LIST.forEach(jour => {
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        grid[`${jour}__${sIdx}`] = null
      }
    })

    // 1. From planning_salles
    for (const [key, cell] of Object.entries(planningSallesMap)) {
      if (!cell || !cell.formateurId) continue
      const parts = key.split('__')
      if (parts.length < 3) continue
      const cellJour = parts[0].toUpperCase()
      const salleNom = parts[1].toUpperCase()
      const tsIdx = parseInt(parts[2], 10)
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 3) continue

      const cellProfNorm = String(cell.formateurId).toUpperCase().trim()
      const matchesProf = (targetFormateur.id && targetFormateur.id === cell.formateurId) ||
        cellProfNorm === profNameNorm ||
        (profNameNorm && (cellProfNorm.includes(profNameNorm) || profNameNorm.includes(cellProfNorm)))

      if (matchesProf) {
        const groupe = groupes.find(g => (g.id && g.id === cell.groupeId) || g.code_groupe.toUpperCase() === String(cell.groupeId).toUpperCase())
        const grpCode = groupe ? groupe.code_groupe : String(cell.groupeId)

        grid[`${cellJour}__${tsIdx}`] = {
          module: cell.module || 'M',
          formateur: profNameNorm,
          salle: salleNom,
          groupe: grpCode
        }
      }
    }

    // 2. From seances
    for (const seance of seancesList) {
      const matchesProf = (targetFormateur.id && targetFormateur.id === seance.id_formateur) ||
        (seance.nom_formateur && seance.nom_formateur.toUpperCase() === profNameNorm)
      if (!matchesProf) continue

      const tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut)
      if (tsIdx === -1) continue

      const cellJour = (seance.jour || '').toUpperCase()
      const gridKey = `${cellJour}__${tsIdx}`

      if (!grid[gridKey]) {
        const salle = salles.find(s => s.id === seance.id_salle)
        const groupe = groupes.find(g => g.id === seance.id_groupe)
        grid[gridKey] = {
          module: seance.module_code || 'M',
          formateur: profNameNorm,
          salle: (salle?.nom_salle || seance.nom_salle || 'SALLE').toUpperCase(),
          groupe: groupe?.code_groupe || seance.code_groupe || 'GROUPE'
        }
      }
    }

    return grid
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NATIVE jsPDF GENERATOR: Instant, 100% Vector Quality, No DOM dependency
  // ══════════════════════════════════════════════════════════════════════════
  function generateTimetablePdf(
    type: 'groupe' | 'formateur',
    targetCodeOrName: string,
    metaData: Record<string, string>,
    grid: Record<string, TimetableSlotData | null>
  ): jsPDF {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    // Dimensions
    const pageWidth = 297
    const pageHeight = 210
    const margin = 8
    const contentWidth = pageWidth - margin * 2 // 281mm

    // ── Outer Border ──
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.6)
    doc.rect(margin, margin, contentWidth, pageHeight - margin * 2)

    // ── Header Box ──
    doc.line(margin, 26, margin + contentWidth, 26)

    // Logo (if loaded)
    if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.naturalWidth > 0) {
      try {
        doc.addImage(cachedLogoImg, 'JPEG', margin + 3, margin + 1.5, 22, 15)
      } catch (err) {
        // Fallback badge if image load issue
        doc.setFillColor(15, 118, 110)
        doc.roundedRect(margin + 3, margin + 2, 22, 14, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(255, 255, 255)
        doc.text('OFPPT', margin + 14, margin + 10.5, { align: 'center' })
      }
    } else {
      doc.setFillColor(15, 118, 110)
      doc.roundedRect(margin + 3, margin + 2, 22, 14, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(255, 255, 255)
      doc.text('OFPPT', margin + 14, margin + 10.5, { align: 'center' })
    }

    // Header Vertical Divider
    doc.line(margin + 28, margin, margin + 28, 26)

    // Header Text
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(51, 65, 85)
    doc.text('ROYAUME DU MAROC  •  OFPPT  •  ISTA / CFP', margin + 32, margin + 5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(15, 23, 42)
    const titleText = type === 'groupe'
      ? `EMPLOI DU TEMPS DU GROUPE : ${targetCodeOrName}`
      : `EMPLOI DU TEMPS DU FORMATEUR : ${targetCodeOrName}`
    doc.text(titleText, margin + 32, margin + 12)

    // Year
    const anneeFormation = type === 'groupe'
      ? (localStorage.getItem('annee_formation_groupe') || '2026/2027')
      : (localStorage.getItem('annee_formation_formateur') || '2026/2027')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(15, 118, 110)
    doc.text(`ANNEE DE FORMATION : ${anneeFormation}`, margin + contentWidth - 4, margin + 12, { align: 'right' })

    // ── Metadata Grid ──
    const metaY = 27
    const metaHeight = 15
    doc.line(margin, metaY + metaHeight, margin + contentWidth, metaY + metaHeight)

    doc.setFontSize(8.5)
    const colWidth = contentWidth / 3
    let metaIdx = 0

    const entries = Object.entries(metaData)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const item = entries[metaIdx]
        if (item) {
          const posX = margin + 4 + c * colWidth
          const posY = metaY + 5.5 + r * 6.5

          doc.setFont('helvetica', 'bold')
          doc.setTextColor(15, 23, 42)
          doc.text(`${item[0]} :`, posX, posY)

          doc.setFont('helvetica', 'normal')
          doc.setTextColor(51, 65, 85)
          const offsetKey = doc.getTextWidth(`${item[0]} : `)
          doc.text(item[1] || '—', posX + offsetKey + 1, posY)
        }
        metaIdx++
      }
    }

    // ── Weekly Schedule Table ──
    const tableTop = metaY + metaHeight // 42mm
    const dayColWidth = 33              // 33mm for day column
    const slotColWidth = (contentWidth - dayColWidth) / 4 // 62mm per slot
    const headerRowHeight = 9
    const dayRowHeight = 22             // 22mm per day row (6 * 22 = 132mm)

    // Table Header Background
    doc.setFillColor(229, 231, 235)
    doc.rect(margin, tableTop, contentWidth, headerRowHeight, 'FD')

    // Header Day Column
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    doc.text('JOUR / CRÉNEAU', margin + dayColWidth / 2, tableTop + 6, { align: 'center' })
    doc.line(margin + dayColWidth, tableTop, margin + dayColWidth, tableTop + headerRowHeight)

    // Header Time Slots
    TS_LABELS.forEach((lbl, i) => {
      const slotX = margin + dayColWidth + i * slotColWidth
      doc.text(lbl, slotX + slotColWidth / 2, tableTop + 6, { align: 'center' })
      if (i > 0) {
        doc.line(slotX, tableTop, slotX, tableTop + headerRowHeight)
      }
    })

    // ── Table Rows (6 Days) ──
    JOURS_LIST.forEach((jour, jourIdx) => {
      const rowY = tableTop + headerRowHeight + jourIdx * dayRowHeight

      // Day Column Background & Label
      doc.setFillColor(243, 244, 246)
      doc.rect(margin, rowY, dayColWidth, dayRowHeight, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(15, 23, 42)
      doc.text(jour, margin + dayColWidth / 2, rowY + dayRowHeight / 2 + 1.5, { align: 'center' })

      // Vertical line after day
      doc.line(margin + dayColWidth, rowY, margin + dayColWidth, rowY + dayRowHeight)

      // Time Slots
      for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
        const slotX = margin + dayColWidth + slotIdx * slotColWidth
        const cell = grid[`${jour}__${slotIdx}`]

        if (cell) {
          // Occupied Slot: Light Emerald Background
          doc.setFillColor(240, 253, 244)
          doc.rect(slotX, rowY, slotColWidth, dayRowHeight, 'FD')

          // 1. Module (bold emerald)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.setTextColor(6, 95, 70)
          doc.text(cell.module, slotX + slotColWidth / 2, rowY + 6.5, { align: 'center' })

          // 2. Prof / Groupe (bold slate)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9.5)
          doc.setTextColor(15, 23, 42)
          const midLabel = type === 'groupe' ? cell.formateur : cell.groupe
          // Truncate if too long
          const truncatedLabel = midLabel.length > 25 ? `${midLabel.substring(0, 23)}...` : midLabel
          doc.text(truncatedLabel, slotX + slotColWidth / 2, rowY + 12.5, { align: 'center' })

          // 3. Salle Badge
          doc.setFillColor(226, 232, 240)
          const badgeWidth = Math.min(slotColWidth - 14, 34)
          doc.roundedRect(slotX + (slotColWidth - badgeWidth) / 2, rowY + 15, badgeWidth, 5, 1, 1, 'F')

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(51, 65, 85)
          doc.text(cell.salle, slotX + slotColWidth / 2, rowY + 18.7, { align: 'center' })
        } else {
          // Empty Slot
          doc.setFillColor(255, 255, 255)
          doc.rect(slotX, rowY, slotColWidth, dayRowHeight, 'FD')

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(203, 213, 225)
          doc.text('—', slotX + slotColWidth / 2, rowY + dayRowHeight / 2 + 1, { align: 'center' })
        }

        // Slot Vertical Divider
        if (slotIdx > 0) {
          doc.line(slotX, rowY, slotX, rowY + dayRowHeight)
        }
      }

      // Horizontal line after each day
      doc.line(margin, rowY + dayRowHeight, margin + contentWidth, rowY + dayRowHeight)
    })

    // ── Signatures Footer ──
    const footerY = tableTop + headerRowHeight + 6 * dayRowHeight + 3 // ~186mm
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42)

    doc.text('Visa du Formateur / Coordinateur Pédagogique', margin + 45, footerY + 5, { align: 'center' })
    doc.text("Visa du Directeur du Complexe / Chef d'Établissement", margin + contentWidth - 45, footerY + 5, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} • Système de Gestion des Emplois du Temps OFPPT`, margin + contentWidth / 2, footerY + 11, { align: 'center' })

    return doc
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Bulletproof Save: Tries Desktop IPC first, with seamless browser fallback
  // ══════════════════════════════════════════════════════════════════════════
  async function savePdfFile(folderName: string, fileName: string, doc: jsPDF) {
    const base64Data = doc.output('datauristring').split(',')[1]

    // 1. Try Desktop IPC in Electron
    let ipcResult: any = null
    try {
      if ((window as any).api?.savePdfToDesktop) {
        ipcResult = await (window as any).api.savePdfToDesktop({ folderName, fileName, base64Data })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        ipcResult = await (window as any).electron.ipcRenderer.invoke('save-pdf-to-desktop', { folderName, fileName, base64Data })
      }
    } catch (ipcErr: any) {
      console.warn('Electron IPC save not ready or failed:', ipcErr)
      setIsIpcAvailable(false)
    }

    if (ipcResult && ipcResult.success) {
      return {
        success: true,
        desktopSaved: true,
        folderName: ipcResult.folderName || folderName,
        targetDir: ipcResult.targetDir || folderName,
        filePath: ipcResult.filePath || fileName
      }
    }

    // 2. Fallback: Save directly via browser download
    try {
      doc.save(fileName)
      return {
        success: true,
        desktopSaved: false,
        folderName,
        targetDir: 'Téléchargements',
        filePath: fileName
      }
    } catch (saveErr) {
      console.error('doc.save error:', saveErr)
      return {
        success: false,
        error: String(saveErr)
      }
    }
  }

  // Open the created desktop folder
  async function handleOpenFolder(targetDir: string) {
    try {
      if ((window as any).api?.openDesktopFolder) {
        await (window as any).api.openDesktopFolder(targetDir)
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        await (window as any).electron.ipcRenderer.invoke('open-desktop-folder', targetDir)
      } else {
        toast.success(lang === 'ar' ? 'تم حفظ الملف في جهازك بنجاح' : 'Fichier enregistré avec succès')
      }
    } catch (e) {
      toast.success(lang === 'ar' ? 'تم حفظ الملف في جهازك بنجاح' : 'Fichier enregistré avec succès')
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT SINGLE GROUPE
  // ══════════════════════════════════════════════════════════════════════════
  async function exportSingleGroupe(groupe: Groupe) {
    try {
      setExportingId(groupe.id || groupe.code_groupe)

      const grid = buildGroupeSchedule(groupe)
      const filiereObj = filieres.find(f => f.id === groupe.id_filiere || f.code_filiere === groupe.filiere)
      const anneeLabel = groupe.annee === 2 ? '2ème Année' : '1ère Année'
      const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2026/2027'
      const periode = localStorage.getItem('periode_application_groupe') || 'Du 01/09/2026 au 30/06/2027'

      const meta = {
        'DRGC': 'Direction Régionale Grand Casablanca',
        'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
        'Filière': filiereObj ? `${filiereObj.code_filiere} - ${filiereObj.nom_filiere}` : (groupe.filiere || 'Filière'),
        'Groupe': groupe.code_groupe,
        'Niveau': anneeLabel,
        'Période': periode,
        'Mode de formation': 'FPA / Résidentiel'
      }

      // Generate PDF natively (takes ~15ms)
      const doc = generateTimetablePdf('groupe', groupe.code_groupe, meta, grid)

      const folderName = groupe.code_groupe.trim()
      const fileName = `${folderName}_Emploi_du_Temps.pdf`

      const saveResult = await savePdfFile(folderName, fileName, doc)

      if (saveResult && saveResult.success) {
        if (saveResult.desktopSaved) {
          setLastExportPath({
            folderName: saveResult.folderName,
            targetDir: saveResult.targetDir,
            filePath: saveResult.filePath
          })

          toast.success(
            (t) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {lang === 'ar'
                    ? `تم حفظ ملف الفوج (${folderName}) على سطح المكتب!`
                    : `Planning du groupe (${folderName}) sauvegardé !`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {lang === 'ar'
                    ? `سطح المكتب > مجلد [${folderName}] > ${fileName}`
                    : `Bureau > Dossier [${folderName}] > ${fileName}`}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                  onClick={() => {
                    toast.dismiss(t.id)
                    handleOpenFolder(saveResult.targetDir)
                  }}
                >
                  <FolderOpen size={14} />
                  {lang === 'ar' ? 'فتح المجلد على سطح المكتب' : 'Ouvrir le dossier sur le Bureau'}
                </button>
              </div>
            ),
            { duration: 7000 }
          )
        } else {
          toast.success(
            lang === 'ar'
              ? `تم تنزيل جدول الفوج (${folderName}) بنجاح! تم حفظ الملف باسم ${fileName}`
              : `Planning du groupe (${folderName}) téléchargé avec succès !`,
            { duration: 5000 }
          )
        }
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف' : 'Erreur lors de la sauvegarde du fichier')
      }
    } catch (err: any) {
      console.error('exportSingleGroupe error:', err)
      toast.error(lang === 'ar' ? `فشل التصدير: ${err?.message || ''}` : `Échec: ${err?.message || ''}`)
    } finally {
      setExportingId(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT SINGLE FORMATEUR
  // ══════════════════════════════════════════════════════════════════════════
  async function exportSingleFormateur(formateur: Formateur) {
    try {
      const profName = formateur.nom_prenom || `${formateur.nom || ''} ${formateur.prenom || ''}`.trim() || 'Formateur'
      setExportingId(formateur.id || profName)

      const grid = buildFormateurSchedule(formateur)
      const anneeFormation = localStorage.getItem('annee_formation_formateur') || '2026/2027'
      const periode = localStorage.getItem('periode_application_formateur') || 'Du 01/09/2026 au 30/06/2027'

      const meta = {
        'DRGC': 'Direction Régionale Grand Casablanca',
        'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
        'Formateur': profName,
        'Matricule': formateur.matricule || '-',
        'Spécialité': formateur.specialite || formateur.matiere || 'Technique',
        'Période': periode,
        'Statut': 'Statutaire'
      }

      const doc = generateTimetablePdf('formateur', profName, meta, grid)

      const folderName = profName.replace(/[\\/:*?"<>|]/g, '_').trim()
      const fileName = `${folderName}_Emploi_du_Temps.pdf`

      const saveResult = await savePdfFile(folderName, fileName, doc)

      if (saveResult && saveResult.success) {
        if (saveResult.desktopSaved) {
          setLastExportPath({
            folderName: saveResult.folderName,
            targetDir: saveResult.targetDir,
            filePath: saveResult.filePath
          })

          toast.success(
            (t) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {lang === 'ar'
                    ? `تم حفظ ملف الأستاذ (${folderName}) على سطح المكتب!`
                    : `Planning du formateur (${folderName}) sauvegardé !`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {lang === 'ar'
                    ? `سطح المكتب > مجلد [${folderName}] > ${fileName}`
                    : `Bureau > Dossier [${folderName}] > ${fileName}`}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                  onClick={() => {
                    toast.dismiss(t.id)
                    handleOpenFolder(saveResult.targetDir)
                  }}
                >
                  <FolderOpen size={14} />
                  {lang === 'ar' ? 'فتح المجلد على سطح المكتب' : 'Ouvrir le dossier sur le Bureau'}
                </button>
              </div>
            ),
            { duration: 7000 }
          )
        } else {
          toast.success(
            lang === 'ar'
              ? `تم تنزيل جدول الأستاذ (${folderName}) بنجاح!`
              : `Planning du formateur (${folderName}) téléchargé avec succès !`,
            { duration: 5000 }
          )
        }
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف' : 'Erreur de sauvegarde')
      }
    } catch (err: any) {
      console.error('exportSingleFormateur error:', err)
      toast.error(lang === 'ar' ? `فشل التصدير: ${err?.message || ''}` : `Échec: ${err?.message || ''}`)
    } finally {
      setExportingId(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT ALL GROUPES (GLOBAL)
  // ══════════════════════════════════════════════════════════════════════════
  async function exportAllGroupes() {
    if (groupes.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد أفواج للتصدير' : 'Aucun groupe à exporter')
      return
    }

    try {
      setBulkProgress({ current: 0, total: groupes.length, label: 'Démarrage de l\'exportation...' })
      let exportedCount = 0
      let desktopSavedCount = 0

      for (let i = 0; i < groupes.length; i++) {
        const g = groupes[i]
        setBulkProgress({
          current: i + 1,
          total: groupes.length,
          label: lang === 'ar'
            ? `جاري تصدير الفوج ${g.code_groupe} (${i + 1}/${groupes.length})...`
            : `Export du groupe ${g.code_groupe} (${i + 1}/${groupes.length})...`
        })

        const grid = buildGroupeSchedule(g)
        const filiereObj = filieres.find(f => f.id === g.id_filiere || f.code_filiere === g.filiere)
        const anneeLabel = g.annee === 2 ? '2ème Année' : '1ère Année'
        const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2026/2027'
        const periode = localStorage.getItem('periode_application_groupe') || 'Du 01/09/2026 au 30/06/2027'

        const meta = {
          'DRGC': 'Direction Régionale Grand Casablanca',
          'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
          'Filière': filiereObj ? `${filiereObj.code_filiere} - ${filiereObj.nom_filiere}` : (g.filiere || 'Filière'),
          'Groupe': g.code_groupe,
          'Niveau': anneeLabel,
          'Période': periode,
          'Mode de formation': 'FPA / Résidentiel'
        }

        const doc = generateTimetablePdf('groupe', g.code_groupe, meta, grid)
        const folderName = g.code_groupe.trim()
        const fileName = `${folderName}_Emploi_du_Temps.pdf`

        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          exportedCount++
          if (res.desktopSaved) desktopSavedCount++
        }

        // Small yield so UI remains silky smooth
        if (i % 5 === 0) {
          await new Promise(r => setTimeout(r, 10))
        }
      }

      if (desktopSavedCount > 0) {
        toast.success(
          lang === 'ar'
            ? `🎉 تم بنجاح تصدير جميع الأفواج (${exportedCount})! تم إنشاء مجلد لكل فوج على سطح المكتب وبداخله ملف الـ PDF.`
            : `🎉 Succès ! ${exportedCount} groupes exportés sur le Bureau dans leurs dossiers respectifs.`
        )
      } else {
        toast.success(
          lang === 'ar'
            ? `🎉 تم تصدير وتحميل جميع ملفات الـ PDF للأفواج (${exportedCount}) بنجاح!`
            : `🎉 Succès ! ${exportedCount} plannings PDF exportés avec succès.`
        )
      }
    } catch (err: any) {
      console.error('exportAllGroupes error:', err)
      toast.error(lang === 'ar' ? `حدث خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT ALL FORMATEURS (GLOBAL)
  // ══════════════════════════════════════════════════════════════════════════
  async function exportAllFormateurs() {
    if (formateurs.length === 0) {
      toast.error(lang === 'ar' ? 'لا يوجد مكونين للتصدير' : 'Aucun formateur à exporter')
      return
    }

    try {
      setBulkProgress({ current: 0, total: formateurs.length, label: 'Démarrage de l\'exportation...' })
      let exportedCount = 0
      let desktopSavedCount = 0

      for (let i = 0; i < formateurs.length; i++) {
        const f = formateurs[i]
        const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || `Formateur_${i + 1}`

        setBulkProgress({
          current: i + 1,
          total: formateurs.length,
          label: lang === 'ar'
            ? `جاري تصدير الأستاذ ${profName} (${i + 1}/${formateurs.length})...`
            : `Export du formateur ${profName} (${i + 1}/${formateurs.length})...`
        })

        const grid = buildFormateurSchedule(f)
        const anneeFormation = localStorage.getItem('annee_formation_formateur') || '2026/2027'
        const periode = localStorage.getItem('periode_application_formateur') || 'Du 01/09/2026 au 30/06/2027'

        const meta = {
          'DRGC': 'Direction Régionale Grand Casablanca',
          'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
          'Formateur': profName,
          'Matricule': f.matricule || '-',
          'Spécialité': f.specialite || f.matiere || 'Technique',
          'Période': periode,
          'Statut': 'Statutaire'
        }

        const doc = generateTimetablePdf('formateur', profName, meta, grid)
        const folderName = profName.replace(/[\\/:*?"<>|]/g, '_').trim()
        const fileName = `${folderName}_Emploi_du_Temps.pdf`

        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          exportedCount++
          if (res.desktopSaved) desktopSavedCount++
        }

        if (i % 5 === 0) {
          await new Promise(r => setTimeout(r, 10))
        }
      }

      if (desktopSavedCount > 0) {
        toast.success(
          lang === 'ar'
            ? `🎉 تم بنجاح تصدير جميع المكونين (${exportedCount}) في مجلداتهم الخاصة على سطح المكتب!`
            : `🎉 Succès ! ${exportedCount} formateurs exportés sur le Bureau.`
        )
      } else {
        toast.success(
          lang === 'ar'
            ? `🎉 تم تصدير جميع جداول المكونين (${exportedCount}) بنجاح!`
            : `🎉 Succès ! ${exportedCount} plannings formateurs exportés avec succès.`
        )
      }
    } catch (err: any) {
      console.error('exportAllFormateurs error:', err)
      toast.error(lang === 'ar' ? `حدث خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // Filtered lists
  const filteredFormateurs = formateurs.filter(f => {
    const term = searchFormateur.toLowerCase().trim()
    if (!term) return true
    const name = (f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`).toLowerCase()
    const matricule = (f.matricule || '').toLowerCase()
    return name.includes(term) || matricule.includes(term)
  })

  const filteredGroupes = groupes.filter(g => {
    const term = searchGroupe.toLowerCase().trim()
    if (!term) return true
    return g.code_groupe.toLowerCase().includes(term)
  })

  return (
    <div className="fade-in-up">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'تصدير التقارير وجداول الحصص (PDF)' : 'Export des Rapports & Emplois du Temps (PDF)'}</h1>
          <p>
            {lang === 'ar'
              ? 'يتم تنزيل كل ملف مباشرة على سطح المكتب داخل مجلد يحمل اسم الفوج أو الأستاذ'
              : 'Chaque fichier est automatiquement enregistré sur le Bureau dans un dossier portant le nom du groupe ou du formateur'}
          </p>
        </div>

        {lastExportPath && (
          <button
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontWeight: 700 }}
            onClick={() => handleOpenFolder(lastExportPath.targetDir)}
          >
            <FolderOpen size={18} color="#059669" />
            {lang === 'ar' ? `فتح آخر مجلد (${lastExportPath.folderName})` : `Ouvrir dossier (${lastExportPath.folderName})`}
          </button>
        )}
      </div>

      {/* ── Status Hint if IPC needs restart ── */}
      {!isIpcAvailable && (
        <div style={{
          background: 'rgba(234, 88, 12, 0.08)',
          border: '1px solid #ea580c',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: '#c2410c'
        }}>
          <AlertTriangle size={18} />
          <span>
            {lang === 'ar'
              ? 'تنبيه: لتفعيل الحفظ المباشر في مجلد سطح المكتب تلقائياً، يرجى إعادة تشغيل التطبيق (Restart).'
              : 'Note : Pour activer la création automatique des dossiers sur le Bureau, veuillez redémarrer l\'application (Restart).'}
          </span>
        </div>
      )}

      {/* ── Bulk Progress Banner ── */}
      {bulkProgress && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08))',
          border: '1.5px solid #10b981',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={18} className="animate-spin" color="#10b981" />
              {bulkProgress.label}
            </span>
            <span style={{ color: '#059669', fontSize: 15 }}>
              {bulkProgress.current} / {bulkProgress.total} ({Math.round((bulkProgress.current / bulkProgress.total) * 100)}%)
            </span>
          </div>
          <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981, #059669)',
              transition: 'width 0.15s ease'
            }} />
          </div>
        </div>
      )}

      {/* ── Page Body ── */}
      <div className="page-body">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <div className="dashboard-grid">

            {/* ══════════════════════════════════════════════════════════
                CARD 1: PLANNINGS DES FORMATEURS
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="card-header" style={{ marginBottom: 16 }}>
                <h3 className="card-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Users size={22} color="var(--primary)" />
                  {lang === 'ar' ? 'جداول المكونين (Formateurs)' : 'Plannings des Formateurs'}
                </h3>
                <span className="badge badge-info" style={{ fontSize: 12 }}>
                  {formateurs.length} {lang === 'ar' ? 'مكون' : 'formateurs'}
                </span>
              </div>

              {/* Global Button */}
              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginBottom: 16,
                  padding: '13px 20px',
                  fontSize: '15px',
                  fontWeight: 700,
                  gap: '10px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
                }}
                disabled={!!bulkProgress}
                onClick={exportAllFormateurs}
              >
                <FileDown size={19} />
                {lang === 'ar'
                  ? 'تصدير جميع المكونين (مجلد لكل أستاذ على المكتب)'
                  : 'Exporter tous les formateurs (Dossier / Bureau)'}
              </button>

              {/* Quick Search */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={16} style={{ position: 'absolute', top: 12, left: lang === 'ar' ? undefined : 12, right: lang === 'ar' ? 12 : undefined, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'بحث سريع عن مكون...' : 'Rechercher un formateur...'}
                  value={searchFormateur}
                  onChange={(e) => setSearchFormateur(e.target.value)}
                  style={{
                    width: '100%',
                    padding: lang === 'ar' ? '9px 36px 9px 12px' : '9px 12px 9px 36px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    background: 'var(--bg-secondary)'
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>{lang === 'ar' ? 'تصدير فردي :' : 'Export individuel :'}</span>
                <span style={{ fontSize: 11, fontWeight: 400 }}>{filteredFormateurs.length} {lang === 'ar' ? 'نتيجة' : 'trouvé(s)'}</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 6 }}>
                {filteredFormateurs.map((f) => {
                  const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || 'Formateur'
                  const isCurrentExporting = exportingId === (f.id || profName)
                  return (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{profName}</span>
                        {f.matricule && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mle: {f.matricule}</span>}
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, gap: '7px' }}
                        disabled={!!exportingId || !!bulkProgress}
                        onClick={() => exportSingleFormateur(f)}
                      >
                        {isCurrentExporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {lang === 'ar' ? 'جاري الحفظ...' : 'Sauvegarde...'}
                          </>
                        ) : (
                          <>
                            <FileDown size={15} />
                            {lang === 'ar' ? 'تصدير للمكتب' : 'Exporter'}
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                CARD 2: PLANNINGS DES GROUPES
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px', border: '1.5px solid rgba(16, 185, 129, 0.4)' }}>
              <div className="card-header" style={{ marginBottom: 16 }}>
                <h3 className="card-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <UsersRound size={22} color="#059669" />
                  {lang === 'ar' ? 'جداول الأفواج (Groupes)' : 'Plannings des Groupes'}
                </h3>
                <span className="badge" style={{ fontSize: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid #10b981' }}>
                  {groupes.length} {lang === 'ar' ? 'فوج' : 'groupes'}
                </span>
              </div>

              {/* Global Button */}
              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginBottom: 16,
                  padding: '13px 20px',
                  fontSize: '15px',
                  fontWeight: 700,
                  gap: '10px',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
                disabled={!!bulkProgress}
                onClick={exportAllGroupes}
              >
                <FileDown size={19} />
                {lang === 'ar'
                  ? 'تصدير جدول جميع الأفواج (مجلد لكل فوج على سطح المكتب)'
                  : 'Exporter tous les groupes (Dossier / Bureau)'}
              </button>

              {/* Quick Search for Groups */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={16} style={{ position: 'absolute', top: 12, left: lang === 'ar' ? undefined : 12, right: lang === 'ar' ? 12 : undefined, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'بحث سريع عن فوج (مثال: AEFGT101)...' : 'Rechercher un groupe (ex: AEFGT101)...'}
                  value={searchGroupe}
                  onChange={(e) => setSearchGroupe(e.target.value)}
                  style={{
                    width: '100%',
                    padding: lang === 'ar' ? '9px 36px 9px 12px' : '9px 12px 9px 36px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    background: 'var(--bg-secondary)'
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>{lang === 'ar' ? 'تصدير فردي (سطح المكتب > مجلد اسم الفوج) :' : 'Export individuel (Bureau > Dossier du groupe) :'}</span>
                <span style={{ fontSize: 11, fontWeight: 400 }}>{filteredGroupes.length} {lang === 'ar' ? 'فوج' : 'groupe(s)'}</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 6 }}>
                {filteredGroupes.map((g) => {
                  const isCurrentExporting = exportingId === (g.id || g.code_groupe)
                  return (
                    <div
                      key={g.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#10b981'
                        }} />
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                          {g.code_groupe}
                        </span>
                        {g.filiere && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>
                            {g.filiere}
                          </span>
                        )}
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 700,
                          gap: '7px',
                          color: '#059669',
                          borderColor: '#10b981'
                        }}
                        disabled={!!exportingId || !!bulkProgress}
                        onClick={() => exportSingleGroupe(g)}
                      >
                        {isCurrentExporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {lang === 'ar' ? 'جاري الحفظ...' : 'Sauvegarde...'}
                          </>
                        ) : (
                          <>
                            <FileDown size={15} />
                            {lang === 'ar' ? 'تصدير للمكتب' : 'Exporter'}
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
