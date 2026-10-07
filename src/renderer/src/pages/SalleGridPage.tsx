import React, { useState, useEffect } from 'react'
import { Grid3X3, Trash2, X, User, Users, BookOpen, Check } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { sallesService, formateursService, groupesService, planningSallesService } from '../services/firebaseService'
import type { Salle, Formateur, Groupe } from '../types'
import { toast } from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CellData {
  formateurId: string
  groupeId: string
  module: string
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
  const [loading, setLoading] = useState(true)

  // Grid data: key → CellData
  const [gridData, setGridData] = useState<Record<GridKey, CellData>>({})

  // Modal state
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [modalFormateur, setModalFormateur] = useState('')
  const [modalGroupe, setModalGroupe] = useState('')
  const [modalModule, setModalModule] = useState('')
  const [searchF, setSearchF] = useState('')
  const [searchG, setSearchG] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [s, f, g, savedGrid] = await Promise.all([
        sallesService.getAll(),
        formateursService.getAll(),
        groupesService.getAll(),
        planningSallesService.getAll()
      ])
      setSalles(s)
      setFormateurs(f)
      setGroupes(g.sort((a, b) => a.code_groupe.localeCompare(b.code_groupe)))
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
      const cellData = {
        formateurId: modalFormateur,
        groupeId: modalGroupe,
        module: modalModule
      }
      setGridData(prev => ({
        ...prev,
        [selectedCell.key]: cellData
      }))
      // حفظ في Firebase
      await planningSallesService.setCell({
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

  const filteredFormateurs = formateurs.filter(f =>
    f.nom_prenom.toLowerCase().includes(searchF.toLowerCase())
  )
  const filteredGroupes = groupes.filter(g =>
    g.code_groupe.toLowerCase().includes(searchG.toLowerCase())
  )

  const salleNames = salles.length > 0
    ? salles.map(s => s.nom_salle)
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
      <div className="page-header">
        <div className="page-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg, #4ade80, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #15803d', color: 'white'
            }}>
              <Grid3X3 size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                {lang === 'ar' ? 'جدول القاعات' : 'Planning des Salles'}
              </h1>
              <p style={{ fontSize: 13.5, color: '#4b5563', margin: '3px 0 0 0' }}>
                {lang === 'ar'
                  ? 'اضغط على أي خلية لتعيين أستاذ، مجموعة، ووحدة'
                  : 'Cliquez sur une cellule pour assigner un formateur, groupe et module'}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            {lang === 'ar' ? 'تفريغ الكل' : 'Tout vider'}
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="page-body">
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
                  {jours.map(jour => (
                    <React.Fragment key={jour}>
                      {salleNames.map((salle, idx) => (
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
                            background: '#f1f5f9',
                            border: '1px solid #000',
                            padding: '9px 12px',
                            textAlign: 'center',
                            fontWeight: 800,
                            fontSize: 14,
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

                            // Label format: "NOM_FORMATEUR - CODE_GROUPE" like the screenshot
                            const label = [
                              prof?.nom_prenom,
                              groupe?.code_groupe
                            ].filter(Boolean).join(' - ')

                            return (
                              <td
                                key={tsIdx}
                                onClick={() => openCell(jour, salle, tsIdx)}
                                title={label || undefined}
                                style={{
                                  border: '1px solid #000',
                                  padding: 0,
                                  minWidth: 150,
                                  height: 38,
                                  cursor: 'pointer',
                                  transition: 'filter 0.15s',
                                  background: color || '#ffffff',
                                  textAlign: 'center',
                                  verticalAlign: 'middle'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.9)' }}
                                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
                              >
                                {label && (
                                  <span style={{
                                    fontSize: 13,
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
                              </td>
                            )
                          })}
                        </tr>
                      ))}
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
                  <button
                    type="button"
                    onClick={() => setModalFormateur('')}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: '1.5px solid #d1d5db',
                      background: modalFormateur === '' ? '#1e293b' : 'white',
                      color: modalFormateur === '' ? 'white' : '#374151',
                      transition: 'all 0.15s'
                    }}
                  >
                    —
                  </button>
                  {filteredFormateurs.map((f) => {
                    const color = PROF_COLORS[formateurs.indexOf(f) % PROF_COLORS.length]
                    const active = modalFormateur === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setModalFormateur(f.id || '')}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: `1.5px solid ${color}`,
                          background: active ? color : `${color}15`,
                          color: active ? 'white' : color,
                          transition: 'all 0.15s'
                        }}
                      >
                        {f.nom_prenom}
                      </button>
                    )
                  })}
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
                  <button
                    type="button"
                    onClick={() => setModalGroupe('')}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: '1.5px solid #d1d5db',
                      background: modalGroupe === '' ? '#1e293b' : 'white',
                      color: modalGroupe === '' ? 'white' : '#374151',
                      transition: 'all 0.15s'
                    }}
                  >
                    —
                  </button>
                  {filteredGroupes.map(g => {
                    const active = modalGroupe === g.id
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setModalGroupe(g.id || '')}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: '1.5px solid #10b981',
                          background: active ? '#10b981' : '#f0fdf4',
                          color: active ? 'white' : '#065f46',
                          transition: 'all 0.15s'
                        }}
                      >
                        {g.code_groupe}
                      </button>
                    )
                  })}
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
    </div>
  )
}
