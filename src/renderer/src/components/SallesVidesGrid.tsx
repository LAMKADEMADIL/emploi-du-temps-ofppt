import React, { useState, useEffect } from 'react'
import {
  Search,
  FileSpreadsheet,
  Printer,
  X,
  CheckCircle2,
  Sparkles,
  LayoutGrid,
  AlignLeft,
  ArrowLeft
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'react-hot-toast'
import { sallesService, planningSallesService } from '../services/firebaseService'

interface SallesVidesGridProps {
  salleNames?: string[]
  gridData?: Record<string, { formateurId: string; groupeId: string; module: string }>
  onBackToOccupation?: () => void
}

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

const TIMESLOT_LABELS = [
  '8H30 à 11H00',
  '11H00 à 13H30',
  '13H30 à 16H00',
  '16H00 à 18H30'
]

export default function SallesVidesGrid({
  salleNames: initialSalleNames,
  gridData: initialGridData,
  onBackToOccupation
}: SallesVidesGridProps): React.ReactElement {
  const [salleNames, setSalleNames] = useState<string[]>(initialSalleNames || [])
  const [gridData, setGridData] = useState<Record<string, { formateurId: string; groupeId: string; module: string }>>(
    initialGridData || {}
  )
  const [loading, setLoading] = useState<boolean>(!initialSalleNames || !initialGridData)

  // Filters & display modes
  const [searchSalle, setSearchSalle] = useState('')
  const [displayMode, setDisplayMode] = useState<'text' | 'badges'>('text')

  // Load data if not provided as props
  useEffect(() => {
    if (initialSalleNames && initialGridData) {
      setSalleNames(initialSalleNames)
      setGridData(initialGridData)
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        setLoading(true)
        const [salles, savedGrid] = await Promise.all([
          sallesService.getAll(),
          planningSallesService.getAll()
        ])

        const uniqueNames = Array.from(new Set(salles.map(s => s.nom_salle)))
        setSalleNames(uniqueNames.length > 0 ? uniqueNames : [
          'SALLE 01', 'SALLE 02', 'SALLE 03', 'SALLE 05', 'SALLE 06',
          'SALLE 08', 'SALLE 09', 'SALLE 10', 'SALLE 11', 'SALLE INFO',
          'AT EB', 'AT TFM', 'AT EEI', 'AT PC', 'AT AEFGT',
          'AT RVA1', 'AT RVA2', 'AT RVA3', 'AT CPA',
          'AT OPCM1', 'AT OPCM2', 'AT MA', 'AT MOAB',
          'AT TREM', 'AT TEMI1', 'AT ESA', 'AT TEMI2'
        ])

        const restored: Record<string, { formateurId: string; groupeId: string; module: string }> = {}
        Object.values(savedGrid).forEach(cell => {
          restored[cell.key] = {
            formateurId: cell.formateurId,
            groupeId: cell.groupeId,
            module: cell.module
          }
        })
        setGridData(restored)
      } catch (err) {
        console.error(err)
        toast.error('Erreur lors du chargement des salles libres')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [initialSalleNames, initialGridData])

  function getFreeSalles(jour: string, tsIdx: number): string[] {
    return salleNames.filter(s => {
      const key = `${jour}__${s}__${tsIdx}`
      const cell = gridData[key]
      return !cell || (!cell.formateurId && !cell.groupeId && !cell.module)
    })
  }

  // Export to Excel (.xlsx) exactly matching Image 1
  function handleExportExcel() {
    try {
      const rows = JOURS.map(jour => {
        const row: Record<string, string> = { 'JOUR': jour }
        TIMESLOT_LABELS.forEach((slot, tsIdx) => {
          const free = getFreeSalles(jour, tsIdx)
          row[slot] = free.join(' - ')
        })
        return row
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      // Set column widths
      ws['!cols'] = [
        { wch: 15 },
        { wch: 45 },
        { wch: 45 },
        { wch: 45 },
        { wch: 45 }
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Trouver Salle Vide')
      XLSX.writeFile(wb, 'Planning_Trouver_Salle_Vide.xlsx')
      toast.success('Tableau des salles vides exporté en Excel (.xlsx)')
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de l'exportation Excel")
    }
  }

  function handlePrint() {
    window.print()
  }

  // Calculate matching stats
  const totalFreeSlots = JOURS.reduce((acc, jour) => {
    return acc + TIMESLOT_LABELS.reduce((sum, _, tsIdx) => sum + getFreeSalles(jour, tsIdx).length, 0)
  }, 0)

  const searchedMatchesCount = searchSalle.trim()
    ? JOURS.reduce((acc, jour) => {
        return (
          acc +
          TIMESLOT_LABELS.reduce((sum, _, tsIdx) => {
            const hasMatch = getFreeSalles(jour, tsIdx).some(s =>
              s.toLowerCase().includes(searchSalle.trim().toLowerCase())
            )
            return sum + (hasMatch ? 1 : 0)
          }, 0)
        )
      }, 0)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          padding: '16px 20px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBackToOccupation && (
            <button
              type="button"
              onClick={onBackToOccupation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                background: '#f1f5f9',
                border: '1.5px solid #cbd5e1',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9' }}
            >
              <ArrowLeft size={16} />
              Retour au Planning
            </button>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: '#fef08a',
                  border: '1.5px solid #ca8a04',
                  color: '#854d0e',
                  fontSize: 12,
                  fontWeight: 900,
                  padding: '3px 8px',
                  borderRadius: 6,
                  letterSpacing: 0.5
                }}
              >
                {totalFreeSlots} DISPONIBILITÉS CETTE SEMAINE
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>
                Trouver Salle Vide
              </h2>
            </div>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0 0' }}>
              Grille hebdomadaire récapitulative des salles et ateliers non occupés
            </p>
          </div>
        </div>

        {/* Right side actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Quick Search Salle */}
          <div style={{ position: 'relative', width: 240 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8'
              }}
            />
            <input
              type="text"
              value={searchSalle}
              onChange={e => setSearchSalle(e.target.value)}
              placeholder="Chercher une salle..."
              style={{
                width: '100%',
                padding: '8px 30px 8px 32px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                fontSize: 13,
                fontWeight: 600,
                outline: 'none'
              }}
            />
            {searchSalle && (
              <button
                type="button"
                onClick={() => setSearchSalle('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 2
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Display Mode Toggle */}
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              borderRadius: 8,
              padding: 3,
              border: '1px solid #cbd5e1'
            }}
          >
            <button
              type="button"
              onClick={() => setDisplayMode('text')}
              title="Affichage texte avec tirets (Format Excel)"
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: displayMode === 'text' ? '#2563eb' : 'transparent',
                color: displayMode === 'text' ? '#ffffff' : '#475569',
                transition: 'all 0.15s'
              }}
            >
              <AlignLeft size={14} />
              Texte Excel
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('badges')}
              title="Affichage sous forme de badges distincts"
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: displayMode === 'badges' ? '#2563eb' : 'transparent',
                color: displayMode === 'badges' ? '#ffffff' : '#475569',
                transition: 'all 0.15s'
              }}
            >
              <LayoutGrid size={14} />
              Badges
            </button>
          </div>

          {/* Export Excel Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 15px',
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#15803d' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#16a34a' }}
          >
            <FileSpreadsheet size={16} />
            Exporter Excel
          </button>

          {/* Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              background: '#f8fafc',
              color: '#1e293b',
              border: '1.5px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
          >
            <Printer size={16} />
            Imprimer
          </button>
        </div>
      </div>

      {/* Info indicator if searching */}
      {searchSalle.trim() && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            color: '#065f46',
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color="#059669" />
            <span>
              Recherche pour « {searchSalle} » : <strong>{searchedMatchesCount}</strong> créneaux disponibles trouvés cette semaine (mis en surbrillance verte).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSearchSalle('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#059669',
              fontWeight: 800,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Réinitialiser
          </button>
        </div>
      )}

      {/* ── Main Table (Identical to Image 1) ─────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          border: '2px solid #000000',
          borderRadius: 8,
          background: '#ffffff'
        }}
      >
        {loading ? (
          <div className="loading-spinner" style={{ padding: 60 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 1050,
                tableLayout: 'fixed'
              }}
            >
              {/* Header row: Timeslots with Yellow background (#ffff00 / #fde047) */}
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th
                    style={{
                      background: '#ffff00',
                      color: '#000000',
                      border: '2px solid #000000',
                      padding: '14px 10px',
                      width: 140,
                      textAlign: 'center',
                      fontWeight: 900,
                      fontSize: 15,
                      letterSpacing: 0.5
                    }}
                  >
                    JOUR / HEURE
                  </th>
                  {TIMESLOT_LABELS.map((slot, i) => (
                    <th
                      key={i}
                      style={{
                        background: '#ffff00',
                        color: '#000000',
                        border: '2px solid #000000',
                        padding: '14px 10px',
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: 15,
                        letterSpacing: 0.5
                      }}
                    >
                      {slot}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {JOURS.map(jour => (
                  <tr key={jour}>
                    {/* Day column: Yellow background (#ffff00 / #fde047) */}
                    <td
                      style={{
                        background: '#ffff00',
                        color: '#000000',
                        border: '2px solid #000000',
                        padding: '16px 10px',
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: 14.5,
                        letterSpacing: 1,
                        verticalAlign: 'middle'
                      }}
                    >
                      {jour}
                    </td>

                    {/* Créneaux for each day */}
                    {TIMESLOT_LABELS.map((_, tsIdx) => {
                      const freeSalles = getFreeSalles(jour, tsIdx)
                      const isSearchedMatch =
                        searchSalle.trim() &&
                        freeSalles.some(s =>
                          s.toLowerCase().includes(searchSalle.trim().toLowerCase())
                        )

                      return (
                        <td
                          key={tsIdx}
                          style={{
                            border: '1.5px solid #000000',
                            padding: '12px 14px',
                            verticalAlign: 'top',
                            background: isSearchedMatch ? '#f0fdf4' : '#ffffff',
                            transition: 'background 0.2s',
                            boxShadow: isSearchedMatch ? 'inset 0 0 0 2px #22c55e' : 'none'
                          }}
                        >
                          {/* Mini header badge for count */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 6
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 800,
                                color: freeSalles.length > 0 ? '#1e40af' : '#991b1b',
                                background: freeSalles.length > 0 ? '#dbeafe' : '#fee2e2',
                                padding: '2px 7px',
                                borderRadius: 4,
                                textTransform: 'uppercase'
                              }}
                            >
                              {freeSalles.length} {freeSalles.length > 1 ? 'libres' : 'libre'}
                            </span>

                            {isSearchedMatch && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  color: '#15803d',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3
                                }}
                              >
                                <CheckCircle2 size={12} />
                                Correspondance
                              </span>
                            )}
                          </div>

                          {freeSalles.length === 0 ? (
                            <div
                              style={{
                                color: '#dc2626',
                                fontStyle: 'italic',
                                fontSize: 12,
                                fontWeight: 700,
                                padding: '8px 0'
                              }}
                            >
                              Toutes occupées (0)
                            </div>
                          ) : displayMode === 'text' ? (
                            /* Format exact de l'image 1: SALLE 02-AT CPA */
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: '#0f172a',
                                lineHeight: 1.65,
                                wordBreak: 'break-word',
                                whiteSpace: 'normal'
                              }}
                            >
                              {freeSalles.map((salle, sIdx) => {
                                const isHighlighted =
                                  searchSalle.trim() &&
                                  salle.toLowerCase().includes(searchSalle.trim().toLowerCase())

                                return (
                                  <React.Fragment key={salle}>
                                    <span
                                      style={{
                                        color: isHighlighted ? '#15803d' : '#0f172a',
                                        background: isHighlighted ? '#bbf7d0' : 'transparent',
                                        padding: isHighlighted ? '1px 4px' : '0',
                                        borderRadius: 3,
                                        fontWeight: isHighlighted ? 900 : 700
                                      }}
                                    >
                                      {salle}
                                    </span>
                                    {sIdx < freeSalles.length - 1 && (
                                      <span style={{ color: '#64748b', fontWeight: 600 }}> - </span>
                                    )}
                                  </React.Fragment>
                                )
                              })}
                            </div>
                          ) : (
                            /* Format Badges distincts */
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 5
                              }}
                            >
                              {freeSalles.map(salle => {
                                const isHighlighted =
                                  searchSalle.trim() &&
                                  salle.toLowerCase().includes(searchSalle.trim().toLowerCase())

                                return (
                                  <span
                                    key={salle}
                                    style={{
                                      fontSize: 11.5,
                                      fontWeight: 800,
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      background: isHighlighted ? '#dcfce7' : '#f8fafc',
                                      border: isHighlighted
                                        ? '1.5px solid #22c55e'
                                        : '1px solid #cbd5e1',
                                      color: isHighlighted ? '#15803d' : '#1e293b',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {salle}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
