import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { filieresService } from '../services/firebaseService'
import type { Filiere } from '../types'
import { useTranslation } from '../lib/i18n'

export default function FilieresPage(): React.ReactElement {
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { lang } = useTranslation()
  
  const [codeFiliere, setCodeFiliere] = useState('')
  const [nomFiliere, setNomFiliere] = useState('')

  useEffect(() => {
    loadFilieres()
  }, [])

  async function loadFilieres() {
    try {
      setLoading(true)
      const data = await filieresService.getAll()
      const sortedData = data.sort((a, b) => a.code_filiere.localeCompare(b.code_filiere))
      setFilieres(sortedData)
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openModal(filiere?: Filiere) {
    if (filiere) {
      setEditingId(filiere.id!)
      setCodeFiliere(filiere.code_filiere)
      setNomFiliere(filiere.nom_filiere)
    } else {
      setEditingId(null)
      setCodeFiliere('')
      setNomFiliere('')
    }
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!codeFiliere || !nomFiliere) {
      toast.error('الرجاء ملء جميع الحقول')
      return
    }

    try {
      if (editingId) {
        await filieresService.update(editingId, { code_filiere: codeFiliere, nom_filiere: nomFiliere })
        toast.success('تم التحديث بنجاح')
      } else {
        await filieresService.add({ code_filiere: codeFiliere, nom_filiere: nomFiliere })
        toast.success('تمت الإضافة بنجاح')
      }
      closeModal()
      loadFilieres()
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm('هل أنت متأكد من حذف هذه الشعبة؟ (قد يؤثر على الأفواج المرتبطة)')) {
      try {
        await filieresService.delete(id)
        toast.success('تم الحذف بنجاح')
        loadFilieres()
      } catch (error) {
        toast.error('حدث خطأ أثناء الحذف')
      }
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'إدارة الشعب والتخصصات' : 'Filières et Spécialités'}</h1>
          <p>{lang === 'ar' ? 'إدارة الشعب التدريبية بالمؤسسة (مثال: TEMI, TDI)' : 'Gestion des filières de formation (ex: TEMI, TDI)'}</p>
        </div>
        <button 
          className="btn btn-primary" 
          style={{ padding: '11px 22px', fontSize: '14px', gap: '8px', fontWeight: 600 }}
          onClick={() => openModal()}
        >
          <Plus size={18} /> {lang === 'ar' ? 'إضافة شعبة جديدة' : 'Ajouter une filière'}
        </button>
      </div>

      <div className="page-body">
        <div className="card" style={{ padding: '24px' }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : filieres.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <h3>{lang === 'ar' ? 'لا توجد شعب مسجلة' : 'Aucune filière'}</h3>
              <p>{lang === 'ar' ? 'قم بإضافة الشعب والتخصصات المتاحة' : 'Ajoutez des filières pour commencer'}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>{lang === 'ar' ? 'رمز الشعبة (Code)' : 'Code Filière'}</th>
                    <th>{lang === 'ar' ? 'اسم الشعبة الكامل' : 'Nom Complet de la Filière'}</th>
                    <th style={{ width: 140, textAlign: 'center' }}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filieres.map((f) => (
                    <tr key={f.id}>
                      <td><span className="badge badge-primary">{f.code_filiere}</span></td>
                      <td style={{ fontWeight: 600, fontSize: '15px' }}>{f.nom_filiere}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                          <button 
                            className="btn btn-secondary btn-icon" 
                            title={lang === 'ar' ? 'تعديل' : 'Modifier'} 
                            onClick={() => openModal(f)}
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            className="btn btn-danger btn-icon" 
                            title={lang === 'ar' ? 'حذف' : 'Supprimer'} 
                            onClick={() => handleDelete(f.id!)}
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
              <h3 className="modal-title">{editingId ? 'تعديل شعبة' : 'إضافة شعبة جديدة'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">رمز الشعبة (Code)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: TEMI"
                  value={codeFiliere}
                  onChange={(e) => setCodeFiliere(e.target.value.toUpperCase())}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">الاسم الكامل للشعبة</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: Technicien en Électricité de Maintenance Industrielle"
                  value={nomFiliere}
                  onChange={(e) => setNomFiliere(e.target.value)}
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
