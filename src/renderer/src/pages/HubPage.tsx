import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Grid3X3,
  CalendarDays,
  FileDown,
  ArrowLeft,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertCircle,
  Building2,
  Briefcase,
  Search,
  Plus,
  Trash2,
  Share2,
  Layers,
  DoorOpen,
  X,
  Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  formateursService,
  sallesService,
  groupesService,
  filieresService,
  planningSallesService,
  seancesService
} from '../services/firebaseService'
import type { Formateur, Salle, Groupe, Filiere, NavPage } from '../types'
import { useTranslation } from '../lib/i18n'
import ofpptLogo from '../assets/ofppt_logo.jpg'

// ── Fallback OFPPT Data matching the Excel Model ──────────────────────────────
interface FallbackFiliereInfo {
  filiere: string
  profs: string[]
  cdsProfs?: string[]
  annee1: string
  annee2: string
  anneeExtra?: string
  cdsList?: string[]
}

const DEFAULT_FALLBACK_COLS: FallbackFiliereInfo[] = [
  { filiere: 'AEFGT', profs: ['BERRADA', 'MEBSOUT', 'ASSOULI'], annee1: 'AEFGT101', annee2: 'AEFGT201' },
  { filiere: 'CPA', profs: ['EDDAMIRI', 'MAAZOUZ'], annee1: 'CPA101', annee2: 'CPA201' },
  { filiere: 'EB', profs: [], annee1: 'EB101', annee2: 'EB201' },
  { filiere: 'EEI', profs: ['ELKHALIDY', 'ASSOULI', 'HANNANE'], annee1: 'EEI101', annee2: 'EEI201' },
  { filiere: 'EM', profs: ['ESSFADI', 'BOUDABLIJ'], annee1: 'EM101', annee2: 'EM201' },
  { filiere: 'ESA', profs: ['CHGORA', 'LOUARGUI', 'AZAROUAL', 'WAHOUB', 'ABOUTARIK', 'ZARIOH'], annee1: 'ESA101', annee2: 'ESA201' },
  { filiere: 'M', profs: ['LAMALEM', 'ROUAGHI'], annee1: 'M101', annee2: 'M201' },
  { filiere: 'MA', profs: ['BAHASSOUNE', 'ELAMIR'], annee1: 'MA101', annee2: 'MA200' },
  { filiere: 'MOAB', profs: ['OUAKIF', 'KHANNIBA', 'MESSOUR'], annee1: 'MOAB100', annee2: 'MOAB201' },
  { filiere: 'OPCM', profs: ['BIALA', 'ABOUTARA', 'FITHANE', 'HANAFI'], annee1: 'OPCM101', annee2: 'OPCM201' },
  { filiere: 'PC', profs: ['DOUHOU', 'KHOUTAM'], annee1: 'PC101', annee2: 'PC201' },
  { filiere: 'RVA', profs: ['RMILI', 'ELHARFI', 'CHAHID', 'CHAFIKI', 'ZOUBID'], annee1: 'RVA101', annee2: 'RVA201', cdsList: ['RVA100CDS'] },
  { filiere: 'TCM', profs: ['NASRI', 'HANAFI'], annee1: 'TCM101', annee2: 'TCM201' },
  { filiere: 'TEMI', profs: [], annee1: 'TEMI101', annee2: 'TEMI201', cdsList: ['TEMI100CDS', 'TEMI300CDS'] },
  { filiere: 'TFM', profs: ['ABOUTARIK', 'BADDI'], annee1: 'TFM101', annee2: 'TFM201' },
  { filiere: 'TREM', profs: ['ELABDANI', 'ELHARFI', 'CHAFIKI', 'ZOUBID', 'FITHANE'], annee1: 'TREM101', annee2: 'TREM201' }
]

const DEFAULT_COMM_COLS = [
  { module: 'Français' },
  { module: 'Anglais' },
  { module: 'Arabe' },
  { module: 'Soft Skills' },
  { module: 'Culture Entreprise' },
  { module: 'Culture Numérique' }
]

// Normalisation des chaînes pour comparaison insensible aux accents et à la casse
function matchesModule(text: string | undefined, moduleName: string): boolean {
  if (!text) return false
  const t = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const m = moduleName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return t === m || t.includes(m) || m.includes(t)
}


const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const
const TIMESLOTS = [
  { label: '8h30 - 11h00', start: '08:30', end: '11:00' },
  { label: '11h00 - 13h30', start: '11:00', end: '13:30' },
  { label: '13h30 - 16h00', start: '13:30', end: '16:00' },
  { label: '16h00 - 18h30', start: '16:00', end: '18:30' }
]

interface FormateurSlot {
  groupe: string
  module: string
  salle: string
  syncedSalle?: boolean
  syncedGroupe?: boolean
  conflit?: {
    salle: string
    occupant: string
    message: string
  }
  conflitGroupe?: {
    groupe: string
    formateur: string
    salle?: string
    message: string
  }
}

// ── Helpers: Calcul automatique des dates depuis l'horloge du PC ─────────────
const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

