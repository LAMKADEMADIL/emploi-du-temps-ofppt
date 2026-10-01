import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { sallesService } from '../services/firebaseService'
import type { Salle } from '../types'

export default function SallesPage(): React.ReactElement {
  const [salles, setSalles] = useState<Salle[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
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
          <h1>إدارة القاعات والورشات</h1>
          <p>إدارة وتصنيف الأماكن المخصصة للتدريس والتدريب</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={16} /> إضافة قاعة جديدة
        </button>
      </div>

      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : salles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚪</div>
              <h3>لا توجد قاعات</h3>
              <p>قم بإضافة القاعات والورشات للبدء</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>اسم القاعة / الورشة</th>
                    <th>النوع</th>
                    <th style={{ width: 120 }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {salles.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.nom_salle}</td>
                      <td>
                        <span className={`badge ${s.type_salle === 'Salle' ? 'badge-salle' : 'badge-atelier'}`}>
                          {s.type_salle === 'Salle' ? 'قاعة عادية' : 'ورشة عمل'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-secondary btn-icon" onClick={() => openModal(s)}>
                            <Edit size={14} />
                          </button>
                          <button className="btn btn-danger btn-icon" onClick={() => handleDelete(s.id!)}>
                            <Trash2 size={14} />
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
