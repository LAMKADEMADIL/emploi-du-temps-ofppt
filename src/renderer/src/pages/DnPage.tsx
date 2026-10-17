import React, { useState, useEffect, useRef } from 'react'
import {
  Database,
  FileSpreadsheet,
  Search,
  Building2,
  Layers,
  Moon
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { groupesService, filieresService } from '../services/firebaseService'
import type { Groupe, Filiere } from '../types'
import { useTranslation } from '../lib/i18n'

interface DnRowData {
  rowKey: string
  filiereId: string
  defaultCode: string
  defaultName: string
  defaultNbr: number
  defaultPrint: string
  isCds: boolean
  groupCount: number
}

export default function DnPage(): React.ReactElement {
  const { lang } = useTranslation()
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Editable cell values per row key persisted in localStorage
  const [synValues, setSynValues] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dn_synValues') || '{}')
    } catch {
      return {}
    }
  })
  const [nbrValues, setNbrValues] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dn_nbrValues') || '{}')
    } catch {
      return {}
    }
  })
  const [codeValues, setCodeValues] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dn_codeValues') || '{}')
    } catch {
      return {}
    }
  })
  const [printValues, setPrintValues] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dn_printValues') || '{}')
    } catch {
      return {}
    }
  })

  // Dynamic extra columns
  const [extraCols, setExtraCols] = useState<{ id: string; header: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dn_extraCols') || '[]')
    } catch {
      return []
    }
  })
  const [extraColValues, setExtraColValues] = useState<Record<string, Record<string, string>>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dn_extraColValues') || '{}')
    } catch {
      return {}
    }
  })

  // Persist edits to localStorage
  useEffect(() => {
    localStorage.setItem('dn_synValues', JSON.stringify(synValues))
  }, [synValues])
  useEffect(() => {
    localStorage.setItem('dn_nbrValues', JSON.stringify(nbrValues))
  }, [nbrValues])
  useEffect(() => {
    localStorage.setItem('dn_codeValues', JSON.stringify(codeValues))
  }, [codeValues])
  useEffect(() => {
    localStorage.setItem('dn_printValues', JSON.stringify(printValues))
  }, [printValues])
  useEffect(() => {
    localStorage.setItem('dn_extraCols', JSON.stringify(extraCols))
  }, [extraCols])
  useEffect(() => {
    localStorage.setItem('dn_extraColValues', JSON.stringify(extraColValues))
  }, [extraColValues])

  function removeExtraCol(colId: string) {
    setExtraCols(prev => prev.filter(c => c.id !== colId))
    setExtraColValues(prev => {
      const next = { ...prev }
      delete next[colId]
      return next
    })
  }

  function setExtraColHeader(colId: string, value: string) {
    setExtraCols(prev => prev.map(c => c.id === colId ? { ...c, header: value } : c))
  }

  function setExtraColCell(colId: string, rowKey: string, value: string) {
    setExtraColValues(prev => ({
      ...prev,
      [colId]: { ...(prev[colId] ?? {}), [rowKey]: value }
    }))
  }

  useEffect(() => {
    loadData()
  }, [])

  async function loadData(): Promise<void> {
    try {
      setLoading(true)
      const [groupesData, filieresData] = await Promise.all([
        groupesService.getAll(),
        filieresService.getAll()
      ])

      const mapped = groupesData.map((g) => {
        const filiere = filieresData.find((f) => f.id === g.id_filiere)
        return { ...g, nom_filiere: filiere ? filiere.code_filiere : '' }
      })

      setGroupes(mapped)
      setFilieres(filieresData)
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // Handle Excel File Upload for DN sheet with CDS support
  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        setIsImporting(true)
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        const dnSheetName =
          workbook.SheetNames.find((s) => s.trim().toUpperCase() === 'DN') ||
          workbook.SheetNames[0]

        if (!dnSheetName) {
          toast.error(lang === 'ar' ? 'الملف فارغ' : 'Fichier vide')
          return
        }

        const ws = workbook.Sheets[dnSheetName]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (!rows || rows.length < 2) {
          toast.error(lang === 'ar' ? 'لا توجد بيانات كافية في ورقة DN' : 'Données insuffisantes dans la feuille DN')
          return
        }

        let createdFilieres = 0
        let createdGroupes = 0
        let updatedGroupes = 0

        // Support standard groups as well as CDS groups (e.g. TEMI101, TEMI101 CDS, RVA101 CDS)
        const groupPattern = /^[A-Z]{1,8}\s*\d{3}(?:\s*CDS)?$/i
        const foundGroups = new Set<string>()

        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            const raw = String(rows[r][c] || '').trim().toUpperCase()
            if (groupPattern.test(raw)) {
              foundGroups.add(raw)
            }
          }
        }

        if (foundGroups.size === 0) {
          toast.error(lang === 'ar' ? 'لم يتم العثور على أفواج صحيحة في ورقة DN' : 'Aucun groupe valide trouvé dans la feuille DN')
          return
        }

        for (const gCode of Array.from(foundGroups)) {
          const cleanCode = gCode.replace(/\s*CDS$/i, '')
          const filiereCode = cleanCode.replace(/\d+$/, '').trim()

          // Skip headers like TEMI100 or TEMI100CDS
          if (/\d00$/.test(cleanCode)) continue

          let filiere = filieres.find((f) => f.code_filiere.toUpperCase() === filiereCode)
          let filiereId = filiere?.id

          if (!filiereId) {
            filiereId = await filieresService.add({
              code_filiere: filiereCode,
              nom_filiere: filiereCode
            })
            const newFiliere = { id: filiereId, code_filiere: filiereCode, nom_filiere: filiereCode }
            filieres.push(newFiliere)
            filiere = newFiliere
            createdFilieres++
          }

          const existing = groupes.find((g) => g.code_groupe.toUpperCase() === gCode)
          if (existing && existing.id) {
            if (existing.id_filiere !== filiereId) {
              await groupesService.update(existing.id, { id_filiere: filiereId })
              updatedGroupes++
            }
          } else {
            await groupesService.add({
              code_groupe: gCode,
              id_filiere: filiereId,
              en_stage: false
            })
            createdGroupes++
          }
        }

        toast.success(
          lang === 'ar'
            ? `تمت مزامنة قاعدة البيانات! إضافة ${createdFilieres} شعبة، و ${createdGroupes} فوج جديد.`
            : `Base synchronisée! ${createdFilieres} filières et ${createdGroupes} groupes ajoutés.`
        )
        loadData()
      } catch (err) {
        console.error(err)
        toast.error(lang === 'ar' ? 'فشل قراءة ورقة DN' : 'Erreur lors de la lecture de la feuille DN')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
        setIsImporting(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Helper functions for CDS detection and year extraction
  const isCds = (code: string) => /CDS/i.test(code)

  const getYear = (code: string): number => {
    const m = code.match(/\d+/)
    if (!m) return 1
    const firstDigit = parseInt(m[0][0], 10)
    return isNaN(firstDigit) ? 1 : firstDigit
  }

  // Filter filieres by search term
  const filteredFilieres = filieres.filter(f =>
    searchTerm === '' ||
    f.code_filiere.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.nom_filiere.toLowerCase().includes(searchTerm.toLowerCase()) ||
    searchTerm.toLowerCase().includes('cds')
  )

  // 1. Build Day Rows (excluding CDS groups so TEMI100 has 6 and RVA100 has 8)
  const dayRows: DnRowData[] = []
  filteredFilieres.forEach((filiere) => {
    const filiereGroupes = groupes.filter(
      (g) => g.id_filiere === filiere.id && !isCds(g.code_groupe)
    )

    const yearsPresent = Array.from(new Set(filiereGroupes.map(g => getYear(g.code_groupe)))).sort()
    const yearsToRender = yearsPresent.length > 0 ? yearsPresent : [1, 2]

    for (const y of yearsToRender) {
      const matching = filiereGroupes.filter(g => getYear(g.code_groupe) === y)
      if (filiereGroupes.length === 0 && y > (filiere.nombre_annees || 2)) continue
      if (filiereGroupes.length > 0 && matching.length === 0) continue

      const key = `${filiere.id}-${y}`
      dayRows.push({
        rowKey: key,
        filiereId: filiere.id || '',
        defaultCode: `${filiere.code_filiere}${y}00`,
        defaultName: filiere.code_filiere,
        defaultNbr: matching.length,
        defaultPrint: 'P',
        isCds: false,
        groupCount: matching.length
      })
    }
  })

  // 2. Build CDS Rows (Cours du Soir) to display at the bottom of the table
  const allCdsGroupes = groupes.filter((g) => isCds(g.code_groupe))
  const cdsByFiliereAndYear = new Map<string, Map<number, Groupe[]>>()

  allCdsGroupes.forEach((g) => {
    let fId = g.id_filiere
    if (!fId) {
      const matchedF = filieres.find(f => g.code_groupe.toUpperCase().startsWith(f.code_filiere.toUpperCase()))
      if (matchedF?.id) fId = matchedF.id
    }
    if (!fId) fId = 'unknown'

    const y = getYear(g.code_groupe)
    if (!cdsByFiliereAndYear.has(fId)) {
      cdsByFiliereAndYear.set(fId, new Map())
    }
    const yearMap = cdsByFiliereAndYear.get(fId)!
    if (!yearMap.has(y)) {
      yearMap.set(y, [])
    }
    yearMap.get(y)!.push(g)
  })

  const cdsRows: DnRowData[] = []
  cdsByFiliereAndYear.forEach((yearMap, fId) => {
    const filiere = filieres.find((f) => f.id === fId)
    const filiereCode = filiere?.code_filiere || 'CDS'

    if (
      searchTerm &&
      !filiereCode.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !searchTerm.toLowerCase().includes('cds')
    ) {
      return
    }

    yearMap.forEach((grpList, y) => {
      const key = `${fId}-cds-${y}`
      cdsRows.push({
        rowKey: key,
        filiereId: fId,
        defaultCode: `${filiereCode}${y}00CDS`,
        defaultName: filiereCode,
        defaultNbr: grpList.length,
        defaultPrint: 'L',
        isCds: true,
        groupCount: grpList.length
      })
    })
  })

  // Sort CDS rows matching Excel style (e.g., TEMI300CDS, TEMI100CDS, RVA100CDS)
  cdsRows.sort((a, b) => {
    if (a.defaultName === b.defaultName) {
      return b.defaultCode.localeCompare(a.defaultCode)
    }
    return a.defaultName.localeCompare(b.defaultName)
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    textAlign: 'center',
    fontSize: '14.5px',
    fontWeight: 700,
    color: '#000',
    cursor: 'text'
  }

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
        onChange={handleExcelUpload}
      />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #2563eb', color: 'white'
            }}>
              <Database size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                {lang === 'ar' ? 'بنية الشعب (DN)' : 'Structure des Filières (DN)'}
              </h1>
              <p style={{ fontSize: 13.5, color: '#4b5563', margin: '3px 0 0 0' }}>
                {lang === 'ar'
                  ? 'إدارة قاعدة بيانات الشعب والأفواج وتصنيف الأفواج النهارية والمسائية (CDS)'
                  : 'Gestion de la base des filières et groupes (Jour et Cours du Soir CDS)'}
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* Page Body */}
      <div className="page-body">
        {/* Statistics Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 20
        }}>
          <div style={{
            background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14,
            padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontWeight: 600 }}>
                {lang === 'ar' ? 'إجمالي الشعب' : 'Total Filières'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', margin: '4px 0 0 0' }}>
                {filieres.length}
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: '#eff6ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6'
            }}>
              <Building2 size={22} />
            </div>
          </div>

          <div style={{
            background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14,
            padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontWeight: 600 }}>
                {lang === 'ar' ? 'إجمالي الأفواج' : 'Total Groupes'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', margin: '4px 0 0 0' }}>
                {groupes.length}
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: '#f5f3ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6'
            }}>
              <Layers size={22} />
            </div>
          </div>

          <div style={{
            background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14,
            padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontWeight: 600 }}>
                {lang === 'ar' ? 'أفواج الدروس المسائية (CDS)' : 'Groupes Cours du Soir (CDS)'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', margin: '4px 0 0 0' }}>
                {allCdsGroupes.length}
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b'
            }}>
              <Moon size={22} />
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{
          background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14,
          padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb',
            border: '1.5px solid #d1d5db', borderRadius: 8, padding: '7px 12px', width: '100%', maxWidth: 360
          }}>
            <Search size={16} color="#6b7280" />
            <input
              type="text"
              placeholder={lang === 'ar' ? 'ابحث عن شعبة أو CDS...' : 'Rechercher une filière ou CDS...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                border: 'none', background: 'transparent', outline: 'none',
                fontSize: 14, color: '#0a0a0a', fontWeight: 600, width: '100%'
              }}
            />
          </div>

          <div style={{ fontSize: 13.5, color: '#64748b', fontWeight: 600 }}>
            {lang === 'ar'
              ? `${dayRows.length} شعبة نهارية + ${cdsRows.length} شعبة مسائية (CDS)`
              : `${dayRows.length} filières jour + ${cdsRows.length} filières cours du soir (CDS)`}
          </div>
        </div>

        {/* Data List Table matching Excel structure */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : dayRows.length === 0 && cdsRows.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Database size={48} color="#9ca3af" /></div>
              <h3>{lang === 'ar' ? 'لا توجد بيانات' : 'Aucune donnée'}</h3>
              <p>{lang === 'ar' ? 'قم باستيراد ورقة DN لبناء قاعدة البيانات' : 'Importez la feuille DN pour construire la base'}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
              <table className="data-table" style={{ borderCollapse: 'collapse', border: '1.5px solid #000', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f5dadf', borderBottom: '1.5px solid #000' }}>
                  <tr>
                    <th colSpan={2} style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', color: '#000', fontWeight: 'bold', fontSize: '15px', padding: '8px' }}>
                      fillier
                    </th>
                    <th style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', color: '#000', fontWeight: 'bold', fontSize: '15px', padding: '8px' }}>
                      Nbr de groupe
                    </th>
                    <th style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', color: '#000', fontWeight: 'bold', fontSize: '15px', padding: '8px' }}>
                      Syn
                    </th>
                    <th style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', color: '#c026d3', fontWeight: 'bold', fontSize: '15px', padding: '8px' }}>
                      Print
                    </th>
                    {extraCols.map((col) => (
                      <th key={col.id} style={{ textAlign: 'center', borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000', color: '#000', fontWeight: 'bold', fontSize: '15px', padding: '4px', minWidth: 110 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          <input
                            type="text"
                            value={col.header}
                            onChange={(e) => setExtraColHeader(col.id, e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', color: '#000', width: 75 }}
                          />
                          <button
                            onClick={() => removeExtraCol(col.id)}
                            title="Supprimer"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                          >✕</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* 1. Day Filières (Regular Classes) */}
                  {dayRows.map((row) => (
                    <tr key={row.rowKey}>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={codeValues[row.rowKey] ?? row.defaultCode}
                          onChange={(e) => setCodeValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={codeValues[`${row.rowKey}-name`] ?? row.defaultName}
                          onChange={(e) => setCodeValues(prev => ({ ...prev, [`${row.rowKey}-name`]: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={nbrValues[row.rowKey] ?? String(row.defaultNbr)}
                          onChange={(e) => setNbrValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#1d4ed8', fontSize: '15px' }}>
                        <input
                          type="text"
                          value={synValues[row.rowKey] ?? ''}
                          onChange={(e) => setSynValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          placeholder="..."
                          style={{ ...inputStyle, color: '#1d4ed8' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={printValues[row.rowKey] ?? row.defaultPrint}
                          onChange={(e) => setPrintValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          style={{ ...inputStyle, color: '#7c3aed', fontWeight: 800 }}
                        />
                      </td>
                      {extraCols.map(col => (
                        <td key={col.id} style={{ textAlign: 'center', borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px' }}>
                          <input
                            type="text"
                            value={extraColValues[col.id]?.[row.rowKey] ?? ''}
                            onChange={(e) => setExtraColCell(col.id, row.rowKey, e.target.value)}
                            placeholder="..."
                            style={{ ...inputStyle, color: '#059669' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* 2. Cours du Soir (CDS) Rows at Bottom (TEMI300CDS, TEMI100CDS, RVA100CDS...) with identical normal style */}
                  {cdsRows.map((row) => (
                    <tr key={row.rowKey}>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={codeValues[row.rowKey] ?? row.defaultCode}
                          onChange={(e) => setCodeValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={codeValues[`${row.rowKey}-name`] ?? row.defaultName}
                          onChange={(e) => setCodeValues(prev => ({ ...prev, [`${row.rowKey}-name`]: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={nbrValues[row.rowKey] ?? String(row.defaultNbr)}
                          onChange={(e) => setNbrValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#1d4ed8', fontSize: '15px' }}>
                        <input
                          type="text"
                          value={synValues[row.rowKey] ?? ''}
                          onChange={(e) => setSynValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          placeholder="..."
                          style={{ ...inputStyle, color: '#1d4ed8' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#dc2626', fontWeight: 800, fontSize: '15px' }}>
                        <input
                          type="text"
                          value={printValues[row.rowKey] ?? row.defaultPrint}
                          onChange={(e) => setPrintValues(prev => ({ ...prev, [row.rowKey]: e.target.value }))}
                          style={{ ...inputStyle, color: '#dc2626', fontWeight: 800 }}
                        />
                      </td>
                      {extraCols.map(col => (
                        <td key={col.id} style={{ textAlign: 'center', borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px' }}>
                          <input
                            type="text"
                            value={extraColValues[col.id]?.[row.rowKey] ?? ''}
                            onChange={(e) => setExtraColCell(col.id, row.rowKey, e.target.value)}
                            placeholder="..."
                            style={{ ...inputStyle, color: '#059669' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
