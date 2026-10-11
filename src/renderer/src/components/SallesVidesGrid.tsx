import React, { useState, useEffect } from 'react'
import {
  Search,
  X,
  CheckCircle2,
  Sparkles,
  ArrowLeft
} from 'lucide-react'
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
  const [searchSalle, setSearchSalle] = useState('')

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Barre de recherche épurée ────────────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '12px 16px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8'
            }}
          />
          <input
            type="text"
            value={searchSalle}
            onChange={e => setSearchSalle(e.target.value)}
            placeholder="Rechercher une salle..."
            style={{
              width: '100%',
              padding: '8px 30px 8px 34px',
              borderRadius: 8,
              border: '1.5px solid #cbd5e1',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              background: '#f8fafc'
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

        {onBackToOccupation && (
          <button
            type="button"
            onClick={onBackToOccupation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: '#f1f5f9',
              border: '1.5px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9' }}
          >
            <ArrowLeft size={15} />
            Retour au Planning
          </button>
        )}
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

      {/* ── Main Table ──────────────────────────────────────────────────────── */}
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
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 210px)', overflowY: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 1050,
                tableLayout: 'fixed'
              }}
            >
              {/* Header row: Timeslots with Yellow background (#ffff00) */}
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
                    {/* Day column: Yellow background (#ffff00) */}
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
                              marginBottom: 8
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
                          ) : (
                            /* Affichage Badges Exclusif */
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