function pcAnneeFormation(d: Date = new Date()): string {
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function pcPeriodeGroupe(d: Date = new Date()): string {
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function pcPeriodeFormateur(d: Date = new Date()): string {
  const mois = MOIS_FR[d.getMonth()]
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${mois} (${day}/${month}/${d.getFullYear()})`
}
// ─────────────────────────────────────────────────────────────────────────────

type ScheduleMap = Record<string, FormateurSlot>

interface HubPageProps {
  onNavigate: (page: NavPage) => void
}

export default function HubPage({ onNavigate }: HubPageProps): React.ReactElement {
  const { lang } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [salles, setSalles] = useState<Salle[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [planningSallesMap, setPlanningSallesMap] = useState<Record<string, any>>({})
  
  // Selection - Formateur
  const [selectedProfName, setSelectedProfName] = useState<string | null>(null)
  const [selectedProfFiliere, setSelectedProfFiliere] = useState<string>('TFM')
  const [selectedProfIsCds, setSelectedProfIsCds] = useState<boolean>(false)
  const [profSchedule, setProfSchedule] = useState<ScheduleMap>({})
  const [statut, setStatut] = useState<'statutaire' | 'cooperant' | 'vacataire' | 'contrat'>('statutaire')
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)
  const [cellEditModal, setCellEditModal] = useState<{ day: string; slotIdx: number } | null>(null)

  // ── Conflit Modal (Salle ou Groupe - style Excel / OFPPT officiel) ──────────
  const [conflitModal, setConflitModal] = useState<{
    type?: 'salle' | 'groupe'
    salle?: string
    groupe?: string
    occupant: string
    day: string
    timeLabel: string
    message: string
  } | null>(null)

  // ── Confirmation Modal (centre de l'écran) ─────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    icon: string
    confirmLabel: string
    confirmColor: string
    onConfirm: () => void
  } | null>(null)

  // Selection - Section Timetable
  const [selectedSection, setSelectedSection] = useState<{
    filiereCode: string
    anneeLabel: string // '1ère Année' | '2ème Année'
    groupes: Groupe[]
    schedule: Record<string, { nomFormateur: string; nomSalle: string; module?: string }> // key: `${jour}__${groupeId}__${tsIdx}`
    loading: boolean
    isCds?: boolean
  } | null>(null)

  // CDS custom hour state (Cours du Soir)
  const [customCdsHour, setCustomCdsHour] = useState<string>(() => {
    return localStorage.getItem('custom_cds_hour') || '18H30 à 21H00'
  })
  const [isEditingCdsHour, setIsEditingCdsHour] = useState(false)
  const [tempCdsHour, setTempCdsHour] = useState('')

  // Cell edit state
  const [editGroupe, setEditGroupe] = useState('')
  const [editModule, setEditModule] = useState('M')
  const [editSalle, setEditSalle] = useState('')

  // Search filter
  const [searchTerm, setSearchTerm] = useState('')

  // Modal Affectation Formateurs Communication
  const [commAssignModal, setCommAssignModal] = useState<{ module: string } | null>(null)
  const [selectedProfToAssign, setSelectedProfToAssign] = useState<string>('')
  const [isSavingAssign, setIsSavingAssign] = useState(false)

  // Modal Mise à jour date — Synchronisé automatiquement avec l'horloge du PC
  const [showDateModal, setShowDateModal] = useState(false)
  const [livePcTime, setLivePcTime] = useState<Date>(new Date())
  const [anneeGroupe, setAnneeGroupe] = useState<string>(() =>
    localStorage.getItem('annee_formation_groupe') || pcAnneeFormation()
  )
  const [periodeGroupe, setPeriodeGroupe] = useState<string>(() =>
    localStorage.getItem('periode_application_groupe') || pcPeriodeGroupe()
  )
  const [anneeFormateur, setAnneeFormateur] = useState<string>(() =>
    localStorage.getItem('annee_formation_formateur') || pcAnneeFormation()
  )
  const [periodeFormateur, setPeriodeFormateur] = useState<string>(() =>
    localStorage.getItem('periode_application_formateur') || pcPeriodeFormateur()
  )

  // Horloge en direct : mise à jour chaque seconde quand la modal est ouverte
  useEffect(() => {
    if (!showDateModal) return
    const timer = setInterval(() => setLivePcTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [showDateModal])

  useEffect(() => {
    loadBaseData()
  }, [])

  async function loadBaseData() {
    try {
      setLoading(true)
      const [f, s, g, fil, ps] = await Promise.all([
        formateursService.getAll(),
        sallesService.getAll(),
        groupesService.getAll(),
        filieresService.getAll(),
        planningSallesService.getAll().catch(() => ({} as Record<string, any>))
      ])
      setFormateurs(f)
      setSalles(s)
      setGroupes(g)
      setFilieres(fil)
      setPlanningSallesMap(ps || {})
    } catch (err) {
      console.error(err)
      toast.error('Erreur de chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // ── 1. Filières triées par ordre alphabétique (Alphabetical Order) ─────────
  const displayFilieresCols = useMemo(() => {
    const isCds = (code: string) => /CDS/i.test(code)

    // If filieres exist in Firebase, sort alphabetically by code_filiere
    if (filieres && filieres.length > 0) {
      const sorted = [...filieres].sort((a, b) => a.code_filiere.localeCompare(b.code_filiere))
      
      return sorted.map(f => {
        const filiereCode = f.code_filiere.toUpperCase()
        
        // Find all groups belonging to this filière using strict prefix / ID matching
        const fGroupes = groupes.filter(g => {
          if (g.id_filiere && g.id_filiere === f.id) return true
          const gFil = (g.filiere || '').trim().toUpperCase()
          if (gFil && (gFil === filiereCode || gFil === f.nom_filiere.toUpperCase())) return true
          const regex = new RegExp(`^${filiereCode}(\\s*\\d|\\s*CDS|$)`, 'i')
          return regex.test((g.code_groupe || '').trim().toUpperCase())
        })
        const fGroupeCodes = new Set(fGroupes.map(g => g.code_groupe.toUpperCase().replace(/\s+/g, '')))

        const dayGroups = fGroupes.filter(g => !isCds(g.code_groupe))
        const cdsGroups = fGroupes.filter(g => isCds(g.code_groupe))
        const dayGroupeCodes = new Set(dayGroups.map(g => g.code_groupe.toUpperCase().replace(/\s+/g, '')))
        const cdsGroupeCodes = new Set(cdsGroups.map(g => g.code_groupe.toUpperCase().replace(/\s+/g, '')))

        // Find formateurs assigned to DAY groups
        const assignedDayProfs: string[] = []
        // Find formateurs assigned to CDS groups
        const assignedCdsProfs: string[] = []

        if (formateurs && formateurs.length > 0) {
          formateurs.forEach(formateur => {
            const name = (formateur.nom || formateur.nom_prenom || '').toUpperCase()
            if (!name) return

            // Check day groups
            const hasDayMatch = formateur.groupes_assignes?.some(gCode => {
              const clean = gCode.toUpperCase().replace(/\s+/g, '')
              if (isCds(clean)) return false
              return dayGroupeCodes.has(clean) || (clean.startsWith(filiereCode) && !isCds(clean))
            })
            if (hasDayMatch && !assignedDayProfs.includes(name)) {
              assignedDayProfs.push(name)
            }

            // Check CDS groups from assignments and scheduled sessions
            const hasCdsMatch = formateur.groupes_assignes?.some(gCode => {
              const clean = gCode.toUpperCase().replace(/\s+/g, '')
              if (!isCds(clean)) return false
              return cdsGroupeCodes.has(clean) || (clean.startsWith(filiereCode) && isCds(clean))
            })
            const hasPlanningCdsMatch = Object.entries(planningSallesMap).some(([pk, pCell]) => {
              if (!pCell || !isSameFormateur(pCell.formateurId, name)) return false
              const pGrp = String(pCell.groupeId || '').toUpperCase().replace(/\s+/g, '')
              return isCds(pGrp) && (cdsGroupeCodes.has(pGrp) || pGrp.startsWith(filiereCode))
            })
            if ((hasCdsMatch || hasPlanningCdsMatch) && !assignedCdsProfs.includes(name)) {
              assignedCdsProfs.push(name)
            }
          })
        }

        const fallback = DEFAULT_FALLBACK_COLS.find(df => df.filiere.toUpperCase() === filiereCode)

        // Determine 1ère année and 2ème année codes from database (day groups)
        const g1 = dayGroups.find(g => g.annee === 1 || g.code_groupe.match(/1\d\d/))
        const annee1 = g1 ? g1.code_groupe.replace(/\s+/g, '') : (fallback?.annee1 || `${filiereCode}101`)

        const g2 = dayGroups.find(g => g.annee === 2 || g.code_groupe.match(/2\d\d/))
        const annee2 = g2 ? g2.code_groupe.replace(/\s+/g, '') : (fallback?.annee2 || `${filiereCode}201`)

        // Dynamically extract all CDS groups for this filière from the database
        const dbCdsList = Array.from(new Set(cdsGroups.map(g => g.code_groupe.replace(/\s+/g, '').toUpperCase())))
        const fallbackCds = fallback?.cdsList || (fallback?.anneeExtra ? [fallback.anneeExtra] : [])
        const cdsList = dbCdsList.length > 0 ? dbCdsList : fallbackCds

        return {
          filiere: f.code_filiere,
          profs: assignedDayProfs,
          cdsProfs: assignedCdsProfs,
          annee1,
          annee2,
          anneeExtra: cdsList[0] || '',
          cdsList
        }
      })
    }

    // Fallback: If no filieres exist in DB, only show structure from DEFAULT_FALLBACK_COLS
    return DEFAULT_FALLBACK_COLS
      .map(col => {
        const filCode = col.filiere.toUpperCase()
        const dbCds = groupes.filter(g => isCds(g.code_groupe) && g.code_groupe.toUpperCase().startsWith(filCode))
        const cdsList = dbCds.length > 0
          ? Array.from(new Set(dbCds.map(g => g.code_groupe.replace(/\s+/g, '').toUpperCase())))
          : (col.cdsList || (col.anneeExtra ? [col.anneeExtra] : []))

        const fallbackCdsProfs: string[] = []
        if (formateurs && formateurs.length > 0) {
          formateurs.forEach(f => {
            const name = (f.nom || f.nom_prenom || '').toUpperCase()
            if (!name) return
            const hasCds = f.groupes_assignes?.some(g => isCds(g) && g.toUpperCase().startsWith(filCode))
            if (hasCds && !fallbackCdsProfs.includes(name)) {
              fallbackCdsProfs.push(name)
            }
          })
        }

        return {
          ...col,
          cdsList,
          profs: formateurs && formateurs.length > 0 ? col.profs : [],
          cdsProfs: fallbackCdsProfs
        }
      })
      .sort((a, b) => a.filiere.localeCompare(b.filiere))
  }, [filieres, formateurs, groupes, planningSallesMap])

  // Calcul dynamique du nombre de lignes pour afficher TOUS les formateurs affectés sans aucune coupure
  const maxFilieresProfsRows = useMemo(() => {
    if (!displayFilieresCols || displayFilieresCols.length === 0) return 7
    const maxInCols = Math.max(0, ...displayFilieresCols.map(col => col.profs.length))
    return Math.max(7, maxInCols)
  }, [displayFilieresCols])

  // Calcul dynamique du nombre de lignes pour les formateurs du soir (CDS)
  const maxCdsProfsRows = useMemo(() => {
    if (!displayFilieresCols || displayFilieresCols.length === 0) return 1
    const maxInCols = Math.max(0, ...displayFilieresCols.map(col => (col.cdsProfs || []).length))
    return Math.max(1, maxInCols)
  }, [displayFilieresCols])

  // ── 2. Communication Modules et Formateurs dynamiques ─────────────────────
  const displayCommCols = useMemo(() => {
    return DEFAULT_COMM_COLS.map(col => {
      // Si aucun formateur dans la base, colonnes vides
      if (!formateurs || formateurs.length === 0) {
        return { module: col.module, profs: [], profObjs: [] }
      }

      // Recherche strictement parmi les formateurs réels présents dans la base
      // basée sur matiere, specialite, ou groupes_assignes (AUCUN nom en dur)
      const matchingProfs = formateurs.filter(f => {
        if (matchesModule(f.matiere, col.module)) return true
        if (matchesModule(f.specialite, col.module)) return true
        if (f.groupes_assignes?.some(g => matchesModule(g, col.module))) return true
        return false
      })

      return {
        module: col.module,
        profs: matchingProfs.map(f => (f.nom || f.nom_prenom || '').toUpperCase()),
        profObjs: matchingProfs
      }
    })
  }, [formateurs])

  const maxCommProfsRows = useMemo(() => {
    if (!displayCommCols || displayCommCols.length === 0) return 6
    const maxInCols = Math.max(0, ...displayCommCols.map(col => col.profs.length))
    return Math.max(6, maxInCols)
  }, [displayCommCols])

  // ── Open Section Timetable ──────────────────────────────────────────────────
  async function openSectionTimetable(groupeCodeSample: string, filiereCode: string, anneeLabel: string) {
    const isCds = /CDS/i.test(groupeCodeSample) || /CDS/i.test(anneeLabel)
    const filCode = filiereCode.toUpperCase().replace(/\s+/g, '')

    // Determine year digit: 1xx → 1, 2xx → 2, 3xx → 3, etc.
    const yearMatch = groupeCodeSample.match(/([1-9])\d\d/)
    const yearDigit = yearMatch ? yearMatch[1] : '1'

    // Get all groups of same filiere & same year/section
    let sectionGroupes = groupes.filter(g => {
      const code = g.code_groupe.toUpperCase().replace(/\s+/g, '')
      const gIsCds = /CDS/i.test(code)
      if (isCds !== gIsCds) return false

      const filObj = filieres.find(f => f.code_filiere.toUpperCase().replace(/\s+/g, '') === filCode)
      const belongs = (filObj && g.id_filiere === filObj.id) ||
        new RegExp(`^${filCode}(\\s*\\d|\\s*CDS|$)`, 'i').test(code)
      if (!belongs) return false

      if (isCds) {
        return code.includes(`${yearDigit}00`) || code.includes(`${yearDigit}01`) || code === groupeCodeSample.toUpperCase().replace(/\s+/g, '')
      } else {
        return code.match(new RegExp(`${yearDigit}\\d\\d`))
      }
    }).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe))

    // Fallback: If no groups in DB match yet, create a virtual group so the timetable opens gracefully
    if (sectionGroupes.length === 0) {
      sectionGroupes = [
        {
          id: groupeCodeSample,
          code_groupe: groupeCodeSample,
          nom_groupe: groupeCodeSample,
          filiere: filiereCode,
          annee: parseInt(yearDigit, 10) || 1,
          effectif: 25,
          createdAt: undefined as any
        }
      ]
    }

    setSelectedSection({
      filiereCode,
      anneeLabel,
      groupes: sectionGroupes,
      schedule: {},
      loading: true,
      isCds
    })

    try {
      // 1. Fetch both seances AND planning_salles from Firebase
      const [allSeances, planningSallesMap] = await Promise.all([
        seancesService.getAll().catch(() => []),
        planningSallesService.getAll().catch(() => ({} as Record<string, any>))
      ])

      const schedule: Record<string, { nomFormateur: string; nomSalle: string; module?: string }> = {}

      // 2. Process planning_salles (Primary planning database used by Planning Salles & Formateurs)
      if (planningSallesMap && typeof planningSallesMap === 'object') {
        for (const [key, cell] of Object.entries(planningSallesMap)) {
          if (!cell || !cell.groupeId) continue
          const parts = key.split('__')
          if (parts.length < 3) continue
          const jourUpper = parts[0].toUpperCase()
          const salleFromKey = parts[1].toUpperCase()
          const tsIdx = parseInt(parts[2], 10)
          if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 4) continue

          // Find target group in this section
          const targetGroup = sectionGroupes.find(g => 
            (g.id && g.id === cell.groupeId) ||
            g.code_groupe.toUpperCase().replace(/\s+/g, '') === String(cell.groupeId).toUpperCase().replace(/\s+/g, '')
          )
          if (!targetGroup) continue

          // Resolve formateur name
          const formateur = formateurs.find(f => 
            (f.id && f.id === cell.formateurId) ||
            (f.nom_prenom && f.nom_prenom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
            (f.nom && f.nom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
            String(cell.formateurId).toUpperCase().includes((f.nom_prenom || '').toUpperCase())
          )
          const nomFormateur = formateur
            ? (formateur.nom && formateur.prenom ? `${formateur.nom} ${formateur.prenom}` : formateur.nom_prenom || formateur.nom || cell.formateurId).toUpperCase()
            : String(cell.formateurId).toUpperCase()

          const cellData = {
            nomFormateur,
            nomSalle: salleFromKey,
            module: cell.module || 'M'
          }

          if (targetGroup.id) schedule[`${jourUpper}__${targetGroup.id}__${tsIdx}`] = cellData
          schedule[`${jourUpper}__${targetGroup.code_groupe.toUpperCase().replace(/\s+/g, '')}__${tsIdx}`] = cellData
        }
      }

      // 3. Process seances collection
      if (allSeances && Array.isArray(allSeances)) {
        for (const seance of allSeances) {
          const targetGroup = sectionGroupes.find(g => 
            (g.id && g.id === seance.id_groupe) ||
            g.code_groupe.toUpperCase().replace(/\s+/g, '') === String(seance.code_groupe || seance.id_groupe || '').toUpperCase().replace(/\s+/g, '')
          )
          if (!targetGroup) continue

          let tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut)
          if (tsIdx === -1 && (seance.heure_debut === '18:30' || seance.heure_debut === '18h30' || /18/i.test(seance.heure_debut))) {
            tsIdx = 4
          }
          if (tsIdx === -1) continue

          const formateur = formateurs.find(f => 
            (f.id && f.id === seance.id_formateur) ||
            (f.nom_prenom && f.nom_prenom.toUpperCase().includes(String(seance.nom_formateur || seance.id_formateur || '').toUpperCase())) ||
            (f.nom && f.nom.toUpperCase().includes(String(seance.nom_formateur || seance.id_formateur || '').toUpperCase()))
          )
          const salle = salles.find(s => 
            (s.id && s.id === seance.id_salle) ||
            s.nom_salle.toUpperCase() === String(seance.nom_salle || seance.id_salle || '').toUpperCase()
          )

          const nomFormateur = formateur
            ? (formateur.nom && formateur.prenom ? `${formateur.nom} ${formateur.prenom}` : formateur.nom_prenom || formateur.nom || seance.id_formateur).toUpperCase()
            : String(seance.nom_formateur || seance.id_formateur || '').toUpperCase()
          const nomSalle = salle ? salle.nom_salle.toUpperCase() : String(seance.nom_salle || seance.id_salle || '').toUpperCase()

          const jourUpper = (seance.jour || '').toUpperCase()
          const cellData = { nomFormateur, nomSalle, module: seance.module_code || 'M' }

          if (targetGroup.id) {
            const idKey = `${jourUpper}__${targetGroup.id}__${tsIdx}`
            if (!schedule[idKey]) schedule[idKey] = cellData
          }
          const codeKey = `${jourUpper}__${targetGroup.code_groupe.toUpperCase().replace(/\s+/g, '')}__${tsIdx}`
          if (!schedule[codeKey]) schedule[codeKey] = cellData
        }
      }

      setSelectedSection(prev => prev ? { ...prev, schedule, loading: false } : null)
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du chargement du planning de la section')
      setSelectedSection(prev => prev ? { ...prev, loading: false } : null)
    }
  }

  // ── Helper functions for Room Conflict Detection ──────────────────────────
  function getOccupantLabel(cell: { formateurId?: string; groupeId?: string }): string {
    if (!cell) return ''
    const rawF = String(cell.formateurId || '').trim()
    const rawG = String(cell.groupeId || '').trim()

    // Find formateur
    const fObj = formateurs.find(f => 
      f.id === rawF ||
      (f.nom_prenom || '').toUpperCase() === rawF.toUpperCase() ||
      (f.nom || '').toUpperCase() === rawF.toUpperCase() ||
      (f.nom_prenom || '').toUpperCase().includes(rawF.toUpperCase())
    )
    const fName = fObj
      ? (fObj.nom && fObj.prenom ? `${fObj.nom} ${fObj.prenom}` : (fObj.nom_prenom || fObj.nom || rawF)).toUpperCase()
      : rawF.toUpperCase()

    // Find groupe
    const gObj = groupes.find(g => 
      g.id === rawG ||
      g.code_groupe.toUpperCase().replace(/\s+/g, '') === rawG.toUpperCase().replace(/\s+/g, '')
    )
    const gCode = gObj ? gObj.code_groupe : rawG

    if (fName && gCode) return `${fName} - ${gCode}`
    return fName || gCode || 'Occupé'
  }

  function isSameFormateur(occupantFormateurId: string, profName: string): boolean {
    if (!occupantFormateurId || !profName) return false
    const occ = occupantFormateurId.trim().toUpperCase()
    const current = profName.trim().toUpperCase()

    if (occ === current) return true

    const profObj = formateurs.find(f => 
      (f.nom_prenom || '').toUpperCase().includes(current) ||
      (f.nom || '').toUpperCase().includes(current) ||
      current.includes((f.nom_prenom || '').toUpperCase())
    )

    if (profObj) {
      if (profObj.id && profObj.id.toUpperCase() === occ) return true
      if ((profObj.nom_prenom || '').toUpperCase() === occ) return true
      if ((profObj.nom || '').toUpperCase() === occ) return true
      if (profObj.nom && profObj.prenom && `${profObj.nom} ${profObj.prenom}`.toUpperCase() === occ) return true
    }

    return false
  }

  function getOccupantProfName(rawF: string): string {
    if (!rawF) return 'Autre formateur'
    const fObj = formateurs.find(f => 
      f.id === rawF ||
      (f.nom_prenom || '').toUpperCase() === rawF.toUpperCase() ||
      (f.nom || '').toUpperCase() === rawF.toUpperCase() ||
      (f.nom_prenom || '').toUpperCase().includes(rawF.toUpperCase())
    )
    if (fObj) {
      return (fObj.nom && fObj.prenom ? `${fObj.nom} ${fObj.prenom}` : (fObj.nom_prenom || fObj.nom || rawF)).toUpperCase()
    }
    return rawF.toUpperCase()
  }

  function isSalleOccupiedByOther(day: string, slotIdx: number, salleName: string): boolean {
    if (!salleName || !salleName.trim() || !selectedProfName) return false
    const planningKey = `${day.toUpperCase()}__${salleName.trim().toUpperCase()}__${slotIdx}`
    const cell = planningSallesMap[planningKey]
    if (!cell) return false
    return !isSameFormateur(cell.formateurId, selectedProfName)
  }

  function getOccupantLabelFor(day: string, slotIdx: number, salleName: string): string {
    if (!salleName || !salleName.trim()) return ''
    const planningKey = `${day.toUpperCase()}__${salleName.trim().toUpperCase()}__${slotIdx}`
    const cell = planningSallesMap[planningKey]
    return cell ? getOccupantLabel(cell) : ''
  }

  // ── Helper: Vérifier si un groupe est déjà occupé à ce créneau avec un autre formateur ──
  function isGroupeOccupiedByOther(
    day: string,
    slotIdx: number,
    groupeCode: string,
    planningMapSource?: Record<string, any>
  ): { formateur: string; salle: string } | null {
    if (!groupeCode || !groupeCode.trim() || groupeCode === '-' || !selectedProfName) return null
    const dayUpper = day.toUpperCase()
    const cleanG = groupeCode.trim().toUpperCase().replace(/\s+/g, '')
    const pMap = planningMapSource || planningSallesMap

    // 1. Vérifier dans planning_salles (Firebase / état actif)
    for (const [pk, pCell] of Object.entries(pMap)) {
      const parts = pk.split('__')
      if (parts.length === 3) {
        const pDay = parts[0]
        const pSalle = parts[1]
        const pIdx = parseInt(parts[2], 10)

        if (pDay === dayUpper && pIdx === slotIdx && pCell) {
          const cellGrpRaw = String(pCell.groupeId || '').trim().toUpperCase()
          const matchedGrp = groupes.find(g => 
            g.id === pCell.groupeId || 
            g.code_groupe.toUpperCase().replace(/\s+/g, '') === cellGrpRaw.replace(/\s+/g, '')
          )
          const cellGrpCode = (matchedGrp ? matchedGrp.code_groupe : cellGrpRaw).toUpperCase().replace(/\s+/g, '')

          if (cellGrpCode === cleanG) {
            if (!isSameFormateur(pCell.formateurId, selectedProfName)) {
              return {
                formateur: getOccupantProfName(pCell.formateurId),
                salle: pSalle
              }
            }
          }
        }
      }
    }

    return null
  }

  function getGroupeOccupantLabelFor(day: string, slotIdx: number, groupeCode: string): string {
    const occ = isGroupeOccupiedByOther(day, slotIdx, groupeCode)
    if (!occ) return ''
    return `${occ.formateur} (${lang === 'ar' ? 'القاعة' : 'Salle'}: ${occ.salle})`
  }

  // Purge any legacy localStorage mock caches on startup
  useEffect(() => {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('edt_prof_')) keysToRemove.push(k)
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch {
      // ignore
    }
  }, [])

  // Load schedule for a formateur DIRECTLY from database (planning_salles in Firebase)
  async function openFormateurSchedule(profName: string, filiereCode: string, isCds = false) {
    setSelectedProfName(profName)
    setSelectedProfFiliere(filiereCode)
    setSelectedProfIsCds(isCds)

    let planningMap: Record<string, any> = planningSallesMap
    try {
      planningMap = await planningSallesService.getAll()
      setPlanningSallesMap(planningMap)
    } catch (e) {
      // ignore
    }

    // Charger les séances réelles de ce formateur UNIQUEMENT depuis la base de données Firebase
    const loadedSchedule: ScheduleMap = {}
    for (const [pk, pCell] of Object.entries(planningMap)) {
      if (!pCell) continue
      const parts = pk.split('__')
      if (parts.length === 3) {
        const pDay = parts[0]
        const pSalle = parts[1]
        const pSlotIdx = parseInt(parts[2], 10)

        if (isSameFormateur(pCell.formateurId, profName)) {
          // Normalize day to title case (e.g. LUNDI -> Lundi)
          const dayCapitalized = pDay.charAt(0).toUpperCase() + pDay.slice(1).toLowerCase()
          const key = `${dayCapitalized}_${pSlotIdx}`

          const rawG = String(pCell.groupeId || '').trim()
          const grpObj = groupes.find(g => 
            g.id === rawG || 
            g.code_groupe.toUpperCase().replace(/\s+/g, '') === rawG.toUpperCase().replace(/\s+/g, '')
          )
          const grpCode = grpObj ? grpObj.code_groupe : rawG

          loadedSchedule[key] = {
            groupe: grpCode,
            module: pCell.module || 'M',
            salle: pSalle,
            syncedSalle: true,
            syncedGroupe: true
          }
        }
      }
    }

    // Check room and groupe conflicts for existing slots
    for (const [key, slot] of Object.entries(loadedSchedule)) {
      if (!slot) continue
      const [day, slotIdxStr] = key.split('_')
      const slotIdx = parseInt(slotIdxStr, 10)
      const dayUpper = day.toUpperCase()
      const timeLabel = TIMESLOTS[slotIdx] ? TIMESLOTS[slotIdx].label : (customCdsHour || '18H30 à 21H00')

      // 1. Vérifier conflit de salle
      if (slot.salle && slot.salle.trim()) {
        const planningKey = `${dayUpper}__${slot.salle.trim().toUpperCase()}__${slotIdx}`
        const cell = planningMap[planningKey]

        if (cell && !isSameFormateur(cell.formateurId, profName)) {
          const occLabel = getOccupantLabel(cell)
          slot.conflit = {
            salle: slot.salle,
            occupant: occLabel,
            message: lang === 'ar'
              ? `تعارض ! القاعة '${slot.salle}' محجوزة بالفعل من طرف '${occLabel}' يوم ${day} توقيت ${timeLabel}.`
              : `Conflit ! La salle '${slot.salle}' est déjà occupée par '${occLabel}' le ${day} à ${timeLabel} .`
          }
        } else {
          delete slot.conflit
        }
      } else {
        delete slot.conflit
      }

      // 2. Vérifier conflit de groupe (est-ce que ce groupe étudie déjà avec un autre formateur à ce créneau ?)
      const cleanG = (slot.groupe || '').trim().toUpperCase()
      if (cleanG && cleanG !== '-') {
        const grpConflict = isGroupeOccupiedByOther(day, slotIdx, cleanG, planningMap)
        if (grpConflict) {
          slot.conflitGroupe = {
            groupe: slot.groupe,
            formateur: grpConflict.formateur,
            salle: grpConflict.salle,
            message: lang === 'ar'
              ? `تعارض ! الفوج '${slot.groupe}' يدرس بالفعل مع '${grpConflict.formateur}' (القاعة: ${grpConflict.salle}) يوم ${day} توقيت ${timeLabel}.`
              : `Conflit ! Le groupe '${slot.groupe}' a déjà cours avec '${grpConflict.formateur}' (Salle: ${grpConflict.salle}) le ${day} à ${timeLabel} .`
          }
        } else {
          delete slot.conflitGroupe
        }
      } else {
        delete slot.conflitGroupe
      }
    }

    setProfSchedule(loadedSchedule)
  }

  function saveSchedule(updated: ScheduleMap) {
    setProfSchedule(updated)
  }

  // Open cell editor
  function handleCellClick(day: string, slotIdx: number) {
    const key = `${day}_${slotIdx}`
    setActiveCellKey(key)
    const current = profSchedule[key] || { groupe: '', module: 'M', salle: '' }
    setEditGroupe(current.groupe || '')
    setEditModule(current.module || 'M')
    setEditSalle(current.salle || (salles.length > 0 ? salles[0].nom_salle : ''))
    setCellEditModal({ day, slotIdx })
  }

  // Apply cell edit with room & groupe conflict checks
  async function handleSaveCell() {
    if (!cellEditModal) return
    const key = `${cellEditModal.day}_${cellEditModal.slotIdx}`
    const existing = profSchedule[key] || { syncedSalle: true, syncedGroupe: true }

    // ── 1. Vérifier si le groupe sélectionné est en stage
    if (editGroupe && editGroupe.trim() && editGroupe !== '-') {
      const cleanG = editGroupe.trim().toUpperCase()
      const targetGrp = groupes.find(g => g.code_groupe.toUpperCase().trim() === cleanG)
      if (targetGrp && targetGrp.en_stage) {
        toast.error(
          lang === 'ar'
            ? `⚠️ لا يمكن برمجة الفوج (${cleanG}) لأنه في فترة تدريب ميداني خارج المؤسسة (En Stage) !`
            : `⚠️ Impossible d'assigner le groupe (${cleanG}) car il est actuellement en stage hors établissement !`,
          { duration: 6000 }
        )
        return
      }
    }

    const dayUpper = cellEditModal.day.toUpperCase()
    const salleUpper = (editSalle || '').trim().toUpperCase()
    const timeLabel = TIMESLOTS[cellEditModal.slotIdx]?.label || ''

    // Refresh latest planning_salles to detect conflict accurately
    let currentPlanning = planningSallesMap
    try {
      currentPlanning = await planningSallesService.getAll()
      setPlanningSallesMap(currentPlanning)
    } catch (e) {
      // fallback to existing
    }

    // ── 2. Vérifier Conflit de Groupe (est-ce que ce groupe est déjà occupé avec un autre formateur ?)
    let detectedGroupeConflict: { groupe: string; formateur: string; salle: string; message: string } | null = null
    if (editGroupe && editGroupe.trim() && editGroupe !== '-' && selectedProfName) {
      const grpConflict = isGroupeOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, editGroupe, currentPlanning)
      if (grpConflict) {
        const conflictMsg = lang === 'ar'
          ? `تعارض ! الفوج '${editGroupe}' يدرس بالفعل مع الأستاذ '${grpConflict.formateur}' (القاعة: ${grpConflict.salle}) يوم ${cellEditModal.day} توقيت ${timeLabel}.`
          : `Conflit ! Le groupe '${editGroupe}' a déjà cours avec le formateur '${grpConflict.formateur}' (Salle: ${grpConflict.salle}) le ${cellEditModal.day} à ${timeLabel} .`
        detectedGroupeConflict = {
          groupe: editGroupe,
          formateur: grpConflict.formateur,
          salle: grpConflict.salle,
          message: conflictMsg
        }
      }
    }

    // ── 3. Vérifier Conflit de Salle
    let detectedConflict: { salle: string; occupant: string; message: string } | null = null
    if (salleUpper && selectedProfName) {
      const planningKey = `${dayUpper}__${salleUpper}__${cellEditModal.slotIdx}`
      const existingPlanningCell = currentPlanning[planningKey]

      if (existingPlanningCell && !isSameFormateur(existingPlanningCell.formateurId, selectedProfName)) {
        const occLabel = getOccupantLabel(existingPlanningCell)
        const conflictMsg = lang === 'ar'
          ? `تعارض ! القاعة '${editSalle}' محجوزة بالفعل من طرف '${occLabel}' يوم ${cellEditModal.day} توقيت ${timeLabel}.`
          : `Conflit ! La salle '${editSalle}' est déjà occupée par '${occLabel}' le ${cellEditModal.day} à ${timeLabel} .`

        detectedConflict = {
          salle: editSalle,
          occupant: occLabel,
          message: conflictMsg
        }
      }
    }

    const updated: ScheduleMap = {
      ...profSchedule,
      [key]: {
        ...existing,
        groupe: editGroupe,
        module: editModule,
        salle: editSalle,
        conflit: detectedConflict || undefined,
        conflitGroupe: detectedGroupeConflict || undefined
      }
    }
    saveSchedule(updated)
    setCellEditModal(null)

    if (detectedGroupeConflict) {
      // Show Groupe conflict popup modal matching Excel
      setConflitModal({
        type: 'groupe',
        groupe: detectedGroupeConflict.groupe,
        occupant: detectedGroupeConflict.formateur,
        day: cellEditModal.day,
        timeLabel,
        message: detectedGroupeConflict.message
      })
      toast.error(detectedGroupeConflict.message, { duration: 7000 })
    } else if (detectedConflict) {
      // Show Salle conflict popup modal matching Excel
      setConflitModal({
        type: 'salle',
        salle: detectedConflict.salle,
        occupant: detectedConflict.occupant,
        day: cellEditModal.day,
        timeLabel,
        message: detectedConflict.message
      })
      toast.error(detectedConflict.message, { duration: 6000 })
    } else {
      toast.success(lang === 'ar' ? '✅ تم حفظ الحصة بنجاح !' : 'Séance enregistrée !')

      // If room changed or cleared, remove previous room entry from planning
      if (existing.salle && existing.salle.trim().toUpperCase() !== salleUpper) {
        try {
          const oldPlanningKey = `${dayUpper}__${existing.salle.trim().toUpperCase()}__${cellEditModal.slotIdx}`
          await planningSallesService.deleteCell(oldPlanningKey)
          setPlanningSallesMap(prev => {
            const next = { ...prev }
            delete next[oldPlanningKey]
            return next
          })
        } catch (e) {
          console.error(e)
        }
      }

      // Automatically sync to planningSalles ONLY if no conflict whatsoever
      if (editSalle && selectedProfName) {
        try {
          const planningKey = `${dayUpper}__${salleUpper}__${cellEditModal.slotIdx}`
          const profObj = formateurs.find(f => 
            (f.nom_prenom || '').toUpperCase().includes(selectedProfName.toUpperCase()) ||
            (f.nom || '').toUpperCase().includes(selectedProfName.toUpperCase()) ||
            selectedProfName.toUpperCase().includes((f.nom_prenom || '').toUpperCase())
          )
          const formateurIdToSave = profObj?.id || selectedProfName

          const grpObj = groupes.find(g => 
            g.code_groupe.toUpperCase().replace(/\s+/g, '') === editGroupe.toUpperCase().replace(/\s+/g, '')
          )
          const groupeIdToSave = grpObj?.id || editGroupe || 'Groupe'

          await planningSallesService.setCell({
            key: planningKey,
            formateurId: formateurIdToSave,
            groupeId: groupeIdToSave,
            module: editModule || 'M'
          })
          setPlanningSallesMap(prev => ({
            ...prev,
            [planningKey]: {
              key: planningKey,
              formateurId: formateurIdToSave,
              groupeId: groupeIdToSave,
              module: editModule || 'M'
            }
          }))
        } catch (e) {
          console.error(e)
        }
      }
    }
  }

  // Clear a specific cell
  async function handleClearCell() {
    if (!cellEditModal) return
    const key = `${cellEditModal.day}_${cellEditModal.slotIdx}`
    const current = profSchedule[key]

    if (current && current.salle) {
      try {
        const planningKey = `${cellEditModal.day.toUpperCase()}__${current.salle}__${cellEditModal.slotIdx}`
        await planningSallesService.deleteCell(planningKey)
      } catch (e) {
        console.error(e)
      }
    }

    const next = { ...profSchedule }
    delete next[key]
    saveSchedule(next)
    setCellEditModal(null)
    toast.success('Cellule vidée avec succès')
  }

  // ── Synchroniser Salle (avec demande de confirmation préalable) ─────────
  async function executeSynchroniserSalle() {
    if (!selectedProfName) return
    const toastId = toast.loading(lang === 'ar' ? 'جاري المزامنة والحفظ...' : 'Synchronisation en cours...')
    try {
      let count = 0
      const profObj = formateurs.find(f => 
        (f.nom_prenom || '').toUpperCase().includes(selectedProfName.toUpperCase()) ||
        (f.nom || '').toUpperCase().includes(selectedProfName.toUpperCase()) ||
        selectedProfName.toUpperCase().includes((f.nom_prenom || '').toUpperCase())
      )
      const formateurIdToSave = profObj?.id || selectedProfName

      for (const [key, slot] of Object.entries(profSchedule)) {
        if (slot.salle) {
          const [day, slotIdxStr] = key.split('_')
          const slotIdx = parseInt(slotIdxStr, 10)
          const planningKey = `${day.toUpperCase()}__${slot.salle}__${slotIdx}`

          const grpObj = groupes.find(g => 
            g.code_groupe.toUpperCase().replace(/\s+/g, '') === (slot.groupe || '').toUpperCase().replace(/\s+/g, '')
          )
          const groupeIdToSave = grpObj?.id || slot.groupe || 'Groupe'

          await planningSallesService.setCell({
            key: planningKey,
            formateurId: formateurIdToSave,
            groupeId: groupeIdToSave,
            module: slot.module || 'M'
          })
          count++
        }
      }
      toast.dismiss(toastId)
      toast.success(
        lang === 'ar'
          ? `✅ تم تأكيد ومزامنة وحفظ ${count} حصة مع جدول القاعات بنجاح !`
          : `✅ ${count} séances synchronisées avec le Planning des Salles !`,
        { duration: 4000 }
      )
    } catch (e) {
      console.error(e)
      toast.dismiss(toastId)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء المزامنة' : 'Erreur lors de la synchronisation des salles')
    }
  }

  function handleSynchroniserSalle() {
    if (!selectedProfName) return
    const count = Object.values(profSchedule).filter(s => s.salle && s.salle.trim()).length
    if (count === 0) {
      toast(
        lang === 'ar' ? 'لا توجد حصص محددة بقاعات لمزامنتها حالياً' : 'Aucune séance avec salle attribuée à synchroniser',
        { icon: 'ℹ️' }
      )
      return
    }
    setConfirmModal({
      title: lang === 'ar' ? 'تأكيد مزامنة القاعات' : 'Confirmer la synchronisation',
      message: lang === 'ar'
        ? `هل تريد تأكيد مزامنة وحفظ ${count} حصة للأستاذ "${selectedProfName}" في جدول القاعات ؟`
        : `Voulez-vous synchroniser et enregistrer les ${count} séance(s) du formateur « ${selectedProfName} » avec le Planning des Salles ?`,
      icon: '🔄',
      confirmLabel: lang === 'ar' ? 'تأكيد وحفظ' : 'Confirmer & Enregistrer',
      confirmColor: '#2563eb',
      onConfirm: executeSynchroniserSalle
    })
  }

  // ── Dé-synchroniser Salle (avec confirmation modale) ────────────────────
  async function executeDesynchroniserSalle() {
    if (!selectedProfName) return
    const toastId = toast.loading(lang === 'ar' ? 'جاري تحرير القاعات...' : 'Libération des salles...')
    try {
      let count = 0
      for (const [key, slot] of Object.entries(profSchedule)) {
        if (slot.salle) {
          const [day, slotIdxStr] = key.split('_')
          const slotIdx = parseInt(slotIdxStr, 10)
          const planningKey = `${day.toUpperCase()}__${slot.salle}__${slotIdx}`
          await planningSallesService.deleteCell(planningKey)
          count++
        }
      }
      toast.dismiss(toastId)
      toast.success(
        lang === 'ar'
          ? `✅ تم تحرير ${count} قاعة وإلغاء مزامنتها بنجاح !`
          : `✅ ${count} salles dé-synchronisées et libérées dans le Planning !`,
        { duration: 4000 }
      )
    } catch (e) {
      console.error(e)
      toast.dismiss(toastId)
      toast.error(lang === 'ar' ? 'خطأ أثناء العملية' : 'Erreur lors de la dé-synchronisation')
    }
  }

  function handleDesynchroniserSalle() {
    if (!selectedProfName) return
    const count = Object.values(profSchedule).filter(s => s.salle && s.salle.trim()).length
    if (count === 0) {
      toast(
        lang === 'ar' ? 'لا توجد قاعات مخصصة لإلغاء مزامنتها' : 'Aucune salle à dé-synchroniser',
        { icon: 'ℹ️' }
      )
      return
    }
    setConfirmModal({
      title: lang === 'ar' ? 'تأكيد إلغاء المزامنة' : 'Confirmer la dé-synchronisation',
      message: lang === 'ar'
        ? `هل تريد تأكيد تحرير ${count} قاعة للأستاذ "${selectedProfName}" من جدول القاعات ؟`
        : `Voulez-vous libérer et dé-synchroniser les ${count} salle(s) de « ${selectedProfName} » du Planning ?`,
      icon: '🗑️',
      confirmLabel: lang === 'ar' ? 'تأكيد التحرير' : 'Confirmer la libération',
      confirmColor: '#dc2626',
      onConfirm: executeDesynchroniserSalle
    })
  }

  // ── Vider cellule groupe (avec confirmation modale identique à Sychron Salle) ──
  async function executeViderCelluleGroupe() {
    if (!selectedProfName) return
    const toastId = toast.loading(lang === 'ar' ? 'جاري إخلاء المجموعات وحفظ التغييرات...' : 'Effacement des groupes en cours...')
    try {
      const updated: ScheduleMap = {}
      let count = 0
      for (const [key, slot] of Object.entries(profSchedule)) {
        if (slot.groupe && slot.groupe.trim() && slot.groupe !== '-') count++
        updated[key] = { ...slot, groupe: '' }
      }
      saveSchedule(updated)
      toast.dismiss(toastId)
      toast.success(
        lang === 'ar'
          ? `✅ تم إخلاء ${count} فوج وحفظ التعديلات بنجاح !`
          : `✅ Les groupes (${count}) ont été vidés et enregistrés avec succès !`,
        { duration: 4000 }
      )
    } catch (e) {
      console.error(e)
      toast.dismiss(toastId)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء إخلاء المجموعات' : 'Erreur lors de l\'effacement des groupes')
    }
  }

  function handleViderCelluleGroupe() {
    if (!selectedProfName) return
    const count = Object.values(profSchedule).filter(s => s.groupe && s.groupe.trim() && s.groupe !== '-').length
    if (count === 0) {
      toast(
        lang === 'ar' ? 'لا توجد مجموعات لإخلائها حالياً' : 'Aucun groupe à vider dans ce tableau',
        { icon: 'ℹ️' }
      )
      return
    }
    setConfirmModal({
      title: lang === 'ar' ? 'تأكيد إخلاء المجموعات' : 'Confirmer l\'effacement des groupes',
      message: lang === 'ar'
        ? `هل تريد تأكيد مسح وإخلاء ${count} فوج من جدول الأستاذ "${selectedProfName}" وحفظ التعديل ؟`
        : `Voulez-vous synchroniser et vider les ${count} groupe(s) de l'emploi du temps de « ${selectedProfName} » ?`,
      icon: '🔄',
      confirmLabel: lang === 'ar' ? 'تأكيد وحفظ' : 'Confirmer & Enregistrer',
      confirmColor: '#2563eb',
      onConfirm: executeViderCelluleGroupe
    })
  }

  // Navigation handlers -> Route to Planning Salles view (occupation / salles_vides / groupes_vides)
  function navigateToTrouverSalleVide() {
    localStorage.setItem('planning_salles_view', 'salles_vides')
    onNavigate('salle_grid')
  }

  function navigateToTrouverGroupeVide() {
    localStorage.setItem('planning_salles_view', 'groupes_vides')
    onNavigate('salle_grid')
  }

  function navigateToPlanningSalles() {
    localStorage.setItem('planning_salles_view', 'occupation')
    onNavigate('salle_grid')
  }

  function handleSyncFeuillesGroupe() {
    localStorage.setItem('annee_formation_groupe', anneeGroupe)
    localStorage.setItem('periode_application_groupe', periodeGroupe)
    toast.success('✅ Feuilles Groupe synchronisées avec succès !')
    setShowDateModal(false)
  }

  function handleSyncFeuillesFormateur() {
    localStorage.setItem('annee_formation_formateur', anneeFormateur)
    localStorage.setItem('periode_application_formateur', periodeFormateur)
    toast.success('✅ Feuilles Formateur synchronisées avec succès !')
    setShowDateModal(false)
  }

  const currentViewSlots = Object.entries(profSchedule).filter(([k, s]) => {
    if (!s || (!s.groupe && !s.salle && !s.module)) return false
    const isSlotCds = k.endsWith('_4')
    return selectedProfIsCds ? isSlotCds : !isSlotCds
  })
  const totalSeancesCount = currentViewSlots.length
  const masseHoraireCalculated = totalSeancesCount * 2.5

  // ── Compute exact groups taught by the active formateur from Database ─────────
  const formateurAssignedGroups = useMemo(() => {
    if (!selectedProfName) return []
    const profNameClean = selectedProfName.toUpperCase().trim()

    // 1. Find formateur object from DB
    const currentProf = formateurs.find(f => 
      (f.nom_prenom || '').toUpperCase().trim() === profNameClean ||
      (f.nom || '').toUpperCase().trim() === profNameClean ||
      (f.nom_prenom || '').toUpperCase().includes(profNameClean) ||
      (f.nom || '').toUpperCase().includes(profNameClean) ||
      profNameClean.includes((f.nom_prenom || '').toUpperCase().trim())
    )

    const profFiliereCode = (selectedProfFiliere || '').toUpperCase().trim()

    // 2. Get assigned codes from currentProf.groupes_assignes (DNA / Affectations)
    const assignedCodes = (currentProf?.groupes_assignes || []).map(c => c.toUpperCase().trim()).filter(Boolean)

    const matchedGroupCodes = new Set<string>()

    // A) If formateur has direct assignments in groupes_assignes:
    if (assignedCodes.length > 0) {
      assignedCodes.forEach(ac => {
        if (ac.endsWith('00')) {
          // e.g. 'EM100' -> matches 'EM101', 'EM102' (year 1)
          // e.g. 'EM200' -> matches 'EM201', 'EM202' (year 2)
          const basePrefix = ac.slice(0, -2)
          groupes.forEach(g => {
            const gc = g.code_groupe.toUpperCase().trim()
            if (gc.startsWith(basePrefix)) matchedGroupCodes.add(gc)
          })
        } else {
          const found = groupes.find(g => g.code_groupe.toUpperCase().trim() === ac)
          if (found) {
            matchedGroupCodes.add(found.code_groupe.toUpperCase().trim())
          } else {
            matchedGroupCodes.add(ac)
          }
        }
      })
    }

    // B) Include all groups of the formateur's filière from groupes collection
    if (profFiliereCode) {
      groupes.forEach(g => {
        const gc = g.code_groupe.toUpperCase().trim()
        if (gc.startsWith(profFiliereCode)) {
          matchedGroupCodes.add(gc)
        }
      })
    }

    // C) Also include any groups already present in this formateur's schedule
    Object.values(profSchedule).forEach(slot => {
      if (slot.groupe && slot.groupe !== '-' && slot.groupe.trim()) {
        matchedGroupCodes.add(slot.groupe.toUpperCase().trim())
      }
    })

    // Sort alphabetically (e.g. EM101, EM102, EM201, EM202)
    let result = Array.from(matchedGroupCodes).sort((a, b) => a.localeCompare(b))

    // Fallback: if no group matched, show groups filtered by filiere or database groups
    if (result.length === 0) {
      const filiereGroups = profFiliereCode 
        ? groupes.filter(g => g.code_groupe.toUpperCase().startsWith(profFiliereCode)).map(g => g.code_groupe)
        : []
      result = filiereGroups.length > 0 ? filiereGroups.sort((a, b) => a.localeCompare(b)) : groupes.map(g => g.code_groupe).slice(0, 12)
    }

    // Filter according to Day vs CDS mode
    if (selectedProfIsCds) {
      const cdsOnly = result.filter(code => /CDS/i.test(code))
      if (cdsOnly.length > 0) {
        result = cdsOnly
      } else {
        const allCds = groupes.filter(g => /CDS/i.test(g.code_groupe)).map(g => g.code_groupe)
        if (allCds.length > 0) result = allCds
      }
    } else {
      const dayOnly = result.filter(code => !/CDS/i.test(code))
      if (dayOnly.length > 0) result = dayOnly
    }

    // ── Exclure les groupes en stage (les groupes en stage sont hors établissement)
    const inStageCodes = new Set(
      groupes.filter(g => g.en_stage).map(g => g.code_groupe.toUpperCase().trim())
    )
    return result.filter(code => !inStageCodes.has(code.toUpperCase().trim()))
  }, [selectedProfName, selectedProfFiliere, formateurs, groupes, profSchedule, selectedProfIsCds])

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 2: EMPLOI DU TEMPS DU FORMATEUR (FACE A FACE)
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 3: EMPLOI DU TEMPS DE LA SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedSection) {
    const isCds = Boolean(
      selectedSection.isCds ||
      /CDS/i.test(selectedSection.anneeLabel) ||
      selectedSection.groupes.some(g => /CDS/i.test(g.code_groupe))
    )
    const JOURS_LIST = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    const TS_LABELS = isCds
      ? [customCdsHour || '18H30 à 21H00']
      : ['8H30 À 11H00', '11H00 À 13H30', '13H30 À 16H00', '16H00 À 18H30']
    const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2025-2026'
    const periodeApp = localStorage.getItem('periode_application_groupe') || 'Avril 2026'

    return (
      <div
        className="fade-in-up"
        style={{
          display: 'block',
          height: '100%',
          maxHeight: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 16px 60px',
          background: '#eef2f7'
        }}
      >

        {/* ── Top bar ─────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setSelectedSection(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontWeight: 700, borderRadius: 8 }}
          >
            <ArrowLeft size={18} />
            Retour au tableau principal
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontWeight: 600, borderRadius: 8 }}
          >
            <Printer size={18} />
            Imprimer / PDF
          </button>
        </div>

        {/* ── Official Document ─────────────────── */}
        <div
          id="section-official-sheet"
          style={{
            background: '#ffffff',
            border: '2.5px solid #000',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            maxWidth: 1300,
            margin: '0 auto',
            color: '#000',
            overflow: 'visible'
          }}
        >
          {/* Header row: Logo + Title */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', borderBottom: '2.5px solid #000' }}>
            <div style={{ borderRight: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px' }}>
              <img src={ofpptLogo} alt="OFPPT" style={{ width: 100, height: 70, objectFit: 'contain' }} />
            </div>
            <div style={{ textAlign: 'center', padding: '14px 8px' }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: 1.5, color: '#0a1628' }}>
                EMPLOI DU TEMPS DE LA SECTION
              </h1>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', letterSpacing: 0.5 }}>
                ANNEE DE FORMATION : {anneeFormation}
              </div>
            </div>
          </div>

          {/* Info block like Excel */}
          <div style={{ borderBottom: '2px solid #000', padding: '8px 16px', fontSize: 13, lineHeight: '22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 2 }}>
              <div><strong>DRGC</strong></div>
              <div></div>
              <div><strong>Complexe/EFP :</strong> CFP IMME/ISTA MY RACHID</div>
              <div></div>
              <div><strong>Groupe :</strong></div>
              <div></div>
              <div><strong>Filière :</strong> {selectedSection.filiereCode}</div>
              <div></div>
              <div><strong>Niveau :</strong> {selectedSection.anneeLabel}</div>
              <div style={{ textAlign: 'right' }}><strong>Période d'application:</strong> {periodeApp}</div>
              <div><strong>Masse horaire :</strong></div>
              <div></div>
              <div><strong>Mode de formation :</strong> {isCds ? 'CDS' : 'FPA'}</div>
              <div><strong>Parrain:</strong></div>
            </div>
          </div>

          {/* Loading */}
          {selectedSection.loading ? (
            <div style={{ textAlign: 'center', padding: 56, fontSize: 15, color: '#64748b' }}>
              <RefreshCw size={30} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
              <br />Chargement du planning de la section...
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
                <thead>
                  {/* Row 1: HEURE header */}
                  <tr>
                    <th colSpan={2} style={{ padding: '6px 4px', border: '1.5px solid #000', background: '#c8c8c8', fontWeight: 900, textAlign: 'center', fontSize: 12 }}>
                      HEURE
                    </th>
                    {TS_LABELS.map((lbl, i) => (
                      <th
                        key={i}
                        onClick={() => {
                          if (isCds) {
                            setTempCdsHour(customCdsHour)
                            setIsEditingCdsHour(true)
                          }
                        }}
                        style={{
                          padding: '8px 6px',
                          border: '1.5px solid #000',
                          background: isCds ? '#fef3c7' : '#d9d9d9',
                          fontWeight: 900,
                          fontSize: isCds ? 13 : 11.5,
                          textAlign: 'center',
                          letterSpacing: 0.2,
                          cursor: isCds ? 'pointer' : 'default',
                          color: '#000',
                          transition: 'background 0.2s'
                        }}
                        title={isCds ? (lang === 'ar' ? 'انقر لتعديل التوقيت المسائي (18H30 à 21H00)' : 'Cliquez pour modifier l\'horaire du soir') : undefined}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span>{lbl}</span>
                          {isCds && (
                            <span style={{ fontSize: 11, background: '#ca8a04', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
                              ✏️ {lang === 'ar' ? 'تعديل' : 'Modifier'}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                  {/* Row 2: JOUR / GROUPE labels */}
                  <tr>
                    <th style={{ width: 78, padding: '6px 4px', border: '1.5px solid #000', background: '#bdbdbd', fontWeight: 900, fontSize: 12, textAlign: 'center' }}>JOUR</th>
                    <th style={{ width: 82, padding: '6px 4px', border: '1.5px solid #000', background: '#bdbdbd', fontWeight: 900, fontSize: 12, textAlign: 'center' }}>GROUPE</th>
                    {TS_LABELS.map((_, i) => <th key={i} style={{ border: '1.5px solid #000', background: '#bdbdbd' }} />)}
                  </tr>
                </thead>
                <tbody>
                  {JOURS_LIST.map((jour, jourIdx) => (
                    <React.Fragment key={jour}>
                      {selectedSection.groupes.map((groupe, grpIdx) => {
                        const isEnStage = groupe.en_stage
                        return (
                          <tr key={groupe.id}>
                            {/* Day cell merged vertically */}
                            {grpIdx === 0 && (
                              <td
                                rowSpan={selectedSection.groupes.length}
                                style={{
                                  border: '2px solid #000',
                                  textAlign: 'center',
                                  fontWeight: 900,
                                  fontSize: 12,
                                  background: '#e2e8f0',
                                  color: '#1e293b',
                                  verticalAlign: 'middle',
                                  padding: '4px 2px',
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.5,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {jour.toUpperCase()}
                              </td>
                            )}
                            {/* Groupe code */}
                            <td style={{ border: '1.5px solid #000', textAlign: 'center', fontWeight: 700, fontSize: 11, padding: '5px 2px', background: '#f5f7fa', color: '#0a1628', whiteSpace: 'nowrap' }}>
                              {groupe.code_groupe}
                            </td>
                            {/* Time-slot cell(s) */}
                            {TS_LABELS.map((_, tsIdx) => {
                              const jourUpper = jour.toUpperCase()
                              const codeClean = groupe.code_groupe.toUpperCase().replace(/\s+/g, '')

                              // Pour le CDS, on cherche la séance du jour sur le créneau du soir (4) en priorité
                              let cell: { nomFormateur: string; nomSalle: string; module?: string } | undefined
                              if (isCds) {
                                const possibleKeys = [
                                  ...[4, 0, 1, 2, 3].map(i => groupe.id ? `${jourUpper}__${groupe.id}__${i}` : ''),
                                  ...[4, 0, 1, 2, 3].map(i => `${jourUpper}__${codeClean}__${i}`)
                                ].filter(Boolean)
                                for (const pk of possibleKeys) {
                                  if (selectedSection.schedule[pk]) {
                                    cell = selectedSection.schedule[pk]
                                    break
                                  }
                                }
                              } else {
                                const keyWithId = groupe.id ? `${jourUpper}__${groupe.id}__${tsIdx}` : ''
                                const keyWithCode = `${jourUpper}__${codeClean}__${tsIdx}`
                                cell = (keyWithId && selectedSection.schedule[keyWithId]) || selectedSection.schedule[keyWithCode]
                              }

                              // 1. If group is in stage, it takes full priority for all slots from 8h30 to 18h30 (Gris clair sobre)
                              if (isEnStage) {
                                return (
                                  <td
                                    key={tsIdx}
                                    style={{
                                      border: '1.5px solid #000',
                                      textAlign: 'center',
                                      fontSize: 11,
                                      fontStyle: 'italic',
                                      fontWeight: 700,
                                      color: '#475569',
                                      background: '#f1f5f9',
                                      padding: '6px 4px',
                                      userSelect: 'none'
                                    }}
                                  >
                                    Stage
                                  </td>
                                )
                              }

                              // 2. Otherwise if an actual session exists, show it (Format Excel: PROF AT SALLE)
                              if (cell && (cell.nomFormateur || cell.nomSalle)) {
                                const displayText = cell.nomSalle
                                  ? `${cell.nomFormateur} AT ${cell.nomSalle}`
                                  : cell.nomFormateur
                                return (
                                  <td
                                    key={tsIdx}
                                    style={{
                                      border: '1.5px solid #000',
                                      textAlign: 'center',
                                      fontSize: 12,
                                      padding: '8px 6px',
                                      fontWeight: 800,
                                      color: '#0f172a',
                                      background: '#f8fafc',
                                      userSelect: 'none'
                                    }}
                                  >
                                    {displayText}
                                  </td>
                                )
                              }

                              // 3. Otherwise empty cell
                              return (
                                <td
                                  key={tsIdx}
                                  style={{
                                    border: '1px solid #bbb',
                                    background: '#fff',
                                    padding: '6px 4px'
                                  }}
                                />
                              )
                            })}
                          </tr>
                        )
                      })}
                      {/* Day separator stripe */}
                      <tr>
                        <td colSpan={2 + TS_LABELS.length} style={{ height: 9, background: jourIdx % 2 === 0 ? '#dce8f7' : '#eef3fb', borderLeft: '2px solid #000', borderRight: '2px solid #000', borderBottom: '2px solid #000' }} />
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {selectedSection.groupes.length === 0 && (
                <div style={{ textAlign: 'center', padding: 48, color: '#64748b', fontSize: 15 }}>
                  <AlertCircle size={34} style={{ marginBottom: 10, opacity: 0.5 }} />
                  <br />Aucun groupe trouvé pour cette section dans la base de données.
                </div>
              )}
            </div>
          )}

          {/* Footer signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: '2.5px solid #000', borderTop: 'none', textAlign: 'center', padding: '24px 0 60px' }}>
            <div style={{ borderRight: '1.5px solid #000', fontWeight: 900, fontSize: 13 }}>Formateur</div>
            <div style={{ borderRight: '1.5px solid #000', fontWeight: 900, fontSize: 13 }}>Directeur / Directeur Pédagogique</div>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Directeur du Complexe</div>
          </div>
        </div>

        {/* Modal Modification Horaire CDS */}
        {isEditingCdsHour && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1500,
              padding: 20
            }}
            onClick={() => setIsEditingCdsHour(false)}
          >
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 440,
                width: '100%',
                background: '#ffffff',
                borderRadius: 14,
                border: '2px solid #ca8a04',
                boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                padding: 22
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  flexShrink: 0
                }}>
                  ⏰
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1f2937' }}>
                    {lang === 'ar' ? 'تعديل توقيت الدروس المسائية (CDS)' : 'Modifier l\'horaire des cours du soir (CDS)'}
                  </h3>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {lang === 'ar' ? 'حدد التوقيت الذي ترغب في ظهوره في جدول استعمال الزمن' : 'Définissez l\'horaire qui apparaîtra dans l\'emploi du temps'}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#374151' }}>
                  {lang === 'ar' ? 'التوقيت :' : 'Horaire :'}
                </label>
                <input
                  type="text"
                  value={tempCdsHour}
                  onChange={(e) => setTempCdsHour(e.target.value)}
                  placeholder="Ex: 18H30 à 21H00"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #d1d5db',
                    fontSize: 15,
                    fontWeight: 700,
                    outline: 'none',
                    color: '#111827',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Quick choices */}
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                  {lang === 'ar' ? 'خيارات سريعة مقترحة :' : 'Suggestions rapides :'}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['18H30 à 21H00', '18H00 à 20H30', '19H00 à 21H30', '18H30 - 21H00'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTempCdsHour(preset)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: '1px solid #d97706',
                        background: tempCdsHour === preset ? '#d97706' : '#fffbeb',
                        color: tempCdsHour === preset ? '#ffffff' : '#b45309',
                        transition: 'all 0.15s'
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditingCdsHour(false)}
                  style={{ padding: '8px 16px', fontSize: 13 }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const val = tempCdsHour.trim() || '18H30 à 21H00'
                    setCustomCdsHour(val)
                    localStorage.setItem('custom_cds_hour', val)
                    setIsEditingCdsHour(false)
                    toast.success(lang === 'ar' ? 'تم تحديث التوقيت بنجاح' : 'Horaire mis à jour avec succès')
                  }}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'linear-gradient(135deg, #d97706, #b45309)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(217,119,6,0.3)'
                  }}
                >
                  {lang === 'ar' ? 'حفظ التوقيت' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (selectedProfName) {
    return (
      <div
        className="fade-in-up"
        style={{
          display: 'block',
          height: '100%',
          maxHeight: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 16px 50px',
          background: '#f8fafc'
        }}
      >
        {/* Top bar with back button & Print */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setSelectedProfName(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 700 }}
          >
            <ArrowLeft size={18} />
            {lang === 'ar' ? 'الرجوع إلى اللوحة المركزية' : 'Retour au tableau principal'}
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 600 }}
            >
              <Printer size={18} />
              {lang === 'ar' ? 'طباعة / PDF' : 'Imprimer / PDF'}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSynchroniserSalle}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 600 }}
            >
              <Share2 size={18} />
              {lang === 'ar' ? 'حفظ وتحديث Planning' : 'Enregistrer & Synchroniser'}
            </button>
          </div>
        </div>

        {/* Official Document Card */}
        <div
          id="ofppt-official-sheet"
          style={{
            background: '#ffffff',
            border: '2px solid #000000',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            padding: 24,
            maxWidth: 1250,
            margin: '0 auto',
            color: '#000000',
            overflow: 'visible'
          }}
        >
          {/* Header row: Logo, Titles, Sync Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 240px', gap: 16, borderBottom: '2px solid #000', paddingBottom: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img src={ofpptLogo} alt="OFPPT Logo" style={{ width: 110, height: 75, objectFit: 'contain' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 21, fontWeight: 900, margin: '0 0 6px 0', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {selectedProfIsCds
                  ? (lang === 'ar' ? 'استعمال الزمن للأستاذ (دروس مسائية - CDS)' : 'EMPLOI DU TEMPS DU FORMATEUR (COURS DU SOIR - CDS)')
                  : (lang === 'ar' ? 'استعمال الزمن للأستاذ حضورياً : المتدربون' : 'EMPLOI DU TEMPS DU FORMATEUR FACE A FACE : Stagiaires')}
              </h1>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                ANNEE DE FORMATION : {anneeFormateur}
              </div>

              {/* Note : Le sélecteur manuel Jour / CDS a été retiré.
                  Le mode (Jour ou Cours du Soir CDS) s'applique automatiquement selon la ligne sélectionnée dans le tableau principal (Hub). */}
            </div>

            {/* Sync Control Buttons Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#f8fafc', padding: '8px 10px', border: '1.5px solid #cbd5e1', borderRadius: 8 }}>
              <button
                type="button"
                onClick={() => toast.success('Synchronisation Groupe active !')}
                style={{ background: '#fff', border: '1px solid #fdba74', color: '#ea580c', fontWeight: 800, fontSize: 12, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'center' }}
              >
                Sychron Groupe
              </button>
              <button
                type="button"
                onClick={() => toast('Groupe dé-synchronisé', { icon: 'ℹ️' })}
                style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'center' }}
              >
                dé-synchron Groupe
              </button>
              <button
                type="button"
                onClick={handleSynchroniserSalle}
                style={{ background: '#fff', border: '1px solid #f87171', color: '#dc2626', fontWeight: 800, fontSize: 12, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'center' }}
              >
                Sychron Salle
              </button>
              <button
                type="button"
                onClick={handleDesynchroniserSalle}
                style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#1e293b', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'center' }}
              >
                dé-synchron SALLE
              </button>
              <button
                type="button"
                onClick={handleViderCelluleGroupe}
                style={{ background: '#fff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 900, fontSize: 12, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'center' }}
                title={lang === 'ar' ? 'إخلاء المجموعات فقط من جدول الحصص' : 'Vider uniquement les groupes du tableau'}
              >
                Vider cellule groupe
              </button>
            </div>
          </div>

          {/* Formateur Information Meta-Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16, padding: '14px 0', borderBottom: '2px solid #000', fontSize: 14 }}>
            {/* Column 1 */}
            <div>
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <span style={{ width: 140, fontWeight: 800 }}>DRGC</span>
                <span>: </span>
              </div>
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <span style={{ width: 140, fontWeight: 800 }}>Complexe/EFP</span>
                <span style={{ fontWeight: 700 }}>: ISTA MY RACHID</span>
              </div>
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <span style={{ width: 140, fontWeight: 800 }}>Formateur</span>
                <span style={{ fontWeight: 900, color: '#1e40af', fontSize: 15 }}>: {selectedProfName}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <span style={{ width: 140, fontWeight: 800 }}>Filière</span>
                <span style={{ fontWeight: 800 }}>: {selectedProfFiliere}</span>
              </div>
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <span style={{ width: 140, fontWeight: 800 }}>Niveau</span>
                <span>: TECHNICIEN</span>
              </div>
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <span style={{ width: 140, fontWeight: 800 }}>Masse horaire</span>
                <span style={{ fontWeight: 800, color: '#047857' }}>: {masseHoraireCalculated} heures ({totalSeancesCount} séances)</span>
              </div>
            </div>

            {/* Column 2: Status check boxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" checked={statut === 'statutaire'} onChange={() => setStatut('statutaire')} />
                <span style={{ fontWeight: 700 }}>Statutaire</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" checked={statut === 'cooperant'} onChange={() => setStatut('cooperant')} />
                <span style={{ fontWeight: 700 }}>Coopérant</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" checked={statut === 'vacataire'} onChange={() => setStatut('vacataire')} />
                <span style={{ fontWeight: 700 }}>Vacataire</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" checked={statut === 'contrat'} onChange={() => setStatut('contrat')} />
                <span style={{ fontWeight: 700 }}>Contrat de service</span>
              </label>
            </div>

            {/* Column 3: Matricule & Period */}
            <div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 800 }}>Mle : </span>
                <span style={{ fontWeight: 800, background: '#f1f5f9', padding: '3px 8px', borderRadius: 4 }}>
                  {formateurs.find(f => (f.nom || f.nom_prenom || '').toUpperCase().includes(selectedProfName.toUpperCase()))?.matricule || 'B704150'}
                </span>
              </div>
              <div style={{ marginTop: 16 }}>
                <span style={{ fontWeight: 800 }}>Période d'application : </span>
                <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{periodeFormateur}</span>
              </div>
            </div>
          </div>

          {/* Weekly Timetable Grid Table */}
          {(() => {
            const activeProfSlots = selectedProfIsCds
              ? [{ label: customCdsHour || '18H30 à 21H00', slotIdx: 4 }]
              : TIMESLOTS.map((ts, idx) => ({ label: ts.label, slotIdx: idx }))

            return (
              <div style={{ marginTop: 14, overflowX: 'auto', overflowY: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontSize: 13, textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #000' }}>
                      <th style={{ width: 110, borderRight: '1.5px solid #000', padding: 8, fontWeight: 900, textAlign: 'center' }}>Jour</th>
                      <th style={{ width: 90, borderRight: '1.5px solid #000', padding: 8, fontWeight: 900, textAlign: 'center' }}>Heure</th>
                      {activeProfSlots.map((ts, idx) => (
                        <th
                          key={idx}
                          style={{
                            borderRight: idx < activeProfSlots.length - 1 ? '1.5px solid #000' : 'none',
                            padding: 8,
                            fontWeight: 900,
                            fontSize: 14,
                            textAlign: 'center'
                          }}
                        >
                          {ts.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day) => {
                      return (
                        <React.Fragment key={day}>
                          {/* Row 1: Groupe */}
                          <tr style={{ borderTop: '2px solid #000' }}>
                            <td
                              rowSpan={3}
                              style={{
                                borderRight: '1.5px solid #000',
                                borderBottom: '2px solid #000',
                                fontWeight: 900,
                                fontSize: 15,
                                background: '#f8fafc',
                                verticalAlign: 'middle',
                                textTransform: 'uppercase'
                              }}
                            >
                              {day}
                            </td>
                            <td style={{ borderRight: '1.5px solid #000', borderBottom: '1px solid #cbd5e1', fontWeight: 800, padding: '4px', background: '#f1f5f9' }}>
                              Groupe
                            </td>
                            {activeProfSlots.map((tsItem, colIndex) => {
                              const slotIdx = tsItem.slotIdx
                              const slot = profSchedule[`${day}_${slotIdx}`]
                              const cleanGrp = (slot?.groupe || '').toUpperCase().trim()
                              const isSlotGroupInStage = cleanGrp && cleanGrp !== '-'
                                ? groupes.some(g => g.code_groupe.toUpperCase().trim() === cleanGrp && g.en_stage)
                                : false
                              const hasGroupeConflict = !isSlotGroupInStage && !!slot?.conflitGroupe

                              return (
                                <td
                                  key={slotIdx}
                                  onClick={() => handleCellClick(day, slotIdx)}
                                  style={{
                                    borderRight: colIndex < activeProfSlots.length - 1 ? '1.5px solid #000' : 'none',
                                    borderBottom: '1px solid #cbd5e1',
                                    padding: '6px 4px',
                                    fontWeight: hasGroupeConflict ? 900 : 800,
                                    fontSize: isSlotGroupInStage ? 12 : 14,
                                    fontStyle: isSlotGroupInStage ? 'italic' : 'normal',
                                    color: isSlotGroupInStage ? '#64748b' : (hasGroupeConflict ? '#ffffff' : (slot?.groupe ? '#0f172a' : '#94a3b8')),
                                    cursor: 'pointer',
                                    background: isSlotGroupInStage ? '#f1f5f9' : (hasGroupeConflict ? '#dc2626' : (slot?.groupe ? '#f8fafc' : '#ffffff')),
                                    transition: 'background 0.15s',
                                    textAlign: 'center'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!hasGroupeConflict) e.currentTarget.style.background = '#e2e8f0'
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!hasGroupeConflict) e.currentTarget.style.background = isSlotGroupInStage ? '#f1f5f9' : (slot?.groupe ? '#f8fafc' : '#ffffff')
                                  }}
                                  title={
                                    isSlotGroupInStage
                                      ? `Le groupe ${slot?.groupe} est en stage en entreprise (hors établissement)`
                                      : (hasGroupeConflict ? slot?.conflitGroupe?.message : "Cliquer pour modifier cette séance")
                                  }
                                >
                                  {isSlotGroupInStage ? (
                                    'Stage'
                                  ) : hasGroupeConflict ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                      <span>⚠️</span>
                                      <span>{slot?.groupe}</span>
                                    </span>
                                  ) : (
                                    slot?.groupe || '-'
                                  )}
                                </td>
                              )
                            })}
                          </tr>

                          {/* Row 2: Module */}
                          <tr>
                            <td style={{ borderRight: '1.5px solid #000', borderBottom: '1px solid #cbd5e1', fontWeight: 800, padding: '4px', background: '#f1f5f9' }}>
                              Module
                            </td>
                            {activeProfSlots.map((tsItem, colIndex) => {
                              const slotIdx = tsItem.slotIdx
                              const slot = profSchedule[`${day}_${slotIdx}`]
                              const cleanGrp = (slot?.groupe || '').toUpperCase().trim()
                              const isSlotGroupInStage = cleanGrp && cleanGrp !== '-'
                                ? groupes.some(g => g.code_groupe.toUpperCase().trim() === cleanGrp && g.en_stage)
                                : false

                              return (
                                <td
                                  key={slotIdx}
                                  onClick={() => handleCellClick(day, slotIdx)}
                                  style={{
                                    borderRight: colIndex < activeProfSlots.length - 1 ? '1.5px solid #000' : 'none',
                                    borderBottom: '1px solid #cbd5e1',
                                    padding: '4px',
                                    fontWeight: 700,
                                    color: isSlotGroupInStage ? '#94a3b8' : '#475569',
                                    cursor: 'pointer',
                                    textAlign: 'center'
                                  }}
                                >
                                  {isSlotGroupInStage ? '-' : (slot?.module || '-')}
                                </td>
                              )
                            })}
                          </tr>

                          {/* Row 3: Salle */}
                          <tr style={{ borderBottom: '2px solid #000' }}>
                            <td style={{ borderRight: '1.5px solid #000', fontWeight: 800, padding: '4px', background: '#f1f5f9' }}>
                              salle
                            </td>
                            {activeProfSlots.map((tsItem, colIndex) => {
                              const slotIdx = tsItem.slotIdx
                              const slot = profSchedule[`${day}_${slotIdx}`]
                              const cleanGrp = (slot?.groupe || '').toUpperCase().trim()
                              const isSlotGroupInStage = cleanGrp && cleanGrp !== '-'
                                ? groupes.some(g => g.code_groupe.toUpperCase().trim() === cleanGrp && g.en_stage)
                                : false
                              const hasConflict = !isSlotGroupInStage && !!slot?.conflit

                              return (
                                <td
                                  key={slotIdx}
                                  onClick={() => handleCellClick(day, slotIdx)}
                                  style={{
                                    borderRight: colIndex < activeProfSlots.length - 1 ? '1.5px solid #000' : 'none',
                                    padding: '4px',
                                    fontWeight: hasConflict ? 900 : 800,
                                    color: isSlotGroupInStage ? '#94a3b8' : (hasConflict ? '#ffffff' : (slot?.salle ? '#1d4ed8' : '#94a3b8')),
                                    cursor: 'pointer',
                                    background: isSlotGroupInStage ? '#f8fafc' : (hasConflict ? '#dc2626' : (slot?.salle ? '#eff6ff' : 'transparent')),
                                    textAlign: 'center',
                                    transition: 'all 0.15s ease',
                                    position: 'relative'
                                  }}
                                  title={
                                    isSlotGroupInStage
                                      ? 'Groupe en stage en entreprise (aucune salle occupée)'
                                      : (hasConflict ? slot?.conflit?.message : (slot?.salle ? `Salle: ${slot.salle} (Cliquer pour modifier)` : 'Cliquer pour assigner une salle'))
                                  }
                                >
                                  {isSlotGroupInStage ? (
                                    '-'
                                  ) : hasConflict ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                      <span>⚠️</span>
                                      <span>{slot?.salle}</span>
                                    </span>
                                  ) : (
                                    slot?.salle || '-'
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {/* Signatures Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: '2px solid #000', borderTop: 'none', textAlign: 'center', marginTop: -2, padding: '16px 0 50px' }}>
            <div style={{ borderRight: '1.5px solid #000', fontWeight: 900, fontSize: 14 }}>
              Formateur
            </div>
            <div style={{ borderRight: '1.5px solid #000', fontWeight: 900, fontSize: 14 }}>
              Directeur / Directeur Pédagogique
            </div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>
              Directeur du Complexe
            </div>
          </div>
        </div>

        {/* Modal for editing a session slot */}
        {cellEditModal && (
          <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setCellEditModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, padding: '24px 28px' }}>
              <div className="modal-header" style={{ marginBottom: 16 }}>
                <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 800 }}>
                  Modifier la séance ({cellEditModal.day} - {TIMESLOTS[cellEditModal.slotIdx]?.label || customCdsHour || '18H30 à 21H00'})
                </h3>
                <button className="modal-close" onClick={() => setCellEditModal(null)}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>
                      Groupe {selectedProfFiliere ? `(${selectedProfFiliere})` : ''}
                    </label>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      {formateurAssignedGroups.length} groupe(s) assigné(s)
                    </span>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={`Ex: ${selectedProfFiliere ? `${selectedProfFiliere}101` : 'TFM101'}`}
                    value={editGroupe}
                    onChange={(e) => setEditGroupe(e.target.value.toUpperCase())}
                    list="formateur-groupes-list"
                    autoFocus
                    style={editGroupe && isGroupeOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, editGroupe) ? {
                      borderColor: '#dc2626',
                      background: '#fef2f2',
                      color: '#991b1b',
                      fontWeight: 700
                    } : {}}
                  />
                  <datalist id="formateur-groupes-list">
                    {groupes.filter(g => !g.en_stage).map(g => (
                      <option key={g.id} value={g.code_groupe} />
                    ))}
                  </datalist>
                  {formateurAssignedGroups.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {formateurAssignedGroups.map(grpCode => {
                        const isSelected = editGroupe === grpCode
                        const isGrpOccupied = !!isGroupeOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, grpCode)
                        return (
                          <button
                            key={grpCode}
                            type="button"
                            onClick={() => setEditGroupe(grpCode)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              fontWeight: 700,
                              background: isGrpOccupied ? '#fef2f2' : (isSelected ? '#2563eb' : '#f1f5f9'),
                              color: isGrpOccupied ? '#dc2626' : (isSelected ? '#ffffff' : '#0f172a'),
                              border: isGrpOccupied ? '1.5px solid #ef4444' : (isSelected ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1'),
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              boxShadow: isSelected ? '0 2px 4px rgba(37,99,235,0.3)' : 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title={isGrpOccupied ? `⚠️ Déjà occupé : ${getGroupeOccupantLabelFor(cellEditModal.day, cellEditModal.slotIdx, grpCode)}` : ''}
                          >
                            {isGrpOccupied && <span>⚠️</span>}
                            <span>{grpCode}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {editGroupe && isGroupeOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, editGroupe) && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      background: '#fef2f2',
                      border: '1.5px solid #ef4444',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#b91c1c',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span style={{ fontSize: 16 }}>⛔</span>
                      <span>
                        {lang === 'ar'
                          ? `تنبيه تعارض : الفوج (${editGroupe}) يدرس بالفعل مع ${getGroupeOccupantLabelFor(cellEditModal.day, cellEditModal.slotIdx, editGroupe)} في هذا التوقيت!`
                          : `Attention conflit : Le groupe (${editGroupe}) a déjà cours avec ${getGroupeOccupantLabelFor(cellEditModal.day, cellEditModal.slotIdx, editGroupe)} à ce créneau !`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Module</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: M"
                    value={editModule}
                    onChange={(e) => setEditModule(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Salle / Atelier</label>
                  <select
                    className="form-select"
                    value={editSalle}
                    onChange={(e) => setEditSalle(e.target.value)}
                    style={editSalle && isSalleOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, editSalle) ? {
                      borderColor: '#dc2626',
                      background: '#fef2f2',
                      color: '#991b1b',
                      fontWeight: 700
                    } : {}}
                  >
                    <option value="">-- Sans salle --</option>
                    {salles.map(s => {
                      const isOccupied = isSalleOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, s.nom_salle)
                      return (
                        <option key={s.id} value={s.nom_salle}>
                          {s.nom_salle} ({s.type_salle}){isOccupied ? ' ⚠️ [Occupée]' : ''}
                        </option>
                      )
                    })}
                  </select>
                  {editSalle && isSalleOccupiedByOther(cellEditModal.day, cellEditModal.slotIdx, editSalle) && (
                    <div style={{
                      marginTop: 6,
                      padding: '8px 12px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#b91c1c',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span>⚠️</span>
                      <span>
                        {lang === 'ar'
                          ? `تنبيه: هذه القاعة محجوزة بالفعل من طرف ${getOccupantLabelFor(cellEditModal.day, cellEditModal.slotIdx, editSalle)} !`
                          : `Attention : cette salle est déjà occupée par ${getOccupantLabelFor(cellEditModal.day, cellEditModal.slotIdx, editSalle)} !`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleClearCell}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
                >
                  <Trash2 size={16} /> Vider
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setCellEditModal(null)}>
                    Annuler
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveCell}>
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirmation Modal centré ─────────────────────────────────────── */}
        {confirmModal && (
          <div
            onClick={() => setConfirmModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              animation: 'fadeIn 0.15s ease'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: 16,
                boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.12)',
                width: 420,
                maxWidth: '90vw',
                padding: '32px 32px 28px',
                border: '1px solid #e2e8f0',
                animation: 'slideUp 0.2s ease'
              }}
            >
              {/* Icon + Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  background: confirmModal.confirmColor === '#2563eb' ? '#eff6ff' : '#fef2f2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  flexShrink: 0
                }}>
                  {confirmModal.icon}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                    {confirmModal.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, fontWeight: 500 }}>
                    {lang === 'ar' ? 'OFPPT - نظام إدارة الجدول' : 'OFPPT - Gestion des Emplois du Temps'}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: '#f1f5f9', margin: '0 0 18px' }} />

              {/* Message */}
              <p style={{
                fontSize: 14,
                color: '#334155',
                lineHeight: 1.7,
                margin: '0 0 24px',
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                direction: lang === 'ar' ? 'rtl' : 'ltr'
              }}>
                {confirmModal.message}
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  style={{
                    padding: '10px 20px',
                    fontSize: 13,
                    fontWeight: 600,
                    background: '#f8fafc',
                    color: '#475569',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 9,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#94a3b8' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e1' }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm()
                    setConfirmModal(null)
                  }}
                  style={{
                    padding: '10px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    background: confirmModal.confirmColor,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 9,
                    cursor: 'pointer',
                    boxShadow: `0 3px 10px ${confirmModal.confirmColor}55`,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
                >
                  {confirmModal.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Conflit de Salle Modal (style Excel / OFPPT officiel) ──────────── */}
        {conflitModal && (
          <div
            onClick={() => setConflitModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              animation: 'fadeIn 0.15s ease'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: 14,
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0,0,0,0.08)',
                width: 490,
                maxWidth: '92vw',
                padding: '26px 30px',
                border: '1.5px solid #fecaca',
                animation: 'slideUp 0.2s ease'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    border: '1.5px solid #fee2e2',
                    flexShrink: 0
                  }}>
                    ⚠️
                  </div>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 900, color: '#991b1b', margin: 0, lineHeight: 1.3 }}>
                      {conflitModal.type === 'groupe'
                        ? (lang === 'ar' ? 'تعارض في الفوج (المجموعة)' : 'Conflit d\'assignation de groupe')
                        : (lang === 'ar' ? 'تعارض في القاعة' : 'Conflit de salle')}
                    </h3>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 3 }}>
                      {conflitModal.type === 'groupe'
                        ? (lang === 'ar' ? 'تنبيه: هذا الفوج يدرس بالفعل مع أستاذ آخر في نفس التوقيت' : 'Alerte : ce groupe a déjà cours avec un autre formateur à ce créneau')
                        : (lang === 'ar' ? 'تنبيه انشغال القاعة في Planning des Salles' : 'Alerte d\'occupation Planning des Salles')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConflitModal(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 24,
                    lineHeight: '20px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 4
                  }}
                >
                  ×
                </button>
              </div>

              {/* Message Banner matching Excel message */}
              <div style={{
                background: '#fff1f2',
                border: '1.5px solid #fecdd3',
                borderRadius: 10,
                padding: '16px 18px',
                color: '#881337',
                fontSize: 14,
                lineHeight: 1.7,
                fontWeight: 600,
                marginBottom: 20,
                direction: lang === 'ar' ? 'rtl' : 'ltr'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <div>
                    {conflitModal.message}
                  </div>
                </div>
              </div>

              <p style={{
                fontSize: 12.5,
                color: '#64748b',
                lineHeight: 1.5,
                margin: '0 0 22px',
                direction: lang === 'ar' ? 'rtl' : 'ltr'
              }}>
                {conflitModal.type === 'groupe'
                  ? (lang === 'ar'
                      ? 'تم تلوين هذا الفوج في الجدول باللون الأحمر لتنبيهك. لا يمكن لنفس الفوج أن يدرس مع أستاذين في نفس التوقيت لتفادي التضارب.'
                      : 'Ce groupe a été marqué en rouge dans le tableau. Un même groupe ne peut pas étudier avec deux formateurs simultanément.')
                  : (lang === 'ar'
                      ? 'تم تلوين هذه القاعة في الجدول باللون الأحمر لتنبيهك. يمكنك النقر عليها لتغيير القاعة أو تعديل الحصة.'
                      : 'Cette salle a été marquée en rouge dans le tableau. Vous pouvez cliquer dessus à tout moment pour la modifier.')}
              </p>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setConflitModal(null)}
                  style={{
                    padding: '9px 28px',
                    fontSize: 13.5,
                    fontWeight: 800,
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    boxShadow: '0 3px 10px rgba(220, 38, 38, 0.4)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#b91c1c' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626' }}
                >
                  {lang === 'ar' ? 'حسناً (OK)' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 1: LE HUB PRINCIPAL (EXCEL MODEL AVEC TRIS ALPHABETIQUES ET SCROLL)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className="fade-in-up"
      style={{
        display: 'block',
        height: '100%',
        maxHeight: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '12px 18px 80px'
      }}
    >
      {/* Top Banner / Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div className="page-header-info">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 900 }}>
            <Layers color="#1e40af" size={26} />
            {lang === 'ar' ? 'لوحة التحكم المركزية لجدول التوقيت' : 'Tableau Central des Emplois du Temps'}
          </h1>
          <p>
            {lang === 'ar'
              ? 'انقر على اسم أي أستاذ لفتح جدول حصصه الكامل وبرمجة أوقاته ومزامنته مع القاعات'
              : 'Cliquez sur le nom de n’importe quel formateur pour ouvrir son emploi du temps complet et synchroniser avec les salles'}
          </p>
        </div>

        {/* Quick Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={16} style={{ position: 'absolute', top: 12, left: 12, color: '#94a3b8' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: 36, height: 40, borderRadius: 8, fontSize: 13 }}
            placeholder={lang === 'ar' ? 'بحث عن أستاذ أو شعبة...' : 'Rechercher un formateur...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Grid + Sidebar Actions Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 265px', gap: 18, alignItems: 'start' }}>
        
        {/* Left Column: Tables matching Image 1 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* 1. TABLE 1: FILIERES TECHNIQUES & FORMATEURS (Alphabetical order) */}
          <div
            style={{
              background: '#ffffff',
              border: '2px solid #000000',
              borderRadius: 6,
              boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
              overflowX: 'auto',
              padding: 2
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', textAlign: 'center', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f59e0b', color: '#000000', borderBottom: '2px solid #000' }}>
                  {displayFilieresCols.map((col, idx) => (
                    <th
                      key={idx}
                      style={{
                        padding: '8px 4px',
                        borderRight: idx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                        fontWeight: 900,
                        fontSize: 14,
                        letterSpacing: 0.5
                      }}
                    >
                      {col.filiere}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Formateurs rows (dynamic count to show all assigned professors) */}
                {Array.from({ length: maxFilieresProfsRows }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {displayFilieresCols.map((col, colIdx) => {
                      const prof = col.profs[rowIdx]
                      const matches = !searchTerm || (prof && prof.toLowerCase().includes(searchTerm.toLowerCase()))
                      return (
                        <td
                          key={colIdx}
                          style={{
                            padding: '3px 4px',
                            borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                            borderBottom: '1.5px solid #000',
                            height: 28,
                            background: prof ? (matches ? '#22d3ee' : '#e0f2fe') : '#ffffff'
                          }}
                        >
                          {prof ? (
                            <button
                              type="button"
                              onClick={() => openFormateurSchedule(prof, col.filiere)}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                fontWeight: 900,
                                fontSize: 12.5,
                                color: '#000000',
                                cursor: 'pointer',
                                padding: '2px 0',
                                textTransform: 'uppercase',
                                transition: 'transform 0.1s, color 0.1s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#1e3a8a'; e.currentTarget.style.transform = 'scale(1.04)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#000000'; e.currentTarget.style.transform = 'scale(1)' }}
                              title={`Ouvrir l'emploi du temps de ${prof}`}
                            >
                              {prof}
                            </button>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Separator row */}
                <tr>
                  {displayFilieresCols.map((_, colIdx) => (
                    <td key={colIdx} style={{ height: 10, background: '#ffffff', borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none', borderBottom: '1.5px solid #000' }}></td>
                  ))}
                </tr>

                {/* Annee 1 Row - Clickable */}
                <tr style={{ background: '#ffffff', fontWeight: 800 }}>
                  {displayFilieresCols.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        padding: '4px 4px',
                        borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                        borderBottom: '1.5px solid #000',
                        fontSize: 12,
                        color: '#000'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openSectionTimetable(col.annee1, col.filiere, 'T 1ère Année')}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          fontWeight: 900,
                          fontSize: 12,
                          color: '#1d4ed8',
                          cursor: 'pointer',
                          padding: '2px 0',
                          textDecoration: 'underline',
                          transition: 'transform 0.1s, color 0.1s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#1e3a8a'; e.currentTarget.style.transform = 'scale(1.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#1d4ed8'; e.currentTarget.style.transform = 'scale(1)' }}
                        title={`Voir le planning de la section ${col.annee1}`}
                      >
                        {col.annee1}
                      </button>
                    </td>
                  ))}
                </tr>

                {/* Annee 2 Row - Clickable */}
                <tr style={{ background: '#ffffff', fontWeight: 800 }}>
                  {displayFilieresCols.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        padding: '4px 4px',
                        borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                        borderBottom: col.anneeExtra ? '1.5px solid #000' : 'none',
                        fontSize: 12,
                        color: '#000'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openSectionTimetable(col.annee2, col.filiere, 'T 2ème Année')}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          fontWeight: 900,
                          fontSize: 12,
                          color: '#1d4ed8',
                          cursor: 'pointer',
                          padding: '2px 0',
                          textDecoration: 'underline',
                          transition: 'transform 0.1s, color 0.1s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#1e3a8a'; e.currentTarget.style.transform = 'scale(1.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#1d4ed8'; e.currentTarget.style.transform = 'scale(1)' }}
                        title={`Voir le planning de la section ${col.annee2}`}
                      >
                        {col.annee2}
                      </button>
                    </td>
                  ))}
                </tr>

                {/* ── CDS Row Header ── */}
                {displayFilieresCols.some(col => (col.cdsList && col.cdsList.length > 0) || (col.cdsProfs && col.cdsProfs.length > 0) || col.anneeExtra) && (
                  <tr>
                    <td
                      colSpan={displayFilieresCols.length}
                      style={{
                        background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 50%, #f59e0b 100%)',
                        color: '#000000',
                        fontWeight: 900,
                        fontSize: 12,
                        letterSpacing: 1.5,
                        textAlign: 'center',
                        padding: '6px 8px',
                        borderTop: '1.5px solid #000000',
                        borderBottom: '1.5px solid #000000',
                        textTransform: 'uppercase'
                      }}
                    >
                      {lang === 'ar' ? 'الدراسة الليلية — Cours du Soir (CDS)' : 'COURS DU SOIR (CDS)'}
                    </td>
                  </tr>
                )}

                {/* ── CDS Groups Row (top, like section links) ── */}
                <tr style={{ background: '#ffffff', fontWeight: 800 }}>
                  {displayFilieresCols.map((col, colIdx) => {
                    const cds = col.cdsList || (col.anneeExtra ? [col.anneeExtra] : [])
                    return (
                      <td
                        key={colIdx}
                        style={{
                          padding: '4px 3px',
                          borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000000' : 'none',
                          borderBottom: '1.5px solid #000000',
                          verticalAlign: 'middle',
                          minHeight: 28
                        }}
                      >
                        {cds.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                            {cds.map((cdsCode, cIdx) => (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={() => openSectionTimetable(cdsCode, col.filiere, `CDS (${cdsCode})`)}
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  background: 'transparent',
                                  fontWeight: 900,
                                  fontSize: cds.length > 1 ? 11 : 12,
                                  color: '#1d4ed8',
                                  cursor: 'pointer',
                                  padding: '2px 0',
                                  textDecoration: 'underline',
                                  transition: 'transform 0.1s, color 0.1s',
                                  whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#1e3a8a'
                                  e.currentTarget.style.transform = 'scale(1.06)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#1d4ed8'
                                  e.currentTarget.style.transform = 'scale(1)'
                                }}
                                title={`Ouvrir l'emploi du temps CDS de ${cdsCode}`}
                              >
                                {cdsCode}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div style={{ height: 24 }} />
                        )}
                      </td>
                    )
                  })}
                </tr>

                {/* ── CDS Separator ── */}
                <tr>
                  {displayFilieresCols.map((_, colIdx) => (
                    <td key={colIdx} style={{ height: 8, background: '#fffbeb', borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none', borderBottom: '1px solid #fde68a' }}></td>
                  ))}
                </tr>

                {/* ── CDS Formateurs rows (cyan cells, click to open evening timetable) ── */}
                {Array.from({ length: maxCdsProfsRows }).map((_, rowIdx) => (
                  <tr key={`cds-prof-${rowIdx}`}>
                    {displayFilieresCols.map((col, colIdx) => {
                      const prof = col.cdsProfs?.[rowIdx]
                      const matches = !searchTerm || (prof && prof.toLowerCase().includes(searchTerm.toLowerCase()))
                      return (
                        <td
                          key={colIdx}
                          style={{
                            padding: '3px 4px',
                            borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                            borderBottom: rowIdx === maxCdsProfsRows - 1 ? '1.5px solid #000' : '1px solid #e2e8f0',
                            height: 28,
                            background: prof ? (matches ? '#22d3ee' : '#e0f2fe') : '#ffffff'
                          }}
                        >
                          {prof ? (
                            <button
                              type="button"
                              onClick={() => openFormateurSchedule(prof, col.filiere, true)}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                fontWeight: 900,
                                fontSize: 12.5,
                                color: '#000000',
                                cursor: 'pointer',
                                padding: '2px 0',
                                textTransform: 'uppercase',
                                transition: 'transform 0.1s, color 0.1s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#1e3a8a'; e.currentTarget.style.transform = 'scale(1.04)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#000000'; e.currentTarget.style.transform = 'scale(1)' }}
                              title={`Ouvrir l'emploi du temps (Soir/CDS) de ${prof}`}
                            >
                              {prof}
                            </button>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 2. TABLE 2: COMMUNICATION & MATIERES TRANSVERSALES (Without days row) */}
          <div
            style={{
              background: '#ffffff',
              border: '2px solid #000000',
              borderRadius: 6,
              boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
              overflowX: 'auto',
              padding: 2
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', textAlign: 'center', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th
                    colSpan={displayCommCols.length}
                    style={{
                      background: '#f59e0b',
                      color: '#000000',
                      padding: '10px 16px',
                      fontWeight: 900,
                      fontSize: 16,
                      letterSpacing: 2,
                      borderBottom: '2px solid #000',
                      textAlign: 'center',
                      textTransform: 'uppercase'
                    }}
                  >
                    COMMUNICATION
                  </th>
                </tr>
                <tr style={{ background: '#fbbf24', color: '#000', borderBottom: '2px solid #000' }}>
                  {displayCommCols.map((col, idx) => (
                    <th
                      key={idx}
                      style={{
                        padding: '6px 4px',
                        borderRight: idx < displayCommCols.length - 1 ? '1.5px solid #000' : 'none',
                        fontWeight: 900,
                        fontSize: 13
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <span>{col.module}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCommAssignModal({ module: col.module })
                            setSelectedProfToAssign('')
                          }}
                          style={{
                            border: '1px solid #78350f',
                            background: '#ffffff',
                            color: '#78350f',
                            borderRadius: 4,
                            padding: '1px 5px',
                            fontSize: 11,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                          }}
                          title={`Affecter des formateurs à ${col.module}`}
                        >
                          <Plus size={11} style={{ marginRight: 1 }} /> +
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Communication profs rows (dynamic count to show all assigned professors) */}
                {Array.from({ length: maxCommProfsRows }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {displayCommCols.map((col, colIdx) => {
                      const prof = col.profs[rowIdx]
                      const matches = !searchTerm || (prof && prof.toLowerCase().includes(searchTerm.toLowerCase()))
                      return (
                        <td
                          key={colIdx}
                          style={{
                            padding: '3px 4px',
                            borderRight: colIdx < displayCommCols.length - 1 ? '1.5px solid #000' : 'none',
                            borderBottom: rowIdx < 5 ? '1.5px solid #000' : 'none',
                            height: 28,
                            background: prof ? (matches ? '#22d3ee' : '#e0f2fe') : '#ffffff'
                          }}
                        >
                          {prof ? (
                            <button
                              type="button"
                              onClick={() => openFormateurSchedule(prof, 'COMM')}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                fontWeight: 900,
                                fontSize: 12,
                                color: '#000000',
                                cursor: 'pointer',
                                padding: '2px 0',
                                textTransform: 'uppercase',
                                transition: 'transform 0.1s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#1e3a8a'; e.currentTarget.style.transform = 'scale(1.04)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#000000'; e.currentTarget.style.transform = 'scale(1)' }}
                              title={`Ouvrir l'emploi du temps de ${prof}`}
                            >
                              {prof}
                            </button>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        {/* Right Column: Actions and Shortcuts Panel (Panneau d'actions rapides - Image 1) */}
        <div
          style={{
            background: '#dcfce7',
            border: '2px solid #000000',
            borderRadius: 6,
            padding: '12px 10px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* Row 1: Affectation | Mise a jour date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => onNavigate('dna')}
              style={hubBtnStyle}
            >
              Affectation
            </button>
            <button
              className="hub-btn"
              onClick={() => setShowDateModal(true)}
              style={hubBtnStyle}
            >
              Mise a jour date
            </button>
          </div>

          {/* Row 2: STAGE | Les groupes en stage */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => onNavigate('stage')}
              style={{ ...hubBtnStyle, color: '#ec4899', fontWeight: 900 }}
            >
              STAGE
            </button>
            <button
              className="hub-btn"
              onClick={() => onNavigate('stage')}
              style={{ ...hubBtnStyle, color: '#ec4899', fontStyle: 'italic', fontWeight: 900 }}
            >
              Les groupes en stage
            </button>
          </div>

          {/* Row 3: Groupe vide | Salle vide (Navigates to Trouver Groupe/Salle Vide) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={navigateToTrouverGroupeVide}
              style={{ ...hubBtnStyle, color: '#2563eb', fontWeight: 800 }}
              title="Trouver les groupes disponibles"
            >
              Groupe vide
            </button>
            <button
              className="hub-btn"
              onClick={navigateToTrouverSalleVide}
              style={{ ...hubBtnStyle, color: '#2563eb', fontWeight: 800 }}
              title="Trouver les salles et ateliers libres"
            >
              Salle vide
            </button>
          </div>

          {/* Row 4: Mise a jour Nbr de Groupes | Nombre des Groupes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => onNavigate('groupes')}
              style={{ ...hubBtnStyle, color: '#047857', fontSize: 10.5 }}
            >
              Mise a jour Nbr Groupes
            </button>
            <button
              className="hub-btn"
              onClick={() => onNavigate('groupes')}
              style={{ ...hubBtnStyle, color: '#047857', fontSize: 10.5 }}
            >
              Nombre Groupes
            </button>
          </div>

          {/* Row 5: DNA | DN | Formateur PDF */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => onNavigate('dna')}
              style={hubBtnStyle}
            >
              DNA
            </button>
            <button
              className="hub-btn"
              onClick={() => onNavigate('dn')}
              style={hubBtnStyle}
            >
              DN
            </button>
            <button
              className="hub-btn"
              onClick={() => onNavigate('export')}
              style={{ ...hubBtnStyle, color: '#b45309' }}
            >
              Formateur PDF
            </button>
          </div>

          {/* Row 6: pdf chaque Formateur | pdf tous les Formateurs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => onNavigate('export')}
              style={{ ...hubBtnStyle, color: '#b91c1c', fontSize: 10.5 }}
            >
              pdf chaque Formateur
            </button>
            <button
              className="hub-btn"
              onClick={() => onNavigate('export')}
              style={{ ...hubBtnStyle, color: '#b91c1c', fontSize: 10.5 }}
            >
              pdf tous Formateurs
            </button>
          </div>

          {/* Row 7: Planning des Salles */}
          <button
            className="hub-btn"
            onClick={() => onNavigate('salle_grid')}
            style={{ ...hubBtnStyle, background: '#eff6ff', color: '#1d4ed8', fontWeight: 900, padding: '9px 12px' }}
          >
            Planning des Salles (Occupation)
          </button>
        </div>

      </div>

      {/* ── Modal Mise à Jour Date (Image 1) ────────────────────────────────── */}
      {showDateModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1300 }}
          onClick={() => setShowDateModal(false)}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fef08a',
              border: '2px solid #ca8a04',
              borderRadius: 12,
              padding: 0,
              maxWidth: 720,
              width: '95%',
              boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
              color: '#000000',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Mise a jour date</span>
                {/* Horloge en temps réel du PC */}
                <span style={{
                  background: '#0f172a',
                  color: '#22d3ee',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  fontSize: 13,
                  padding: '3px 10px',
                  borderRadius: 6,
                  letterSpacing: 1.5
                }}>
                  🕐 {livePcTime.toLocaleTimeString('fr-FR')} — {livePcTime.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Bouton synchronisation automatique depuis le PC */}
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date()
                    setAnneeGroupe(pcAnneeFormation(now))
                    setPeriodeGroupe(pcPeriodeGroupe(now))
                    setAnneeFormateur(pcAnneeFormation(now))
                    setPeriodeFormateur(pcPeriodeFormateur(now))
                    toast.success('🕐 Dates synchronisées depuis l\'horloge du PC !', { duration: 2500 })
                  }}
                  style={{
                    background: '#0ea5e9',
                    border: '1.5px solid #0284c7',
                    borderRadius: 6,
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '5px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0284c7' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#0ea5e9' }}
                  title="Remplir automatiquement avec la date actuelle du PC"
                >
                  🔄 Auto depuis PC
                </button>
                <button
                  type="button"
                  onClick={() => setShowDateModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 20,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#64748b'
                  }}
                >
                  ×
                </button>
              </div>
            </div>


            {/* Modal Content with yellow background matching Image 1 */}
            <div style={{ padding: '28px 24px 36px', display: 'flex', flexDirection: 'column', gap: 28 }}>
              {/* Section 1: Groupe */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, width: 200 }}>ANNEE DE FORMATION :</span>
                    <input
                      type="text"
                      value={anneeGroupe}
                      onChange={(e) => setAnneeGroupe(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1.5px solid #000000',
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: 14,
                        width: 140,
                        background: '#ffffff'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, width: 200 }}>Période d'application:</span>
                    <input
                      type="text"
                      value={periodeGroupe}
                      onChange={(e) => setPeriodeGroupe(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1.5px solid #000000',
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: 14,
                        width: 140,
                        background: '#ffffff'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleSyncFeuillesGroupe}
                    style={{
                      background: '#86efac',
                      border: '2px solid #16a34a',
                      borderRadius: 6,
                      color: '#064e3b',
                      fontWeight: 900,
                      fontSize: 15,
                      padding: '14px 18px',
                      cursor: 'pointer',
                      width: '100%',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      transition: 'transform 0.1s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    Sychronsation des feuilles Groupe
                  </button>
                </div>
              </div>

              {/* Section 2: Formateur */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, width: 200 }}>ANNEE DE FORMATION :</span>
                    <input
                      type="text"
                      value={anneeFormateur}
                      onChange={(e) => setAnneeFormateur(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1.5px solid #000000',
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: 14,
                        width: 140,
                        background: '#ffffff'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, width: 200 }}>Période d'application:</span>
                    <input
                      type="text"
                      value={periodeFormateur}
                      onChange={(e) => setPeriodeFormateur(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1.5px solid #000000',
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: 14,
                        width: 140,
                        background: '#ffffff'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleSyncFeuillesFormateur}
                    style={{
                      background: '#86efac',
                      border: '2px solid #16a34a',
                      borderRadius: 6,
                      color: '#064e3b',
                      fontWeight: 900,
                      fontSize: 15,
                      padding: '14px 18px',
                      cursor: 'pointer',
                      width: '100%',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      transition: 'transform 0.1s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    Sychronsation des feuilles Formateur
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Affectation Formateur Communication ───────────────────────── */}
      {commAssignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1350,
            padding: 20
          }}
          onClick={() => {
            if (!isSavingAssign) setCommAssignModal(null)
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: '100%',
              background: '#ffffff',
              borderRadius: 12,
              border: '2px solid #000000',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              margin: 'auto',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: '#f59e0b',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #000'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🎓</span>
                <div>
                  <h3 style={{ margin: 0, fontWeight: 900, fontSize: 16, color: '#000000', textTransform: 'uppercase' }}>
                    Affectation des Formateurs
                  </h3>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#78350f' }}>
                    Matière : {commAssignModal.module}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCommAssignModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 22,
                  fontWeight: 900,
                  cursor: 'pointer',
                  color: '#000000',
                  lineHeight: 1
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', maxHeight: 'calc(85vh - 130px)' }}>
              
              {/* Section 1: Formateurs actuellement affectés */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                  Formateurs actuellement affectés à {commAssignModal.module} :
                </h4>
                {(() => {
                  const assigned = formateurs.filter(f =>
                    matchesModule(f.matiere, commAssignModal.module) ||
                    matchesModule(f.specialite, commAssignModal.module) ||
                    f.groupes_assignes?.some(g => matchesModule(g, commAssignModal.module))
                  )

                  if (assigned.length === 0) {
                    return (
                      <div style={{ padding: '12px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                        Aucun formateur n'est encore affecté à cette matière.
                      </div>
                    )
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                      {assigned.map(prof => (
                        <div
                          key={prof.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: '#eff6ff',
                            border: '1.5px solid #bfdbfe',
                            borderRadius: 6
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 900, fontSize: 13, color: '#1e3a8a' }}>
                              {(prof.nom_prenom || `${prof.nom} ${prof.prenom || ''}`).toUpperCase()}
                            </span>
                            {prof.specialite && (
                              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                                ({prof.specialite})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!prof.id) return
                              try {
                                await formateursService.update(prof.id, { matiere: '' })
                                setFormateurs(prev => prev.map(p => p.id === prof.id ? { ...p, matiere: '' } : p))
                                toast.success(`${prof.nom || prof.nom_prenom} retiré de ${commAssignModal.module}`)
                              } catch (e) {
                                toast.error('Erreur lors de la suppression')
                              }
                            }}
                            style={{
                              border: '1px solid #ef4444',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              borderRadius: 4,
                              padding: '4px 8px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="Retirer ce formateur"
                          >
                            <Trash2 size={12} /> Retirer
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Section 2: Ajouter un formateur */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                  Affecter un nouveau formateur :
                </h4>
                <div style={{ display: 'flex', gap: 10 }}>
                  <select
                    value={selectedProfToAssign}
                    onChange={(e) => setSelectedProfToAssign(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: '1.5px solid #000000',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      background: '#ffffff'
                    }}
                  >
                    <option value="">-- Choisir un formateur dans la base --</option>
                    {formateurs
                      .filter(f => Boolean(f.id) && !matchesModule(f.matiere, commAssignModal.module))
                      .sort((a, b) => (a.nom_prenom || a.nom || '').localeCompare(b.nom_prenom || b.nom || ''))
                      .map(f => (
                        <option key={f.id} value={f.id}>
                          {(f.nom_prenom || `${f.nom} ${f.prenom || ''}`).toUpperCase()} {f.specialite ? `[${f.specialite}]` : ''}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedProfToAssign || isSavingAssign}
                    onClick={async () => {
                      if (!selectedProfToAssign) return
                      setIsSavingAssign(true)
                      try {
                        await formateursService.update(selectedProfToAssign, { matiere: commAssignModal.module })
                        setFormateurs(prev => prev.map(p => p.id === selectedProfToAssign ? { ...p, matiere: commAssignModal.module } : p))
                        setSelectedProfToAssign('')
                        toast.success(`Formateur affecté à ${commAssignModal.module} avec succès !`)
                      } catch (e) {
                        toast.error("Erreur lors de l'enregistrement")
                      } finally {
                        setIsSavingAssign(false)
                      }
                    }}
                    style={{
                      background: selectedProfToAssign ? '#16a34a' : '#94a3b8',
                      color: '#ffffff',
                      border: '1.5px solid #000000',
                      borderRadius: 6,
                      padding: '8px 16px',
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: selectedProfToAssign ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    <Check size={14} /> Affecter
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <button
                type="button"
                onClick={() => setCommAssignModal(null)}
                style={{
                  padding: '7px 18px',
                  background: '#ffffff',
                  border: '1.5px solid #000000',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const hubBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1.5px solid #000000',
  borderRadius: 4,
  padding: '7px 6px',
  fontWeight: 700,
  fontSize: 12,
  color: '#000000',
  cursor: 'pointer',
  textAlign: 'center',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  transition: 'transform 0.1s, box-shadow 0.1s',
  boxSizing: 'border-box',
  width: '100%'
}
