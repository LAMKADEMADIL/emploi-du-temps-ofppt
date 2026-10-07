import React, { useState, useEffect, useRef } from 'react'
import {
  Database,
  FileSpreadsheet,
  Download,
  Search,
  Building2,
  Layers,
  CheckCircle2,
  Plus
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { groupesService, filieresService } from '../services/firebaseService'
import type { Groupe, Filiere } from '../types'
import { useTranslation } from '../lib/i18n'

export default function DnPage(): React.ReactElement {
  const { lang } = useTranslation()
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Manual Add State
  const [manualFiliere, setManualFiliere] = useState('')
  const [manualNbrGroupe, setManualNbrGroupe] = useState<number | ''>('')
  const [manualAnnee, setManualAnnee] = useState<1 | 2>(1)
  const [isSavingManual, setIsSavingManual] = useState(false)

  // Editable cell values per row key "filiereId-annee"
  const [synValues, setSynValues] = useState<Record<string, string>>({})
  const [nbrValues, setNbrValues] = useState<Record<string, string>>({})
  const [codeValues, setCodeValues] = useState<Record<string, string>>({})
  const [printValues, setPrintValues] = useState<Record<string, string>>({})

  // Dynamic extra columns
  const [extraCols, setExtraCols] = useState<{ id: string; header: string }[]>([])
  const [extraColValues, setExtraColValues] = useState<Record<string, Record<string, string>>>({})

  function addExtraCol() {
    const id = `col_${Date.now()}`
    setExtraCols(prev => [...prev, { id, header: 'Nouveau' }])
  }

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

  // Handle Excel File Upload for DN sheet
  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        setIsImporting(true)
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        // Check if there's a sheet named "DN"
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

        // In DN sheet, groups are usually in columns like TEMI100, TEMI200 starting from a specific column (e.g. col G)
        // We will scan the whole sheet for any cell matching the group code pattern (e.g., letters followed by 3 digits)
        const groupPattern = /^[A-Z]{2,6}\d{3}$/i
        const foundGroups = new Set<string>()

        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            const cellValue = String(rows[r][c] || '').trim().toUpperCase()
            if (groupPattern.test(cellValue)) {
              foundGroups.add(cellValue)
            }
          }
        }

        if (foundGroups.size === 0) {
          toast.error(lang === 'ar' ? 'لم يتم العثور على أفواج صحيحة في ورقة DN' : 'Aucun groupe valide trouvé dans la feuille DN')
          return
        }

        // Now process found groups
        for (const gCode of Array.from(foundGroups)) {
          // Extract filiere code (e.g., "TEMI" from "TEMI101")
          const filiereCode = gCode.replace(/\d+$/, '')

          // Find or create filiere
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

          // Check if group exists
          const existing = groupes.find((g) => g.code_groupe.toUpperCase() === gCode)
          if (existing && existing.id) {
            // Update if needed
            if (existing.id_filiere !== filiereId) {
              await groupesService.update(existing.id, { id_filiere: filiereId })
              updatedGroupes++
            }
          } else {
            // Create group
            // Check if it ends with 00 (which is usually a header like TEMI100, not an actual group like TEMI101)
            if (!gCode.endsWith('00')) {
              await groupesService.add({
                code_groupe: gCode,
                id_filiere: filiereId,
                en_stage: false
              })
              createdGroupes++
            }
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

  // Handle Manual Add
  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!manualFiliere || !manualNbrGroupe) return
    setIsSavingManual(true)
    
    try {
      const code = manualFiliere.trim().toUpperCase()
      
      // Find or create filiere
      let filiere = filieres.find((f) => f.code_filiere.toUpperCase() === code)
      let filiereId = filiere?.id

      if (!filiereId) {
        filiereId = await filieresService.add({
          code_filiere: code,
          nom_filiere: code
        })
        const newFiliere = { id: filiereId, code_filiere: code, nom_filiere: code }
        filieres.push(newFiliere)
      }

      // Add groups
      const startNum = manualAnnee === 1 ? 101 : 201
      const numGroups = Number(manualNbrGroupe)
      let added = 0
      for (let i = 0; i < numGroups; i++) {
        const gCode = `${code}${startNum + i}`
        const exists = groupes.some(g => g.code_groupe === gCode)
        if (!exists) {
          await groupesService.add({
            code_groupe: gCode,
            id_filiere: filiereId,
            en_stage: false
          })
          added++
        }
      }
      
      toast.success(lang === 'ar' ? `تمت الإضافة! ${added} فوج جديد.` : `Ajouté! ${added} nouveaux groupes.`)
      setManualFiliere('')
      setManualNbrGroupe('')
      loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحفظ' : 'Erreur lors de l\'enregistrement')
    } finally {
      setIsSavingManual(false)
    }
  }

  // Filter filieres
  const filteredFilieres = filieres.filter(f =>
    searchTerm === '' ||
    f.code_filiere.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.nom_filiere.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
                  ? 'إدارة قاعدة بيانات الشعب والأفواج واستيراد الهيكلة من ملف الإكسل'
                  : 'Gestion de la base des filières et groupes à partir du fichier Excel'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 18px',
              fontSize: '14px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              cursor: isImporting ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              opacity: isImporting ? 0.7 : 1
            }}
            onMouseEnter={(e) => { if (!isImporting) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { if (!isImporting) e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <FileSpreadsheet size={18} />
            {isImporting ? (lang === 'ar' ? 'جاري المزامنة...' : 'Synchronisation...') : (lang === 'ar' ? 'استيراد ورقة DN' : 'Importer la feuille DN')}
          </button>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        {/* Statistics Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
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
        </div>

        {/* Filter Bar */}
        <div style={{
          background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14,
          padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb',
              border: '1.5px solid #d1d5db', borderRadius: 8, padding: '7px 12px', width: '100%', maxWidth: 360
            }}>
              <Search size={16} color="#6b7280" />
              <input
                type="text"
                placeholder={lang === 'ar' ? 'ابحث عن شعبة...' : 'Rechercher une filière...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 14, color: '#0a0a0a', fontWeight: 600, width: '100%'
                }}
              />
            </div>
          </div>
        </div>

        {/* Data List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : filteredFilieres.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Database size={48} color="#9ca3af" /></div>
              <h3>{lang === 'ar' ? 'لا توجد بيانات' : 'Aucune donnée'}</h3>
              <p>{lang === 'ar' ? 'قم باستيراد ورقة DN لبناء قاعدة البيانات' : 'Importez la feuille DN pour construire la base'}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
              <table className="data-table" style={{ borderCollapse: 'collapse', border: '1.5px solid #000' }}>
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
                    <th style={{ textAlign: 'center', borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '8px', minWidth: 44 }}>
                      <button
                        onClick={addExtraCol}
                        title="Ajouter une colonne"
                        style={{
                          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          color: 'white', fontWeight: 800, fontSize: 18,
                          width: 28, height: 28, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center'
                        }}
                      >+</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFilieres.flatMap((filiere) => {
                    const filiereGroupes = groupes.filter(g => g.id_filiere === filiere.id)

                    const groupes1A = filiereGroupes.filter(g => {
                      const match = g.code_groupe.match(/\d+/)
                      return match ? match[0].startsWith('1') : true
                    })

                    const groupes2A = filiereGroupes.filter(g => {
                      const match = g.code_groupe.match(/\d+/)
                      return match ? match[0].startsWith('2') : false
                    })

                    const rows: React.ReactNode[] = []

                    if (groupes1A.length > 0) {
                      const key1 = `${filiere.id}-1`
                      const inputStyle = {
                        width: '100%', border: 'none', outline: 'none',
                        background: 'transparent', textAlign: 'center' as const,
                        fontSize: '14px', fontWeight: 700, color: '#000', cursor: 'text'
                      }
                      rows.push(
                        <tr key={`${filiere.id}-100`}>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={codeValues[key1] ?? `${filiere.code_filiere}100`} onChange={(e) => setCodeValues(prev => ({ ...prev, [key1]: e.target.value }))} style={inputStyle} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={codeValues[`${key1}-name`] ?? filiere.code_filiere} onChange={(e) => setCodeValues(prev => ({ ...prev, [`${key1}-name`]: e.target.value }))} style={inputStyle} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={nbrValues[key1] ?? String(groupes1A.length)} onChange={(e) => setNbrValues(prev => ({ ...prev, [key1]: e.target.value }))} style={inputStyle} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#1d4ed8', fontSize: '15px' }}>
                            <input type="text" value={synValues[key1] ?? ''} onChange={(e) => setSynValues(prev => ({ ...prev, [key1]: e.target.value }))} placeholder="..." style={{ ...inputStyle, color: '#1d4ed8' }} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={printValues[key1] ?? 'P'} onChange={(e) => setPrintValues(prev => ({ ...prev, [key1]: e.target.value }))} style={{ ...inputStyle, color: '#7c3aed', fontWeight: 800 }} />
                          </td>
                          {extraCols.map(col => (
                            <td key={col.id} style={{ textAlign: 'center', borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px' }}>
                              <input type="text" value={extraColValues[col.id]?.[key1] ?? ''} onChange={(e) => setExtraColCell(col.id, key1, e.target.value)} placeholder="..." style={{ ...inputStyle, color: '#059669' }} />
                            </td>
                          ))}
                          <td style={{ borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000' }} />
                        </tr>
                      )
                    }

                    if (groupes2A.length > 0) {
                      const key2 = `${filiere.id}-2`
                      const inputStyle2 = {
                        width: '100%', border: 'none', outline: 'none',
                        background: 'transparent', textAlign: 'center' as const,
                        fontSize: '14px', fontWeight: 700, color: '#000', cursor: 'text'
                      }
                      rows.push(
                        <tr key={`${filiere.id}-200`}>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={codeValues[key2] ?? `${filiere.code_filiere}200`} onChange={(e) => setCodeValues(prev => ({ ...prev, [key2]: e.target.value }))} style={inputStyle2} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={codeValues[`${key2}-name`] ?? filiere.code_filiere} onChange={(e) => setCodeValues(prev => ({ ...prev, [`${key2}-name`]: e.target.value }))} style={inputStyle2} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={nbrValues[key2] ?? String(groupes2A.length)} onChange={(e) => setNbrValues(prev => ({ ...prev, [key2]: e.target.value }))} style={inputStyle2} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#1d4ed8', fontSize: '15px' }}>
                            <input type="text" value={synValues[key2] ?? ''} onChange={(e) => setSynValues(prev => ({ ...prev, [key2]: e.target.value }))} placeholder="..." style={{ ...inputStyle2, color: '#1d4ed8' }} />
                          </td>
                          <td style={{ textAlign: 'center', borderRight: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px', color: '#000', fontWeight: 700, fontSize: '15px' }}>
                            <input type="text" value={printValues[key2] ?? 'P'} onChange={(e) => setPrintValues(prev => ({ ...prev, [key2]: e.target.value }))} style={{ ...inputStyle2, color: '#7c3aed', fontWeight: 800 }} />
                          </td>
                          {extraCols.map(col => (
                            <td key={col.id} style={{ textAlign: 'center', borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '4px' }}>
                              <input type="text" value={extraColValues[col.id]?.[key2] ?? ''} onChange={(e) => setExtraColCell(col.id, key2, e.target.value)} placeholder="..." style={{ ...inputStyle2, color: '#059669' }} />
                            </td>
                          ))}
                          <td style={{ borderLeft: '1.5px solid #000', borderBottom: '1.5px solid #000' }} />
                        </tr>
                      )
                    }

                    return rows
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
