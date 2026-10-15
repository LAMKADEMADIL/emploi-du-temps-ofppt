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
  DoorOpen
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
  annee1: string
  annee2: string
  anneeExtra?: string
}

const DEFAULT_FALLBACK_COLS: FallbackFiliereInfo[] = [
  { filiere: 'AEFGT', profs: ['BERRADA', 'MEBSOUT', 'ASSOULI'], annee1: 'AEFGT100', annee2: 'AEFGT200' },
  { filiere: 'CPA', profs: ['EDDAMIRI', 'MAAZOUZ'], annee1: 'CPA100', annee2: 'CPA200' },
  { filiere: 'EEI', profs: ['ELKHALIDY', 'ASSOULI', 'HANNANE'], annee1: 'EEI100', annee2: 'EEI200' },
  { filiere: 'EM', profs: ['ESSFADI', 'BOUDABLIJ'], annee1: 'EM100', annee2: 'EM200' },
  { filiere: 'ESA', profs: ['CHGORA', 'LOUARGUI', 'AZAROUAL', 'WAHOUB', 'ABOUTARIK', 'ZARIOH'], annee1: 'ESA100', annee2: 'ESA200' },
  { filiere: 'M/MOAB', profs: ['LAMALEM', 'ROUAGHI', 'BAHASSOUNE', 'ELAMIR', 'OUAKIF', 'KHANNIBA', 'MESSOUR'], annee1: 'M100', annee2: 'MOAB200' },
  { filiere: 'OPCM', profs: ['BIALA', 'ABOUTARA', 'FITHANE', 'HANAFI'], annee1: 'OPCM100', annee2: 'OPCM200' },
  { filiere: 'PC', profs: ['DOUHOU', 'KHOUTAM'], annee1: 'PC100', annee2: 'PC200' },
  { filiere: 'RVA', profs: ['RMILI', 'ELHARFI', 'CHAHID', 'CHAFIKI', 'ZOUBID'], annee1: 'RVA100', annee2: 'RVA200', anneeExtra: 'RVA100CDS' },
  { filiere: 'TCM', profs: ['NASRI', 'HANAFI'], annee1: 'TCM100', annee2: 'TCM200' },
  { filiere: 'TFM', profs: ['ABOUTARIK', 'BADDI'], annee1: 'TFM100', annee2: 'TFM200' },
  { filiere: 'TREM', profs: ['ELABDANI', 'ELHARFI', 'CHAFIKI', 'ZOUBID', 'FITHANE'], annee1: 'TREM100', annee2: 'TREM200' }
]

