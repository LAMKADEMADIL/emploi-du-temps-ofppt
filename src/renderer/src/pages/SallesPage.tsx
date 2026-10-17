import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { sallesService } from '../services/firebaseService'
import type { Salle } from '../types'
import { useTranslation } from '../lib/i18n'

const SALLES_OFFICIELLES: Omit<Salle, 'id'>[] = [
  { nom_salle: 'SALLE 01',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 02',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 03',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 05',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 06',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 08',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 09',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 10',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE 11',   type_salle: 'Salle'   },
  { nom_salle: 'SALLE INFO', type_salle: 'Salle'   },
  { nom_salle: 'AT EB',      type_salle: 'Atelier' },
  { nom_salle: 'AT TFM',     type_salle: 'Atelier' },
  { nom_salle: 'AT EEI',     type_salle: 'Atelier' },
  { nom_salle: 'AT PC',      type_salle: 'Atelier' },
  { nom_salle: 'AT AEFGT',   type_salle: 'Atelier' },
  { nom_salle: 'AT RVA1',    type_salle: 'Atelier' },
  { nom_salle: 'AT RVA2',    type_salle: 'Atelier' },
  { nom_salle: 'AT RVA3',    type_salle: 'Atelier' },
  { nom_salle: 'AT CPA',     type_salle: 'Atelier' },
  { nom_salle: 'AT OPCM1',   type_salle: 'Atelier' },
  { nom_salle: 'AT OPCM2',   type_salle: 'Atelier' },
  { nom_salle: 'AT MA',      type_salle: 'Atelier' },
  { nom_salle: 'AT MOAB',    type_salle: 'Atelier' },
  { nom_salle: 'AT TREM',    type_salle: 'Atelier' },
  { nom_salle: 'AT TEMI1',   type_salle: 'Atelier' },
  { nom_salle: 'AT ESA',     type_salle: 'Atelier' },
  { nom_salle: 'AT TEMI2',   type_salle: 'Atelier' },
]

