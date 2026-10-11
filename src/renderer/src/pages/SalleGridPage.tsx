import React, { useState, useEffect } from 'react'
import { Grid3X3, Trash2, X, User, Users, BookOpen, Check, Search } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { sallesService, formateursService, groupesService, filieresService, planningSallesService } from '../services/firebaseService'
import type { Salle, Formateur, Groupe, Filiere } from '../types'
import { toast } from 'react-hot-toast'
import SallesVidesGrid from '../components/SallesVidesGrid'
import GroupesVidesGrid from '../components/GroupesVidesGrid'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CellData {
  formateurId: string
  groupeId: string
  module: string
  remarque?: string
}

type GridKey = string // `${jour}__${salle}__${tsIdx}`

interface SelectedCell {
  jour: string
  salle: string
  timeslotIdx: number
  key: GridKey
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const PROF_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#6366f1',
  '#84cc16', '#fb923c', '#a78bfa', '#34d399', '#f472b6'
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function SalleGridPage(): React.ReactElement {
  const { lang } = useTranslation()

  const jours = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
  const timeslots = ['08H30 - 11H00', '11H00 - 13H30', '13H30 - 16H00', '16H00 - 18H30']

  const [salles, setSalles] = useState<Salle[]>([])
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)

  // Grid data: key → CellData
  const [gridData, setGridData] = useState<Record<GridKey, CellData>>({})

  // Modal state
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [modalFormateur, setModalFormateur] = useState('')
  const [modalGroupe, setModalGroupe] = useState('')
  const [modalModule, setModalModule] = useState('')
  const [modalRemarque, setModalRemarque] = useState('')
  const [searchF, setSearchF] = useState('')
  const [searchG, setSearchG] = useState('')

  // Vider par formateur modal
  const [showViderModal, setShowViderModal] = useState(false)
  const [viderSearch, setViderSearch] = useState('')
  const [viderSelectedId, setViderSelectedId] = useState('')

  // Mode d'affichage: Occupation des salles, Trouver salle vide ou Trouver groupe vide
  const [activeView, setActiveView] = useState<'occupation' | 'salles_vides' | 'groupes_vides'>('occupation')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [s, f, g, fil, savedGrid] = await Promise.all([
        sallesService.getAll(),
        formateursService.getAll(),
        groupesService.getAll(),
        filieresService.getAll(),
        planningSallesService.getAll()
      ])
      setSalles(s)
      setFormateurs(f)
      setGroupes(g.sort((a, b) => a.code_groupe.localeCompare(b.code_groupe)))
      setFilieres(fil.sort((a, b) => a.code_filiere.localeCompare(b.code_filiere)))
      // تحميل البيانات المحفوظة من Firebase
      const restoredGrid: Record<string, { formateurId: string; groupeId: string; module: string }> = {}
      Object.values(savedGrid).forEach(cell => {
        restoredGrid[cell.key] = {
          formateurId: cell.formateurId,
          groupeId: cell.groupeId,
          module: cell.module
        }
      })
      setGridData(restoredGrid)
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  function getProfColor(formateurId: string): string {
    const idx = formateurs.findIndex(f => f.id === formateurId)
    return idx >= 0 ? PROF_COLORS[idx % PROF_COLORS.length] : '#6b7280'
  }

  function makeKey(jour: string, salle: string, tsIdx: number): GridKey {
    return `${jour}__${salle}__${tsIdx}`
  }

  function openCell(jour: string, salle: string, tsIdx: number) {
    const key = makeKey(jour, salle, tsIdx)
    const existing = gridData[key]
    setModalFormateur(existing?.formateurId || '')
    setModalGroupe(existing?.groupeId || '')
    setModalModule(existing?.module || '')
    setModalRemarque(existing?.remarque || '')
    setSearchF('')
    setSearchG('')
    setSelectedCell({ jour, salle, timeslotIdx: tsIdx, key })
  }