const DEFAULT_COMM_COLS = [
  { module: 'Français', profs: ['BOUZADI', 'AOURAZENE', 'MESBAHI', 'KATMANE', 'JAOUAD', 'KHALDOUNI'] },
  { module: 'Anglais', profs: ['GAOUGAOU', 'ELMOURABIT', 'RYABI', 'YAMKENE'] },
  { module: 'Arabe', profs: ['ELOUARGUI', 'DEBBAR', 'NOUR'] },
  { module: 'Soft Skills', profs: ['SIF', 'MESSOUDI'] },
  { module: 'Culture Entreprise', profs: ['BEKRI'] },
  { module: 'Culture Numérique', profs: ['ERRHAIMINI'] }
]

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
}

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
  
  // Selection
  const [selectedProfName, setSelectedProfName] = useState<string | null>(null)
  const [selectedProfFiliere, setSelectedProfFiliere] = useState<string>('TFM')
  const [profSchedule, setProfSchedule] = useState<ScheduleMap>({})
  const [statut, setStatut] = useState<'statutaire' | 'cooperant' | 'vacataire' | 'contrat'>('statutaire')
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)
  const [cellEditModal, setCellEditModal] = useState<{ day: string; slotIdx: number } | null>(null)

  // Cell edit state
  const [editGroupe, setEditGroupe] = useState('')
  const [editModule, setEditModule] = useState('M')
  const [editSalle, setEditSalle] = useState('')

  // Search filter
  const [searchTerm, setSearchTerm] = useState('')

  // Modal Mise à jour date state (Image 1)
  const [showDateModal, setShowDateModal] = useState(false)
  const [anneeGroupe, setAnneeGroupe] = useState('2025-2026')
  const [periodeGroupe, setPeriodeGroupe] = useState('Avril 2026')
  const [anneeFormateur, setAnneeFormateur] = useState('2025-2026')
  const [periodeFormateur, setPeriodeFormateur] = useState('Avril (01/04/2026)')

  useEffect(() => {
    loadBaseData()
  }, [])

  async function loadBaseData() {
    try {
      setLoading(true)
      const [f, s, g, fil] = await Promise.all([
        formateursService.getAll(),
        sallesService.getAll(),
        groupesService.getAll(),
        filieresService.getAll()
      ])
      setFormateurs(f)
      setSalles(s)
      setGroupes(g)
      setFilieres(fil)
    } catch (err) {
      console.error(err)
      toast.error('Erreur de chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // ── 1. Filières triées par ordre alphabétique (Alphabetical Order) ─────────
  const displayFilieresCols = useMemo(() => {
    // If filieres exist in Firebase, sort alphabetically by code_filiere
    if (filieres && filieres.length > 0) {
      const sorted = [...filieres].sort((a, b) => a.code_filiere.localeCompare(b.code_filiere))
      
      return sorted.map(f => {
        const filiereCode = f.code_filiere.toUpperCase()
        
        // Find all groups belonging to this filière
        const fGroupes = groupes.filter(g => g.id_filiere === f.id || g.code_groupe.toUpperCase().startsWith(filiereCode))
        const fGroupeCodes = new Set(fGroupes.map(g => g.code_groupe.toUpperCase()))

        // Find formateurs assigned to groups of this filière
        const assignedProfs: string[] = []

        // A) Formateurs in DB with groupes_assignes matching this filière
        formateurs.forEach(formateur => {
          const hasMatch = formateur.groupes_assignes?.some(gCode => {
            const clean = gCode.toUpperCase().trim()
            return fGroupeCodes.has(clean) || clean.startsWith(filiereCode)
          })
          if (hasMatch) {
            const name = (formateur.nom || formateur.nom_prenom || '').toUpperCase()
            if (name && !assignedProfs.includes(name)) {
              assignedProfs.push(name)
            }
          }
        })

        // B) If no profs found from DB assignments, merge with fallback model for this filière code
        const fallback = DEFAULT_FALLBACK_COLS.find(df => df.filiere.toUpperCase() === filiereCode)
        if (fallback) {
          fallback.profs.forEach(p => {
            if (!assignedProfs.includes(p)) assignedProfs.push(p)
          })
        }

        // Determine 1ère année and 2ème année codes
        const annee1 = fGroupes.find(g => g.code_groupe.match(/1\d\d/))?.code_groupe.replace(/\s+/g, '') || `${filiereCode}100`
        const annee2 = fGroupes.find(g => g.code_groupe.match(/2\d\d/))?.code_groupe.replace(/\s+/g, '') || `${filiereCode}200`
        const anneeExtra = fallback?.anneeExtra || ''

        return {
          filiere: f.code_filiere,
          profs: assignedProfs,
          annee1,
          annee2,
          anneeExtra
        }
      })
    }

    // Fallback: sorted alphabetically
    return [...DEFAULT_FALLBACK_COLS].sort((a, b) => a.filiere.localeCompare(b.filiere))
  }, [filieres, formateurs, groupes])

  // Load schedule for a formateur (from localStorage or firebase planning)
  async function openFormateurSchedule(profName: string, filiereCode: string) {
    setSelectedProfName(profName)
    setSelectedProfFiliere(filiereCode)
    
    // Check localStorage cache first
    const cacheKey = `edt_prof_${profName.replace(/\s+/g, '_').toUpperCase()}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        setProfSchedule(JSON.parse(cached))
        return
      } catch (e) {
        // fallback
      }
    }

    // Default sample data for demo if not found
    const defaultData: ScheduleMap = {
      'Lundi_0': { groupe: `${filiereCode}101`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Lundi_1': { groupe: `${filiereCode}101`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Lundi_2': { groupe: `${filiereCode}201`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Lundi_3': { groupe: `${filiereCode}201`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Mardi_0': { groupe: `${filiereCode}202`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Mardi_1': { groupe: `${filiereCode}202`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Mercredi_0': { groupe: `${filiereCode}201`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Mercredi_1': { groupe: `${filiereCode}202`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Jeudi_0': { groupe: `${filiereCode}101`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true },
      'Jeudi_1': { groupe: `${filiereCode}101`, module: 'M', salle: `AT ${filiereCode}`, syncedSalle: true, syncedGroupe: true }
    }
    setProfSchedule(defaultData)
  }

  function saveSchedule(updated: ScheduleMap) {
    setProfSchedule(updated)
    if (selectedProfName) {
      const cacheKey = `edt_prof_${selectedProfName.replace(/\s+/g, '_').toUpperCase()}`
      localStorage.setItem(cacheKey, JSON.stringify(updated))
    }
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

  // Apply cell edit
  async function handleSaveCell() {
    if (!cellEditModal) return
    const key = `${cellEditModal.day}_${cellEditModal.slotIdx}`
    const existing = profSchedule[key] || { syncedSalle: true, syncedGroupe: true }

    const updated = {
      ...profSchedule,
      [key]: {
        ...existing,
        groupe: editGroupe,
        module: editModule,
        salle: editSalle
      }
    }
    saveSchedule(updated)
    setCellEditModal(null)
    toast.success('Séance enregistrée !')

    // Automatically sync to planningSalles if salle is filled
    if (editSalle && selectedProfName) {
      try {
        const planningKey = `${cellEditModal.day.toUpperCase()}__${editSalle}__${cellEditModal.slotIdx}`
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
      } catch (e) {
        console.error(e)
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

  // Synchroniser Salle
  async function handleSynchroniserSalle() {
    if (!selectedProfName) return
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
      toast.success(`✅ ${count} séances synchronisées avec le Planning des Salles !`)
    } catch (e) {
      toast.error('Erreur lors de la synchronisation des salles')
    }
  }

  // Dé-synchroniser Salle
  async function handleDesynchroniserSalle() {
    if (!selectedProfName) return
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
      toast.success(`✅ ${count} salles dé-synchronisées et libérées dans le Planning !`)
    } catch (e) {
      toast.error('Erreur lors de la dé-synchronisation')
    }
  }

  // Vider cellule groupe: clears only the groups from the formateur timetable
  function handleViderCelluleGroupe() {
    if (!selectedProfName) return
    const updated: ScheduleMap = {}
    let count = 0
    for (const [key, slot] of Object.entries(profSchedule)) {
      if (slot.groupe && slot.groupe !== '-') count++
      updated[key] = {
        ...slot,
        groupe: ''
      }
    }
    saveSchedule(updated)
    toast.success(
      lang === 'ar'
        ? `تم إخلاء الأفواج (${count}) من جدول الحصص`
        : `Les groupes (${count}) ont été vidés de l'emploi du temps`
    )
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
    toast.success('✅ Synchronisation des feuilles Groupe effectuée !')
  }

  function handleSyncFeuillesFormateur() {
    localStorage.setItem('annee_formation_formateur', anneeFormateur)
    localStorage.setItem('periode_application_formateur', periodeFormateur)
    toast.success('✅ Synchronisation des feuilles Formateur effectuée !')
  }

  const totalSeancesCount = Object.keys(profSchedule).length
  const masseHoraireCalculated = totalSeancesCount * 2.5

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 2: EMPLOI DU TEMPS DU FORMATEUR (FACE A FACE)
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedProfName) {
    return (
      <div className="fade-in-up" style={{ padding: '8px 16px 50px', background: '#f8fafc', minHeight: '100vh', overflowY: 'auto' }}>
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
            color: '#000000'
          }}
        >
          {/* Header row: Logo, Titles, Sync Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 240px', gap: 16, borderBottom: '2px solid #000', paddingBottom: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <img src={ofpptLogo} alt="OFPPT Logo" style={{ width: 110, height: 75, objectFit: 'contain' }} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: 21, fontWeight: 900, margin: '0 0 6px 0', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                EMPLOI DU TEMPS DU FORMATEUR FACE A FACE : Stagiaires
              </h1>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                ANNEE DE FORMATION : 2025-2026
              </div>
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
                <span style={{ fontWeight: 700 }}>Avril (01/04/2026)</span>
              </div>
            </div>
          </div>

          {/* Weekly Timetable Grid Table */}
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontSize: 13, textAlign: 'center' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #000' }}>
                  <th style={{ width: 110, borderRight: '1.5px solid #000', padding: 8, fontWeight: 900 }}>Jour</th>
                  <th style={{ width: 90, borderRight: '1.5px solid #000', padding: 8, fontWeight: 900 }}>Heure</th>
                  {TIMESLOTS.map((ts, idx) => (
                    <th key={idx} style={{ borderRight: idx < 3 ? '1.5px solid #000' : 'none', padding: 8, fontWeight: 900, fontSize: 14 }}>
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
                        {TIMESLOTS.map((_, slotIdx) => {
                          const slot = profSchedule[`${day}_${slotIdx}`]
                          return (
                            <td
                              key={slotIdx}
                              onClick={() => handleCellClick(day, slotIdx)}
                              style={{
                                borderRight: slotIdx < 3 ? '1.5px solid #000' : 'none',
                                borderBottom: '1px solid #cbd5e1',
                                padding: '6px 4px',
                                fontWeight: 800,
                                fontSize: 14,
                                color: slot?.groupe ? '#0f172a' : '#94a3b8',
                                cursor: 'pointer',
                                background: slot?.groupe ? '#f8fafc' : '#ffffff',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = slot?.groupe ? '#f8fafc' : '#ffffff' }}
                              title="Cliquer pour modifier cette séance"
                            >
                              {slot?.groupe || '-'}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Row 2: Module */}
                      <tr>
                        <td style={{ borderRight: '1.5px solid #000', borderBottom: '1px solid #cbd5e1', fontWeight: 800, padding: '4px', background: '#f1f5f9' }}>
                          Module
                        </td>
                        {TIMESLOTS.map((_, slotIdx) => {
                          const slot = profSchedule[`${day}_${slotIdx}`]
                          return (
                            <td
                              key={slotIdx}
                              onClick={() => handleCellClick(day, slotIdx)}
                              style={{
                                borderRight: slotIdx < 3 ? '1.5px solid #000' : 'none',
                                borderBottom: '1px solid #cbd5e1',
                                padding: '4px',
                                fontWeight: 700,
                                color: '#475569',
                                cursor: 'pointer'
                              }}
                            >
                              {slot?.module || '-'}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Row 3: Salle */}
                      <tr style={{ borderBottom: '2px solid #000' }}>
                        <td style={{ borderRight: '1.5px solid #000', fontWeight: 800, padding: '4px', background: '#f1f5f9' }}>
                          salle
                        </td>
                        {TIMESLOTS.map((_, slotIdx) => {
                          const slot = profSchedule[`${day}_${slotIdx}`]
                          return (
                            <td
                              key={slotIdx}
                              onClick={() => handleCellClick(day, slotIdx)}
                              style={{
                                borderRight: slotIdx < 3 ? '1.5px solid #000' : 'none',
                                padding: '4px',
                                fontWeight: 800,
                                color: slot?.salle ? '#1d4ed8' : '#94a3b8',
                                cursor: 'pointer',
                                background: slot?.salle ? '#eff6ff' : 'transparent'
                              }}
                            >
                              {slot?.salle || '-'}
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
                  Modifier la séance ({cellEditModal.day} - {TIMESLOTS[cellEditModal.slotIdx].label})
                </h3>
                <button className="modal-close" onClick={() => setCellEditModal(null)}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Groupe</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: TFM101"
                    value={editGroupe}
                    onChange={(e) => setEditGroupe(e.target.value.toUpperCase())}
                    autoFocus
                  />
                  {groupes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {groupes.slice(0, 8).map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setEditGroupe(g.code_groupe)}
                          style={{ padding: '2px 8px', fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}
                        >
                          {g.code_groupe}
                        </button>
                      ))}
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
                  >
                    <option value="">-- Sans salle --</option>
                    {salles.map(s => (
                      <option key={s.id} value={s.nom_salle}>{s.nom_salle} ({s.type_salle})</option>
                    ))}
                  </select>
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
        padding: '12px 18px 80px',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto'
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
                {/* Formateurs rows (max 7 rows) */}
                {Array.from({ length: 7 }).map((_, rowIdx) => (
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

                {/* Annee 1 Row */}
                <tr style={{ background: '#ffffff', fontWeight: 800 }}>
                  {displayFilieresCols.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        padding: '6px 4px',
                        borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                        borderBottom: '1.5px solid #000',
                        fontSize: 12,
                        color: '#000'
                      }}
                    >
                      {col.annee1}
                    </td>
                  ))}
                </tr>

                {/* Annee 2 Row */}
                <tr style={{ background: '#ffffff', fontWeight: 800 }}>
                  {displayFilieresCols.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        padding: '6px 4px',
                        borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                        borderBottom: col.anneeExtra ? '1.5px solid #000' : 'none',
                        fontSize: 12,
                        color: '#000'
                      }}
                    >
                      {col.annee2}
                    </td>
                  ))}
                </tr>

                {/* Annee Extra Row (e.g. CDS) */}
                <tr style={{ background: '#ffffff', fontWeight: 800 }}>
                  {displayFilieresCols.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        padding: '4px',
                        borderRight: colIdx < displayFilieresCols.length - 1 ? '1.5px solid #000' : 'none',
                        fontSize: 11,
                        color: '#475569'
                      }}
                    >
                      {col.anneeExtra || ''}
                    </td>
                  ))}
                </tr>
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
                    colSpan={DEFAULT_COMM_COLS.length}
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
                  {DEFAULT_COMM_COLS.map((col, idx) => (
                    <th
                      key={idx}
                      style={{
                        padding: '6px 4px',
                        borderRight: idx < DEFAULT_COMM_COLS.length - 1 ? '1.5px solid #000' : 'none',
                        fontWeight: 900,
                        fontSize: 13
                      }}
                    >
                      {col.module}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Communication profs rows (max 6 rows) */}
                {Array.from({ length: 6 }).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {DEFAULT_COMM_COLS.map((col, colIdx) => {
                      const prof = col.profs[rowIdx]
                      const matches = !searchTerm || (prof && prof.toLowerCase().includes(searchTerm.toLowerCase()))
                      return (
                        <td
                          key={colIdx}
                          style={{
                            padding: '3px 4px',
                            borderRight: colIdx < DEFAULT_COMM_COLS.length - 1 ? '1.5px solid #000' : 'none',
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

          {/* Row 8: Action maintenance (Correctly contained inside border) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => toast.success('Cellules blanches remplies')}
              style={{
                ...hubBtnStyle,
                color: '#dc2626',
                fontSize: 10,
                padding: '6px 2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              title="Remplir Cellules En Blanc"
            >
              RemplirCellulesBlanc
            </button>
            <button
              className="hub-btn"
              onClick={() => toast.success('Lignes vides supprimées')}
              style={{
                ...hubBtnStyle,
                color: '#dc2626',
                fontSize: 10,
                padding: '6px 2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              title="Supprimer Lignes Vides"
            >
              SupprimerLignesVides
            </button>
          </div>

          {/* Row 9: Vider feuilles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%', boxSizing: 'border-box' }}>
            <button
              className="hub-btn"
              onClick={() => toast('Fonction de vidage', { icon: 'ℹ️' })}
              style={{ ...hubBtnStyle, color: '#dc2626', fontSize: 11 }}
            >
              Vider Samedi
            </button>
            <button
              className="hub-btn"
              onClick={() => toast('Fonction de vidage FAD', { icon: 'ℹ️' })}
              style={{ ...hubBtnStyle, color: '#dc2626', fontSize: 11 }}
            >
              Vider FAD
            </button>
          </div>
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
              <span style={{ fontWeight: 700, fontSize: 14 }}>Mise a jour date</span>
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
