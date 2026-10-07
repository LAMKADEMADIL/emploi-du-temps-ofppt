import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Edit, AlertTriangle, FileSpreadsheet, Download, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { formateursService } from '../services/firebaseService'
import type { Formateur } from '../types'
import { useTranslation } from '../lib/i18n'

export default function FormateursPage(): React.ReactElement {
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { lang } = useTranslation()

  // Form state
  const [matricule, setMatricule] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')

  // Confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  // Excel Import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importedList, setImportedList] = useState<Array<{ matricule: string; nom: string; prenom: string }>>([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    loadFormateurs()
  }, [])

  async function loadFormateurs(): Promise<void> {
    try {
      setLoading(true)
      const data = await formateursService.getAll()
      setFormateurs(data)
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  function openModal(formateur?: Formateur): void {
    if (formateur) {
      setEditingId(formateur.id!)
      setMatricule(formateur.matricule)
      // Support both old nom_prenom and new prenom/nom
      if (formateur.prenom !== undefined) {
        setPrenom(formateur.prenom)
        setNom(formateur.nom ?? '')
      } else {
        const parts = formateur.nom_prenom.split(' ')
        setPrenom(parts[0] ?? '')
        setNom(parts.slice(1).join(' '))
      }
    } else {
      setEditingId(null)
      setMatricule('')
      setPrenom('')
      setNom('')
    }
    setIsModalOpen(true)
  }

  function closeModal(): void {
    setIsModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!matricule || !prenom || !nom) {
      toast.error(lang === 'ar' ? 'الرجاء ملء جميع الحقول' : 'Veuillez remplir tous les champs')
      return
    }

    const data: Partial<Formateur> = {
      matricule,
      prenom,
      nom,
      nom_prenom: `${prenom} ${nom}`
    }

    try {
      if (editingId) {
        await formateursService.update(editingId, data)
        toast.success(lang === 'ar' ? 'تم التحديث بنجاح' : 'Mis à jour avec succès')
      } else {
        await formateursService.add(data as Formateur)
        toast.success(lang === 'ar' ? 'تمت الإضافة بنجاح' : 'Ajouté avec succès')
      }
      closeModal()
      loadFormateurs()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحفظ' : "Erreur lors de l'enregistrement")
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setConfirmDeleteId(id)
  }

  async function confirmDelete(): Promise<void> {
    if (!confirmDeleteId) return
    try {
      await formateursService.delete(confirmDeleteId)
      toast.success(lang === 'ar' ? 'تم الحذف بنجاح' : 'Supprimé avec succès')
      loadFormateurs()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Erreur lors de la suppression')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  async function confirmDeleteAllFormateurs(): Promise<void> {
    setIsDeletingAll(true)
    try {
      await formateursService.deleteAll()
      toast.success(lang === 'ar' ? 'تم حذف جميع الأساتذة بنجاح' : 'Tous les formateurs ont été supprimés avec succès')
      setConfirmDeleteAll(false)
      loadFormateurs()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء مسح الأساتذة' : 'Erreur lors de la suppression')
    } finally {
      setIsDeletingAll(false)
    }
  }

  // Download Sample Excel Template
  function downloadTemplate(): void {
    const wsData = [
      ['Matricule', 'Nom', 'Prénom'],
      ['1234501', 'BENALI', 'Ahmed'],
      ['1234502', 'EL AMRANI', 'Fatima'],
      ['1234503', 'ALAOUI', 'Youssef']
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 22 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Formateurs')
    XLSX.writeFile(wb, 'modele_import_formateurs.xlsx')
  }

  // Handle Excel File Selection
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          toast.error(lang === 'ar' ? 'الملف فارغ' : 'Le fichier est vide')
          return
        }
        const worksheet = workbook.Sheets[sheetName]
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

        if (!rows || rows.length === 0) {
          toast.error(lang === 'ar' ? 'الملف لا يحتوي على بيانات' : 'Le fichier ne contient aucune donnée')
          return
        }

        const firstRow = rows[0].map((c) => String(c ?? '').trim().toLowerCase())

        // ── تحديد هيكل الأعمدة ──────────────────────────────────────────────
        const hasHeader = firstRow.some((cell) =>
          cell.includes('matr') || cell.includes('mle') || cell.includes('مترك') ||
          cell.includes('nom') || cell.includes('نسب') || cell.includes('لقب') ||
          cell.includes('prenom') || cell.includes('prénom') || cell.includes('اسم')
        )

        let matriculeIdx = 0
        let nomPrenomIdx = -1  // عمود "Nom et Prénom" المجمّع
        let nomIdx = -1
        let prenomIdx = -1
        let startIdx = hasHeader ? 1 : 0

        if (hasHeader) {
          firstRow.forEach((cell, idx) => {
            if (cell.includes('matr') || cell.includes('mle') || cell.includes('مترك') || cell.includes('code')) {
              matriculeIdx = idx
            } else if (
              // عمود مجمّع "nom et prénom" أو "nom & prénom"
              (cell.includes('nom') && cell.includes('pr')) ||
              (cell.includes('اسم') && cell.includes('نسب')) ||
              cell === 'nom et prénom' || cell === 'nom & prénom' || cell === 'الاسم واللقب'
            ) {
              nomPrenomIdx = idx
            } else if (cell.includes('prenom') || cell.includes('prénom') || cell === 'اسم') {
              prenomIdx = idx
            } else if (cell.includes('nom') || cell.includes('نسب') || cell.includes('لقب')) {
              nomIdx = idx
            }
          })

          // إذا لم يُعثر على عمود prénom منفصل → يبحث في عمود nom عن "Nom et Prénom"
          if (prenomIdx === -1 && nomIdx !== -1 && nomPrenomIdx === -1) {
            // قد يكون عمود nom هو في الواقع "Nom et Prénom"
            // نتحقق من أول صف بيانات
            const sampleCell = String(rows[startIdx]?.[nomIdx] ?? '').trim()
            if (sampleCell.includes(' ')) {
              // الاسم مجمّع في هذا العمود
              nomPrenomIdx = nomIdx
              nomIdx = -1
            }
          }
        } else {
          // بدون رأس: إذا كان الملف عمودين فقط → عمود 0=Matricule، عمود 1=Nom et Prénom
          const colCount = Math.max(...rows.map(r => r.length))
          matriculeIdx = 0
          if (colCount >= 3) {
            nomIdx = 1
            prenomIdx = 2
          } else {
            nomPrenomIdx = 1  // عمود مجمّع
          }
        }

        // ── تحليل الصفوف ───────────────────────────────────────────────────
        const parsed: Array<{ matricule: string; nom: string; prenom: string }> = []

        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length === 0) continue

          const m = String(row[matriculeIdx] ?? '').trim()
          let nom = ''
          let prenom = ''

          if (nomPrenomIdx !== -1) {
            // ── حالة: الاسم مجمّع في عمود واحد (مثال: "KALAM HALIMA" أو "EL ABDANI ABDELTIF") ──
            const full = String(row[nomPrenomIdx] ?? '').trim()
            const parts = full.split(/\s+/)
            if (parts.length === 1) {
              nom = parts[0]
              prenom = ''
            } else {
              // آخر كلمة = Prénom (الاسم)، الباقي = Nom (النسب)
              prenom = parts[parts.length - 1]
              nom = parts.slice(0, -1).join(' ')
            }
          } else {
            // ── حالة: عمودان منفصلان Nom + Prénom ──
            nom = nomIdx !== -1 ? String(row[nomIdx] ?? '').trim() : ''
            prenom = prenomIdx !== -1 ? String(row[prenomIdx] ?? '').trim() : ''
          }

          if (!m && !nom && !prenom) continue
          parsed.push({ matricule: m, nom, prenom })
        }

        if (parsed.length === 0) {
          toast.error(lang === 'ar' ? 'لم يتم العثور على أية صفوف صالحة' : 'Aucune ligne valide trouvée')
          return
        }

        setImportedList(parsed)
        setIsImportModalOpen(true)
      } catch (err) {
        console.error(err)
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء قراءة ملف Excel' : 'Erreur lors de la lecture du fichier Excel')
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    }
    reader.readAsArrayBuffer(file)
  }



  // Confirm Import to Firebase
  async function handleConfirmImport(): Promise<void> {
    if (importedList.length === 0) return
    setIsImporting(true)
    try {
      let added = 0
      let updated = 0

      for (const item of importedList) {
        const existing = formateurs.find(
          (f) => f.matricule.trim().toLowerCase() === item.matricule.trim().toLowerCase()
        )
        const nom_prenom = `${item.prenom} ${item.nom}`.trim()
        const data = {
          matricule: item.matricule,
          nom: item.nom,
          prenom: item.prenom,
          nom_prenom: nom_prenom || item.matricule
        }

        if (existing && existing.id) {
          await formateursService.update(existing.id, data)
          updated++
        } else {
          await formateursService.add(data as Formateur)
          added++
        }
      }

      if (lang === 'ar') {
        toast.success(`تم استيراد ${added} أستاذ جديد وتحديث ${updated} بنجاح!`)
      } else {
        toast.success(`${added} ajouté(s), ${updated} mis à jour avec succès!`)
      }

      setIsImportModalOpen(false)
      setImportedList([])
      await loadFormateurs()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الأساتذة' : "Erreur lors de l'enregistrement")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Hidden File Input for Excel */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .xls, .csv"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'إدارة المكونين' : 'Gestion des Formateurs'}</h1>
          <p>{lang === 'ar' ? 'إضافة، تعديل، أو حذف بيانات المكونين (الأساتذة)' : 'Ajouter, modifier ou supprimer les formateurs'}</p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Delete All Button */}
          {formateurs.length > 0 && (
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 700,
                background: 'white',
                color: '#dc2626',
                border: '2px solid #ef4444',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.08)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ef4444'
                e.currentTarget.style.color = 'white'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white'
                e.currentTarget.style.color = '#dc2626'
              }}
              onClick={() => setConfirmDeleteAll(true)}
              title={lang === 'ar' ? 'مسح جميع الأساتذة في آن واحد' : 'Supprimer tous les formateurs en un clic'}
            >
              <Trash2 size={16} />
              {lang === 'ar' ? 'مسح الكل' : 'Tout supprimer'}
            </button>
          )}

          {/* Import Excel Button */}
          <button
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 20px',
              fontSize: '14px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            onClick={() => fileInputRef.current?.click()}
            title={lang === 'ar' ? 'استيراد من حاسوب ملف Excel (رقم التسجيل، النسب، الاسم)' : 'Importer depuis Excel (Matricule, Nom, Prénom)'}
          >
            <FileSpreadsheet size={18} />
            {lang === 'ar' ? 'استيراد من Excel' : 'Importer Excel'}
          </button>

          {/* Add Teacher Button */}
          <button
            className="btn btn-primary"
            style={{ padding: '11px 22px', fontSize: '14px', gap: '8px', fontWeight: 600 }}
            onClick={() => openModal()}
          >
            <Plus size={18} /> {lang === 'ar' ? 'إضافة مكون جديد' : 'Ajouter un formateur'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="page-body">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 40 }}><div className="spinner" /></div>
          ) : formateurs.length === 0 ? (
            <div className="empty-state" style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="empty-state-icon" style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
                {lang === 'ar' ? 'لا يوجد مكونون' : 'Aucun formateur'}
              </h3>
              <p style={{ fontSize: 15, color: '#6b7280', marginBottom: 24, maxWidth: 460, textAlign: 'center', lineHeight: 1.6 }}>
                {lang === 'ar'
                  ? 'قم بإضافة المكونين يدوياً أو استيرادهم مباشرة من ملف Excel للبدء'
                  : 'Ajoutez des formateurs manuellement ou importez-les directement depuis un fichier Excel'}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '10px 20px', fontSize: '14px', gap: '8px' }}
                  onClick={() => openModal()}
                >
                  <Plus size={16} /> {lang === 'ar' ? 'إضافة مكون' : 'Ajouter un formateur'}
                </button>
                <button
                  type="button"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet size={16} />
                  {lang === 'ar' ? 'استيراد من Excel' : 'Importer Excel'}
                </button>
              </div>
            </div>
          ) : (
            <div className="table-wrapper" style={{ margin: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #a8d5a2, #7ec87a)' }}>
                    <th style={thStyle}>{lang === 'ar' ? 'رقم التسجيل' : 'Matricule'}</th>
                    <th style={thStyle}>{lang === 'ar' ? 'الاسم' : 'Prénom'}</th>
                    <th style={thStyle}>{lang === 'ar' ? 'اللقب' : 'Nom'}</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {formateurs.map((f, idx) => {
                    const prenomVal = f.prenom ?? f.nom_prenom.split(' ')[0]
                    const nomVal = f.nom ?? f.nom_prenom.split(' ').slice(1).join(' ')
                    return (
                      <tr
                        key={f.id}
                        style={{
                          background: idx % 2 === 0 ? '#ffffff' : '#f8fffe',
                          borderBottom: '1px solid #e8f5e9',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                        onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#f8fffe')}
                      >
                        <td style={tdStyle}>
                          <span style={{
                            fontWeight: 700,
                            color: '#0a0a0a',
                            fontSize: 17
                          }}>{f.matricule}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 17, color: '#0a0a0a', fontWeight: 500 }}>{prenomVal}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700, fontSize: 17, color: '#0a0a0a', textTransform: 'uppercase' }}>{nomVal}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button
                              onClick={() => openModal(f)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '7px 16px', borderRadius: 8, fontWeight: 600,
                                fontSize: 13, cursor: 'pointer', border: '2px solid #3b82f6',
                                background: 'white', color: '#3b82f6',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#3b82f6'
                                ;(e.currentTarget as HTMLButtonElement).style.color = 'white'
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = 'white'
                                ;(e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'
                              }}
                              title="Modifier"
                            >
                              <Edit size={14} />
                              {lang === 'ar' ? 'تعديل' : 'Modifier'}
                            </button>
                            <button
                              onClick={() => handleDelete(f.id!)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '7px 16px', borderRadius: 8, fontWeight: 600,
                                fontSize: 13, cursor: 'pointer', border: '2px solid #ef4444',
                                background: 'white', color: '#ef4444',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#ef4444'
                                ;(e.currentTarget as HTMLButtonElement).style.color = 'white'
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = 'white'
                                ;(e.currentTarget as HTMLButtonElement).style.color = '#ef4444'
                              }}
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                              {lang === 'ar' ? 'حذف' : 'Supprimer'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingId
                  ? (lang === 'ar' ? 'تعديل بيانات المكون' : 'Modifier le formateur')
                  : (lang === 'ar' ? 'إضافة مكون جديد' : 'Ajouter un formateur')}
              </h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Matricule */}
              <div className="form-group">
                <label className="form-label">{lang === 'ar' ? 'رقم التسجيل' : 'Matricule'}</label>
                <input
                  type="text" className="form-input"
                  placeholder={lang === 'ar' ? 'مثال: BBBBB' : 'Ex: BBBBB'}
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Prénom + Nom side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                <div className="form-group">
                  <label className="form-label">{lang === 'ar' ? 'الاسم' : 'Prénom'}</label>
                  <input
                    type="text" className="form-input"
                    placeholder={lang === 'ar' ? 'مثال: بلال' : 'Ex: Bilal'}
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{lang === 'ar' ? 'اللقب' : 'Nom'}</label>
                  <input
                    type="text" className="form-input"
                    placeholder={lang === 'ar' ? 'مثال: زهراوي' : 'Ex: ZEHRAOUI'}
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 24 }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '14px' }}>
                  {lang === 'ar' ? 'حفظ البيانات' : 'Enregistrer'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: '14px' }} onClick={closeModal}>
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ padding: '32px 24px 24px' }}>
              {/* Icon */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                border: '3px solid #fca5a5'
              }}>
                <AlertTriangle size={34} color="#dc2626" />
              </div>

              {/* Title */}
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0a0a0a', marginBottom: 10 }}>
                {lang === 'ar' ? 'تأكيد الحذف' : 'Confirmer la suppression'}
              </h3>

              {/* Message */}
              <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.6, marginBottom: 28 }}>
                {lang === 'ar'
                  ? 'هل أنت متأكد من حذف هذا المكون؟ لا يمكن التراجع عن هذا الإجراء.'
                  : 'Êtes-vous sûr de vouloir supprimer ce formateur ? Cette action est irréversible.'}
              </p>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={confirmDelete}
                  style={{
                    padding: '11px 28px', borderRadius: 10, fontWeight: 700,
                    fontSize: 15, cursor: 'pointer', border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: 'white', display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <Trash2 size={16} />
                  {lang === 'ar' ? 'نعم، احذف' : 'Oui, supprimer'}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  style={{
                    padding: '11px 28px', borderRadius: 10, fontWeight: 700,
                    fontSize: 15, cursor: 'pointer',
                    border: '2px solid #e5e7eb',
                    background: 'white', color: '#374151',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#6b7280'
                    ;(e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'white'
                  }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete All Modal */}
      {confirmDeleteAll && (
        <div className="modal-overlay" onClick={() => !isDeletingAll && setConfirmDeleteAll(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{ padding: '32px 26px 24px' }}>
              {/* Icon */}
              <div style={{
                width: 76, height: 76, borderRadius: '50%',
                background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                border: '3px solid #f87171'
              }}>
                <AlertTriangle size={38} color="#b91c1c" />
              </div>

              {/* Title */}
              <h3 style={{ fontSize: 21, fontWeight: 800, color: '#0a0a0a', marginBottom: 12 }}>
                {lang === 'ar' ? 'تأكيد مسح جميع الأساتذة' : 'Supprimer tous les formateurs'}
              </h3>

              {/* Message */}
              <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.6, marginBottom: 28 }}>
                {lang === 'ar'
                  ? `هل أنت متأكد تماماً من رغبتك في حذف جميع الأساتذة (${formateurs.length} أستاذ) دفعة واحدة؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.`
                  : `Êtes-vous sûr de vouloir supprimer tous les ${formateurs.length} formateurs en une seule fois ? Cette action est définitive et irréversible.`}
              </p>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={confirmDeleteAllFormateurs}
                  disabled={isDeletingAll}
                  style={{
                    padding: '12px 28px', borderRadius: 10, fontWeight: 700,
                    fontSize: 15, cursor: isDeletingAll ? 'not-allowed' : 'pointer', border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                    color: 'white', display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 4px 14px rgba(239,68,68,0.4)',
                    opacity: isDeletingAll ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => !isDeletingAll && (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={e => !isDeletingAll && (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <Trash2 size={17} />
                  {isDeletingAll
                    ? (lang === 'ar' ? 'جاري المسح...' : 'Suppression en cours...')
                    : (lang === 'ar' ? `نعم، مسح الكل (${formateurs.length})` : `Oui, tout supprimer (${formateurs.length})`)}
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(false)}
                  disabled={isDeletingAll}
                  style={{
                    padding: '12px 24px', borderRadius: 10, fontWeight: 700,
                    fontSize: 15, cursor: 'pointer',
                    border: '2px solid #e5e7eb',
                    background: 'white', color: '#374151',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#6b7280'
                    ;(e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'white'
                  }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Preview Modal */}
      {isImportModalOpen && (
        <div className="modal-overlay" onClick={() => !isImporting && setIsImportModalOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 660, width: '95%' }}
          >
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.25))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ fontSize: 20, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                    {lang === 'ar' ? 'معاينة واستيراد ملف Excel' : 'Aperçu et importation Excel'}
                  </h3>
                  <p style={{ fontSize: 13, color: '#4b5563', margin: '3px 0 0 0' }}>
                    {lang === 'ar'
                      ? `تم العثور على ${importedList.length} أستاذ جاهز للاستيراد`
                      : `${importedList.length} formateur(s) trouvé(s) dans le fichier`}
                  </p>
                </div>
              </div>
              <button
                className="modal-close"
                disabled={isImporting}
                onClick={() => setIsImportModalOpen(false)}
              >
                ×
              </button>
            </div>

            {/* Hint & Template download */}
            <div style={{
              background: '#f0fdf4',
              border: '1.5px solid #bbf7d0',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              {/* ── Legend: Formats supportés ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 14, color: '#166534', fontWeight: 800 }}>
                    {lang === 'ar' ? '📋 الصيغ المدعومة للملف:' : '📋 Formats de fichier acceptés :'}
                  </span>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8,
                      border: '1.5px solid #16a34a', background: 'white', color: '#16a34a',
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'; (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; (e.currentTarget as HTMLButtonElement).style.color = '#16a34a' }}
                  >
                    <Download size={14} />
                    {lang === 'ar' ? 'تحميل نموذج Excel' : 'Télécharger modèle'}
                  </button>
                </div>

                {/* Format 1: 2 colonnes */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240, background: '#dcfce7', borderRadius: 8, padding: '10px 14px', border: '1px solid #86efac' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>
                      {lang === 'ar' ? '✅ الصيغة 1 — عمودان (مجمّع)' : '✅ Format 1 — 2 colonnes (nom combiné)'}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ background: '#bbf7d0' }}>
                          <td style={{ padding: '3px 8px', fontWeight: 700, border: '1px solid #86efac' }}>Matricule</td>
                          <td style={{ padding: '3px 8px', fontWeight: 700, border: '1px solid #86efac' }}>Nom et Prénom</td>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '3px 8px', border: '1px solid #86efac', color: '#0a0a0a' }}>9202</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #86efac', color: '#0a0a0a' }}>KALAM HALIMA</td>
                        </tr>
                        <tr style={{ background: '#f0fdf4' }}>
                          <td style={{ padding: '3px 8px', border: '1px solid #86efac', color: '#0a0a0a' }}>13293</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #86efac', color: '#0a0a0a' }}>EL ABDANI ABDELTIF</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ fontSize: 11, color: '#166534', marginTop: 5, fontStyle: 'italic' }}>
                      {lang === 'ar' ? '← آخر كلمة = الاسم، الباقي = النسب' : '← Dernier mot = Prénom, reste = Nom'}
                    </div>
                  </div>

                  {/* Format 2: 3 colonnes */}
                  <div style={{ flex: 1, minWidth: 240, background: '#dbeafe', borderRadius: 8, padding: '10px 14px', border: '1px solid #93c5fd' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>
                      {lang === 'ar' ? '✅ الصيغة 2 — ثلاثة أعمدة (منفصل)' : '✅ Format 2 — 3 colonnes (séparés)'}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ background: '#bfdbfe' }}>
                          <td style={{ padding: '3px 8px', fontWeight: 700, border: '1px solid #93c5fd' }}>Matricule</td>
                          <td style={{ padding: '3px 8px', fontWeight: 700, border: '1px solid #93c5fd' }}>Nom</td>
                          <td style={{ padding: '3px 8px', fontWeight: 700, border: '1px solid #93c5fd' }}>Prénom</td>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '3px 8px', border: '1px solid #93c5fd', color: '#0a0a0a' }}>9202</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #93c5fd', color: '#0a0a0a' }}>KALAM</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #93c5fd', color: '#0a0a0a' }}>HALIMA</td>
                        </tr>
                        <tr style={{ background: '#eff6ff' }}>
                          <td style={{ padding: '3px 8px', border: '1px solid #93c5fd', color: '#0a0a0a' }}>13293</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #93c5fd', color: '#0a0a0a' }}>EL ABDANI</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #93c5fd', color: '#0a0a0a' }}>ABDELTIF</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 5, fontStyle: 'italic' }}>
                      {lang === 'ar' ? '← كل عمود في مكانه مباشرةً' : '← Chaque colonne directement à sa place'}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Table Preview */}
            <div style={{
              maxHeight: 280,
              overflowY: 'auto',
              border: '1.5px solid #e5e7eb',
              borderRadius: 10,
              marginBottom: 20
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#0a0a0a', textAlign: 'center', width: 45 }}>#</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#0a0a0a', textAlign: 'left' }}>{lang === 'ar' ? 'رقم التسجيل' : 'Matricule'}</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#0a0a0a', textAlign: 'left' }}>{lang === 'ar' ? 'النسب' : 'Nom'}</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#0a0a0a', textAlign: 'left' }}>{lang === 'ar' ? 'الاسم' : 'Prénom'}</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#0a0a0a', textAlign: 'center', width: 110 }}>{lang === 'ar' ? 'الحالة' : 'État'}</th>
                  </tr>
                </thead>
                <tbody>
                  {importedList.map((row, idx) => {
                    const isExisting = formateurs.some(
                      (f) => f.matricule.trim().toLowerCase() === row.matricule.trim().toLowerCase()
                    )
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0a0a0a' }}>{row.matricule || '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0a0a0a', textTransform: 'uppercase' }}>{row.nom || '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0a0a0a' }}>{row.prenom || '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {isExisting ? (
                            <span style={{
                              fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                              background: '#fef3c7', color: '#b45309'
                            }}>
                              {lang === 'ar' ? 'تحديث' : 'Mise à jour'}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                              background: '#dcfce7', color: '#15803d'
                            }}>
                              {lang === 'ar' ? 'جديد' : 'Nouveau'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="modal-footer" style={{ marginTop: 0, justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isImporting}
                onClick={() => setIsImportModalOpen(false)}
                style={{ padding: '10px 22px', fontSize: 14 }}
              >
                {lang === 'ar' ? 'إلغاء' : 'Annuler'}
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={handleConfirmImport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 24px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  opacity: isImporting ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
              >
                <CheckCircle2 size={16} />
                {isImporting
                  ? (lang === 'ar' ? 'جاري الاستيراد...' : 'Importation en cours...')
                  : (lang === 'ar' ? `تأكيد استيراد (${importedList.length})` : `Confirmer l'importation (${importedList.length})`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Style helpers
const thStyle: React.CSSProperties = {
  padding: '16px 20px',
  fontWeight: 800,
  fontSize: 17,
  color: '#0a0a0a',
  textAlign: 'left',
  letterSpacing: 0.4,
  borderBottom: '2px solid rgba(0,0,0,0.15)'
}

const tdStyle: React.CSSProperties = {
  padding: '14px 20px',
  verticalAlign: 'middle'
}