export default function SallesPage(): React.ReactElement {
  const [salles, setSalles] = useState<Salle[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { lang } = useTranslation()

  const [nomSalle, setNomSalle] = useState('')
  const [typeSalle, setTypeSalle] = useState<'Salle' | 'Atelier'>('Salle')

  useEffect(() => { loadSalles() }, [])

  async function loadSalles() {
    try {
      setLoading(true)
      const data = await sallesService.getAll()
      setSalles(data)
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // حساب عدد القاعات المكررة بدقة
  const duplicateCount = React.useMemo(() => {
    const seen = new Set<string>()
    let count = 0
    salles.forEach(s => {
      const clean = (s.nom_salle || '').trim().toUpperCase()
      if (seen.has(clean)) count++
      else seen.add(clean)
    })
    return count
  }, [salles])

  // إزالة النسخ المكررة تلقائياً من Firebase
  async function handleRemoveDuplicates() {
    try {
      setResetting(true)
      const allSalles = await sallesService.getAll()
      const seen = new Set<string>()
      const duplicatesToDelete: string[] = []

      for (const s of allSalles) {
        const clean = (s.nom_salle || '').trim().toUpperCase()
        if (seen.has(clean)) {
          if (s.id) duplicatesToDelete.push(s.id)
        } else {
          seen.add(clean)
        }
      }

      if (duplicatesToDelete.length === 0) {
        toast.success(lang === 'ar' ? 'لا توجد قاعات مكررة' : 'Aucun doublon trouvé')
        return
      }

      for (const id of duplicatesToDelete) {
        await sallesService.delete(id)
      }

      toast.success(
        lang === 'ar'
          ? `✅ تم حذف ${duplicatesToDelete.length} قاعة مكررة بنجاح!`
          : `✅ ${duplicatesToDelete.length} salle(s) en double supprimée(s) !`
      )
      loadSalles()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء إزالة التكرارات' : 'Erreur lors de la suppression des doublons')
    } finally {
      setResetting(false)
    }
  }

  async function handleResetSalles() {
    const msg = lang === 'ar'
      ? 'سيتم حذف جميع القاعات الحالية واستبدالها بالقائمة الرسمية (27 قاعة). هل تريد المتابعة؟'
      : 'Toutes les salles actuelles seront supprimées et remplacées par la liste officielle (27 salles). Continuer ?'
    if (!window.confirm(msg)) return
    try {
      setResetting(true)
      await sallesService.deleteAll()
      for (const s of SALLES_OFFICIELLES) await sallesService.add(s)
      toast.success(lang === 'ar' ? '✅ تم تحديث القاعات (27 قاعة)' : '✅ Salles réinitialisées (27 salles)')
      loadSalles()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء إعادة التعيين' : 'Erreur lors de la réinitialisation')
    } finally {
      setResetting(false)
    }
  }

  function openModal(salle?: Salle) {
    setEditingId(salle?.id ?? null)
    setNomSalle(salle?.nom_salle ?? '')
    setTypeSalle(salle?.type_salle ?? 'Salle')
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nomSalle.trim()) {
      toast.error(lang === 'ar' ? 'الرجاء إدخال اسم القاعة' : 'Veuillez entrer le nom de la salle')
      return
    }

    const cleanName = nomSalle.trim().toUpperCase()
    const isDuplicate = salles.some(
      s => s.id !== editingId && (s.nom_salle || '').trim().toUpperCase() === cleanName
    )
    if (isDuplicate) {
      toast.error(
        lang === 'ar'
          ? `القاعة "${nomSalle.trim()}" موجودة بالفعل في قاعدة البيانات!`
          : `La salle « ${nomSalle.trim()} » existe déjà dans la base !`
      )
      return
    }

    try {
      if (editingId) {
        await sallesService.update(editingId, { nom_salle: nomSalle.trim(), type_salle: typeSalle })
        toast.success(lang === 'ar' ? 'تم التحديث بنجاح' : 'Mis à jour avec succès')
      } else {
        await sallesService.add({ nom_salle: nomSalle.trim(), type_salle: typeSalle })
        toast.success(lang === 'ar' ? 'تمت الإضافة بنجاح' : 'Ajouté avec succès')
      }
      closeModal()
      loadSalles()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحفظ' : "Erreur lors de l'enregistrement")
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذه القاعة؟' : 'Êtes-vous sûr de vouloir supprimer cette salle ?')) return
    try {
      await sallesService.delete(id)
      toast.success(lang === 'ar' ? 'تم الحذف بنجاح' : 'Supprimé avec succès')
      loadSalles()
    } catch {
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Erreur lors de la suppression')
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'إدارة القاعات والورشات' : 'Salles et Ateliers'}</h1>
          <p>
            {lang === 'ar'
              ? `إدارة وتصنيف القاعات والورشات (${salles.length} مسجلة في قاعدة البيانات)`
              : `Gestion des salles et ateliers (${salles.length} enregistrée(s) dans la base de données)`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Duplicate cleaner button if duplicates exist */}
          {duplicateCount > 0 && (
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 16px',
                fontSize: '13.5px',
                fontWeight: 800,
                background: '#fef2f2',
                color: '#dc2626',
                border: '1.5px solid #ef4444',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)'
              }}
              onClick={handleRemoveDuplicates}
              disabled={resetting}
              title={lang === 'ar' ? 'إزالة كافة النسخ المكررة من قاعدة البيانات' : 'Supprimer automatiquement tous les doublons de la base'}
            >
              <Trash2 size={16} />
              {lang === 'ar'
                ? `حذف التكرارات (${duplicateCount})`
                : `Supprimer les doublons (${duplicateCount})`}
            </button>
          )}

          {/* Reset to official 27 rooms button */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: '10px 18px',
              fontSize: '13.5px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 'var(--radius-md)'
            }}
            onClick={handleResetSalles}
            disabled={resetting}
            title={lang === 'ar' ? 'إعادة ضبط القاعات للقائمة الرسمية الـ 27' : 'Réinitialiser aux 27 salles officielles'}
          >
            <RefreshCw size={15} style={resetting ? { animation: 'spin 1s linear infinite' } : {}} />
            {lang === 'ar' ? 'إعادة تعيين الرسمية (27)' : 'Réinitialiser (27 salles)'}
          </button>

          {/* Add Room Button */}
          <button
            className="btn btn-primary"
            style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => openModal()}
          >
            <Plus size={18} /> {lang === 'ar' ? 'إضافة قاعة جديدة' : 'Ajouter une salle'}
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ padding: '24px' }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : salles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚪</div>
              <h3>{lang === 'ar' ? 'لا توجد قاعات' : 'Aucune salle'}</h3>
              <p>{lang === 'ar' ? 'قم بتحميل القائمة الرسمية' : 'Chargez la liste officielle'}</p>
              <button className="btn btn-primary" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }} onClick={handleResetSalles}>
                <RefreshCw size={16} />
                {lang === 'ar' ? 'تحميل القائمة الرسمية' : 'Charger la liste officielle'}
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ fontSize: 15, fontWeight: 700 }}>{lang === 'ar' ? 'اسم القاعة / الورشة' : 'Nom de la Salle / Atelier'}</th>
                    <th style={{ width: 200, fontSize: 15, fontWeight: 700 }}>{lang === 'ar' ? 'النوع' : 'Type'}</th>
                    <th style={{ width: 140, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {salles.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700, fontSize: '17px', padding: '14px 16px' }}>{s.nom_salle}</td>
                      <td>
                        <span className={`badge ${s.type_salle === 'Salle' ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: 14, padding: '6px 14px' }}>
                          {s.type_salle === 'Salle'
                            ? (lang === 'ar' ? 'قاعة عادية' : 'Salle de cours')
                            : (lang === 'ar' ? 'ورشة عمل' : 'Atelier')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                          <button className="btn btn-secondary btn-icon" title={lang === 'ar' ? 'تعديل' : 'Modifier'} onClick={() => openModal(s)}>
                            <Edit size={16} />
                          </button>
                          <button className="btn btn-danger btn-icon" title={lang === 'ar' ? 'حذف' : 'Supprimer'} onClick={() => handleDelete(s.id!)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingId ? 'تعديل قاعة' : 'إضافة قاعة جديدة'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">اسم / رقم القاعة</label>
                <input type="text" className="form-input" placeholder="مثال: SALLE 01, AT EB" value={nomSalle} onChange={(e) => setNomSalle(e.target.value)} autoFocus />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">النوع</label>
                <select className="form-select" value={typeSalle} onChange={(e) => setTypeSalle(e.target.value as 'Salle' | 'Atelier')}>
                  <option value="Salle">قاعة عادية (Salle)</option>
                  <option value="Atelier">ورشة عمل (Atelier)</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary">حفظ البيانات</button>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
