import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { formateursService } from '../services/firebaseService'
import type { Formateur } from '../types'

export default function FormateursPage(): React.ReactElement {
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form state
  const [matricule, setMatricule] = useState('')
  const [nomPrenom, setNomPrenom] = useState('')

  useEffect(() => {
    loadFormateurs()
  }, [])

  async function loadFormateurs() {
    try {
      setLoading(true)
      const data = await formateursService.getAll()
      setFormateurs(data)
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openModal(formateur?: Formateur) {
    if (formateur) {
      setEditingId(formateur.id!)
      setMatricule(formateur.matricule)
      setNomPrenom(formateur.nom_prenom)
    } else {
      setEditingId(null)
      setMatricule('')
      setNomPrenom('')
    }
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!matricule || !nomPrenom) {
      toast.error('الرجاء ملء جميع الحقول')
      return
    }

    try {
      if (editingId) {
        await formateursService.update(editingId, { matricule, nom_prenom: nomPrenom })
        toast.success('تم التحديث بنجاح')
      } else {
        await formateursService.add({ matricule, nom_prenom: nomPrenom })
        toast.success('تمت الإضافة بنجاح')
      }
      closeModal()
      loadFormateurs()
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm('هل أنت متأكد من حذف هذا المكون؟')) {
      try {
        await formateursService.delete(id)
        toast.success('تم الحذف بنجاح')
        loadFormateurs()
      } catch (error) {
        toast.error('حدث خطأ أثناء الحذف')
      }
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>إدارة المكونين</h1>
          <p>إضافة، تعديل، أو حذف بيانات المكونين (الأساتذة)</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={16} /> إضافة مكون جديد
        </button>
      </div>

      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : formateurs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>لا يوجد مكونون</h3>
              <p>قم بإضافة المكونين للبدء في استخدام النظام</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>رقم التسجيل (Matricule)</th>
                    <th>الاسم الكامل (Nom & Prénom)</th>
                    <th style={{ width: 120 }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {formateurs.map((f) => (
                    <tr key={f.id}>
                      <td><span className="badge badge-primary">{f.matricule}</span></td>
                      <td style={{ fontWeight: 500 }}>{f.nom_prenom}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-secondary btn-icon" onClick={() => openModal(f)}>
                            <Edit size={14} />
                          </button>
                          <button className="btn btn-danger btn-icon" onClick={() => handleDelete(f.id!)}>
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
              <h3 className="modal-title">{editingId ? 'تعديل مكون' : 'إضافة مكون جديد'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">رقم التسجيل (Matricule)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: 12345"
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">الاسم الكامل</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: أحمد محمد"
                  value={nomPrenom}
                  onChange={(e) => setNomPrenom(e.target.value)}
                />
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
