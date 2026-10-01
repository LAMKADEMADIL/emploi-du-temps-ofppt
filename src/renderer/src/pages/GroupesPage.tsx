import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { groupesService, filieresService } from '../services/firebaseService'
import type { Groupe, Filiere } from '../types'

export default function GroupesPage(): React.ReactElement {
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [codeGroupe, setCodeGroupe] = useState('')
  const [idFiliere, setIdFiliere] = useState('')
  const [enStage, setEnStage] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [groupesData, filieresData] = await Promise.all([
        groupesService.getAll(),
        filieresService.getAll()
      ])
      
      // Map filiere names to groupes for display
      const mappedGroupes = groupesData.map(g => {
        const filiere = filieresData.find(f => f.id === g.id_filiere)
        return { ...g, nom_filiere: filiere ? filiere.code_filiere : 'غير معروف' }
      })

      setGroupes(mappedGroupes)
      setFilieres(filieresData)
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openModal(groupe?: Groupe) {
    if (groupe) {
      setEditingId(groupe.id!)
      setCodeGroupe(groupe.code_groupe)
      setIdFiliere(groupe.id_filiere)
      setEnStage(groupe.en_stage)
    } else {
      setEditingId(null)
      setCodeGroupe('')
      setIdFiliere(filieres.length > 0 ? filieres[0].id! : '')
      setEnStage(false)
    }
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!codeGroupe || !idFiliere) {
      toast.error('الرجاء ملء جميع الحقول المطلوبة')
      return
    }

    try {
      if (editingId) {
        await groupesService.update(editingId, { 
          code_groupe: codeGroupe, 
          id_filiere: idFiliere,
          en_stage: enStage 
        })
        toast.success('تم التحديث بنجاح')
      } else {
        await groupesService.add({ 
          code_groupe: codeGroupe, 
          id_filiere: idFiliere,
          en_stage: enStage 
        })
        toast.success('تمت الإضافة بنجاح')
      }
      closeModal()
      loadData()
    } catch (error) {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm('هل أنت متأكد من حذف هذا الفوج؟')) {
      try {
        await groupesService.delete(id)
        toast.success('تم الحذف بنجاح')
        loadData()
      } catch (error) {
        toast.error('حدث خطأ أثناء الحذف')
      }
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>إدارة الأفواج</h1>
          <p>إدارة المجموعات وحالتهم (في المعهد أو في فترة تدريب ميداني Stage)</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            if (filieres.length === 0) {
              toast.error('يجب إضافة شعبة واحدة على الأقل قبل إضافة الأفواج')
              return
            }
            openModal()
          }}
        >
          <Plus size={16} /> إضافة فوج جديد
        </button>
      </div>

      <div className="page-body">
        <div className="card">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : groupes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>لا توجد أفواج</h3>
              <p>قم بإضافة الأفواج للبدء في جدولة الحصص</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>رمز الفوج</th>
                    <th>الشعبة التابع لها</th>
                    <th>حالة الفوج</th>
                    <th style={{ width: 120 }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((g) => (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.code_groupe}</td>
                      <td><span className="badge badge-primary">{g.nom_filiere}</span></td>
                      <td>
                        {g.en_stage ? (
                          <span className="badge badge-warning">في تدريب (Stage)</span>
                        ) : (
                          <span className="badge badge-success">في المعهد</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-secondary btn-icon" onClick={() => openModal(g)}>
                            <Edit size={14} />
                          </button>
                          <button className="btn btn-danger btn-icon" onClick={() => handleDelete(g.id!)}>
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
              <h3 className="modal-title">{editingId ? 'تعديل فوج' : 'إضافة فوج جديد'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">رمز الفوج (Code)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: TEMI 101"
                  value={codeGroupe}
                  onChange={(e) => setCodeGroupe(e.target.value.toUpperCase())}
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">الشعبة (Filière)</label>
                <select 
                  className="form-select"
                  value={idFiliere}
                  onChange={(e) => setIdFiliere(e.target.value)}
                >
                  {filieres.map(f => (
                    <option key={f.id} value={f.id}>{f.code_filiere} - {f.nom_filiere}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div className="toggle">
                    <input 
                      type="checkbox" 
                      checked={enStage}
                      onChange={(e) => setEnStage(e.target.checked)}
                    />
                    <div className="toggle-slider"></div>
                  </div>
                  <span>هذا الفوج حالياً في فترة تدريب ميداني (Stage) ولا يمكن جدولة حصص له</span>
                </label>
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
