import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { groupesService, filieresService } from '../services/firebaseService'
import type { Groupe, Filiere } from '../types'
import { useTranslation } from '../lib/i18n'

export default function GroupesPage(): React.ReactElement {
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { lang } = useTranslation()
  
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

  function openModal(groupe?: Groupe, defaultFiliereId?: string, defaultCode?: string) {
    if (groupe) {
      setEditingId(groupe.id!)
      setCodeGroupe(groupe.code_groupe)
      setIdFiliere(groupe.id_filiere)
      setEnStage(groupe.en_stage)
    } else {
      setEditingId(null)
      setCodeGroupe(defaultCode || '')
      setIdFiliere(defaultFiliereId || (filieres.length > 0 ? filieres[0].id! : ''))
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
        closeModal()
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
          <h1>{lang === 'ar' ? 'إدارة الأفواج' : 'Gestion des Groupes'}</h1>
          <p>{lang === 'ar' ? 'إدارة المجموعات وحالتهم (في المعهد أو في فترة تدريب ميداني Stage)' : 'Gestion des groupes et statut de stage'}</p>
        </div>
        <button 
          className="btn btn-primary" 
          style={{ padding: '11px 22px', fontSize: '14px', gap: '8px', fontWeight: 600 }}
          onClick={() => {
            if (filieres.length === 0) {
              toast.error(lang === 'ar' ? 'يجب إضافة شعبة واحدة على الأقل قبل إضافة الأفواج' : 'Ajoutez au moins une filière avant d\'ajouter des groupes')
              return
            }
            openModal()
          }}
        >
          <Plus size={18} /> {lang === 'ar' ? 'إضافة فوج جديد' : 'Ajouter un groupe'}
        </button>
      </div>

      <div className="page-body">
        <div className="card" style={{ padding: '24px' }}>
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : groupes.length === 0 && filieres.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>{lang === 'ar' ? 'لا توجد أفواج' : 'Aucun groupe'}</h3>
              <p>{lang === 'ar' ? 'قم بإضافة الأفواج للبدء في جدولة الحصص' : 'Ajoutez des groupes pour commencer la planification'}</p>
            </div>
          ) : (() => {
            // Compute virtual columns (100 and 200 for each filiere)
            const virtualCols = filieres.flatMap(f => {
              return [
                {
                  id: `${f.id}-100`,
                  filiere: f,
                  label: `${f.code_filiere}100`,
                  prefix: '1',
                  groupes: groupes.filter(g => g.id_filiere === f.id && (g.code_groupe.match(/\d+/) ? g.code_groupe.match(/\d+/)![0].startsWith('1') : true)).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe))
                },
                {
                  id: `${f.id}-200`,
                  filiere: f,
                  label: `${f.code_filiere}200`,
                  prefix: '2',
                  groupes: groupes.filter(g => g.id_filiere === f.id && (g.code_groupe.match(/\d+/) ? g.code_groupe.match(/\d+/)![0].startsWith('2') : false)).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe))
                }
              ]
            })

            const maxGroupCount = virtualCols.length > 0 ? Math.max(0, ...virtualCols.map(c => c.groupes.length)) : 0;
            const rowCount = Math.max(1, maxGroupCount + 1); // Always leave at least one empty row at the bottom for easy adding

            return (
              <div className="table-wrapper" style={{ overflowX: 'auto', paddingBottom: 10 }}>
                <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', border: '1.5px solid #000' }}>
                  <thead>
                    <tr style={{ background: '#f5dadf' }}>
                      <th style={{ width: 40, textAlign: 'center', border: '1.5px solid #000', padding: '10px', color: '#000' }}>#</th>
                      {virtualCols.map(col => (
                        <th key={col.id} style={{ textAlign: 'center', border: '1.5px solid #000', padding: '10px', color: '#000', fontWeight: 'bold' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowCount }).map((_, rowIndex) => (
                      <tr key={rowIndex}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', border: '1.5px solid #000', background: '#f8fafc', color: '#000' }}>
                          {rowIndex + 1}
                        </td>
                        {virtualCols.map(col => {
                          const groupe = col.groupes[rowIndex]
                          return (
                            <td 
                              key={col.id} 
                              style={{ 
                                textAlign: 'center', 
                                border: '1.5px solid #000', 
                                padding: '4px', 
                                minWidth: 100, 
                                cursor: groupe ? 'default' : 'pointer',
                                background: groupe ? 'transparent' : '#ffffff'
                              }}
                              onClick={() => {
                                if (!groupe) {
                                  // Suggest the code based on the row. e.g. TEMI 100 -> Row 1 -> TEMI101
                                  const suggestedNumber = (rowIndex + 1).toString().padStart(2, '0');
                                  const defaultCode = `${col.filiere.code_filiere}${col.prefix}${suggestedNumber}`;
                                  openModal(undefined, col.filiere.id, defaultCode);
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (!groupe) e.currentTarget.style.background = '#f1f5f9'
                              }}
                              onMouseLeave={(e) => {
                                if (!groupe) e.currentTarget.style.background = '#ffffff'
                              }}
                              title={!groupe ? (lang === 'ar' ? 'انقر لإضافة فوج هنا' : 'Cliquez pour ajouter un groupe') : undefined}
                            >
                              {groupe ? (
                                <div 
                                  onClick={(e) => { e.stopPropagation(); openModal(groupe); }}
                                  style={{ 
                                    cursor: 'pointer', 
                                    background: groupe.en_stage ? '#fef3c7' : 'transparent',
                                    color: groupe.en_stage ? '#b45309' : '#000',
                                    padding: '6px 4px',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    borderRadius: 4,
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!groupe.en_stage) e.currentTarget.style.background = '#e0e7ff'
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!groupe.en_stage) e.currentTarget.style.background = 'transparent'
                                  }}
                                  title={lang === 'ar' ? 'انقر للتعديل' : 'Cliquez pour modifier'}
                                >
                                  {groupe.code_groupe}
                                </div>
                              ) : (
                                <div style={{ height: '100%', minHeight: '28px' }}></div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, fontSize: 13, color: '#6b7280', display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span>💡 {lang === 'ar' ? 'انقر على خانة فارغة لإضافة فوج بسرعة، أو انقر على فوج للتعديل/الحذف' : 'Cliquez sur une case vide pour ajouter rapidement, ou sur un groupe pour modifier/supprimer'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 12, height: 12, background: '#fef3c7', borderRadius: 2, border: '1px solid #fcd34d' }}></div>
                    {lang === 'ar' ? 'في فترة تدريب (Stage)' : 'En Stage'}
                  </span>
                </div>
              </div>
            )
          })()}
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
              
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {editingId && (
                    <button 
                      type="button" 
                      className="btn btn-danger" 
                      style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => handleDelete(editingId)}
                    >
                      <Trash2 size={16} />
                      {lang === 'ar' ? 'حذف الفوج' : 'Supprimer'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {lang === 'ar' ? 'حفظ البيانات' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
