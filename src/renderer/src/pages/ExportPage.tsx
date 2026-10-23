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
  Files,
  BookOpen,
  Layers
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
  const [selectedFiliereIds, setSelectedFiliereIds] = useState<Set<string>>(new Set())
  const [searchFiliere, setSearchFiliere] = useState('')

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
      for (let sIdx = 0; sIdx <= 4; sIdx++) {
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
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 4) continue

      const cellGrp = String(cell.groupeId).toUpperCase().replace(/\s+/g, '')
      const matchesGroup =
        (targetGroupe.id && targetGroupe.id === cell.groupeId) ||
        cellGrp === grpCodeNorm ||
        (grpCodeNorm && cellGrp.includes(grpCodeNorm)) ||
        (cellGrp && grpCodeNorm.includes(cellGrp))

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
      const matchesGroup =
        (targetGroupe.id && targetGroupe.id === seance.id_groupe) ||
        seanceGrp === grpCodeNorm ||
        (grpCodeNorm && seanceGrp.includes(seanceGrp)) ||
        (seanceGrp && grpCodeNorm.includes(seanceGrp))
      if (!matchesGroup) continue

      let tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut as string)
      if (tsIdx === -1 && ((seance.heure_debut as string) === '18:30' || (seance.heure_debut as string) === '18h30' || /18/i.test(seance.heure_debut as string))) {
        tsIdx = 4
      }
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
      for (let sIdx = 0; sIdx <= 4; sIdx++) {
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
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 4) continue

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

      let tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut as string)
      if (tsIdx === -1 && ((seance.heure_debut as string) === '18:30' || (seance.heure_debut as string) === '18h30' || /18/i.test(seance.heure_debut as string))) {
        tsIdx = 4
      }
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
    const isCds = /CDS/i.test(targetCodeOrName) ||
      /CDS/i.test(metaData['Groupe'] || '') ||
      metaData['isCds'] === 'true' ||
      /CDS/i.test(metaData['Masse'] || '')

    const customCdsHour = localStorage.getItem('custom_cds_hour') || '18H30 À 21H00'
    const activeTsLabels = isCds ? [customCdsHour] : TS_LABELS
    const numSlots = activeTsLabels.length

    const tableTopY = metaTopY + 29
    const col1Width = 32 // Jour column
    const col2Width = 24 // Groupe/Module/salle column
    const slotWidth = (contentWidth - col1Width - col2Width) / numSlots
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
    activeTsLabels.forEach((slotLabel, sIdx) => {
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
      if (isCds) {
        const slotX = marginX + col1Width + col2Width
        // Look for cell in slot 4 (evening slot), or fallback to any filled slot
        const cell = grid[`${jourUpper}__4`] ||
          grid[`${jourUpper}__0`] ||
          grid[`${jourUpper}__1`] ||
          grid[`${jourUpper}__2`] ||
          grid[`${jourUpper}__3`]

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
      } else {
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

  const filteredFilieres = filieres.filter(f => {
    const term = searchFiliere.toLowerCase().trim()
    if (!term) return true
    return (
      f.code_filiere.toLowerCase().includes(term) ||
      f.nom_filiere.toLowerCase().includes(term)
    )
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

  function toggleSelectAllFilieres() {
    if (selectedFiliereIds.size === filteredFilieres.length) {
      setSelectedFiliereIds(new Set())
    } else {
      setSelectedFiliereIds(new Set(filteredFilieres.map(f => f.id || f.code_filiere)))
    }
  }

  function toggleSelectFiliere(id: string) {
    const next = new Set(selectedFiliereIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedFiliereIds(next)
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
    const isCds = /CDS/i.test(grpCode)
    const filCode = extractFiliereFromGroup(grpCode)
    const filiereObj = filieres.find(f => f.id === g.id_filiere || f.code_filiere.toUpperCase() === filCode)
    const filiereDisplay = filiereObj ? filiereObj.code_filiere : (filCode || g.filiere || 'Filière')
    const anneeLabel = g.annee === 2 ? '2ème Année' : '1ère Année'
    const periode = localStorage.getItem('periode_application_groupe') || 'Avril (01/04/2026)'

    return {
      'DRGC': 'Direction Régionale Grand Casablanca',
      'Complexe/EFP': 'ISTA MY RACHID',
      'Groupe': grpCode,
      'Filière': filiereDisplay,
      'Niveau': anneeLabel,
      'Période': periode,
      'Masse': isCds ? 'Cours du Soir (CDS)' : 'FPA / Résidentiel',
      'isCds': isCds ? 'true' : 'false'
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

  // ══════════════════════════════════════════════════════════════════════════
  // FILIERE: Get all groups of a given filiere
  // ══════════════════════════════════════════════════════════════════════════
  function getGroupesForFiliere(targetFiliere: Filiere): Groupe[] {
    return groupes.filter(g => {
      if (g.id_filiere && g.id_filiere === targetFiliere.id) return true
      if (g.filiere && g.filiere.toUpperCase() === targetFiliere.code_filiere.toUpperCase()) return true
      const extracted = extractFiliereFromGroup(g.code_groupe)
      return extracted.toUpperCase() === targetFiliere.code_filiere.toUpperCase()
    })
  }

  // Get groups of a filiere filtered by year digit (1 = 1ère année, 2 = 2ème année)
  function getGroupesForFiliereByYear(targetFiliere: Filiere, yearDigit: '1' | '2'): Groupe[] {
    return getGroupesForFiliere(targetFiliere).filter(g => {
      const code = g.code_groupe.toUpperCase().replace(/\s+/g, '')
      const yearMatch = code.match(/([1-9])\d\d/)
      if (!yearMatch) return false
      return yearMatch[1] === yearDigit
    }).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe))
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Build a schedule map for a list of groups (Section format)
  // key: `${JOUR}__${groupeId or code}__${tsIdx}`
  // ══════════════════════════════════════════════════════════════════════════
  function buildSectionScheduleMap(
    sectionGroupes: Groupe[]
  ): Record<string, { nomFormateur: string; nomSalle: string }> {
    const schedule: Record<string, { nomFormateur: string; nomSalle: string }> = {}

    // From planning_salles
    for (const [key, cell] of Object.entries(planningSallesMap)) {
      if (!cell || !cell.groupeId) continue
      const parts = key.split('__')
      if (parts.length < 3) continue
      const jourUpper = parts[0].toUpperCase()
      const salleFromKey = parts[1].toUpperCase()
      const tsIdx = parseInt(parts[2], 10)
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 4) continue

      const targetGroup = sectionGroupes.find(g =>
        (g.id && g.id === cell.groupeId) ||
        g.code_groupe.toUpperCase().replace(/\s+/g, '') === String(cell.groupeId).toUpperCase().replace(/\s+/g, '')
      )
      if (!targetGroup) continue

      const formateur = formateurs.find(f =>
        (f.id && f.id === cell.formateurId) ||
        (f.nom_prenom && f.nom_prenom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
        String(cell.formateurId).toUpperCase().includes((f.nom_prenom || '').toUpperCase())
      )
      const nomFormateur = formateur
        ? (formateur.nom && formateur.prenom ? `${formateur.nom} ${formateur.prenom}` : formateur.nom_prenom || formateur.nom || cell.formateurId).toUpperCase()
        : String(cell.formateurId).toUpperCase()

      const cellData = { nomFormateur, nomSalle: salleFromKey }
      if (targetGroup.id) schedule[`${jourUpper}__${targetGroup.id}__${tsIdx}`] = cellData
      schedule[`${jourUpper}__${targetGroup.code_groupe.toUpperCase().replace(/\s+/g, '')}__${tsIdx}`] = cellData
    }

    // From seances (fallback)
    for (const seance of seancesList) {
      const targetGroup = sectionGroupes.find(g =>
        (g.id && g.id === seance.id_groupe) ||
        g.code_groupe.toUpperCase().replace(/\s+/g, '') === String(seance.code_groupe || seance.id_groupe || '').toUpperCase().replace(/\s+/g, '')
      )
      if (!targetGroup) continue

      let tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut)
      if (tsIdx === -1 && /18/i.test(seance.heure_debut)) tsIdx = 4
      if (tsIdx === -1) continue

      const formateur = formateurs.find(f => f.id === seance.id_formateur)
      const salle = salles.find(s => s.id === seance.id_salle)
      const nomFormateur = (formateur?.nom_prenom || seance.nom_formateur || '').toUpperCase()
      const nomSalle = (salle?.nom_salle || seance.nom_salle || '').toUpperCase()

      const jourUpper = (seance.jour || '').toUpperCase()
      const cellData = { nomFormateur, nomSalle }
      if (targetGroup.id) {
        const idKey = `${jourUpper}__${targetGroup.id}__${tsIdx}`
        if (!schedule[idKey]) schedule[idKey] = cellData
      }
      const codeKey = `${jourUpper}__${targetGroup.code_groupe.toUpperCase().replace(/\s+/g, '')}__${tsIdx}`
      if (!schedule[codeKey]) schedule[codeKey] = cellData
    }

    return schedule
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Draw a "Section" PDF page (all groups per day in rows) – exact OFPPT layout
  // ══════════════════════════════════════════════════════════════════════════
  function drawSectionPage(
    doc: jsPDF,
    filiereCode: string,
    anneeLabel: string,
    sectionGroupes: Groupe[],
    schedule: Record<string, { nomFormateur: string; nomSalle: string }>,
    pageIndex?: number,
    totalPages?: number
  ) {
    const mX = 7    // margin left/right
    const mY = 5    // margin top/bottom
    const PW = 297  // A4 landscape width mm
    const PH = 210  // A4 landscape height mm
    const contentW = PW - mX * 2

    const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2025-2026'
    const periode = localStorage.getItem('periode_application_groupe') || 'Octobre 2026'
    const numGroups = sectionGroupes.length || 1
    const TS = ['8H30 \u00c0 11H00', '11H00 \u00c0 13H30', '13H30 \u00c0 16H00', '16H00 \u00c0 18H30']
    const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
    const numDays = JOURS.length // always 6

    // Fixed column widths
    const col1W = 18  // JOUR column
    const col2W = 20  // GROUPE column
    const slotW = (contentW - col1W - col2W) / 4

    // Fixed header heights (compact)
    const hdrH = 5   // each header row

    // ── Layout geometry ──
    // Title block: mY to mY+16 = 16mm
    // Meta block:  mY+17 to mY+17+24 = 24mm
    // Table starts at: mY + 16 + 24 = mY + 40
    const titleBlockH = 16
    const metaBlockH  = 24
    const tY = mY + titleBlockH + metaBlockH   // table top Y
    const headerTotalH = hdrH * 2              // two header rows
    const bodyStartY = tY + headerTotalH
    const sigH = 12                            // signature footer height
    const availableForBody = PH - bodyStartY - sigH - mY - 2

    // Auto-scale: fit all 6 days in available space
    // dayH = numGroups * rowH + sepH
    // numDays * dayH <= availableForBody
    const sepH = 2
    const totalSepH = numDays * sepH
    const totalRowSlots = numDays * numGroups
    const rowH = Math.max(3.5, (availableForBody - totalSepH) / totalRowSlots)
    const dayH = numGroups * rowH + sepH

    // ── LOGO ──
    if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.naturalWidth > 0) {
      try { doc.addImage(cachedLogoImg, 'JPEG', mX + 1, mY + 1, 14, 10) } catch (_) {}
    } else {
      doc.setFillColor(15, 118, 110)
      doc.roundedRect(mX + 1, mY + 1, 14, 10, 2, 2, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(6).setTextColor(255, 255, 255)
      doc.text('OFPPT', mX + 8, mY + 7, { align: 'center' })
    }

    // ── TITLE ──
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold').setFontSize(13)
    doc.text('EMPLOI DU TEMPS DE LA SECTION', PW / 2, mY + 7, { align: 'center' })
    doc.setFontSize(8.5)
    doc.text(`ANNEE DE FORMATION : ${anneeFormation}`, PW / 2, mY + 13, { align: 'center' })

    // ── META INFO (compact 2-column grid) ──
    const metaY = mY + titleBlockH + 2
    const metaFontSize = 7.5
    doc.setFont('helvetica', 'normal').setFontSize(metaFontSize)
    const lh = 3.8 // line height
    doc.text('DRGC', mX + 2, metaY)
    doc.text('Complexe/EFP : CFP IMME/ISTA MY RACHID', mX + 2, metaY + lh)
    doc.text('Groupe :', mX + 2, metaY + lh * 2)
    doc.text(`Fili\u00e8re : ${filiereCode}`, mX + 2, metaY + lh * 3)
    doc.text(`Niveau : ${anneeLabel}`, mX + 2, metaY + lh * 4)
    doc.text('Masse horaire :', mX + 2, metaY + lh * 5)
    doc.text('Mode de formation : FPA', mX + 2, metaY + lh * 6 - 0.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`P\u00e9riode d'application: ${periode}`, mX + contentW - 2, metaY + lh * 3, { align: 'right' })
    doc.text('Parrains:', mX + contentW / 2, metaY + lh * 6 - 0.5)

    // ── TABLE HEADERS ──
    doc.setDrawColor(0, 0, 0).setLineWidth(0.35)

    // Header row 1: HEURE
    doc.setFillColor(200, 200, 200)
    doc.rect(mX, tY, col1W + col2W, hdrH, 'FD')
    doc.rect(mX + col1W + col2W, tY, contentW - col1W - col2W, hdrH, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(7)
    doc.text('HEURE', mX + col1W + col2W + (contentW - col1W - col2W) / 2, tY + hdrH / 2 + 1.2, { align: 'center' })

    // Header row 2: JOUR | GROUPE | time slots
    const h2Y = tY + hdrH
    doc.setFillColor(185, 185, 185)
    doc.rect(mX, h2Y, col1W, hdrH, 'FD')
    doc.rect(mX + col1W, h2Y, col2W, hdrH, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(6.5)
    doc.text('JOUR', mX + col1W / 2, h2Y + hdrH / 2 + 1.2, { align: 'center' })
    doc.text('GROUPE', mX + col1W + col2W / 2, h2Y + hdrH / 2 + 1.2, { align: 'center' })
    TS.forEach((label, i) => {
      const sx = mX + col1W + col2W + i * slotW
      doc.setFillColor(217, 217, 217)
      doc.rect(sx, h2Y, slotW, hdrH, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(6)
      doc.text(label, sx + slotW / 2, h2Y + hdrH / 2 + 1.2, { align: 'center' })
      if (i > 0) doc.line(sx, tY, sx, h2Y + hdrH)
    })

    // ── BODY ROWS ──
    JOURS.forEach((jour, jourIdx) => {
      const dayTopY = bodyStartY + jourIdx * dayH

      // Day label cell (merged across all group rows)
      doc.setFillColor(226, 232, 240)
      doc.rect(mX, dayTopY, col1W, numGroups * rowH, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(Math.min(6.5, rowH * 0.8))
      doc.setTextColor(30, 41, 59)
      doc.text(jour, mX + col1W / 2, dayTopY + (numGroups * rowH) / 2 + 1, { align: 'center' })

      sectionGroupes.forEach((groupe, grpIdx) => {
        const rowY = dayTopY + grpIdx * rowH
        const codeClean = groupe.code_groupe.toUpperCase().replace(/\s+/g, '')
        const textMidY = rowY + rowH / 2 + 1

        // Group name cell
        doc.setFillColor(245, 247, 250)
        doc.rect(mX + col1W, rowY, col2W, rowH, 'FD')
        doc.setFont('helvetica', 'bold').setFontSize(Math.min(6, rowH * 0.75)).setTextColor(10, 22, 40)
        doc.text(groupe.code_groupe, mX + col1W + col2W / 2, textMidY, { align: 'center' })

        // Time slot cells
        for (let tsIdx = 0; tsIdx < 4; tsIdx++) {
          const sx = mX + col1W + col2W + tsIdx * slotW

          if (groupe.en_stage) {
            doc.setFillColor(241, 245, 249)
            doc.rect(sx, rowY, slotW, rowH, 'FD')
            doc.setFont('helvetica', 'italic').setFontSize(Math.min(5.5, rowH * 0.7)).setTextColor(71, 85, 105)
            doc.text('Stage', sx + slotW / 2, textMidY, { align: 'center' })
          } else {
            const keyId  = groupe.id ? `${jour}__${groupe.id}__${tsIdx}` : ''
            const keyCode = `${jour}__${codeClean}__${tsIdx}`
            const cell   = (keyId && schedule[keyId]) || schedule[keyCode]

            if (cell && (cell.nomFormateur || cell.nomSalle)) {
              const txt = cell.nomSalle
                ? `${cell.nomFormateur} AT ${cell.nomSalle}`
                : cell.nomFormateur
              doc.setFillColor(219, 234, 254)
              doc.rect(sx, rowY, slotW, rowH, 'FD')
              doc.setFont('helvetica', 'bold').setFontSize(Math.min(5.5, rowH * 0.68)).setTextColor(15, 23, 42)
              const lines = doc.splitTextToSize(txt, slotW - 1.5)
              const lineH2 = Math.min(3, rowH / (lines.length + 0.5))
              const totalTxtH = lines.length * lineH2
              const startTY = rowY + (rowH - totalTxtH) / 2 + lineH2 * 0.7
              lines.forEach((line: string, li: number) => {
                doc.text(line, sx + slotW / 2, startTY + li * lineH2, { align: 'center' })
              })
            } else {
              doc.setFillColor(255, 255, 255)
              doc.rect(sx, rowY, slotW, rowH, 'FD')
            }
          }

          doc.setDrawColor(0, 0, 0).setLineWidth(0.25)
          doc.rect(sx, rowY, slotW, rowH)
        }

        // Group cell border
        doc.setDrawColor(0, 0, 0).setLineWidth(0.22)
        doc.rect(mX + col1W, rowY, col2W, rowH)
      })

      // Day outer border (bold)
      doc.setDrawColor(0, 0, 0).setLineWidth(0.5)
      doc.rect(mX, dayTopY, contentW, numGroups * rowH)

      // Separator stripe between days
      const sepY = dayTopY + numGroups * rowH
      const sepColor = jourIdx % 2 === 0 ? [220, 232, 247] as const : [238, 243, 251] as const
      doc.setFillColor(sepColor[0], sepColor[1], sepColor[2])
      doc.rect(mX, sepY, contentW, sepH, 'F')
      doc.setDrawColor(0).setLineWidth(0.35)
      doc.rect(mX, sepY, contentW, sepH)
    })

    // ── SIGNATURES ──
    const sigY = bodyStartY + numDays * dayH + 1
    const sigColW = contentW / 3
    const actualSigH = Math.max(sigH, PH - sigY - mY - 1)
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(0, 0, 0)
    doc.setDrawColor(0).setLineWidth(0.45)
    doc.rect(mX, sigY, contentW, actualSigH)
    doc.line(mX + sigColW, sigY, mX + sigColW, sigY + actualSigH)
    doc.line(mX + sigColW * 2, sigY, mX + sigColW * 2, sigY + actualSigH)
    doc.text('Formateur', mX + sigColW / 2, sigY + 3.5, { align: 'center' })
    doc.text('Directeur / Directeur P\u00e9dagogique', mX + sigColW + sigColW / 2, sigY + 3.5, { align: 'center' })
    doc.text('Directeur du Complexe', mX + sigColW * 2 + sigColW / 2, sigY + 3.5, { align: 'center' })
    doc.setLineWidth(0.25)
    doc.line(mX, sigY + 5.5, mX + contentW, sigY + 5.5)

    // Page number
    if (totalPages && totalPages > 1 && typeof pageIndex === 'number') {
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(100, 116, 139)
      doc.text(`Page ${pageIndex + 1} / ${totalPages}`, mX + contentW, PH - 1.5, { align: 'right' })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Export Section PDF: one PDF page per filiere+year containing ALL groups in rows
  // ══════════════════════════════════════════════════════════════════════════

  async function exportSectionsPdf(yearDigit: '1' | '2') {
    const anneeLabel = yearDigit === '1' ? 'T 1ère Année' : 'T 2ème Année'
    const folderName = `Emplois_du_Temps_Section_Annee${yearDigit}`
    const fileName = `Sections_Annee${yearDigit}_Emploi_du_Temps.pdf`

    // Collect all filieres that have at least one group in this year
    const activeFilieres = filieres.filter(fil => getGroupesForFiliereByYear(fil, yearDigit).length > 0)

    if (activeFilieres.length === 0) {
      toast.error(
        lang === 'ar'
          ? `لا توجد أفواج مسجلة للسنة ${yearDigit === '1' ? 'الأولى' : 'الثانية'}`
          : `Aucun groupe trouvé pour l'année ${yearDigit}`
      )
      return
    }

    try {
      setBulkProgress({ current: 0, total: activeFilieres.length, label: 'Génération des Sections PDF...' })

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      for (let i = 0; i < activeFilieres.length; i++) {
        const fil = activeFilieres[i]
        const sectionGroupes = getGroupesForFiliereByYear(fil, yearDigit)

        setBulkProgress({
          current: i + 1,
          total: activeFilieres.length,
          label: lang === 'ar'
            ? `جاري إنشاء جدول الشعبة: ${fil.code_filiere} (${i + 1}/${activeFilieres.length})...`
            : `Génération section ${fil.code_filiere} (${i + 1}/${activeFilieres.length})...`
        })

        if (i > 0) doc.addPage('a4', 'landscape')

        const schedule = buildSectionScheduleMap(sectionGroupes)
        drawSectionPage(doc, fil.code_filiere, anneeLabel, sectionGroupes, schedule, i, activeFilieres.length)

        if (i % 4 === 0) await new Promise(r => setTimeout(r, 10))
      }

      const res = await savePdfFile(folderName, fileName, doc)

      if (res && res.success) {
        setLastExportPath({ folderName, targetDir: res.targetDir || folderName, filePath: res.filePath || fileName })
        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {lang === 'ar'
                  ? `🎉 تم تصدير ${activeFilieres.length} شعبة (سنة ${yearDigit === '1' ? 'أولى' : 'ثانية'}) في ملف PDF واحد!`
                  : `🎉 ${activeFilieres.length} sections année ${yearDigit} exportées dans 1 PDF !`}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => { toast.dismiss(t.id); handleOpenFolder(res.targetDir) }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد' : 'Ouvrir le dossier'}
              </button>
            </div>
          ),
          { duration: 8000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف' : 'Erreur de sauvegarde')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILIERE COMBINED PDF: All groups of the filière in one PDF (multi-page)
  // ══════════════════════════════════════════════════════════════════════════
  async function exportFiliereCombinedPdf(targetFilieres: Filiere[]) {
    if (targetFilieres.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد شعبة واحدة على الأقل' : 'Veuillez sélectionner au moins une filière')
      return
    }

    const folderName = 'Emplois_du_Temps_Filieres'
    const fileName = targetFilieres.length === 1
      ? `Filiere_${targetFilieres[0].code_filiere}_Emploi_du_Temps.pdf`
      : `Filieres_(${targetFilieres.length})_Emploi_du_Temps.pdf`

    // Collect all groups across selected filieres
    const allGroups: Groupe[] = []
    for (const fil of targetFilieres) {
      const grps = getGroupesForFiliere(fil)
      allGroups.push(...grps)
    }

    if (allGroups.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد أفواج مرتبطة بهذه الشعبة' : 'Aucun groupe trouvé pour cette filière')
      return
    }

    try {
      setBulkProgress({ current: 0, total: allGroups.length, label: 'Génération PDF Filière...' })

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      for (let i = 0; i < allGroups.length; i++) {
        const g = allGroups[i]
        const grpCode = g.code_groupe.trim()

        setBulkProgress({
          current: i + 1,
          total: allGroups.length,
          label: lang === 'ar'
            ? `جاري إضافة الفوج: ${grpCode} (${i + 1}/${allGroups.length})...`
            : `Ajout du groupe ${grpCode} (${i + 1}/${allGroups.length})...`
        })

        if (i > 0) doc.addPage('a4', 'landscape')

        const grid = buildGroupeSchedule(g)
        const meta = buildGroupeMeta(g)
        drawOfficialOfpptPage(doc, 'groupe', grpCode, meta, grid, i, allGroups.length)

        if (i % 6 === 0) await new Promise(r => setTimeout(r, 10))
      }

      const res = await savePdfFile(folderName, fileName, doc)

      if (res && res.success) {
        setLastExportPath({ folderName, targetDir: res.targetDir || folderName, filePath: res.filePath || fileName })
        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {lang === 'ar'
                  ? `🎉 تم تصدير ${allGroups.length} فوج في ملف PDF واحد!`
                  : `🎉 ${allGroups.length} groupes exportés dans 1 PDF !`}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => { toast.dismiss(t.id); handleOpenFolder(res.targetDir) }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد' : 'Ouvrir le dossier'}
              </button>
            </div>
          ),
          { duration: 8000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف' : 'Erreur de sauvegarde')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILIERE SEPARATE PDF: One PDF per filière (all groups inside each)
  // ══════════════════════════════════════════════════════════════════════════
  async function exportFiliereSeparateFiles(targetFilieres: Filiere[], isSingle = false) {
    if (targetFilieres.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد شعبة واحدة على الأقل' : 'Veuillez sélectionner au moins une filière')
      return
    }

    const folderName = 'Emplois_du_Temps_Filieres'
    try {
      if (!isSingle) {
        setBulkProgress({ current: 0, total: targetFilieres.length, label: 'Préparation des fichiers...' })
      }

      let successCount = 0
      let lastSavedDir = ''

      for (let i = 0; i < targetFilieres.length; i++) {
        const fil = targetFilieres[i]
        const filCode = fil.code_filiere.replace(/[\\/:*?"<>|]/g, '_')
        const grps = getGroupesForFiliere(fil)

        if (!isSingle) {
          setBulkProgress({
            current: i + 1,
            total: targetFilieres.length,
            label: lang === 'ar' ? `جاري تصدير الشعبة: ${fil.code_filiere}...` : `Export de la filière ${fil.code_filiere}...`
          })
        }

        if (grps.length === 0) continue

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        for (let j = 0; j < grps.length; j++) {
          const g = grps[j]
          if (j > 0) doc.addPage('a4', 'landscape')
          const grid = buildGroupeSchedule(g)
          const meta = buildGroupeMeta(g)
          drawOfficialOfpptPage(doc, 'groupe', g.code_groupe.trim(), meta, grid, j, grps.length)
          if (j % 6 === 0) await new Promise(r => setTimeout(r, 10))
        }

        const fileName = `Filiere_${filCode}_Emploi_du_Temps.pdf`
        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          successCount++
          lastSavedDir = res.targetDir
        }
      }

      setLastExportPath({ folderName, targetDir: lastSavedDir || folderName, filePath: folderName })

      if (isSingle) {
        toast.success(lang === 'ar' ? 'تم تنزيل جدول الشعبة بنجاح!' : 'Planning filière exporté avec succès !')
      } else {
        toast.success(
          lang === 'ar'
            ? `🎉 تم حفظ جداول الشعب (${successCount}) كملفات منفصلة داخل مجلد [${folderName}]!`
            : `🎉 ${successCount} fichiers enregistrés dans [${folderName}] sur le Bureau !`
        )
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION FORMAT per filière: ESA100.pdf (year1) + ESA200.pdf (year2)
  // "Télécharger" button on each filière row calls this
  // ══════════════════════════════════════════════════════════════════════════
  async function exportFiliereSectionFiles(targetFiliere: Filiere) {
    const filCode = targetFiliere.code_filiere.replace(/[\\/:*?"<>|]/g, '_')
    const folderName = 'PDFchaqueGroupes'

    const anneeItems: { digit: '1' | '2'; label: string }[] = [
      { digit: '1', label: 'T 1er Année' },
      { digit: '2', label: 'T 2ème Année' }
    ]

    const yearsWithGroups = anneeItems.filter(
      ({ digit }) => getGroupesForFiliereByYear(targetFiliere, digit).length > 0
    )

    if (yearsWithGroups.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد أفواج لهذه الشعبة' : 'Aucun groupe trouvé pour cette filière')
      return
    }

    try {
      setExportingId(targetFiliere.id || targetFiliere.code_filiere)
      let lastSavedDir = ''
      let savedCount = 0

      for (const { digit, label } of yearsWithGroups) {
        const sectionGroupes = getGroupesForFiliereByYear(targetFiliere, digit)
        if (sectionGroupes.length === 0) continue

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const schedule = buildSectionScheduleMap(sectionGroupes)
        drawSectionPage(doc, targetFiliere.code_filiere, label, sectionGroupes, schedule)

        const fileName = `${filCode}${digit}00.pdf`
        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          savedCount++
          lastSavedDir = res.targetDir
        }
      }

      if (savedCount > 0) {
        setLastExportPath({ folderName, targetDir: lastSavedDir || folderName, filePath: folderName })
        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {lang === 'ar'
                  ? `✅ تم حفظ ${savedCount} ملف Section لشعبة ${targetFiliere.code_filiere}!`
                  : `✅ ${savedCount} fichier(s) Section pour ${targetFiliere.code_filiere} !`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {yearsWithGroups.map(y => `${filCode}${y.digit}00.pdf`).join(' + ')}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => { toast.dismiss(t.id); handleOpenFolder(lastSavedDir) }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد' : 'Ouvrir le dossier'}
              </button>
            </div>
          ),
          { duration: 7000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحفظ' : 'Erreur lors de la sauvegarde')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setExportingId(null)
    }
  }

  // Export ALL filières as Section PDFs into PDFchaqueGroupes folder
  async function exportAllFiliereSectionFiles(targetFilieres: Filiere[]) {
    if (targetFilieres.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد شعبة واحدة على الأقل' : 'Veuillez sélectionner au moins une filière')
      return
    }

    const folderName = 'PDFchaqueGroupes'
    const anneeItems: { digit: '1' | '2'; label: string }[] = [
      { digit: '1', label: 'T 1er Année' },
      { digit: '2', label: 'T 2ème Année' }
    ]

    const tasks: { fil: Filiere; digit: '1' | '2'; label: string }[] = []
    for (const fil of targetFilieres) {
      for (const { digit, label } of anneeItems) {
        if (getGroupesForFiliereByYear(fil, digit).length > 0) {
          tasks.push({ fil, digit, label })
        }
      }
    }

    if (tasks.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد أفواج مسجلة' : 'Aucun groupe trouvé')
      return
    }

    try {
      setBulkProgress({ current: 0, total: tasks.length, label: 'Génération Section PDFs...' })

      let successCount = 0
      let lastSavedDir = ''

      for (let i = 0; i < tasks.length; i++) {
        const { fil, digit, label } = tasks[i]
        const filCode = fil.code_filiere.replace(/[\\/:*?"<>|]/g, '_')
        const sectionGroupes = getGroupesForFiliereByYear(fil, digit)

        setBulkProgress({
          current: i + 1,
          total: tasks.length,
          label: `${filCode}${digit}00.pdf (${i + 1}/${tasks.length})...`
        })

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const schedule = buildSectionScheduleMap(sectionGroupes)
        drawSectionPage(doc, fil.code_filiere, label, sectionGroupes, schedule)

        const fileName = `${filCode}${digit}00.pdf`
        const res = await savePdfFile(folderName, fileName, doc)
        if (res && res.success) {
          successCount++
          lastSavedDir = res.targetDir
        }

        if (i % 4 === 0) await new Promise(r => setTimeout(r, 10))
      }

      setLastExportPath({ folderName, targetDir: lastSavedDir || folderName, filePath: folderName })
      toast.success(
        (t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {lang === 'ar'
                ? `🎉 تم حفظ ${successCount} ملف Section في مجلد [${folderName}]!`
                : `🎉 ${successCount} fichiers Section dans [${folderName}] !`}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
              onClick={() => { toast.dismiss(t.id); handleOpenFolder(lastSavedDir) }}
            >
              <FolderOpen size={14} />
              {lang === 'ar' ? 'فتح المجلد' : 'Ouvrir le dossier'}
            </button>
          </div>
        ),
        { duration: 8000 }
      )
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setBulkProgress(null)
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

            {/* ══════════════════════════════════════════════════════════
                CARD 3: PLANNINGS DES FILIERES
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px', border: '1.5px solid rgba(124, 58, 237, 0.4)' }}>
              <div className="card-header" style={{ marginBottom: 16 }}>
                <h3 className="card-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <BookOpen size={22} color="#7c3aed" />
                  {lang === 'ar' ? 'جداول الشعب (Filieres)' : 'Plannings des Filières'}
                </h3>
                <span className="badge" style={{ fontSize: 12, background: 'rgba(124, 58, 237, 0.15)', color: '#7c3aed', border: '1px solid #7c3aed' }}>
                  {filieres.length} {lang === 'ar' ? 'شعبة' : 'filières'}
                </span>
              </div>

              {/* Action Buttons */}
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
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportFiliereCombinedPdf(filieres)}
                >
                  <FileText size={20} />
                  {lang === 'ar'
                    ? '📄 تصدير جميع الشعب في ملف PDF واحد مجمع'
                    : 'Exporter toutes les filières (1 SEUL fichier PDF)'}
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
                    borderColor: '#7c3aed',
                    color: '#7c3aed'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportFiliereSeparateFiles(filieres)}
                >
                  <Files size={17} />
                  {lang === 'ar'
                    ? '📁 تصدير في ملفات منفصلة (ملف مستقل لكل شعبة)'
                    : 'Exporter en fichiers séparés (1 par filière)'}
                </button>

                {/* SECTION PDF BUTTON - exports ESA100.pdf, ESA200.pdf etc. */}
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    fontSize: '15px',
                    fontWeight: 800,
                    gap: '10px',
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                  }}
                  disabled={!!bulkProgress}
                  onClick={() => exportAllFiliereSectionFiles(filieres)}
                >
                  <Layers size={20} />
                  {lang === 'ar'
                    ? '📋 تصدير جداول القسم (Section) ملف منفصل لكل شعبة/سنة'
                    : 'Exporter Sections PDF (ESA100, ESA200... 1 fichier / filière / année)'}
                </button>

                {/* Selected Action Buttons */}
                {selectedFiliereIds.size > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '10px 12px',
                    background: 'rgba(124, 58, 237, 0.08)',
                    border: '1.5px solid #7c3aed',
                    borderRadius: 8
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>
                      {lang === 'ar' ? `المحددة (${selectedFiliereIds.size} شعب):` : `Sélection (${selectedFiliereIds.size} filières) :`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 700, gap: '6px', background: '#7c3aed' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = filieres.filter(f => selectedFiliereIds.has(f.id || f.code_filiere))
                          exportFiliereCombinedPdf(selectedList)
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
                          const selectedList = filieres.filter(f => selectedFiliereIds.has(f.id || f.code_filiere))
                          exportFiliereSeparateFiles(selectedList)
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
                  placeholder={lang === 'ar' ? 'بحث عن شعبة (مثال: AEFGT, TREM)...' : 'Rechercher une filière (ex: AEFGT)...'}
                  value={searchFiliere}
                  onChange={(e) => setSearchFiliere(e.target.value)}
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 8,
                  marginBottom: 12,
                  cursor: 'pointer'
                }}
                onClick={toggleSelectAllFilieres}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                  {selectedFiliereIds.size === filteredFilieres.length && filteredFilieres.length > 0 ? (
                    <CheckSquare size={18} color="#7c3aed" />
                  ) : (
                    <Square size={18} color="var(--text-secondary)" />
                  )}
                  <span>{lang === 'ar' ? 'تحديد الكل (Select All)' : 'Tout sélectionner'}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {selectedFiliereIds.size} / {filteredFilieres.length} {lang === 'ar' ? 'محدد' : 'sélectionné(s)'}
                </span>
              </div>

              {/* Filiere List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 6 }}>
                {filteredFilieres.map((fil) => {
                  const fId = fil.id || fil.code_filiere
                  const isSelected = selectedFiliereIds.has(fId)
                  const grpsCount = getGroupesForFiliere(fil).length

                  return (
                    <div
                      key={fId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: isSelected ? '1.5px solid #7c3aed' : '1px solid var(--border)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}
                        onClick={() => toggleSelectFiliere(fId)}
                      >
                        {isSelected ? (
                          <CheckSquare size={19} color="#7c3aed" />
                        ) : (
                          <Square size={19} color="var(--text-secondary)" />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                            {fil.code_filiere}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {fil.nom_filiere}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: '#7c3aed', background: 'rgba(124, 58, 237, 0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                          {grpsCount} {lang === 'ar' ? 'فوج' : 'groupe(s)'}
                        </span>
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '7px 14px',
                          fontSize: '13px',
                          fontWeight: 700,
                          gap: '6px',
                          color: '#7c3aed',
                          borderColor: '#7c3aed'
                        }}
                        disabled={!!bulkProgress || !!exportingId || grpsCount === 0}
                        onClick={() => exportFiliereSectionFiles(fil)}
                        title={lang === 'ar' ? 'تنزيل جدول القسم (Section PDF)' : 'Télécharger Section PDF'}
                      >
                        {exportingId === (fil.id || fil.code_filiere) ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <FileDown size={15} />
                        )}
                        {lang === 'ar' ? 'تنزيل Section' : 'Section PDF'}
                      </button>
                    </div>
                  )
                })}

                {filteredFilieres.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, padding: '20px 0' }}>
                    {lang === 'ar' ? 'لا توجد شعب مطابقة للبحث' : 'Aucune filière trouvée'}
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                CARD 4: EMPLOI DU TEMPS DE LA SECTION (Année 1 & 2)
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px', border: '1.5px solid rgba(99, 102, 241, 0.5)', gridColumn: '1 / -1' }}>
              <div className="card-header" style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <h3 className="card-title" style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Layers size={24} color="#6366f1" />
                    {lang === 'ar' ? 'جدول استعمال الزمن — القسم (Section)' : 'Emploi du Temps de la Section'}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    {lang === 'ar'
                      ? 'تصدير جميع شعب السنة الأولى أو الثانية — جدول واحد يجمع كل المجموعات في نموذج OFPPT الرسمي (بضبط كالصورة)'
                      : 'Exporte toutes les sections (Année 1 ou 2) — un tableau par filière regroupant tous les groupes dans le format officiel OFPPT'}
                  </p>
                </div>
                <span className="badge" style={{ fontSize: 12, background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', border: '1px solid #6366f1', alignSelf: 'flex-start' }}>
                  {filieres.length} {lang === 'ar' ? 'شعبة' : 'filières'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* ANNÉE 1 */}
                <div style={{
                  padding: '20px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(79, 70, 229, 0.04))',
                  border: '1.5px solid rgba(99, 102, 241, 0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 900, fontSize: 16
                    }}>1</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {lang === 'ar' ? 'السنة الأولى — T 1ère Année' : 'Année 1 — T 1ère Année'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {lang === 'ar'
                          ? `مجموعات السنة الأولى (1xx) من ${filieres.filter(f => getGroupesForFiliereByYear(f, '1').length > 0).length} شعبة`
                          : `Groupes 1xx de ${filieres.filter(f => getGroupesForFiliereByYear(f, '1').length > 0).length} filières`}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      fontSize: '15px',
                      fontWeight: 800,
                      gap: '10px',
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                    }}
                    disabled={!!bulkProgress}
                    onClick={() => exportSectionsPdf('1')}
                  >
                    <FileText size={20} />
                    {lang === 'ar'
                      ? '📄 تصدير جداول القسم — السنة الأولى (PDF)'
                      : 'Exporter Sections Année 1 (PDF)'}
                  </button>
                </div>

                {/* ANNÉE 2 */}
                <div style={{
                  padding: '20px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(2, 132, 199, 0.04))',
                  border: '1.5px solid rgba(14, 165, 233, 0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 900, fontSize: 16
                    }}>2</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {lang === 'ar' ? 'السنة الثانية — T 2ème Année' : 'Année 2 — T 2ème Année'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {lang === 'ar'
                          ? `مجموعات السنة الثانية (2xx) من ${filieres.filter(f => getGroupesForFiliereByYear(f, '2').length > 0).length} شعبة`
                          : `Groupes 2xx de ${filieres.filter(f => getGroupesForFiliereByYear(f, '2').length > 0).length} filières`}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      fontSize: '15px',
                      fontWeight: 800,
                      gap: '10px',
                      background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                      boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)'
                    }}
                    disabled={!!bulkProgress}
                    onClick={() => exportSectionsPdf('2')}
                  >
                    <FileText size={20} />
                    {lang === 'ar'
                      ? '📄 تصدير جداول القسم — السنة الثانية (PDF)'
                      : 'Exporter Sections Année 2 (PDF)'}
                  </button>
                </div>
              </div>

              {/* Info note */}
              <div style={{
                marginTop: 14,
                padding: '10px 14px',
                background: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <Layers size={14} color="#6366f1" />
                <span>
                  {lang === 'ar'
                    ? 'كل صفحة PDF تجمع جميع مجموعات الشعبة في جدول واحد بالتنسيق الرسمي OFPPT (EMPLOI DU TEMPS DE LA SECTION) — بضبط كما تراه في الشاشة'
                    : 'Chaque page PDF regroupe tous les groupes d\'une filière dans un seul tableau au format officiel OFPPT (EMPLOI DU TEMPS DE LA SECTION)'}
                </span>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