  async function saveCell() {
    if (!selectedCell) return
    if (!modalFormateur && !modalGroupe && !modalModule) {
      // حذف الخلية
      setGridData(prev => {
        const next = { ...prev }
        delete next[selectedCell.key]
        return next
      })
      await planningSallesService.deleteCell(selectedCell.key)
    } else {
      const cellData: CellData = {
        formateurId: modalFormateur,
        groupeId: modalGroupe,
        module: modalModule,
        remarque: modalRemarque
      }
      setGridData(prev => ({
        ...prev,
        [selectedCell.key]: cellData
      }))
      // حفظ في Firebase
      await (planningSallesService.setCell as (cell: CellData & { key: string }) => Promise<void>)({
        key: selectedCell.key,
        ...cellData
      })
    }
    setSelectedCell(null)
  }

  async function clearCell() {
    if (!selectedCell) return
    setGridData(prev => {
      const next = { ...prev }
      delete next[selectedCell.key]
      return next
    })
    await planningSallesService.deleteCell(selectedCell.key)
    setSelectedCell(null)
  }

  async function clearAll() {
    setGridData({})
    await planningSallesService.deleteAll()
    toast.success(lang === 'ar' ? 'تم تفريغ الجدول بنجاح' : 'Tableau vidé avec succès')
  }

  async function clearByFormateur() {
    if (!viderSelectedId) return
    const keysToDelete = Object.keys(gridData).filter(
      k => gridData[k].formateurId === viderSelectedId
    )
    if (keysToDelete.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد خلايا لهذا الأستاذ' : 'Aucune cellule pour ce formateur')
      return
    }
    setGridData(prev => {
      const next = { ...prev }
      keysToDelete.forEach(k => delete next[k])
      return next
    })
    await Promise.all(keysToDelete.map(k => planningSallesService.deleteCell(k)))
    const prof = formateurs.find(f => f.id === viderSelectedId)
    toast.success(`${prof?.nom_prenom ?? ''} — ${lang === 'ar' ? 'تم الحذف بنجاح' : 'cellules supprimées'}`)
    setShowViderModal(false)
    setViderSelectedId('')
    setViderSearch('')
  }

  const filteredFormateurs = formateurs.filter(f =>
    f.nom_prenom.toLowerCase().includes(searchF.toLowerCase())
  )

  // When a formateur is selected, filter groups to only show his filière groups
  // e.g. groupes_assignes = ['TEMI100','TEMI200'] → show TEMI101, TEMI102, TEMI103...
  const selectedFormateur = modalFormateur ? formateurs.find(f => f.id === modalFormateur) : null
  const assignedPrefixes: string[] = selectedFormateur?.groupes_assignes
    ?.map(code => code.replace(/\d+$/, '').trim()) // 'TEMI100' → 'TEMI'
    .filter(Boolean) ?? []

  const groupesForFormateur = (assignedPrefixes.length > 0)
    ? groupes.filter(g => assignedPrefixes.some(prefix => g.code_groupe.startsWith(prefix)))
    : groupes // show all if no formateur selected or no assignments

  const filteredGroupes = groupesForFormateur.filter(g =>
    g.code_groupe.toLowerCase().includes(searchG.toLowerCase())
  )

