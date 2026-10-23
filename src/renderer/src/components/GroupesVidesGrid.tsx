import React, { useState, useEffect } from 'react'
import {
  Search,
  X,
  ArrowLeft,
  Trash2,
  Layers,
  FileDown
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { filieresService, groupesService, planningSallesService, formateursService } from '../services/firebaseService'
import type { Filiere, Groupe, Formateur } from '../types'

interface GroupesVidesGridProps {
  filieres?: Filiere[]
  groupes?: Groupe[]
  gridData?: Record<string, { formateurId: string; groupeId: string; module: string; remarque?: string }>
  formateurs?: Formateur[]
  onBackToOccupation?: () => void
}

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

const TIMESLOT_LABELS = [
  '8H30 À 11H00',
  '11H00 À 13H30',
  '13H30 À 16H00',
  '16H00 À 18H30'
]

// Liste officielle des codes de filières (codes uniquement)
const OFFICIAL_FILIERE_CODES = [
  'TEMI100', 'TEMI200', 'ESA100', 'TREM100', 'TREM200', 'TFM100', 'TFM200',
  'TCM100', 'TCM200', 'EEI100', 'EEI200', 'EM100', 'EM200', 'RVA100',
  'RVA200', 'OPCM100', 'OPCM200', 'AEFGT100', 'AEFGT200', 'CPA100', 'CPA200',
  'PC100', 'PC200', 'M100', 'MOAB200', 'MA100', 'EB100', 'TEMI300CDS',
  'ESA200', 'TEMI100CD', 'RVA100CDS'
]

export default function GroupesVidesGrid({
  filieres: initialFilieres,
  groupes: initialGroupes,
  gridData: initialGridData,
  formateurs: initialFormateurs,
  onBackToOccupation
}: GroupesVidesGridProps): React.ReactElement {
  const [filieres, setFilieres] = useState<Filiere[]>(initialFilieres || [])
  const [groupes, setGroupes] = useState<Groupe[]>(initialGroupes || [])
  const [formateurs, setFormateurs] = useState<Formateur[]>(initialFormateurs || [])
  const [gridData, setGridData] = useState<Record<string, { formateurId: string; groupeId: string; module: string; remarque?: string }>>(
    initialGridData || {}
  )
  const [loading, setLoading] = useState<boolean>(!initialFilieres || !initialGroupes)

  // Codes de filières sélectionnés (persistés dans localStorage)
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('groupesVides_selectedCodes')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return ['TEMI100']
  })

  const [tempSelectedCodes, setTempSelectedCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('groupesVides_selectedCodes')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return ['TEMI100']
  })

  const [showFiliereModal, setShowFiliereModal] = useState<boolean>(false)
  const [searchFiliere, setSearchFiliere] = useState<string>('')

  // Filtrage dans la grille
  const [searchGroupe, setSearchGroupe] = useState<string>('')

  // État du tableau: conservé dans localStorage pour que les données restent affichées en revenant
  const [isCleared, setIsCleared] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('groupesVides_isCleared')
      if (saved !== null) return saved === 'true'
    } catch {}
    return false // Par défaut, conserver le tableau affiché
  })

  // Synchronisation automatique dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem('groupesVides_selectedCodes', JSON.stringify(selectedCodes))
    } catch {}
  }, [selectedCodes])

  useEffect(() => {
    try {
      localStorage.setItem('groupesVides_isCleared', String(isCleared))
    } catch {}
  }, [isCleared])

  // Chargement des données si non fournies via props
  useEffect(() => {
    if (initialFilieres && initialGroupes && initialGridData) {
      setFilieres(initialFilieres)
      setGroupes(initialGroupes)
      setGridData(initialGridData)
      if (initialFormateurs) setFormateurs(initialFormateurs)
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        setLoading(true)
        const [fil, grp, savedGrid, profs] = await Promise.all([
          filieresService.getAll(),
          groupesService.getAll(),
          planningSallesService.getAll(),
          formateursService.getAll()
        ])

        setFilieres(fil)
        setGroupes(grp)
        setFormateurs(profs)

        const restored: Record<string, { formateurId: string; groupeId: string; module: string; remarque?: string }> = {}
        Object.values(savedGrid).forEach(cell => {
          restored[cell.key] = {
            formateurId: cell.formateurId,
            groupeId: cell.groupeId,
            module: cell.module,
            remarque: (cell as { remarque?: string }).remarque
          }
        })
        setGridData(restored)
      } catch (err) {
        console.error(err)
        toast.error('Erreur lors du chargement des données')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [initialFilieres, initialGroupes, initialGridData])

  // Rassembler tous les codes de filières disponibles (liste officielle + base de données)
  const allAvailableCodes: string[] = React.useMemo(() => {
    const codeSet = new Set<string>(OFFICIAL_FILIERE_CODES)

    // Formateurs groupes assignés
    formateurs.forEach(f => {
      f.groupes_assignes?.forEach(c => {
        if (c) codeSet.add(c.trim().toUpperCase())
      })
    })

    // Groupes enregistrés
    groupes.forEach(g => {
      const clean = g.code_groupe.trim().replace(/\s+/g, '').toUpperCase()
      const m = clean.match(/^([A-Z]+)(\d)(\d{2})(.*)$/)
      if (m) {
        codeSet.add(m[1] + m[2] + '00' + (m[4] || ''))
      }
    })

    // Filières
    filieres.forEach(f => {
      if (f.code_filiere) codeSet.add(f.code_filiere.trim().toUpperCase())
    })

    return Array.from(codeSet).sort((a, b) => a.localeCompare(b))
  }, [formateurs, groupes, filieres])

  // Filtrer les codes selon le texte de recherche dans le modal
  const displayedFiliereCodes = allAvailableCodes.filter(c =>
    c.toLowerCase().includes(searchFiliere.trim().toLowerCase())
  )

  // Récupérer les groupes appartenant aux codes de filières sélectionnés (AVEC DÉDOUBLONNAGE STRICT)
  const filiereGroupes: Groupe[] = React.useMemo(() => {
    if (selectedCodes.length === 0) return []

    // 1. Filtrer les groupes qui correspondent aux codes de filières
    const matched = groupes.filter(g => {
      const rawGrp = g.code_groupe.trim().toUpperCase()
      const cleanGrp = rawGrp.replace(/\s+/g, '')

      return selectedCodes.some(code => {
        const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '')

        // Égalité directe
        if (cleanGrp === cleanCode || rawGrp === cleanCode) return true

        // Préfixe + Niveau (ex: TEMI100 -> TEMI + niveau 1)
        const codeMatch = cleanCode.match(/^([A-Z]+)(\d)(\d{2})(.*)$/)
        if (codeMatch) {
          const pfx = codeMatch[1]
          const lvl = codeMatch[2]
          const sfx = codeMatch[4]

          const grpMatch = cleanGrp.match(/^([A-Z]+)(\d)(\d{2})(.*)$/)
          if (grpMatch && grpMatch[1] === pfx && grpMatch[2] === lvl) {
            if (sfx) return grpMatch[4].includes(sfx) || cleanGrp.includes(sfx)
            return true
          }

          if (cleanGrp.startsWith(pfx + lvl)) {
            if (sfx) return cleanGrp.includes(sfx)
            return true
          }
        }

        // Correspondance de base par lettres
        const lettersOnly = cleanCode.replace(/\d+.*$/, '')
        if (lettersOnly && cleanGrp.startsWith(lettersOnly)) {
          const digitMatch = cleanCode.match(/\d/)
          if (digitMatch) {
            const digit = digitMatch[0]
            return cleanGrp.includes(lettersOnly + digit) || cleanGrp.includes(lettersOnly + ' ' + digit)
          }
          return true
        }

        return cleanGrp.startsWith(cleanCode)
      })
    })

    // 2. DÉDOUBLONNAGE PAR CODE NORMALISÉ (TEMI 101 ne s'affiche qu'une seule fois !)
    const uniqueGroupes: Groupe[] = []
    const seenCodes = new Set<string>()

    for (const g of matched) {
      const norm = g.code_groupe.trim().replace(/\s+/g, '').toUpperCase()
      if (!seenCodes.has(norm)) {
        seenCodes.add(norm)
        uniqueGroupes.push(g)
      }
    }

    // 3. Tri naturel (TEMI 101, TEMI 102, TEMI 103, TEMI 104, TEMI 105, TEMI 106...)
    return uniqueGroupes.sort((a, b) =>
      a.code_groupe.localeCompare(b.code_groupe, undefined, { numeric: true })
    )
  }, [selectedCodes, groupes])

  // Vérifier si un groupe a cours à ce créneau
  function getGroupStatus(groupe: Groupe, jour: string, tsIdx: number): {
    isOccupied: boolean
    salleName?: string
    formateurName?: string
    moduleName?: string
  } {
    const targetNorm = groupe.code_groupe.trim().replace(/\s+/g, '').toUpperCase()
    // Tous les IDs possibles de ce même groupe dans Firebase
    const allIdsForGroup = new Set(
      groupes
        .filter(g => g.code_groupe.trim().replace(/\s+/g, '').toUpperCase() === targetNorm)
        .map(g => g.id)
        .filter(Boolean)
    )
    if (groupe.id) allIdsForGroup.add(groupe.id)

    for (const [key, cell] of Object.entries(gridData)) {
      const parts = key.split('__')
      if (parts.length >= 3) {
        const [cellJour, cellSalle, cellTsIdx] = parts
        if (cellJour === jour && Number(cellTsIdx) === tsIdx) {
          const cellGrpId = cell.groupeId
          if (cellGrpId) {
            const isMatch =
              allIdsForGroup.has(cellGrpId) ||
              cellGrpId === groupe.code_groupe ||
              cellGrpId.trim().replace(/\s+/g, '').toUpperCase() === targetNorm

            if (isMatch) {
              const formateur = formateurs.find(f => f.id === cell.formateurId)
              return {
                isOccupied: true,
                salleName: cellSalle,
                formateurName: formateur ? formateur.nom_prenom : '—',
                moduleName: cell.module
              }
            }
          }
        }
      }
    }

    return { isOccupied: false }
  }

  function handleOpenModal() {
    setTempSelectedCodes([...selectedCodes])
    setSearchFiliere('')
    setShowFiliereModal(true)
  }

  function toggleCode(code: string) {
    setTempSelectedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  // ── Export Excel (EMPLOI DU TEMPS DE LA SECTION) ───────────────────────────
  function handleExportExcel() {
    if (selectedCodes.length === 0) {
      toast.error('Veuillez sélectionner une filière avant de télécharger.')
      return
    }

    const wb = XLSX.utils.book_new()

    // One sheet per filière code selected
    selectedCodes.forEach(code => {
      const groups = filiereGroupes

      // ── Header rows ──────────────────────────────────────────────────────────
      const headerRows: (string | null)[][] = [
        ['EMPLOI DU TEMPS DE LA SECTION', null, null, null, null, null],
        [`ANNEE DE FORMATION : ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, null, null, null, null, null],
        [],
        ['DRGC'],
        ['Complexe/EFP : CFP IMME / ISTA MY RACHID'],
        [`Filière : ${code}`],
        [],
      ]

      // ── Table header ─────────────────────────────────────────────────────────
      const tableHeader1 = ['HEURE', '8H30 À 11H00', '11H00 À 13H30', '13H30 À 16H00', '16H00 À 18H30']
      const tableHeader2 = ['JOUR / GROUPE', ...Array(4).fill('')]

      const aoa: (string | null)[][] = [
        ...headerRows,
        tableHeader1,
        tableHeader2,
      ]

      // ── Data rows (one row per jour, one sub-row per groupe) ─────────────────
      JOURS.forEach(jour => {
        let firstGroupInJour = true
        if (groups.length === 0) {
          aoa.push([jour, '', '', '', ''])
        } else {
          groups.forEach(grp => {
            const row: (string | null)[] = []
            row.push(firstGroupInJour ? jour : null)
            firstGroupInJour = false

            TIMESLOT_LABELS.forEach((_, tsIdx) => {
              if (isCleared) {
                row.push('')
              } else {
                const status = getGroupStatus(grp, jour, tsIdx)
                if (status.isOccupied) {
                  row.push(`${status.formateurName || ''} AT ${status.salleName || ''}`)
                } else {
                  row.push('')
                }
              }
            })
            aoa.push(row)
          })
          // separator row between days
          aoa.push(['', '', '', '', ''])
        }
      })

      const ws = XLSX.utils.aoa_to_sheet(aoa)

      // Column widths
      ws['!cols'] = [
        { wch: 18 },
        { wch: 30 },
        { wch: 30 },
        { wch: 30 },
        { wch: 30 },
      ]

      // Merge title cells
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // EMPLOI DU TEMPS...
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, // ANNEE DE FORMATION
      ]

      const sheetName = code.replace(/[^a-zA-Z0-9]/g, '').slice(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Section')
    })

    const fileName = `EmploiTempsSection_${selectedCodes.join('_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`Fichier Excel téléchargé : ${fileName}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '12px 18px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        {/* Left Side: Select Filière & Search Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleOpenModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 8,
              border: '2px solid #2563eb',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#2563eb' }}
          >
            <Layers size={16} />
            {selectedCodes.length > 0 ? `Filière: ${selectedCodes.join(', ')}` : 'Sélectionner Filière'}
          </button>

          {/* Search Group input */}
          <div style={{ position: 'relative', width: 220 }}>
            <Search
              size={15}
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
              placeholder="Rechercher un groupe..."
              value={searchGroupe}
              onChange={e => setSearchGroupe(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                fontSize: 13,
                fontWeight: 600,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchGroupe && (
              <button
                type="button"
                onClick={() => setSearchGroupe('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Vide & Retour */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Button Vide / Afficher */}
          <button
            type="button"
            onClick={() => {
              const nextState = !isCleared
              setIsCleared(nextState)
              try {
                localStorage.setItem('groupesVides_isCleared', String(nextState))
              } catch {}
              if (nextState) {
                toast.success('Tableau vidé.')
              } else {
                toast.success('Tableau affiché.')
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: isCleared ? '1.5px solid #16a34a' : '1.5px solid #fca5a5',
              background: isCleared ? '#f0fdf4' : '#ffffff',
              color: isCleared ? '#15803d' : '#dc2626',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.18s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = isCleared ? '#dcfce7' : '#fee2e2'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isCleared ? '#f0fdf4' : '#ffffff'
            }}
          >
            <Trash2 size={15} />
            {isCleared ? 'Afficher' : 'Vide'}
          </button>

          {/* Button Télécharger Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1.5px solid #16a34a',
              background: '#16a34a',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(22,163,74,0.25)',
              transition: 'all 0.18s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#15803d' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#16a34a' }}
            title="Télécharger l'emploi du temps en Excel"
          >
            <FileDown size={15} />
            Télécharger Excel
          </button>

          {/* Button Retour */}
          {onBackToOccupation && (
            <button
              type="button"
              onClick={onBackToOccupation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={15} />
              Retour
            </button>
          )}
        </div>
      </div>

      {/* ── Table Container (Classic Yellow Excel Style) ───────────────────────── */}
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
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
            Chargement des données...
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
                      padding: '12px 10px',
                      width: 140,
                      textAlign: 'center',
                      fontWeight: 900,
                      fontSize: 14,
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

                    {/* 4 Timeslot Columns */}
                    {TIMESLOT_LABELS.map((_, tsIdx) => {
                      if (isCleared || selectedCodes.length === 0) {
                        return (
                          <td
                            key={tsIdx}
                            style={{
                              border: '1.5px solid #000000',
                              padding: '12px 14px',
                              background: '#ffffff',
                              verticalAlign: 'middle',
                              minHeight: 80
                            }}
                          >
                            <div style={{ height: 40 }} />
                          </td>
                        )
                      }

                      // Évaluer les groupes uniques pour ce créneau
                      const groupStatuses = filiereGroupes.map(grp => {
                        const status = getGroupStatus(grp, jour, tsIdx)
                        return {
                          groupe: grp,
                          ...status
                        }
                      })

                      return (
                        <td
                          key={tsIdx}
                          style={{
                            border: '1.5px solid #000000',
                            padding: '12px 14px',
                            verticalAlign: 'top',
                            background: '#ffffff',
                            minHeight: 80
                          }}
                        >
                          {filiereGroupes.length === 0 ? (
                            <div style={{ height: 40 }} />
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {groupStatuses.map(({ groupe, isOccupied, salleName, formateurName }) => {
                                const isSearched = searchGroupe.trim() &&
                                  groupe.code_groupe.toLowerCase().includes(searchGroupe.trim().toLowerCase())

                                return (
                                  <span
                                    key={groupe.code_groupe}
                                    title={
                                      isOccupied
                                        ? `${groupe.code_groupe} : En cours (${salleName || 'Salle'} - ${formateurName || 'Prof'})`
                                        : `${groupe.code_groupe} : Libre (Pas de cours)`
                                    }
                                    style={{
                                      fontSize: 12.5,
                                      fontWeight: 900,
                                      padding: '3px 7px',
                                      borderRadius: 4,
                                      background: isOccupied ? '#fee2e2' : isSearched ? '#fef08a' : '#f8fafc',
                                      border: isOccupied ? '1.5px solid #ef4444' : isSearched ? '1.5px solid #eab308' : '1px solid #cbd5e1',
                                      color: isOccupied ? '#dc2626' : '#000000',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      whiteSpace: 'nowrap',
                                      cursor: 'default'
                                    }}
                                  >
                                    {groupe.code_groupe}
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

      {/* ── Modal Sélection Filière (Codes uniquement) ───────────────────────── */}
      {showFiliereModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowFiliereModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            className="modal-card"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#f1f5f9',
              borderRadius: 12,
              width: '100%',
              maxWidth: 780,
              border: '2px solid #94a3b8',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div
              style={{
                background: '#ffffff',
                borderBottom: '1.5px solid #cbd5e1',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                  Sélectionner les Filières (Codes)
                </span>
                {tempSelectedCodes.length > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '2px 8px',
                      borderRadius: 12
                    }}
                  >
                    {tempSelectedCodes.length} sélectionnée{tempSelectedCodes.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFiliereModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Barre de recherche rapide de code */}
            <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ position: 'relative', width: 260 }}>
                <Search
                  size={14}
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
                  placeholder="Filtrer le code..."
                  value={searchFiliere}
                  onChange={e => setSearchFiliere(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: 6,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Boutons rapides */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setTempSelectedCodes([...allAvailableCodes])}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#334155'
                  }}
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={() => setTempSelectedCodes([])}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#64748b'
                  }}
                >
                  Tout décocher
                </button>
              </div>
            </div>

            {/* Grille multi-colonnes de cases à cocher (style exact Image 1) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '10px 14px',
                padding: '16px 20px',
                maxHeight: '52vh',
                overflowY: 'auto'
              }}
            >
              {displayedFiliereCodes.map(code => {
                const isChecked = tempSelectedCodes.includes(code)
                return (
                  <label
                    key={code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#000000',
                      cursor: 'pointer',
                      userSelect: 'none',
                      padding: '4px 6px',
                      borderRadius: 4,
                      background: isChecked ? '#e0e7ff' : 'transparent',
                      transition: 'background 0.12s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCode(code)}
                      style={{
                        width: 15,
                        height: 15,
                        cursor: 'pointer',
                        accentColor: '#2563eb'
                      }}
                    />
                    <span>{code}</span>
                  </label>
                )
              })}
            </div>

            {/* Footer avec bouton OK en bas à droite */}
            <div
              style={{
                background: '#e2e8f0',
                borderTop: '1.5px solid #cbd5e1',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 12
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedCodes([...tempSelectedCodes])
                  setIsCleared(false)
                  try {
                    localStorage.setItem('groupesVides_selectedCodes', JSON.stringify(tempSelectedCodes))
                    localStorage.setItem('groupesVides_isCleared', 'false')
                  } catch {}
                  setShowFiliereModal(false)
                  if (tempSelectedCodes.length > 0) {
                    toast.success(`Filière: ${tempSelectedCodes.join(', ')}`)
                  }
                }}
                style={{
                  padding: '7px 32px',
                  background: '#ffffff',
                  color: '#000000',
                  border: '1.5px solid #000000',
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 900,
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                  boxShadow: '1px 1px 0px #000000',
                  transition: 'transform 0.1s'
                }}
                onMouseDown={e => { e.currentTarget.style.transform = 'translate(1px, 1px)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'none' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
