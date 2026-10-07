import React, { useState, useEffect, useRef } from 'react'
import {
  Network,
  FileSpreadsheet,
  Download,
  Search,
  Users,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { formateursService, groupesService } from '../services/firebaseService'
import type { Formateur, Groupe } from '../types'
import { useTranslation } from '../lib/i18n'

export default function DnaPage(): React.ReactElement {
  const { lang } = useTranslation()
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Predefined aesthetic colors for professors
  const PROF_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#6366f1'
  ]
  const getProfColor = (idx: number) => PROF_COLORS[idx % PROF_COLORS.length]

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Clear / Delete state
  const [confirmClearModal, setConfirmClearModal] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [deleteFormateurId, setDeleteFormateurId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData(): Promise<void> {
    try {
      setLoading(true)
      const [formateursData, groupesData] = await Promise.all([
        formateursService.getAll(),
        groupesService.getAll()
      ])
      setFormateurs(formateursData)
      // Sort groups alphabetically
      setGroupes(groupesData.sort((a, b) => a.code_groupe.localeCompare(b.code_groupe)))
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // Download Sample DNA Excel Template
  function downloadDnaTemplate(): void {
    const headerRow: string[] = ['WAHOUB', 'KALAM', 'LOUARGUI', 'ZARIOH', 'ELABDANI']
    const sampleRows: string[][] = [
      ['TEMI100', 'TEMI100', 'TEMI200', 'TEMI200', 'TREM100'],
      ['ESA100', '', 'ESA200', 'ESA100', ''],
      ['', '', '', 'TREM100', ''],
      ['', '', '', 'TREM200', ''],
      ['', '', '', 'EEI200', '']
    ]

    const aoa = [headerRow, ...sampleRows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DNA')
    XLSX.writeFile(wb, 'modele_dna_ofppt.xlsx')
  }

  // Handle Excel File Upload for DNA sheet
  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        setIsImporting(true)
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        // Check if there's a sheet named "DNA" (case insensitive)
        const dnaSheetName =
          workbook.SheetNames.find((s) => s.trim().toUpperCase() === 'DNA') ||
          workbook.SheetNames[0]

        if (!dnaSheetName) {
          toast.error(lang === 'ar' ? 'الملف فارغ' : 'Fichier vide')
          return
        }

        const ws = workbook.Sheets[dnaSheetName]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (!rows || rows.length < 2) {
          toast.error(lang === 'ar' ? 'لا توجد بيانات كافية في ورقة DNA' : 'Données insuffisantes dans la feuille DNA')
          return
        }

        const header = rows[0].map((c) => String(c ?? '').trim())
        
        let createdCount = 0
        let updatedCount = 0

        // Process columns
        for (let colIdx = 0; colIdx < header.length; colIdx++) {
          const formateurName = header[colIdx]
          if (!formateurName) continue

          const colGroupes: string[] = []
          for (let r = 1; r < rows.length; r++) {
            const val = String(rows[r][colIdx] ?? '').trim()
            if (val && !colGroupes.includes(val)) {
              colGroupes.push(val)
            }
          }

          if (colGroupes.length > 0) {
            // Find formateur in DB
            const existingFormateur = formateurs.find(f => 
              f.nom_prenom.toLowerCase().includes(formateurName.toLowerCase()) || 
              (f.nom && f.nom.toLowerCase().includes(formateurName.toLowerCase()))
            )

            if (existingFormateur && existingFormateur.id) {
              await formateursService.update(existingFormateur.id, {
                groupes_assignes: colGroupes
              })
              updatedCount++
            } else {
              // Create new formateur
              await formateursService.add({
                matricule: `MAT-${Math.floor(Math.random() * 10000)}`,
                nom_prenom: formateurName,
                nom: formateurName,
                prenom: '',
                groupes_assignes: colGroupes
              })
              createdCount++
            }
          }
        }

        toast.success(
          lang === 'ar'
            ? `تم استيراد البيانات! تحديث ${updatedCount} وإنشاء ${createdCount} مكون.`
            : `Import terminé ! ${updatedCount} mis à jour et ${createdCount} créés.`
        )
        loadData()

      } catch (err) {
        console.error(err)
        toast.error(lang === 'ar' ? 'فشل قراءة ورقة DNA' : 'Erreur lors de la lecture de la feuille DNA')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
        setIsImporting(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Handle manual cell edit
  async function handleCellChange(formateur: Formateur, rowIndex: number, value: string) {
    if (!formateur.id) return
    
    // Optimistic UI update
    setFormateurs(prev => prev.map(f => {
      if (f.id === formateur.id) {
        const newGroupes = [...(f.groupes_assignes || [])]
        newGroupes[rowIndex] = value
        return { ...f, groupes_assignes: newGroupes }
      }
      return f
    }))

    // Save to DB
    const newGroupesToSave = [...(formateur.groupes_assignes || [])]
    newGroupesToSave[rowIndex] = value
    const cleaned = newGroupesToSave.filter(g => g.trim() !== '')
    
    try {
      await formateursService.update(formateur.id, { groupes_assignes: cleaned })
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'فشل الحفظ التلقائي' : 'Erreur de sauvegarde automatique')
    }
  }

  // Clear all group assignments (empty all cells on this page)
  async function handleClearAllAssignments(): Promise<void> {
    try {
      setIsClearing(true)
      const promises = formateurs.map((f) => {
        if (!f.id) return Promise.resolve()
        return formateursService.update(f.id, { groupes_assignes: [] })
      })
      await Promise.all(promises)
      toast.success(
        lang === 'ar'
          ? 'تم مسح جميع تعيينات المجموعات بنجاح!'
          : 'Toutes les affectations ont été effacées avec succès !'
      )
      setConfirmClearModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء مسح التعيينات' : 'Erreur lors de la réinitialisation')
    } finally {
      setIsClearing(false)
    }
  }

  // Delete all formateurs (complete wipe)
  async function handleDeleteAllFormateurs(): Promise<void> {
    try {
      setIsClearing(true)
      await formateursService.deleteAll()
      toast.success(
        lang === 'ar'
          ? 'تم مسح جميع المكونين والتعيينات بنجاح!'
          : 'Tous les formateurs et affectations ont été supprimés !'
      )
      setConfirmClearModal(false)
      await loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Erreur lors de la suppression')
    } finally {
      setIsClearing(false)
    }
  }

  // Delete a single formateur column
  async function handleDeleteSingleFormateur(id: string): Promise<void> {
    try {
      await formateursService.delete(id)
      toast.success(lang === 'ar' ? 'تم حذف المكون بنجاح' : 'Formateur supprimé avec succès')
      setDeleteFormateurId(null)
      await loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Erreur lors de la suppression')
    }
  }

  // Filter formateurs based on search
  const filteredFormateurs = formateurs.filter(f => 
    searchTerm === '' || 
    f.nom_prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.groupes_assignes && f.groupes_assignes.some(g => g.toLowerCase().includes(searchTerm.toLowerCase())))
  )

  // Calculate max rows (+1 to always show an empty row for new additions)
  const maxRows = Math.max(6, ...filteredFormateurs.map((f) => f.groupes_assignes?.length || 0)) + 1

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
              background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #7c3aed', color: 'white'
            }}>
              <Network size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                {lang === 'ar' ? 'إسناد المجموعات (DNA)' : 'Affectations (DNA)'}
              </h1>
              <p style={{ fontSize: 13.5, color: '#4b5563', margin: '3px 0 0 0' }}>
                {lang === 'ar'
                  ? 'إدارة المجموعات والأفواج المسندة لكل مكون (أستاذ)'
                  : 'Gestion des groupes assignés à chaque formateur'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Vider le tableau Button */}
          {formateurs.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearModal(true)}
              disabled={isImporting || isClearing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 700,
                background: 'white',
                color: '#d97706',
                border: '2px solid #f59e0b',
                borderRadius: 'var(--radius-md)',
                cursor: isClearing ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)'
              }}
              onMouseEnter={(e) => {
                if (!isClearing) {
                  e.currentTarget.style.background = '#f59e0b'
                  e.currentTarget.style.color = 'white'
                }
              }}
              onMouseLeave={(e) => {
                if (!isClearing) {
                  e.currentTarget.style.background = 'white'
                  e.currentTarget.style.color = '#d97706'
                }
              }}
              title={lang === 'ar' ? 'تفريغ كل الجدول' : 'Vider le tableau'}
            >
              <Trash2 size={16} />
              {lang === 'ar' ? 'تفريغ الجدول' : 'Vider le tableau'}
            </button>
          )}

          {/* Import Excel DNA */}
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
            {isImporting ? (lang === 'ar' ? 'جاري الاستيراد...' : 'Importation...') : (lang === 'ar' ? 'استيراد ورقة DNA' : 'Importer DNA')}
          </button>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        {/* Filter Bar */}
        <div style={{
          background: 'white',
          border: '1.5px solid #e5e7eb',
          borderRadius: 14,
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f9fafb', border: '1.5px solid #d1d5db',
              borderRadius: 8, padding: '7px 12px', width: '100%', maxWidth: 360
            }}>
              <Search size={16} color="#6b7280" />
              <input
                type="text"
                placeholder={lang === 'ar' ? 'ابحث عن أستاذ أو مجموعة...' : 'Rechercher un formateur ou groupe...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 14, color: '#0a0a0a', fontWeight: 600, width: '100%'
                }}
              />
            </div>
          </div>

          {/* Hint / Template */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4b5563' }}>
            <button
              type="button"
              onClick={downloadDnaTemplate}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: 'none', color: '#16a34a',
                fontWeight: 700, cursor: 'pointer', fontSize: 13, textDecoration: 'underline'
              }}
            >
              <Download size={13} />
              {lang === 'ar' ? 'تحميل نموذج Excel' : 'Modèle Excel'}
            </button>
          </div>
        </div>

        {/* DNA Grid Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : filteredFormateurs.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Users size={48} color="#9ca3af" /></div>
              <h3>{lang === 'ar' ? 'لا توجد بيانات' : 'Aucune donnée'}</h3>
              <p>{lang === 'ar' ? 'لم يتم العثور على أي أساتذة' : 'Aucun formateur trouvé'}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: filteredFormateurs.length * 130 }}>
                {/* Column Headers (Formateurs) */}
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    {filteredFormateurs.map((formateur, idx) => (
                      <th
                        key={idx}
                        style={{
                          padding: '14px 10px',
                          minWidth: 125,
                          width: 130,
                          textAlign: 'center',
                          borderRight: '1.5px solid #d1d5db',
                          borderBottom: `3px solid ${getProfColor(idx)}`,
                          background: 'linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)',
                          color: '#0a0a0a',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#0a0a0a', letterSpacing: 0.3 }}>
                          {formateur.nom
                            ? formateur.nom
                            : ((formateur.nom_prenom ?? '').split(' ').slice(1).join(' ') || formateur.nom_prenom || formateur.matricule)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {/* Rows (Groupes) */}
                <tbody>
                  {Array.from({ length: maxRows }).map((_, rIdx) => (
                    <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      {filteredFormateurs.map((formateur, cIdx) => {
                        const groupeCode = formateur.groupes_assignes?.[rIdx] || ''
                        return (
                          <td
                            key={cIdx}
                            style={{
                              padding: '6px 8px',
                              textAlign: 'center',
                              borderRight: '1px solid #e5e7eb',
                              borderBottom: '1px solid #e5e7eb'
                            }}
                          >
                            <select
                              value={groupeCode}
                              onChange={(e) => handleCellChange(formateur, rIdx, e.target.value)}
                              style={{
                                width: '100%',
                                textAlign: 'center',
                                textAlignLast: 'center',
                                border: '1px solid transparent',
                                background: 'transparent',
                                fontSize: 14,
                                fontWeight: groupeCode ? 700 : 400,
                                color: groupeCode ? getProfColor(cIdx) : '#9ca3af',
                                outline: 'none',
                                padding: '4px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                transition: 'all 0.2s',
                                appearance: 'none'
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.border = `1px solid ${getProfColor(cIdx)}`
                                e.currentTarget.style.background = '#ffffff'
                                e.currentTarget.style.boxShadow = `0 0 0 2px ${getProfColor(cIdx)}20`
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.border = '1px solid transparent'
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                            >
                              <option value="" style={{ color: '#9ca3af' }}>-</option>
                              {groupes.map(g => (
                                <option key={g.id} value={g.code_groupe} style={{ color: '#1f2937' }}>
                                  {g.code_groupe}
                                </option>
                              ))}
                            </select>
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

      {/* Confirm Clear Page Modal */}
      {confirmClearModal && (
        <div className="modal-overlay" onClick={() => !isClearing && setConfirmClearModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, textAlign: 'center' }}>
            <div style={{ padding: '32px 24px 24px' }}>
              <div style={{
                width: 76, height: 76, borderRadius: '50%',
                background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                border: '3px solid #fca5a5'
              }}>
                <AlertTriangle size={36} color="#dc2626" />
              </div>

              <h3 style={{ fontSize: 21, fontWeight: 800, color: '#0a0a0a', marginBottom: 10 }}>
                {lang === 'ar' ? 'مسح بيانات صفحة DNA' : 'Nettoyer la page DNA'}
              </h3>

              <p style={{ fontSize: 14.5, color: '#4b5563', lineHeight: 1.6, marginBottom: 24 }}>
                {lang === 'ar'
                  ? 'اختر نوع المسح الذي ترغب في تطبيقه على هذه الصفحة:'
                  : 'Choisissez le type de nettoyage que vous souhaitez appliquer :'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {/* Option 1: Clear assignments only */}
                <button
                  type="button"
                  onClick={handleClearAllAssignments}
                  disabled={isClearing}
                  style={{
                    padding: '12px 18px',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 14.5,
                    cursor: isClearing ? 'not-allowed' : 'pointer',
                    border: '2px solid #f59e0b',
                    background: '#fffbeb',
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isClearing) {
                      e.currentTarget.style.background = '#f59e0b'
                      e.currentTarget.style.color = 'white'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isClearing) {
                      e.currentTarget.style.background = '#fffbeb'
                      e.currentTarget.style.color = '#b45309'
                    }
                  }}
                >
                  <Trash2 size={16} />
                  {lang === 'ar' ? 'مسح التعيينات فقط (تفريغ الخانات)' : 'Vider les affectations uniquement'}
                </button>

              </div>

              <button
                type="button"
                onClick={() => setConfirmClearModal(false)}
                disabled={isClearing}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  border: '2px solid #e5e7eb',
                  background: 'white',
                  color: '#4b5563',
                  transition: 'all 0.2s',
                  width: '100%'
                }}
              >
                {lang === 'ar' ? 'إلغاء' : 'Annuler'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Single Formateur Modal */}
      {deleteFormateurId && (
        <div className="modal-overlay" onClick={() => setDeleteFormateurId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ padding: '30px 24px 24px' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#fee2e2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                border: '2px solid #fca5a5'
              }}>
                <Trash2 size={30} color="#dc2626" />
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 800, color: '#0a0a0a', marginBottom: 8 }}>
                {lang === 'ar' ? 'حذف هذا المكون' : 'Supprimer ce formateur'}
              </h3>
              <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 24 }}>
                {lang === 'ar' ? 'هل أنت متأكد من حذف هذا العمود وتعييناته؟' : 'Voulez-vous vraiment supprimer cette colonne et ses affectations ?'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleDeleteSingleFormateur(deleteFormateurId)}
                  style={{
                    padding: '10px 22px', borderRadius: 8, fontWeight: 700,
                    background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer'
                  }}
                >
                  {lang === 'ar' ? 'نعم، احذف' : 'Oui, supprimer'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteFormateurId(null)}
                  style={{
                    padding: '10px 22px', borderRadius: 8, fontWeight: 700,
                    border: '1.5px solid #d1d5db', background: 'white', color: '#374151', cursor: 'pointer'
                  }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
