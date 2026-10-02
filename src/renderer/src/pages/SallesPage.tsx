import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { sallesService } from '../services/firebaseService'
import type { Salle } from '../types'
import { useTranslation } from '../lib/i18n'

export default function SallesPage(): React.ReactElement {
  const [salles, setSalles] = useState<Salle[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { lang } = useTranslation()
  
  const [nomSalle, setNomSalle] = useState('')
  const [typeSalle, setTypeSalle] = useState<'Salle' | 'Atelier'>('Salle')

  useEffect(() => {
    loadSalles()
  }, [])

  async function loadSalles() {
    try {
      setLoading(true)
      const data = await sallesService.getAll()
      setSalles(data)
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openModal(salle?: Salle) {
    if (salle) {
      setEditingId(salle.id!)
      setNomSalle(salle.nom_salle)
      setTypeSalle(salle.type_salle)
    } else {
      setEditingId(null)
      setNomSalle('')
      setTypeSalle('Salle')
    }
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nomSalle) {
      toast.error('الرجاء إدخال اسم القاعة')
      return
    }

    try {
      if (editingId) {
        await sallesService.update(editingId, { nom_salle: nomSalle, type_salle: typeSalle })
        toast.success('تم التحديث بنجاح')
      } else {
        await sallesService.add({ nom_salle: nomSalle, type_salle: typeSalle })
        toast.success('تمت الإضافة بنجاح')
      }
      closeModal()
      loadSalles()
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm('هل أنت متأكد من حذف هذه القاعة؟')) {
      try {
        await sallesService.delete(id)
        toast.success('تم الحذف بنجاح')
        loadSalles()
      } catch (error) {
        toast.error('حدث خطأ أثناء الحذف')
      }
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'إدارة القاعات والورشات' : 'Salles et Ateliers'}</h1>
          <p>{lang === 'ar' ? 'إدارة وتصنيف الأماكن المخصصة للتدريس والتدريب' : 'Gestion des salles de cours et ateliers pratiques'}</p>
        </div>
        <button 
          className="btn btn-primary" 
          style={{ padding: '11px 22px', fontSize: '14px', gap: '8px', fontWeight: 600 }}
          onClick={() => openModal()}
        >
          <Plus size={18} /> {lang === 'ar' ? 'إضافة قاعة جديدة' : 'Ajouter une salle'}
        </button>
      </div>

      <div className="page-body">
        <div className="card" style={{ padding: '24px' }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : salles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚪</div>
              <h3>{lang === 'ar' ? 'لا توجد قاعات' : 'Aucune salle'}</h3>
              <p>{lang === 'ar' ? 'قم بإضافة القاعات والورشات للبدء' : 'Ajoutez des salles et ateliers pour commencer'}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>{lang === 'ar' ? 'اسم القاعة / الورشة' : 'Nom de la Salle / Atelier'}</th>
                    <th style={{ width: 180 }}>{lang === 'ar' ? 'النوع' : 'Type'}</th>
                    <th style={{ width: 140, textAlign: 'center' }}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {salles.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, fontSize: '15px' }}>{s.nom_salle}</td>
                      <td>
                        <span className={`badge ${s.type_salle === 'Salle' ? 'badge-primary' : 'badge-warning'}`}>
                          {s.type_salle === 'Salle' 
                            ? (lang === 'ar' ? 'قاعة عادية' : 'Salle de cours') 
                            : (lang === 'ar' ? 'ورشة عمل' : 'Atelier')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                          <button 
                            className="btn btn-secondary btn-icon" 
                            title={lang === 'ar' ? 'تعديل' : 'Modifier'} 
                            onClick={() => openModal(s)}
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            className="btn btn-danger btn-icon" 
                            title={lang === 'ar' ? 'حذف' : 'Supprimer'} 
                            onClick={() => handleDelete(s.id!)}
                          >
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
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: S1, Atelier 2"
                  value={nomSalle}
                  onChange={(e) => setNomSalle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">النوع</label>
                <select 
                  className="form-select"
                  value={typeSalle}
                  onChange={(e) => setTypeSalle(e.target.value as 'Salle' | 'Atelier')}
                >
                  <option value="Salle">قاعة عادية (Salle)</option>
                  <option value="Atelier">ورشة عمل (Atelier)</option>
                </select>
              </div>
              
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary">
                  حفظ البيانات
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
