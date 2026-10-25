import React, { useState, useEffect, useMemo } from 'react'
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
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set())
  const [searchSection, setSearchSection] = useState('')

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
      if (/CDS/i.test(g.code_groupe)) return false
      const code = g.code_groupe.toUpperCase().replace(/\s+/g, '')
      const yearMatch = code.match(/([1-9])\d\d/)
      if (!yearMatch) return false
      return yearMatch[1] === yearDigit
    }).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe))
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION ITEMS: Structure sections as CPA100, CPA200, AEFGT100, etc.
  // ══════════════════════════════════════════════════════════════════════════
  interface SectionItem {
    id: string
    code_section: string
    filiereCode: string
    filiereNom: string
    digit: '1' | '2' | '3'
    anneeLabel: string
    groupes: Groupe[]
    filiereObj?: Filiere
    isCds?: boolean
  }

  const allSections = useMemo<SectionItem[]>(() => {
    const list: SectionItem[] = []
    const anneeItems: { digit: '1' | '2'; label: string; suffix: string }[] = [
      { digit: '1', label: 'T 1ère Année', suffix: '100' },
      { digit: '2', label: 'T 2ème Année', suffix: '200' }
    ]

    for (const fil of filieres) {
      const filCode = fil.code_filiere.replace(/[\\/:*?"<>|]/g, '_').trim()
      if (!filCode) continue

      for (const { digit, label, suffix } of anneeItems) {
        const secGroupes = getGroupesForFiliereByYear(fil, digit)
        if (secGroupes.length > 0) {
          const codeSec = `${filCode}${suffix}`
          list.push({
            id: codeSec,
            code_section: codeSec,
            filiereCode: fil.code_filiere,
            filiereNom: fil.nom_filiere || '',
            digit,
            anneeLabel: label,
            groupes: secGroupes,
            filiereObj: fil
          })
        }
      }

      // Check CDS groups for this filière (e.g. RVA100CDS, TEMI100CDS)
      const filGrps = getGroupesForFiliere(fil)
      const cdsGrps = filGrps.filter(g => /CDS/i.test(g.code_groupe))
      if (cdsGrps.length > 0) {
        const cdsCode = cdsGrps[0].code_groupe.toUpperCase().replace(/\s+/g, '')
        const codeSec = /^\w+\d+CDS/i.test(cdsCode) ? cdsCode : `${filCode}100CDS`
        if (!list.some(s => s.code_section === codeSec)) {
          list.push({
            id: codeSec,
            code_section: codeSec,
            filiereCode: fil.code_filiere,
            filiereNom: fil.nom_filiere ? `${fil.nom_filiere} (CDS)` : 'Cours du Soir',
            digit: '1',
            anneeLabel: 'Cours du Soir (CDS)',
            groupes: cdsGrps,
            filiereObj: fil,
            isCds: true
          })
        }
      }
    }

    return list.sort((a, b) => a.code_section.localeCompare(b.code_section))
  }, [filieres, groupes])

  const filteredSections = useMemo(() => {
    const term = searchSection.toLowerCase().trim()
    if (!term) return allSections
    return allSections.filter(sec =>
      sec.code_section.toLowerCase().includes(term) ||
      sec.filiereCode.toLowerCase().includes(term) ||
      sec.filiereNom.toLowerCase().includes(term) ||
      sec.anneeLabel.toLowerCase().includes(term) ||
      sec.groupes.some(g => g.code_groupe.toLowerCase().includes(term))
    )
  }, [allSections, searchSection])

  function toggleSelectAllSections() {
    if (selectedSectionIds.size === filteredSections.length && filteredSections.length > 0) {
      setSelectedSectionIds(new Set())
    } else {
      setSelectedSectionIds(new Set(filteredSections.map(s => s.id)))
    }
  }

  function toggleSelectSection(id: string) {
    const next = new Set(selectedSectionIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedSectionIds(next)
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
  // Formateur Pastel Palette for Section Timetable (Matches official OFPPT sheet)
  // ══════════════════════════════════════════════════════════════════════════
  const SECTION_PASTEL_PALETTE: Array<[number, number, number]> = [
    [216, 180, 226], // 0: Lilac / Soft Purple (MEBSOUT)
    [244, 182, 182], // 1: Soft Rose / Pink (BERRADA)
    [254, 215, 170], // 2: Soft Peach / Warm Orange (DEBBAR)
    [241, 245, 249], // 3: Soft Slate / Neutral Light Gray (KHOUTAM)
    [198, 246, 213], // 4: Soft Mint Green
    [207, 250, 254], // 5: Soft Sky Blue
    [254, 240, 138], // 6: Soft Pastel Yellow
    [224, 231, 255], // 7: Soft Lavender
    [253, 230, 138], // 8: Soft Amber
    [233, 213, 255], // 9: Soft Violet
    [204, 251, 241], // 10: Soft Teal
    [254, 205, 211], // 11: Soft Coral
  ]

  function getSectionFormateurColor(nom: string): [number, number, number] {
    if (!nom) return [255, 255, 255]
    const clean = nom.toUpperCase().trim()
    if (clean.includes('MEBSOUT')) return [216, 180, 226]
    if (clean.includes('BERRADA')) return [244, 182, 182]
    if (clean.includes('DEBBAR'))  return [254, 215, 170]
    if (clean.includes('KHOUTAM')) return [241, 245, 249]

    let hash = 0
    for (let i = 0; i < clean.length; i++) {
      hash = (hash * 31 + clean.charCodeAt(i)) % SECTION_PASTEL_PALETTE.length
    }
    return SECTION_PASTEL_PALETTE[Math.abs(hash)]
  }

  function formatSectionSessionText(nomFormateur: string, nomSalle: string): string {
    const prof = (nomFormateur || '').trim().toUpperCase()
    let salle = (nomSalle || '').trim().toUpperCase()
    if (!salle) return prof

    // Standardize atelier / salle room names
    if (
      !salle.startsWith('AT ') &&
      !salle.startsWith('ATELIER') &&
      !salle.startsWith('SALLE') &&
      !salle.startsWith('LABO') &&
      !salle.startsWith('AMPHI')
    ) {
      if (salle === 'PC' || salle.length <= 8) {
        salle = `AT ${salle}`
      }
    }

    return `${prof} - ${salle}`
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Draw "Section" PDF pages (2 Pages: LUN-MER on P1, JEU-SAM + Signatures on P2)
  // Exact OFPPT 10-row matrix layout with pastel colors & clear typography
  // ══════════════════════════════════════════════════════════════════════════
  function drawSectionPage(
    doc: jsPDF,
    filiereCode: string,
    anneeLabel: string,
    sectionGroupes: Groupe[],
    schedule: Record<string, { nomFormateur: string; nomSalle: string }>,
    sectionIndex?: number,
    totalSections?: number
  ) {
    const mX = 8     // margin left/right
    const mY = 4     // margin top
    const PW = 297   // A4 landscape width mm
    const PH = 210   // A4 landscape height mm
    const contentW = PW - mX * 2 // 281 mm

    const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2025-2026'
    const periode = localStorage.getItem('periode_application_groupe') || 'Avril 2026'
    const isCdsSection = sectionGroupes.some(g => /CDS/i.test(g.code_groupe)) || /CDS/i.test(anneeLabel)
    const customCdsHour = localStorage.getItem('custom_cds_hour') || '18H30 \u00c0 21H00'
    const TS = isCdsSection
      ? [customCdsHour]
      : ['8H30 \u00e0 11H00', '11H00 \u00e0 13H30', '13H30 \u00e0 16H00', '16H00 \u00e0 18H30']

    // Fixed column widths
    const col1W = 20  // JOUR column
    const col2W = 22  // GROUPE column
    const slotW = (contentW - col1W - col2W) / TS.length // 59.75mm for 4 slots

    // 10 rows per day matrix (standard OFPPT section template)
    const rowsPerDay = Math.max(10, sectionGroupes.length)
    const rowH = 4.6  // 4.6mm per row
    const sepH = 1.2  // separator stripe between days
    const hdrH = 4.5  // each table header row (2 x 4.5 = 9mm)

    // Helper: Draw Table Header (Row 1: HEURE + TimeSlots, Row 2: JOUR + GROUPE)
    const drawTableHeaders = (startY: number) => {
      doc.setDrawColor(0, 0, 0).setLineWidth(0.35)

      // Header row 1:
      // Merged cell over JOUR and GROUPE: "HEURE"
      doc.setFillColor(200, 200, 200)
      doc.rect(mX, startY, col1W + col2W, hdrH, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(0, 0, 0)
      doc.text('HEURE', mX + (col1W + col2W) / 2, startY + hdrH / 2 + 1.2, { align: 'center' })

      // Time slots on Row 1
      TS.forEach((label, i) => {
        const sx = mX + col1W + col2W + i * slotW
        doc.setFillColor(217, 217, 217)
        doc.rect(sx, startY, slotW, hdrH, 'FD')
        doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(0, 0, 0)
        doc.text(label, sx + slotW / 2, startY + hdrH / 2 + 1.2, { align: 'center' })
      })

      // Header row 2:
      const h2Y = startY + hdrH
      doc.setFillColor(185, 185, 185)
      doc.rect(mX, h2Y, col1W, hdrH, 'FD')
      doc.rect(mX + col1W, h2Y, col2W, hdrH, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(0, 0, 0)
      doc.text('JOUR', mX + col1W / 2, h2Y + hdrH / 2 + 1.2, { align: 'center' })
      doc.text('GROUPE', mX + col1W + col2W / 2, h2Y + hdrH / 2 + 1.2, { align: 'center' })

      // Time slots row 2 (clean background with borders)
      TS.forEach((_, i) => {
        const sx = mX + col1W + col2W + i * slotW
        doc.setFillColor(232, 232, 232)
        doc.rect(sx, h2Y, slotW, hdrH, 'FD')
      })
    }

    // Helper: Draw Day Block (10 rows)
    const drawDayBlock = (jour: string, dayTopY: number) => {
      const dayTotalH = rowsPerDay * rowH

      // 1. Day label cell (vertically merged across all rows of this day)
      doc.setFillColor(226, 232, 240)
      doc.setDrawColor(0, 0, 0).setLineWidth(0.4)
      doc.rect(mX, dayTopY, col1W, dayTotalH, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(15, 23, 42)
      doc.text(jour, mX + col1W / 2, dayTopY + dayTotalH / 2 + 1.2, { align: 'center' })

      // 2. Rows
      for (let rIdx = 0; rIdx < rowsPerDay; rIdx++) {
        const rowY = dayTopY + rIdx * rowH
        const groupe = rIdx < sectionGroupes.length ? sectionGroupes[rIdx] : null
        const textMidY = rowY + rowH / 2 + 1.1

        // Groupe cell
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(0, 0, 0).setLineWidth(0.25)
        doc.rect(mX + col1W, rowY, col2W, rowH, 'FD')

        if (groupe) {
          doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(0, 0, 0)
          doc.text(groupe.code_groupe, mX + col1W + col2W / 2, textMidY, { align: 'center' })

          // Time slot cells
          for (let sIdx = 0; sIdx < TS.length; sIdx++) {
            const tsIdx = isCdsSection ? 4 : sIdx
            const sx = mX + col1W + col2W + sIdx * slotW
            const codeClean = groupe.code_groupe.toUpperCase().replace(/\s+/g, '')

            if (groupe.en_stage) {
              doc.setFillColor(241, 245, 249)
              doc.rect(sx, rowY, slotW, rowH, 'FD')
              doc.setFont('helvetica', 'italic').setFontSize(6.2).setTextColor(71, 85, 105)
              doc.text('Stage', sx + slotW / 2, textMidY, { align: 'center' })
            } else {
              const keyId = groupe.id ? `${jour}__${groupe.id}__${tsIdx}` : ''
              const keyCode = `${jour}__${codeClean}__${tsIdx}`
              const cell = (keyId && schedule[keyId]) || schedule[keyCode]

              if (cell && (cell.nomFormateur || cell.nomSalle)) {
                const pastel = getSectionFormateurColor(cell.nomFormateur)
                doc.setFillColor(pastel[0], pastel[1], pastel[2])
                doc.rect(sx, rowY, slotW, rowH, 'FD')

                doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(0, 0, 0)
                const txt = formatSectionSessionText(cell.nomFormateur, cell.nomSalle)
                const lines = doc.splitTextToSize(txt, slotW - 2)
                if (lines.length <= 1) {
                  doc.text(txt, sx + slotW / 2, textMidY, { align: 'center' })
                } else {
                  const lineH = 2.3
                  const totalH = lines.length * lineH
                  const startLineY = rowY + (rowH - totalH) / 2 + 1.7
                  lines.forEach((l: string, li: number) => {
                    doc.text(l, sx + slotW / 2, startLineY + li * lineH, { align: 'center' })
                  })
                }
              } else {
                doc.setFillColor(255, 255, 255)
                doc.rect(sx, rowY, slotW, rowH, 'FD')
              }
            }

            doc.setDrawColor(0, 0, 0).setLineWidth(0.22)
            doc.rect(sx, rowY, slotW, rowH)
          }
        } else {
          // Empty matrix row
          for (let sIdx = 0; sIdx < TS.length; sIdx++) {
            const sx = mX + col1W + col2W + sIdx * slotW
            doc.setFillColor(255, 255, 255)
            doc.setDrawColor(0, 0, 0).setLineWidth(0.2)
            doc.rect(sx, rowY, slotW, rowH, 'FD')
          }
        }
      }

      // Day outer border
      doc.setDrawColor(0, 0, 0).setLineWidth(0.45)
      doc.rect(mX, dayTopY, contentW, dayTotalH)

      // Separator stripe between days
      const sepY = dayTopY + dayTotalH
      doc.setFillColor(220, 232, 247)
      doc.rect(mX, sepY, contentW, sepH, 'F')
      doc.setDrawColor(0, 0, 0).setLineWidth(0.3)
      doc.rect(mX, sepY, contentW, sepH)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── PAGE 1: LUNDI, MARDI, MERCREDI ──
    // ══════════════════════════════════════════════════════════════════════════

    // 1. Logo
    if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.naturalWidth > 0) {
      try { doc.addImage(cachedLogoImg, 'JPEG', mX + 1, mY + 1, 15, 11) } catch (_) {}
    } else {
      doc.setFillColor(15, 118, 110)
      doc.roundedRect(mX + 1, mY + 1, 15, 11, 2, 2, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(255, 255, 255)
      doc.text('OFPPT', mX + 8.5, mY + 7.5, { align: 'center' })
    }

    // 2. Title & Subtitle
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold').setFontSize(14)
    doc.text('EMPLOI DU TEMPS DE LA SECTION', PW / 2, mY + 6, { align: 'center' })
    doc.setFontSize(9)
    doc.text(`ANNEE DE FORMATION : ${anneeFormation}`, PW / 2, mY + 11.5, { align: 'center' })

    // 3. Meta block
    const metaY = mY + 14.5
    const lh = 3.3
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(0, 0, 0)

    // Left column
    doc.setFont('helvetica', 'bold').text('DRGC', mX + 1, metaY)
    doc.setFont('helvetica', 'normal').text('Complexe/EFP : CFP IMME/ISTA MY RACHID', mX + 1, metaY + lh)
    doc.text('Groupe :', mX + 1, metaY + lh * 2)
    doc.text(`Fili\u00e8re : ${filiereCode}`, mX + 1, metaY + lh * 3)
    doc.text(`Niveau : ${anneeLabel}`, mX + 1, metaY + lh * 4)
    doc.text('Masse horaire :', mX + 1, metaY + lh * 5)
    doc.text(`Mode de formation : ${isCdsSection ? 'CDS' : 'FPA'}`, mX + 1, metaY + lh * 6)

    // Right column
    doc.setFont('helvetica', 'bold')
    doc.text(`P\u00e9riode d'application: ${periode}`, mX + contentW - 2, metaY + lh * 3, { align: 'right' })
    doc.text('Parrain:', mX + contentW - 2, metaY + lh * 4, { align: 'right' })

    // 4. Table Header on Page 1
    const tY1 = metaY + lh * 6 + 2.5
    drawTableHeaders(tY1)

    // 5. Days on Page 1: LUNDI, MARDI, MERCREDI
    const page1Days = ['LUNDI', 'MARDI', 'MERCREDI']
    const bodyStartY1 = tY1 + hdrH * 2
    page1Days.forEach((jour, jIdx) => {
      const dayTopY = bodyStartY1 + jIdx * (rowsPerDay * rowH + sepH)
      drawDayBlock(jour, dayTopY)
    })

    // Page 1 footer
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(100, 116, 139)
    const pageStr1 = typeof sectionIndex === 'number' && totalSections
      ? `Section ${sectionIndex + 1}/${totalSections} • Page 1 / 2`
      : 'Page 1 / 2'
    doc.text(pageStr1, mX + contentW, PH - 2, { align: 'right' })

    // ══════════════════════════════════════════════════════════════════════════
    // ── PAGE 2: JEUDI, VENDREDI, SAMEDI + SIGNATURES ──
    // ══════════════════════════════════════════════════════════════════════════
    doc.addPage('a4', 'landscape')

    const tY2 = mY + 2
    drawTableHeaders(tY2)

    const page2Days = ['JEUDI', 'VENDREDI', 'SAMEDI']
    const bodyStartY2 = tY2 + hdrH * 2
    page2Days.forEach((jour, jIdx) => {
      const dayTopY = bodyStartY2 + jIdx * (rowsPerDay * rowH + sepH)
      drawDayBlock(jour, dayTopY)
    })

    // Signatures footer on Page 2
    const lastDayBottomY = bodyStartY2 + page2Days.length * (rowsPerDay * rowH + sepH)
    const sigY = lastDayBottomY + 2
    const sigColW = contentW / 3
    const sigH = 26

    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(0, 0, 0)
    doc.setDrawColor(0, 0, 0).setLineWidth(0.45)
    doc.rect(mX, sigY, contentW, sigH)
    doc.line(mX + sigColW, sigY, mX + sigColW, sigY + sigH)
    doc.line(mX + sigColW * 2, sigY, mX + sigColW * 2, sigY + sigH)

    doc.text('Formateur', mX + sigColW / 2, sigY + 4.5, { align: 'center' })
    doc.text('Directeur / Directeur P\u00e9dagogique', mX + sigColW + sigColW / 2, sigY + 4.5, { align: 'center' })
    doc.text('Directeur du Complexe', mX + sigColW * 2 + sigColW / 2, sigY + 4.5, { align: 'center' })

    doc.setLineWidth(0.25)
    doc.line(mX, sigY + 6.8, mX + contentW, sigY + 6.8)

    // Page 2 footer
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(100, 116, 139)
    const pageStr2 = typeof sectionIndex === 'number' && totalSections
      ? `Section ${sectionIndex + 1}/${totalSections} • Page 2 / 2`
      : 'Page 2 / 2'
    doc.text(pageStr2, mX + contentW, PH - 2, { align: 'right' })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT SINGLE SECTION: e.g. CPA100.pdf or CPA200.pdf
  // ══════════════════════════════════════════════════════════════════════════
  async function exportSingleSection(sec: SectionItem) {
    const folderName = 'PDFchaqueGroupes'
    const fileName = `${sec.code_section}.pdf`

    if (sec.groupes.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد أفواج في هذا القسم' : 'Aucun groupe dans cette section')
      return
    }

    try {
      setExportingId(sec.code_section)
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const schedule = buildSectionScheduleMap(sec.groupes)
      drawSectionPage(doc, sec.filiereCode, sec.anneeLabel, sec.groupes, schedule)

      const res = await savePdfFile(folderName, fileName, doc)
      if (res && res.success) {
        setLastExportPath({ folderName, targetDir: res.targetDir || folderName, filePath: res.filePath || fileName })
        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {lang === 'ar'
                  ? `✅ تم حفظ ملف القسم [${fileName}] بنجاح!`
                  : `✅ Fichier Section [${fileName}] enregistré !`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {sec.groupes.map(g => g.code_groupe).join(', ')}
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
          { duration: 7000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف' : 'Erreur lors de la sauvegarde')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? `خطأ: ${err?.message || ''}` : `Erreur: ${err?.message || ''}`)
    } finally {
      setExportingId(null)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT MULTIPLE SECTIONS: 1 file per section into PDFchaqueGroupes folder
  // ══════════════════════════════════════════════════════════════════════════
  async function exportMultipleSections(targetSections: SectionItem[]) {
    if (targetSections.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد قسم واحد على الأقل' : 'Veuillez sélectionner au moins une section')
      return
    }

    const folderName = 'PDFchaqueGroupes'

    try {
      setBulkProgress({ current: 0, total: targetSections.length, label: 'Génération Section PDFs...' })

      let successCount = 0
      let lastSavedDir = ''

      for (let i = 0; i < targetSections.length; i++) {
        const sec = targetSections[i]
        const fileName = `${sec.code_section}.pdf`

        setBulkProgress({
          current: i + 1,
          total: targetSections.length,
          label: `${fileName} (${i + 1}/${targetSections.length})...`
        })

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const schedule = buildSectionScheduleMap(sec.groupes)
        drawSectionPage(doc, sec.filiereCode, sec.anneeLabel, sec.groupes, schedule)

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
                : `🎉 ${successCount} fichiers Section enregistrés dans [${folderName}] !`}
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

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT SECTIONS COMBINED: 1 single PDF with 1 page per section
  // ══════════════════════════════════════════════════════════════════════════
  async function exportSectionsCombinedPdf(targetSections: SectionItem[]) {
    if (targetSections.length === 0) {
      toast.error(lang === 'ar' ? 'الرجاء تحديد قسم واحد على الأقل' : 'Veuillez sélectionner au moins une section')
      return
    }

    const folderName = 'PDFchaqueGroupes'
    const fileName = targetSections.length === allSections.length
      ? 'Toutes_les_Sections_Emploi_du_Temps.pdf'
      : `Sections_(${targetSections.length})_Emploi_du_Temps.pdf`

    try {
      setBulkProgress({ current: 0, total: targetSections.length, label: 'Génération du PDF combiné des Sections...' })

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      for (let i = 0; i < targetSections.length; i++) {
        const sec = targetSections[i]

        setBulkProgress({
          current: i + 1,
          total: targetSections.length,
          label: `${sec.code_section} (${i + 1}/${targetSections.length})...`
        })

        if (i > 0) doc.addPage('a4', 'landscape')

        const schedule = buildSectionScheduleMap(sec.groupes)
        drawSectionPage(doc, sec.filiereCode, sec.anneeLabel, sec.groupes, schedule, i, targetSections.length)

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
                  ? `🎉 تم حفظ ${targetSections.length} قسم في ملف PDF واحد مجمع!`
                  : `🎉 ${targetSections.length} sections enregistrées dans 1 fichier PDF !`}
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
                CARD 3: EMPLOIS DU TEMPS DES SECTIONS (CPA100, CPA200...)
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px', border: '1.5px solid rgba(124, 58, 237, 0.4)' }}>
              <div className="card-header" style={{ marginBottom: 16 }}>
                <h3 className="card-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Layers size={22} color="#7c3aed" />
                  {lang === 'ar' ? 'جداول الأقسام (Sections: CPA100, CPA200...)' : 'Emploi du Temps des Sections (CPA100, CPA200...)'}
                </h3>
                <span className="badge" style={{ fontSize: 12, background: 'rgba(124, 58, 237, 0.15)', color: '#7c3aed', border: '1px solid #7c3aed' }}>
                  {allSections.length} {lang === 'ar' ? 'قسم' : 'sections'}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {/* 1 FILE PER SECTION BUTTON (Main button) */}
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    fontSize: '15px',
                    fontWeight: 800,
                    gap: '10px',
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)'
                  }}
                  disabled={!!bulkProgress || allSections.length === 0}
                  onClick={() => exportMultipleSections(allSections)}
                >
                  <Layers size={20} />
                  {lang === 'ar'
                    ? `📋 تصدير جميع الأقسام (${allSections.length} ملف : CPA100, CPA200...)`
                    : `Exporter toutes les sections (${allSections.length} fichiers : CPA100, CPA200...)`}
                </button>

                {/* 1 SINGLE COMBINED PDF BUTTON */}
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
                  disabled={!!bulkProgress || allSections.length === 0}
                  onClick={() => exportSectionsCombinedPdf(allSections)}
                >
                  <FileText size={17} />
                  {lang === 'ar'
                    ? '📄 تصدير جميع الأقسام في ملف PDF واحد مجمع'
                    : 'Exporter toutes les sections (1 SEUL fichier PDF)'}
                </button>

                {/* Selected Action Buttons */}
                {selectedSectionIds.size > 0 && (
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
                      {lang === 'ar' ? `المحددة (${selectedSectionIds.size} قسم):` : `Sélection (${selectedSectionIds.size} sections) :`}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 700, gap: '6px', background: '#7c3aed' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = allSections.filter(s => selectedSectionIds.has(s.id))
                          exportMultipleSections(selectedList)
                        }}
                      >
                        <Files size={15} />
                        {lang === 'ar' ? 'ملفات منفصلة' : 'Fichiers séparés'}
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px', fontWeight: 600, gap: '6px' }}
                        disabled={!!bulkProgress}
                        onClick={() => {
                          const selectedList = allSections.filter(s => selectedSectionIds.has(s.id))
                          exportSectionsCombinedPdf(selectedList)
                        }}
                      >
                        <FileText size={15} />
                        {lang === 'ar' ? 'ملف واحد مجمع' : '1 seul PDF'}
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
                  placeholder={lang === 'ar' ? 'بحث عن قسم (مثال: CPA100, AEFGT, 100)...' : 'Rechercher une section (ex: CPA100, AEFGT, 100)...'}
                  value={searchSection}
                  onChange={(e) => setSearchSection(e.target.value)}
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
                onClick={toggleSelectAllSections}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                  {selectedSectionIds.size === filteredSections.length && filteredSections.length > 0 ? (
                    <CheckSquare size={18} color="#7c3aed" />
                  ) : (
                    <Square size={18} color="var(--text-secondary)" />
                  )}
                  <span>{lang === 'ar' ? 'تحديد الكل (Select All)' : 'Tout sélectionner'}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {selectedSectionIds.size} / {filteredSections.length} {lang === 'ar' ? 'محدد' : 'sélectionné(s)'}
                </span>
              </div>

              {/* Section List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto', paddingRight: 6 }}>
                {filteredSections.map((sec) => {
                  const isSelected = selectedSectionIds.has(sec.id)
                  const isExportingThis = exportingId === sec.code_section

                  return (
                    <div
                      key={sec.id}
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
                        onClick={() => toggleSelectSection(sec.id)}
                      >
                        {isSelected ? (
                          <CheckSquare size={19} color="#7c3aed" />
                        ) : (
                          <Square size={19} color="var(--text-secondary)" />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                              {sec.code_section}
                            </span>
                            <span style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: sec.digit === '1' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                              color: sec.digit === '1' ? '#6366f1' : '#0284c7'
                            }}>
                              {sec.anneeLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                            {sec.filiereNom && <span>{sec.filiereNom}</span>}
                            <span>•</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>
                              {sec.groupes.map(g => g.code_groupe).join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, color: '#7c3aed', background: 'rgba(124, 58, 237, 0.1)', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                          {sec.groupes.length} {lang === 'ar' ? 'فوج' : 'groupe(s)'}
                        </span>

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
                          disabled={!!bulkProgress || !!exportingId || sec.groupes.length === 0}
                          onClick={() => exportSingleSection(sec)}
                          title={lang === 'ar' ? `تنزيل ${sec.code_section}.pdf` : `Télécharger ${sec.code_section}.pdf`}
                        >
                          {isExportingThis ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <FileDown size={15} />
                          )}
                          {lang === 'ar' ? 'Section PDF' : 'Section PDF'}
                        </button>
                      </div>
                    </div>
                  )
                })}

                {filteredSections.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, padding: '20px 0' }}>
                    {lang === 'ar' ? 'لا توجد أقسام مطابقة للبحث' : 'Aucune section trouvée'}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  )
}