  // إزالة التكرار من القاعات
  const salleNames = salles.length > 0
    ? Array.from(new Set(salles.map(s => s.nom_salle)))
    : [
        'SALLE 01', 'SALLE 02', 'SALLE 03', 'SALLE 05', 'SALLE 06',
        'SALLE 08', 'SALLE 09', 'SALLE 10', 'SALLE 11', 'SALLE INFO',
        'AT EB', 'AT TFM', 'AT EEI', 'AT PC', 'AT AEFGT',
        'AT RVA1', 'AT RVA2', 'AT RVA3', 'AT CPA',
        'AT OPCM1', 'AT OPCM2', 'AT MA', 'AT MOAB',
        'AT TREM', 'AT TEMI1', 'AT ESA', 'AT TEMI2'
      ]

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ gap: 16 }}>
        <div className="page-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: activeView === 'occupation'
                ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                : activeView === 'salles_vides'
                ? 'linear-gradient(135deg, #facc15, #ca8a04)'
                : 'linear-gradient(135deg, #059669, #10b981)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: activeView === 'occupation' ? '2px solid #1e40af' : activeView === 'salles_vides' ? '2px solid #a16207' : '2px solid #047857',
              color: 'white'
            }}>
              {activeView === 'occupation' ? <Grid3X3 size={22} /> : activeView === 'salles_vides' ? <Search size={22} /> : <Users size={22} />}
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                {activeView === 'occupation'
                  ? 'Planning des Salles'
                  : activeView === 'salles_vides'
                  ? 'Trouver Salle Vide'
                  : 'Trouver Groupe Vide (Filières)'}
              </h1>
              <p style={{ fontSize: 13.5, color: '#4b5563', margin: '3px 0 0 0' }}>
                {activeView === 'occupation'
                  ? 'Cliquez sur une cellule pour assigner un formateur, groupe et module'
                  : activeView === 'salles_vides'
                  ? 'Tableau hebdomadaire récapitulatif des salles et ateliers non occupés'
                  : 'Disponibilité des groupes par filière (Noir = Libre / Rouge = En cours)'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Sélecteur de Mode (Onglets) ─────────────────────────────────── */}
        <div style={{
          display: 'flex',
          background: '#e2e8f0',
          borderRadius: 10,
          padding: 3,
          gap: 4
        }}>
          <button
            type="button"
            onClick={() => setActiveView('occupation')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: activeView === 'occupation' ? '#2563eb' : 'transparent',
              color: activeView === 'occupation' ? '#ffffff' : '#475569',
              boxShadow: activeView === 'occupation' ? '0 2px 6px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Grid3X3 size={16} />
            Planning Salles
          </button>

          <button
            type="button"
            onClick={() => setActiveView('salles_vides')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: activeView === 'salles_vides' ? '#2563eb' : 'transparent',
              color: activeView === 'salles_vides' ? '#ffffff' : '#475569',
              boxShadow: activeView === 'salles_vides' ? '0 2px 6px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Search size={16} />
            Trouver Salle Vide
          </button>

          <button
            type="button"
            onClick={() => setActiveView('groupes_vides')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: activeView === 'groupes_vides' ? '#2563eb' : 'transparent',
              color: activeView === 'groupes_vides' ? '#ffffff' : '#475569',
              boxShadow: activeView === 'groupes_vides' ? '0 2px 6px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Users size={16} />
            Trouver Groupe Vide
          </button>
        </div>

        {/* ── Actions (Mode Occupation) ────────────────────────────────────── */}
        {activeView === 'occupation' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Vider par formateur */}
            <button
              type="button"
              onClick={() => { setShowViderModal(true); setViderSelectedId(''); setViderSearch('') }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px',
                fontSize: '14px', fontWeight: 700, background: 'white', color: '#2563eb',
                border: '2px solid #2563eb', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.color = 'white' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#2563eb' }}
            >
              <User size={16} />
              Vider par formateur
            </button>

            {/* Tout vider */}
            <button
              type="button"
              onClick={clearAll}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px',
                fontSize: '14px', fontWeight: 700, background: 'white', color: '#dc2626',
                border: '2px solid #ef4444', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#dc2626' }}
            >
              <Trash2 size={16} />
              Tout vider
            </button>
          </div>
        )}
      </div>

      {/* ── Body: Salles Vides ─────────────────────────────────────────────── */}
      <div className="page-body" style={{ display: activeView === 'salles_vides' ? 'block' : 'none' }}>
        <SallesVidesGrid
          salleNames={salleNames}
          gridData={gridData}
          onBackToOccupation={() => setActiveView('occupation')}
        />
      </div>

      {/* ── Body: Groupes Vides ────────────────────────────────────────────── */}
      <div className="page-body" style={{ display: activeView === 'groupes_vides' ? 'block' : 'none' }}>
        <GroupesVidesGrid
          filieres={filieres}
          groupes={groupes}
          gridData={gridData}
          formateurs={formateurs}
          onBackToOccupation={() => setActiveView('occupation')}
        />
      </div>

      {/* ── Body: Occupation Salles ────────────────────────────────────────── */}
      <div className="page-body" style={{ display: activeView === 'occupation' ? 'block' : 'none' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th colSpan={2} style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #000', padding: '12px', textAlign: 'left', fontWeight: 900, fontSize: 16 }}>
                      HEURE
                    </th>
                    {timeslots.map((t, i) => (
                      <th key={i} style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #000', padding: '12px', textAlign: 'center', fontWeight: 900, fontSize: 15 }}>
                        {t}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #000', padding: '12px', width: 80, textAlign: 'center', fontWeight: 900, fontSize: 15 }}>
                      JOUR
                    </th>
                    <th style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #000', padding: '12px', width: 140, textAlign: 'center', fontWeight: 900, fontSize: 15 }}>
                      SALLE
                    </th>
                    {timeslots.map((_, i) => (
                      <th key={i} style={{ background: '#f1f5f9', border: '1px solid #000', padding: '10px' }} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jours.map((jour, jourIdx) => (
                    <React.Fragment key={jour}>
                      {/* ── Séparateur entre jours ────────────────────────── */}
                      {jourIdx > 0 && (
                        <tr>
                          <td
                            colSpan={timeslots.length + 2}
                            style={{
                              background: 'linear-gradient(90deg, #0f172a, #334155, #0f172a)',
                              height: 7,
                              padding: 0,
                              border: 'none'
                            }}
                          />
                        </tr>
                      )}
                      {salleNames.map((salle, idx) => {
                        const isLastRow = idx === salleNames.length - 1
                        return (
                          <tr key={`${jour}-${idx}`} style={{ background: '#ffffff' }}>
                            {idx === 0 && (
                              <td
                                rowSpan={salleNames.length}
                                style={{
                                  background: '#f1f5f9',
                                  color: '#0f172a',
                                  border: '1px solid #000',
                                  padding: '10px',
                                  textAlign: 'center',
                                  fontWeight: 900,
                                  fontSize: 15,
                                  writingMode: 'vertical-rl',
                                  transform: 'rotate(180deg)',
                                  letterSpacing: 3
                                }}
                              >
                                {jour}
                              </td>
                            )}
                            <td style={{
                              background: '#f8fafc',
                              border: '1px solid #94a3b8',
                              borderBottom: isLastRow ? '2px solid #475569' : '1px solid #94a3b8',
                              padding: '9px 12px',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontSize: 13,
                              color: '#0f172a',
                              whiteSpace: 'nowrap'
                            }}>
                              {salle}
                            </td>
                            {timeslots.map((_, tsIdx) => {
                              const key = makeKey(jour, salle, tsIdx)
                              const cell = gridData[key]
                              const prof = cell ? formateurs.find(f => f.id === cell.formateurId) : null
                              const groupe = cell ? groupes.find(g => g.id === cell.groupeId) : null
                              const color = cell ? getProfColor(cell.formateurId) : null

                              const label = [
                                prof?.nom_prenom,
                                groupe?.code_groupe
                              ].filter(Boolean).join(' - ')

                              const tooltipTitle = [
                                label,
                                cell?.module ? `Module: ${cell.module}` : '',
                                cell?.remarque ? `Remarque: ${cell.remarque}` : ''
                              ].filter(Boolean).join(' | ')

                              return (
                                <td
                                  key={tsIdx}
                                  onClick={() => openCell(jour, salle, tsIdx)}
                                  title={tooltipTitle || undefined}
                                  style={{
                                    border: '1px solid #94a3b8',
                                    borderBottom: isLastRow ? '2px solid #475569' : '1px solid #94a3b8',
                                    padding: 0,
                                    minWidth: 150,
                                    height: 38,
                                    cursor: 'pointer',
                                    transition: 'filter 0.15s',
                                    background: color || '#ffffff',
                                    textAlign: 'center',
                                    verticalAlign: 'middle'
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.88)' }}
                                  onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
                                >
                                  {label && (
                                    <span style={{
                                      fontSize: 12,
                                      fontWeight: 800,
                                      color: '#000000',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      display: 'block',
                                      padding: '0 6px'
                                    }}>
                                      {label}
                                    </span>
                                  )}
                                  {cell?.remarque && (
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: 'rgba(0,0,0,0.6)',
                                      display: 'block',
                                      padding: '0 6px',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      fontStyle: 'italic'
                                    }}>
                                      📝 {cell.remarque}
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Selection Modal ─────────────────────────────────────────────────── */}
      {selectedCell && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedCell(null)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 560, width: '95vw', padding: 0, borderRadius: 16, overflow: 'hidden' }}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b, #334155)',
              color: 'white', padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {selectedCell.jour} · {timeslots[selectedCell.timeslotIdx]}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                  {selectedCell.salle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Formateur Selection */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  <User size={14} color="#3b82f6" />
                  {lang === 'ar' ? 'الأستاذ (المكون)' : 'Formateur'}
                </label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'ابحث عن أستاذ...' : 'Rechercher un formateur...'}
                  value={searchF}
                  onChange={e => setSearchF(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none',
                    marginBottom: 8, boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                  {modalFormateur ? (
                    (() => {
                      const selectedProf = formateurs.find(f => f.id === modalFormateur)
                      const profIndex = selectedProf ? formateurs.indexOf(selectedProf) : 0
                      const color = PROF_COLORS[profIndex % PROF_COLORS.length]
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setModalFormateur('')}
                            title={lang === 'ar' ? 'إلغاء التحديد وعرض باقي الأساتذة' : 'Désélectionner et afficher tous les formateurs'}
                            style={{
                              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                              border: `2px solid ${color}`,
                              background: color,
                              color: 'white',
                              boxShadow: `0 2px 8px ${color}55`,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              transition: 'all 0.15s'
                            }}
                          >
                            <span>{selectedProf ? selectedProf.nom_prenom : '—'}</span>
                            <span style={{
                              background: 'rgba(255,255,255,0.3)',
                              borderRadius: '50%',
                              width: 18, height: 18,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 900
                            }}>✕</span>
                          </button>
                          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                            {lang === 'ar' ? '(اضغط ✕ لتغيير الأستاذ أو عرض الكل)' : '(Cliquez ✕ pour changer)'}
                          </span>
                        </div>
                      )
                    })()
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalFormateur('')}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: '1.5px solid #d1d5db',
                          background: '#1e293b',
                          color: 'white',
                          transition: 'all 0.15s'
                        }}
                      >
                        —
                      </button>
                      {filteredFormateurs.map((f) => {
                        const color = PROF_COLORS[formateurs.indexOf(f) % PROF_COLORS.length]
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setModalFormateur(f.id || '')}
                            style={{
                              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              border: `1.5px solid ${color}`,
                              background: `${color}15`,
                              color: color,
                              transition: 'all 0.15s'
                            }}
                          >
                            {f.nom_prenom}
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>

              {/* Groupe Selection */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  <Users size={14} color="#10b981" />
                  {lang === 'ar' ? 'الفوج (المجموعة)' : 'Groupe'}
                </label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'ابحث عن فوج...' : 'Rechercher un groupe...'}
                  value={searchG}
                  onChange={e => setSearchG(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1.5px solid #d1d5db', fontSize: 13, outline: 'none',
                    marginBottom: 8, boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto' }}>
                  {modalGroupe ? (
                    (() => {
                      const selectedGrp = groupes.find(g => g.id === modalGroupe)
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setModalGroupe('')}
                            title={lang === 'ar' ? 'إلغاء التحديد وعرض باقي الأفواج' : 'Désélectionner et afficher tous les groupes'}
                            style={{
                              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                              border: '2px solid #10b981',
                              background: '#10b981',
                              color: 'white',
                              boxShadow: '0 2px 8px rgba(16,185,129,0.35)',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              transition: 'all 0.15s'
                            }}
                          >
                            <span>{selectedGrp ? selectedGrp.code_groupe : '—'}</span>
                            <span style={{
                              background: 'rgba(255,255,255,0.3)',
                              borderRadius: '50%',
                              width: 18, height: 18,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 900
                            }}>✕</span>
                          </button>
                          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                            {lang === 'ar' ? '(اضغط ✕ لتغيير الفوج)' : '(Cliquez ✕ pour changer)'}
                          </span>
                        </div>
                      )
                    })()
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setModalGroupe('')}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: '1.5px solid #d1d5db',
                          background: '#1e293b',
                          color: 'white',
                          transition: 'all 0.15s'
                        }}
                      >
                        —
                      </button>
                      {filteredGroupes.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setModalGroupe(g.id || '')}
                          style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            border: '1.5px solid #10b981',
                            background: '#f0fdf4',
                            color: '#065f46',
                            transition: 'all 0.15s'
                          }}
                        >
                          {g.code_groupe}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Module input */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  <BookOpen size={14} color="#8b5cf6" />
                  {lang === 'ar' ? 'الوحدة / المادة' : 'Module / Matière'}
                </label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'اكتب اسم الوحدة...' : 'Nom du module...'}
                  value={modalModule}
                  onChange={e => setModalModule(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10,
                    border: '1.5px solid #d1d5db', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box', fontWeight: 600,
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#8b5cf6' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#d1d5db' }}
                />
              </div>

              {/* Remarque input */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>📝</span>
                  Remarque
                </label>
                <input
                  type="text"
                  placeholder="Ajouter une remarque (optionnel)..."
                  value={modalRemarque}
                  onChange={e => setModalRemarque(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 10,
                    border: '1.5px solid #d1d5db', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box', fontWeight: 500,
                    transition: 'border-color 0.2s', fontStyle: 'italic',
                    color: '#6b7280'
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.fontStyle = 'normal'; e.currentTarget.style.color = '#1e293b' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.fontStyle = modalRemarque ? 'normal' : 'italic'; e.currentTarget.style.color = modalRemarque ? '#1e293b' : '#6b7280' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={clearCell}
                  style={{
                    padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    border: '1.5px solid #ef4444', background: 'white', color: '#ef4444',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#ef4444' }}
                >
                  <Trash2 size={15} />
                  {lang === 'ar' ? 'مسح الخلية' : 'Vider'}
                </button>
                <button
                  type="button"
                  onClick={saveCell}
                  style={{
                    padding: '10px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 4px 12px rgba(16,185,129,0.3)', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <Check size={15} />
                  {lang === 'ar' ? 'حفظ' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Vider par formateur Modal ────────────────────────────────────────── */}
      {showViderModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowViderModal(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 480, width: '95vw', padding: 0, borderRadius: 16, overflow: 'hidden' }}
          >
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
              color: 'white', padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <User size={18} />
                  {lang === 'ar' ? 'تفريغ حسب الأستاذ' : 'Vider par formateur'}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                  {lang === 'ar'
                    ? 'اختر أستاذاً لحذف جميع خلاياه من الجدول'
                    : 'Choisissez un formateur pour supprimer toutes ses cellules'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowViderModal(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                type="text"
                autoFocus
                placeholder={lang === 'ar' ? 'ابحث عن أستاذ...' : 'Rechercher un formateur...'}
                value={viderSearch}
                onChange={e => { setViderSearch(e.target.value); setViderSelectedId('') }}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid #d1d5db', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s'
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#2563eb' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#d1d5db' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {formateurs
                  .filter(f => f.nom_prenom.toLowerCase().includes(viderSearch.toLowerCase()))
                  .map(f => {
                    const color = PROF_COLORS[formateurs.indexOf(f) % PROF_COLORS.length]
                    const isSelected = viderSelectedId === f.id
                    const cellCount = Object.values(gridData).filter(c => c.formateurId === f.id).length
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setViderSelectedId(f.id || '')}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: isSelected ? `2px solid ${color}` : '1.5px solid #e5e7eb',
                          background: isSelected ? `${color}18` : '#fafafa',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: color, flexShrink: 0
                          }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                            {f.nom_prenom}
                          </span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: cellCount > 0 ? color : '#9ca3af',
                          background: cellCount > 0 ? `${color}18` : '#f3f4f6',
                          padding: '2px 10px', borderRadius: 20
                        }}>
                          {cellCount} {lang === 'ar' ? 'خلية' : 'cellule(s)'}
                        </span>
                      </button>
                    )
                  })}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowViderModal(false)}
                  style={{
                    padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="button"
                  onClick={clearByFormateur}
                  disabled={!viderSelectedId}
                  style={{
                    padding: '10px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    border: 'none',
                    background: viderSelectedId ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#e5e7eb',
                    color: viderSelectedId ? 'white' : '#9ca3af',
                    cursor: viderSelectedId ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: viderSelectedId ? '0 4px 12px rgba(124,58,237,0.35)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  <Trash2 size={15} />
                  {lang === 'ar' ? 'تفريغ' : 'Vider'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
