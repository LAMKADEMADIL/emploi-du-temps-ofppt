import React, { useState, useEffect } from 'react'
import {
  FileDown,
  Users,
  UsersRound,
  Search,
  FolderOpen,
  RefreshCw,
  CheckSquare,
  Square,
  AlertTriangle,
  FileText,
  Files
} from 'lucide-react'
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

const JOURS_LIST = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const TS_LABELS = ['8h30-11h00', '11h00-13h30', '13h30-16h00', '16h00-18h30']

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

  // Multi-selection checkboxes
  const [selectedFormateurIds, setSelectedFormateurIds] = useState<Set<string>>(new Set())
  const [selectedGroupeIds, setSelectedGroupeIds] = useState<Set<string>>(new Set())

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
      const jourUpper = jour.toUpperCase()
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        grid[`${jourUpper}__${sIdx}`] = null
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
      const jourUpper = jour.toUpperCase()
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        grid[`${jourUpper}__${sIdx}`] = null
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
  // OFFICIAL OFPPT EXCEL-STYLE PDF PAGE DRAWER (Exact Replica of Image 1)
  // ══════════════════════════════════════════════════════════════════════════
  function drawOfficialOfpptPage(
    doc: jsPDF,
    type: 'groupe' | 'formateur',
    targetCodeOrName: string,
    metaData: Record<string, string>,
    grid: Record<string, TimetableSlotData | null>,
    pageIndex?: number,
    totalPages?: number
  ) {
    const marginX = 12
    const marginY = 10
    const contentWidth = 273 // 297 - 24mm

    // ── 1. Top Logo (Left) ──
    if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.naturalWidth > 0) {
      try {
        doc.addImage(cachedLogoImg, 'JPEG', marginX + 2, marginY + 2, 22, 16)
      } catch (err) {
        doc.setFillColor(15, 118, 110)
        doc.roundedRect(marginX + 2, marginY + 2, 22, 16, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        doc.text('OFPPT', marginX + 13, marginY + 11, { align: 'center' })
      }
    } else {
      doc.setFillColor(15, 118, 110)
      doc.roundedRect(marginX + 2, marginY + 2, 22, 16, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(255, 255, 255)
      doc.text('OFPPT', marginX + 13, marginY + 11, { align: 'center' })
    }

    // ── 2. Top Centered Titles (Matching Image 1) ──
    const anneeFormation = type === 'groupe'
      ? (localStorage.getItem('annee_formation_groupe') || '2025-2026')
      : (localStorage.getItem('annee_formation_formateur') || '2025-2026')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    const title = type === 'groupe'
      ? `EMPLOI DU TEMPS DU GROUPE : ${targetCodeOrName}`
      : `EMPLOI DU TEMPS DU FORMATEUR FACE A FACE : Stagiaires`
    doc.text(title, 297 / 2, marginY + 6, { align: 'center' })

    doc.setFontSize(10)
    doc.text(`ANNEE DE FORMATION : ${anneeFormation}`, 297 / 2, marginY + 12, { align: 'center' })

    // ── 3. Meta Information Block (Exact placement as Image 1) ──
    const metaTopY = marginY + 18
    doc.setFontSize(9)

    // Left Column
    const leftColX = marginX + 2
    doc.setFont('helvetica', 'bold')
    doc.text('DRGC', leftColX, metaTopY)

    doc.text('Complexe/EFP  :', leftColX, metaTopY + 5)
    doc.setFont('helvetica', 'normal')
    doc.text(metaData['Complexe/EFP'] || 'ISTA MY RACHID', leftColX + 26, metaTopY + 5)

    doc.setFont('helvetica', 'bold')
    const entityLabel = type === 'groupe' ? 'Groupe             :' : 'Formateur        :'
    doc.text(entityLabel, leftColX, metaTopY + 10)
    doc.setFont('helvetica', 'bold')
    doc.text(targetCodeOrName, leftColX + 26, metaTopY + 10)

    doc.setFont('helvetica', 'bold')
    doc.text('Filière               :', leftColX, metaTopY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(metaData['Filière'] || '-', leftColX + 26, metaTopY + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('Niveau              :', leftColX, metaTopY + 20)
    doc.setFont('helvetica', 'normal')
    doc.text(metaData['Niveau'] || 'T/Q', leftColX + 26, metaTopY + 20)

    doc.setFont('helvetica', 'bold')
    const masseLabel = type === 'groupe' ? 'Mode form.     :' : 'Masse horaire  :'
    doc.text(masseLabel, leftColX, metaTopY + 25)
    doc.setFont('helvetica', 'normal')
    doc.text(metaData['Masse'] || (type === 'groupe' ? 'FPA / Résidentiel' : '25 heures'), leftColX + 26, metaTopY + 25)

    // Center Column: Statut with checkboxes (Image 1 style)
    if (type === 'formateur') {
      const centerColX = marginX + 100
      doc.setFont('helvetica', 'bold')
      doc.text('Statutaire :', centerColX, metaTopY + 10)
      doc.text('Coopérant :', centerColX, metaTopY + 15)
      doc.text('Vacataire :', centerColX, metaTopY + 20)
      doc.text('Contrat de service :', centerColX, metaTopY + 25)

      // Draw Checkbox Squares
      const checkX = centerColX + 38
      // Statutaire box (checked in red/brown like Image 1)
      doc.setFillColor(180, 83, 60)
      doc.setDrawColor(0, 0, 0)
      doc.rect(checkX, metaTopY + 7.5, 3.5, 3.5, 'FD')

      // Coopérant box
      doc.setFillColor(255, 255, 255)
      doc.rect(checkX, metaTopY + 12.5, 3.5, 3.5, 'FD')

      // Vacataire box
      doc.rect(checkX, metaTopY + 17.5, 3.5, 3.5, 'FD')

      // Contrat box
      doc.rect(checkX, metaTopY + 22.5, 3.5, 3.5, 'FD')
    }

    // Right Column: Matricule & Période d'application
    const rightColX = marginX + 155
    doc.setFont('helvetica', 'bold')
    doc.text(`Mle: ${metaData['Matricule'] || ''}`, rightColX, metaTopY + 10)

    const periode = metaData['Période'] || 'Avril (01/04/2026)'
    doc.setFont('helvetica', 'bold')
    doc.text(`Période d'application: `, rightColX, metaTopY + 25)
    doc.setFont('helvetica', 'normal')
    doc.text(periode, rightColX + 38, metaTopY + 25)

    // ── 4. Official Timetable Matrix (Image 1 Style) ──
    const tableTopY = metaTopY + 29
    const col1Width = 32 // Jour column
    const col2Width = 24 // Groupe/Module/salle column
    const slotWidth = (contentWidth - col1Width - col2Width) / 4 // 54.25mm per slot
    const tableHeaderHeight = 8
    const subRowHeight = 5.6 // 3 sub-rows = 16.8mm per day

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)

    // ── Header Row 1 & 2 ──
    doc.rect(marginX, tableTopY, contentWidth, tableHeaderHeight)
    doc.line(marginX + col1Width + col2Width, tableTopY, marginX + col1Width + col2Width, tableTopY + tableHeaderHeight)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('Heure', marginX + col1Width + col2Width - 3, tableTopY + 3.5, { align: 'right' })
    doc.text('Jour', marginX + 4, tableTopY + 7)
    doc.line(marginX, tableTopY + tableHeaderHeight, marginX + col1Width + col2Width, tableTopY)

    // Time Slot Headers
    TS_LABELS.forEach((slotLabel, sIdx) => {
      const slotX = marginX + col1Width + col2Width + sIdx * slotWidth
      doc.text(slotLabel, slotX + slotWidth / 2, tableTopY + 5.5, { align: 'center' })
      if (sIdx > 0) {
        doc.line(slotX, tableTopY, slotX, tableTopY + tableHeaderHeight)
      }
    })

    // ── 6 Days x 3 Sub-Rows ──
    JOURS_LIST.forEach((jour, jourIdx) => {
      const dayTopY = tableTopY + tableHeaderHeight + jourIdx * (subRowHeight * 3)
      const dayTotalHeight = subRowHeight * 3
      const jourUpper = jour.toUpperCase()

      // Outer day box
      doc.rect(marginX, dayTopY, contentWidth, dayTotalHeight)

      // Col 1: Jour (vertically centered across all 3 sub-rows)
      doc.line(marginX + col1Width, dayTopY, marginX + col1Width, dayTopY + dayTotalHeight)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text(jour, marginX + col1Width / 2, dayTopY + dayTotalHeight / 2 + 1.5, { align: 'center' })

      // Col 2: Sub-labels (Groupe, Module, salle)
      doc.line(marginX + col1Width + col2Width, dayTopY, marginX + col1Width + col2Width, dayTopY + dayTotalHeight)

      const subLabels = type === 'formateur'
        ? ['Groupe', 'Module', 'salle']
        : ['Module', 'Formateur', 'salle']

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)

      subLabels.forEach((lbl, rIdx) => {
        const subY = dayTopY + rIdx * subRowHeight
        if (rIdx > 0) {
          doc.line(marginX + col1Width, subY, marginX + contentWidth, subY)
        }
        doc.text(lbl, marginX + col1Width + col2Width / 2, subY + subRowHeight / 2 + 1, { align: 'center' })
      })

      // Time slots content
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const slotX = marginX + col1Width + col2Width + sIdx * slotWidth
        if (sIdx > 0) {
          doc.line(slotX, dayTopY, slotX, dayTopY + dayTotalHeight)
        }

        const cell = grid[`${jourUpper}__${sIdx}`]
        if (cell) {
          // Sub-row 1 (Groupe or Module)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8.5)
          const line1 = type === 'formateur' ? cell.groupe : cell.module
          doc.text(line1 || '', slotX + slotWidth / 2, dayTopY + subRowHeight / 2 + 1, { align: 'center' })

          // Sub-row 2 (Module or Formateur)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          const line2 = type === 'formateur' ? cell.module : cell.formateur
          doc.text(line2 || '', slotX + slotWidth / 2, dayTopY + subRowHeight + subRowHeight / 2 + 1, { align: 'center' })

          // Sub-row 3 (salle)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.5)
          doc.text(cell.salle || '', slotX + slotWidth / 2, dayTopY + subRowHeight * 2 + subRowHeight / 2 + 1, { align: 'center' })
        }
      }
    })

    // ── 5. Official Signatures Table (Exact match to Image 1) ──
    const sigTopY = tableTopY + tableHeaderHeight + 6 * (subRowHeight * 3) + 5
    const sigColWidth = contentWidth / 3
    const sigHeight = 22

    doc.rect(marginX, sigTopY, contentWidth, sigHeight)
    doc.line(marginX + sigColWidth, sigTopY, marginX + sigColWidth, sigTopY + sigHeight)
    doc.line(marginX + sigColWidth * 2, sigTopY, marginX + sigColWidth * 2, sigTopY + sigHeight)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('Formateur', marginX + sigColWidth / 2, sigTopY + 4.5, { align: 'center' })
    doc.text('Directeur / Directeur Pédagogique', marginX + sigColWidth + sigColWidth / 2, sigTopY + 4.5, { align: 'center' })
    doc.text('Directeur du Complexe', marginX + sigColWidth * 2 + sigColWidth / 2, sigTopY + 4.5, { align: 'center' })

    doc.line(marginX, sigTopY + 6.5, marginX + contentWidth, sigTopY + 6.5)

    // Page Numbering in bottom right
    if (totalPages && totalPages > 1 && typeof pageIndex === 'number') {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(100, 116, 139)
      doc.text(`Page ${pageIndex + 1} / ${totalPages}`, marginX + contentWidth - 4, sigTopY + sigHeight + 4.5, { align: 'right' })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Bulletproof Save: Places all files inside one main folder on Desktop!
  // ══════════════════════════════════════════════════════════════════════════
  async function savePdfFile(folderName: string, fileName: string, doc: jsPDF) {
    const base64Data = doc.output('datauristring').split(',')[1]

    let ipcResult: any = null
    try {
      if ((window as any).api?.savePdfToDesktop) {
        ipcResult = await (window as any).api.savePdfToDesktop({ folderName, fileName, base64Data })
      } else if ((window as any).electron?.ipcRenderer?.invoke) {
        ipcResult = await (window as any).electron.ipcRenderer.invoke('save-pdf-to-desktop', { folderName, fileName, base64Data })
      }
    } catch (ipcErr: any) {
      console.warn('Electron IPC save error:', ipcErr)
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

    // Fallback: Browser download
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
      return { success: false, error: String(saveErr) }
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
  // Checkboxes / Selection logic
  // ══════════════════════════════════════════════════════════════════════════
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

  function toggleSelectAllFormateurs() {
    if (selectedFormateurIds.size === filteredFormateurs.length) {
      setSelectedFormateurIds(new Set())
    } else {
      setSelectedFormateurIds(new Set(filteredFormateurs.map(f => f.id || f.nom_prenom)))
    }
  }

  function toggleSelectFormateur(id: string) {
    const next = new Set(selectedFormateurIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedFormateurIds(next)
  }

  function toggleSelectAllGroupes() {
    if (selectedGroupeIds.size === filteredGroupes.length) {
      setSelectedGroupeIds(new Set())
    } else {
      setSelectedGroupeIds(new Set(filteredGroupes.map(g => g.id || g.code_groupe)))
    }
  }

  function toggleSelectGroupe(id: string) {
    const next = new Set(selectedGroupeIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedGroupeIds(next)
  }

  // ── Helper: Extract exact Filière code from group code ──────────────────
  function extractFiliereFromGroup(gCode: string): string {
    if (!gCode) return ''
    const norm = gCode.toUpperCase().replace(/\s+/g, '')

    // Check if group is registered in groupes collection
    const grpObj = groupes.find(g =>
      g.code_groupe.toUpperCase().replace(/\s+/g, '') === norm || (g.id && g.id === gCode)
    )

    if (grpObj) {
      if (grpObj.id_filiere) {
        const fil = filieres.find(f => f.id === grpObj.id_filiere)
        if (fil?.code_filiere) return fil.code_filiere.toUpperCase()
      }
      if (grpObj.filiere) return grpObj.filiere.toUpperCase()
    }

    // Standard OFPPT pattern: Group codes start with the Filière letters (e.g. AEFGT101 -> AEFGT, TREM104 -> TREM, RVA201 -> RVA)
    const match = norm.match(/^([A-Z]+)/)
    if (match) return match[1]
    return ''
  }

  // ── Helper: Build dynamic Meta for Formateur matching Image 1 ──────────
  function buildFormateurMeta(f: Formateur, grid: Record<string, TimetableSlotData | null>) {
    const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || 'Formateur'

    // 1. Collect all taught groups and count occupied slots
    const taughtGroups: string[] = []
    let occupiedSlots = 0

    Object.values(grid).forEach(cell => {
      if (cell && cell.groupe && cell.groupe !== '—' && cell.groupe !== '-') {
        taughtGroups.push(cell.groupe)
        occupiedSlots++
      }
    })

    // 2. Extract unique filières taught from the groups (e.g. AEFGT, or TREM/RVA)
    const filieresSet = new Set<string>()
    taughtGroups.forEach(grp => {
      const fil = extractFiliereFromGroup(grp)
      if (fil) filieresSet.add(fil)
    })

    const taughtFilieres = Array.from(filieresSet)
    const filiereDisplay = taughtFilieres.length > 0
      ? taughtFilieres.join('/')
      : (f.specialite || f.matiere || '-')

    // 3. Dynamic Masse Horaire (2.5 hours per slot: 10 slots = 25h, 12 slots = 30h, 14 slots = 35h)
    const totalHours = occupiedSlots * 2.5
    const masseHoraire = totalHours > 0 ? `${totalHours} heures` : '25 heures'

    // 4. Dynamic Niveau (matching user's screenshots)
    let niveau = 'TECHNICIEN'
    if (taughtGroups.some(g => g.includes('TS') || g.includes('TDM') || g.includes('DEV') || g.includes('GE'))) {
      niveau = 'TECHNICIEN SPECIALISE'
    } else if (taughtGroups.some(g => g.includes('Q') || g.includes('CQ'))) {
      niveau = 'QUALIFIANT'
    } else if (taughtGroups.some(g => g.includes('T/Q'))) {
      niveau = 'T/Q'
    } else {
      niveau = 'TECHNICIEN'
    }

    const anneeFormation = localStorage.getItem('annee_formation_formateur') || '2025-2026'
    const periode = localStorage.getItem('periode_application_formateur') || 'Avril (01/04/2026)'

    return {
      'DRGC': 'Direction Régionale Grand Casablanca',
      'Complexe/EFP': 'ISTA MY RACHID',
      'Formateur': profName,
      'Matricule': f.matricule || '-',
      'Filière': filiereDisplay,
      'Niveau': niveau,
      'Masse': masseHoraire,
      'Période': periode
    }
  }

  // ── Helper: Build dynamic Meta for Groupe ──────────────────────────────
  function buildGroupeMeta(g: Groupe) {
    const grpCode = g.code_groupe.trim()
    const filCode = extractFiliereFromGroup(grpCode)
    const filiereObj = filieres.find(f => f.id === g.id_filiere || f.code_filiere.toUpperCase() === filCode)
    const filiereDisplay = filiereObj ? filiereObj.code_filiere : (filCode || g.filiere || 'Filière')
    const anneeLabel = g.annee === 2 ? '2ème Année' : '1ère Année'
    const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2025-2026'
    const periode = localStorage.getItem('periode_application_groupe') || 'Avril (01/04/2026)'

    return {
      'DRGC': 'Direction Régionale Grand Casablanca',
      'Complexe/EFP': 'ISTA MY RACHID',
      'Groupe': grpCode,
      'Filière': filiereDisplay,
      'Niveau': anneeLabel,
      'Période': periode,
      'Masse': 'FPA / Résidentiel'
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. COMBINED MULTI-PAGE PDF: All teachers inside ONE SINGLE PDF FILE!
  // ══════════════════════════════════════════════════════════════════════════
  async function exportFormateursCombinedPdf(targetList: Formateur[]) {
    if (targetList.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد أستاذ واحد على الأقل' : 'Veuillez sélectionner au moins un formateur')
      return
    }

    const folderName = 'Emplois_du_Temps_Formateurs'
    const fileName = targetList.length === formateurs.length
      ? 'Tous_les_Formateurs_Emploi_du_Temps.pdf'
      : `Selection_Formateurs_(${targetList.length})_Emploi_du_Temps.pdf`

    try {
      setBulkProgress({ current: 0, total: targetList.length, label: 'Génération du PDF combiné...' })

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      for (let i = 0; i < targetList.length; i++) {
        const f = targetList[i]
        const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || `Formateur_${i + 1}`

        setBulkProgress({
          current: i + 1,
          total: targetList.length,
          label: lang === 'ar'
            ? `جاري إضافة صفحة الأستاذ: ${profName} (${i + 1}/${targetList.length})...`
            : `Ajout de la page ${profName} (${i + 1}/${targetList.length})...`
        })

        if (i > 0) {
          doc.addPage('a4', 'landscape')
        }

        const grid = buildFormateurSchedule(f)
        const meta = buildFormateurMeta(f, grid)

        drawOfficialOfpptPage(doc, 'formateur', profName, meta, grid, i, targetList.length)

        if (i % 6 === 0) await new Promise(r => setTimeout(r, 10))
      }

      const res = await savePdfFile(folderName, fileName, doc)

      if (res && res.success) {
        setLastExportPath({
          folderName,
          targetDir: res.targetDir || folderName,
          filePath: res.filePath || fileName
        })

        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {lang === 'ar'
                  ? `🎉 تم حفظ جميع الأساتذة (${targetList.length}) في ملف PDF واحد مجمع!`
                  : `🎉 Tous les formateurs (${targetList.length} pages) réunis dans un seul PDF !`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {lang === 'ar'
                  ? `الملف: ${fileName}`
                  : `Fichier : ${fileName}`}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => {
                  toast.dismiss(t.id)
                  handleOpenFolder(res.targetDir)
                }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد على سطح المكتب' : 'Ouvrir le dossier'}
              </button>
            </div>
          ),
          { duration: 8000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف الموحد' : 'Erreur de sauvegarde')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `حدث خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SEPARATE PDF FILES: Each teacher in their own PDF file inside the folder
  // ══════════════════════════════════════════════════════════════════════════
  async function exportFormateursSeparateFiles(targetList: Formateur[], isSingle = false) {
    if (targetList.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد أستاذ واحد على الأقل' : 'Veuillez sélectionner au moins un formateur')
      return
    }

    const folderName = 'Emplois_du_Temps_Formateurs'
    try {
      if (!isSingle) {
        setBulkProgress({ current: 0, total: targetList.length, label: 'Préparation...' })
      } else {
        setExportingId(targetList[0].id || targetList[0].nom_prenom)
      }

      let successCount = 0
      let lastSavedDir = ''

      for (let i = 0; i < targetList.length; i++) {
        const f = targetList[i]
        const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || `Formateur_${i + 1}`

        if (!isSingle) {
          setBulkProgress({
            current: i + 1,
            total: targetList.length,
            label: lang === 'ar' ? `جاري تصدير الأستاذ ${profName}...` : `Export de ${profName}...`
          })
        }

        const grid = buildFormateurSchedule(f)
        const meta = buildFormateurMeta(f, grid)

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        drawOfficialOfpptPage(doc, 'formateur', profName, meta, grid)
        const fileName = `${profName.replace(/[\\/:*?"<>|]/g, '_')}_Emploi_du_Temps.pdf`

        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          successCount++
          lastSavedDir = res.targetDir
        }

        if (i % 5 === 0) await new Promise(r => setTimeout(r, 10))
      }

      setLastExportPath({
        folderName,
        targetDir: lastSavedDir || folderName,
        filePath: folderName
      })

      if (isSingle) {
        toast.success(lang === 'ar' ? 'تم تنزيل جدول الحصص بنجاح!' : 'Planning exporté avec succès !')
      } else {
        toast.success(
          lang === 'ar'
            ? `🎉 تم حفظ جداول الأساتذة (${successCount}) كملفات منفصلة داخل مجلد [${folderName}] على سطح المكتب!`
            : `🎉 ${successCount} fichiers enregistrés dans [${folderName}] sur le Bureau !`
        )
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `حدث خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
      setExportingId(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. COMBINED MULTI-PAGE PDF: All groups inside ONE SINGLE PDF FILE!
  // ══════════════════════════════════════════════════════════════════════════
  async function exportGroupesCombinedPdf(targetList: Groupe[]) {
    if (targetList.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد فوج واحد على الأقل' : 'Veuillez sélectionner au moins un groupe')
      return
    }

    const folderName = 'Emplois_du_Temps_Groupes'
    const fileName = targetList.length === groupes.length
      ? 'Tous_les_Groupes_Emploi_du_Temps.pdf'
      : `Selection_Groupes_(${targetList.length})_Emploi_du_Temps.pdf`

    try {
      setBulkProgress({ current: 0, total: targetList.length, label: 'Génération du PDF combiné...' })

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      for (let i = 0; i < targetList.length; i++) {
        const g = targetList[i]
        const grpCode = g.code_groupe.trim()

        setBulkProgress({
          current: i + 1,
          total: targetList.length,
          label: lang === 'ar'
            ? `جاري إضافة صفحة الفوج: ${grpCode} (${i + 1}/${targetList.length})...`
            : `Ajout de la page ${grpCode} (${i + 1}/${targetList.length})...`
        })

        if (i > 0) {
          doc.addPage('a4', 'landscape')
        }

        const grid = buildGroupeSchedule(g)
        const meta = buildGroupeMeta(g)

        drawOfficialOfpptPage(doc, 'groupe', grpCode, meta, grid, i, targetList.length)

        if (i % 6 === 0) await new Promise(r => setTimeout(r, 10))
      }

      const res = await savePdfFile(folderName, fileName, doc)

      if (res && res.success) {
        setLastExportPath({
          folderName,
          targetDir: res.targetDir || folderName,
          filePath: res.filePath || fileName
        })

        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {lang === 'ar'
                  ? `🎉 تم حفظ جميع الأفواج (${targetList.length}) في ملف PDF واحد مجمع!`
                  : `🎉 Tous les groupes (${targetList.length} pages) réunis dans un seul PDF !`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {lang === 'ar'
                  ? `الملف: ${fileName}`
                  : `Fichier : ${fileName}`}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => {
                  toast.dismiss(t.id)
                  handleOpenFolder(res.targetDir)
                }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد على سطح المكتب' : 'Ouvrir le dossier'}
              </button>
            </div>
          ),
          { duration: 8000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف الموحد' : 'Erreur de sauvegarde')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `حدث خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. SEPARATE PDF FILES: Each group in their own PDF file inside the folder
  // ══════════════════════════════════════════════════════════════════════════
  async function exportGroupesSeparateFiles(targetList: Groupe[], isSingle = false) {
    if (targetList.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد فوج واحد على الأقل' : 'Veuillez sélectionner au moins un groupe')
      return
    }

    const folderName = 'Emplois_du_Temps_Groupes'
    try {
      if (!isSingle) {
        setBulkProgress({ current: 0, total: targetList.length, label: 'Préparation...' })
      } else {
        setExportingId(targetList[0].id || targetList[0].code_groupe)
      }

      let successCount = 0
      let lastSavedDir = ''

      for (let i = 0; i < targetList.length; i++) {
        const g = targetList[i]
        const grpCode = g.code_groupe.trim()

        if (!isSingle) {
          setBulkProgress({
            current: i + 1,
            total: targetList.length,
            label: lang === 'ar' ? `جاري تصدير الفوج ${grpCode}...` : `Export de ${grpCode}...`
          })
        }

        const grid = buildGroupeSchedule(g)
        const meta = buildGroupeMeta(g)

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        drawOfficialOfpptPage(doc, 'groupe', grpCode, meta, grid)
        const fileName = `${grpCode}_Emploi_du_Temps.pdf`

        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          successCount++
          lastSavedDir = res.targetDir
        }

        if (i % 5 === 0) await new Promise(r => setTimeout(r, 10))
      }

      setLastExportPath({
        folderName,
        targetDir: lastSavedDir || folderName,
        filePath: folderName
      })

      if (isSingle) {
        toast.success(lang === 'ar' ? 'تم تنزيل جدول الفوج بنجاح!' : 'Planning exporté avec succès !')
      } else {
        toast.success(
          lang === 'ar'
            ? `🎉 تم حفظ جداول الأفواج (${successCount}) كملفات منفصلة داخل مجلد [${folderName}] على سطح المكتب!`
            : `🎉 ${successCount} fichiers enregistrés dans [${folderName}] sur le Bureau !`
        )
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `حدث خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
      setExportingId(null)
    }
  }

  return (
    <div className="fade-in-up">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'تصدير التقارير وجداول الحصص (PDF الرسمية)' : 'Export des Emplois du Temps Officiels (PDF)'}</h1>
          <p>
            {lang === 'ar'
              ? 'تنزيل جداول الحصص بالنموذج الرسمي لـ OFPPT في ملف واحد مجمع أو ملفات منفصلة على سطح المكتب'
              : 'Extraction des plannings au format officiel OFPPT en 1 seul fichier PDF multi-pages ou fichiers séparés sur le Bureau'}
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

      {/* ── Status Hint if IPC not ready ── */}
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
              ? 'تنبيه: لتفعيل الحفظ المباشر داخل مجلد سطح المكتب تلقائياً، يرجى إعادة تشغيل التطبيق (Restart).'
              : 'Note : Pour enregistrer directement sur le Bureau dans un dossier, redémarrez l\'application.'}
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

              {/* Action Buttons: 1 COMBINED FILE vs SEPARATE FILES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {/* 1 SINGLE PDF BUTTON (Requested by User) */}
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    fontSize: '15px',
                    fontWeight: 800,
                    gap: '10px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportFormateursCombinedPdf(formateurs)}
                >
                  <FileText size={20} />
                  {lang === 'ar'
                    ? '📄 تصدير جميع المكونين في ملف PDF واحد مجمع (ملف موحد)'
                    : 'Exporter tous les formateurs (1 SEUL fichier PDF)'}
                </button>

                {/* SEPARATE FILES BUTTON */}
                <button
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    gap: '8px'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportFormateursSeparateFiles(formateurs)}
                >
                  <Files size={17} />
                  {lang === 'ar'
                    ? '📁 تصدير في ملفات منفصلة (ملف مستقل لكل أستاذ)'
                    : 'Exporter en fichiers séparés (1 par formateur)'}
                </button>

                {/* Selected Action Buttons */}
                {selectedFormateurIds.size > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '10px 12px',
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1.5px solid var(--primary)',
                    borderRadius: 8
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                      {lang === 'ar' ? `المحددين (${selectedFormateurIds.size} أساتذة):` : `Sélection (${selectedFormateurIds.size} formateurs) :`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 700, gap: '6px' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = formateurs.filter(f => selectedFormateurIds.has(f.id || f.nom_prenom))
                          exportFormateursCombinedPdf(selectedList)
                        }}
                      >
                        <FileText size={15} />
                        {lang === 'ar' ? 'ملف واحد مجمع' : '1 seul PDF'}
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 600, gap: '6px' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = formateurs.filter(f => selectedFormateurIds.has(f.id || f.nom_prenom))
                          exportFormateursSeparateFiles(selectedList)
                        }}
                      >
                        <Files size={15} />
                        {lang === 'ar' ? 'ملفات منفصلة' : 'Fichiers séparés'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Search */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
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

              {/* Select All Checkbox Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                marginBottom: 12,
                cursor: 'pointer'
              }}
              onClick={toggleSelectAllFormateurs}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                  {selectedFormateurIds.size === filteredFormateurs.length && filteredFormateurs.length > 0 ? (
                    <CheckSquare size={18} color="var(--primary)" />
                  ) : (
                    <Square size={18} color="var(--text-secondary)" />
                  )}
                  <span>{lang === 'ar' ? 'تحديد الكل (Select All)' : 'Tout sélectionner'}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {selectedFormateurIds.size} / {filteredFormateurs.length} {lang === 'ar' ? 'محدد' : 'sélectionné(s)'}
                </span>
              </div>

              {/* List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 6 }}>
                {filteredFormateurs.map((f) => {
                  const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || 'Formateur'
                  const fId = f.id || f.nom_prenom
                  const isSelected = selectedFormateurIds.has(fId)
                  const isCurrentExporting = exportingId === fId

                  return (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: isSelected ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}
                        onClick={() => toggleSelectFormateur(fId)}
                      >
                        {isSelected ? (
                          <CheckSquare size={19} color="var(--primary)" />
                        ) : (
                          <Square size={19} color="var(--text-secondary)" />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{profName}</span>
                          {f.matricule && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mle: {f.matricule}</span>}
                        </div>
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '7px 14px', fontSize: '13px', fontWeight: 600, gap: '6px' }}
                        disabled={!!exportingId || !!bulkProgress}
                        onClick={() => exportFormateursSeparateFiles([f], true)}
                      >
                        {isCurrentExporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {lang === 'ar' ? 'جاري الحفظ...' : 'Sauvegarde...'}
                          </>
                        ) : (
                          <>
                            <FileDown size={15} />
                            {lang === 'ar' ? 'تنزيل PDF' : 'Télécharger'}
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

              {/* Action Buttons: 1 COMBINED FILE vs SEPARATE FILES */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {/* 1 SINGLE PDF BUTTON */}
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    fontSize: '15px',
                    fontWeight: 800,
                    gap: '10px',
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportGroupesCombinedPdf(groupes)}
                >
                  <FileText size={20} />
                  {lang === 'ar'
                    ? '📄 تصدير جميع الأفواج في ملف PDF واحد مجمع (ملف موحد)'
                    : 'Exporter tous les groupes (1 SEUL fichier PDF)'}
                </button>

                {/* SEPARATE FILES BUTTON */}
                <button
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    gap: '8px',
                    borderColor: '#10b981',
                    color: '#059669'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportGroupesSeparateFiles(groupes)}
                >
                  <Files size={17} />
                  {lang === 'ar'
                    ? '📁 تصدير في ملفات منفصلة (ملف مستقل لكل فوج)'
                    : 'Exporter en fichiers séparés (1 par groupe)'}
                </button>

                {/* Selected Action Buttons */}
                {selectedGroupeIds.size > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '10px 12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1.5px solid #10b981',
                    borderRadius: 8
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                      {lang === 'ar' ? `المحددين (${selectedGroupeIds.size} أفواج):` : `Sélection (${selectedGroupeIds.size} groupes) :`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 700, gap: '6px', background: '#059669' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = groupes.filter(g => selectedGroupeIds.has(g.id || g.code_groupe))
                          exportGroupesCombinedPdf(selectedList)
                        }}
                      >
                        <FileText size={15} />
                        {lang === 'ar' ? 'ملف واحد مجمع' : '1 seul PDF'}
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 600, gap: '6px' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = groupes.filter(g => selectedGroupeIds.has(g.id || g.code_groupe))
                          exportGroupesSeparateFiles(selectedList)
                        }}
                      >
                        <Files size={15} />
                        {lang === 'ar' ? 'ملفات منفصلة' : 'Fichiers séparés'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Search */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
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

              {/* Select All Checkbox Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                marginBottom: 12,
                cursor: 'pointer'
              }}
              onClick={toggleSelectAllGroupes}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                  {selectedGroupeIds.size === filteredGroupes.length && filteredGroupes.length > 0 ? (
                    <CheckSquare size={18} color="#059669" />
                  ) : (
                    <Square size={18} color="var(--text-secondary)" />
                  )}
                  <span>{lang === 'ar' ? 'تحديد الكل (Select All)' : 'Tout sélectionner'}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {selectedGroupeIds.size} / {filteredGroupes.length} {lang === 'ar' ? 'محدد' : 'sélectionné(s)'}
                </span>
              </div>

              {/* List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 6 }}>
                {filteredGroupes.map((g) => {
                  const grpCode = g.code_groupe.trim()
                  const gId = g.id || grpCode
                  const isSelected = selectedGroupeIds.has(gId)
                  const isCurrentExporting = exportingId === gId

                  return (
                    <div
                      key={g.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: isSelected ? '1.5px solid #10b981' : '1px solid var(--border)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}
                        onClick={() => toggleSelectGroupe(gId)}
                      >
                        {isSelected ? (
                          <CheckSquare size={19} color="#059669" />
                        ) : (
                          <Square size={19} color="var(--text-secondary)" />
                        )}
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                          {grpCode}
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
                          padding: '7px 14px',
                          fontSize: '13px',
                          fontWeight: 700,
                          gap: '6px',
                          color: '#059669',
                          borderColor: '#10b981'
                        }}
                        disabled={!!exportingId || !!bulkProgress}
                        onClick={() => exportGroupesSeparateFiles([g], true)}
                      >
                        {isCurrentExporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {lang === 'ar' ? 'جاري الحفظ...' : 'Sauvegarde...'}
                          </>
                        ) : (
                          <>
                            <FileDown size={15} />
                            {lang === 'ar' ? 'تنزيل PDF' : 'Télécharger'}
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
