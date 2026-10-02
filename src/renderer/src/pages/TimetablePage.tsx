import React, { useState, useEffect } from 'react'
import { Plus, Trash2, CalendarDays, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  seancesService, 
  formateursService, 
  sallesService, 
  groupesService 
} from '../services/firebaseService'
import { JOURS, TIME_SLOTS, type Seance, type Formateur, type Salle, type Groupe, type Jour, type HeureDebut, type HeureFin } from '../types'
import { useTranslation } from '../lib/i18n'

export default function TimetablePage(): React.ReactElement {
  const [seances, setSeances] = useState<Seance[]>([])
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [salles, setSalles] = useState<Salle[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const { lang } = useTranslation()
  
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [conflictMsg, setConflictMsg] = useState('')
  
  // View mode
  const [viewType, setViewType] = useState<'global' | 'formateur' | 'groupe'>('global')
  const [selectedFilterId, setSelectedFilterId] = useState<string>('')

  // Form state
  const [selectedJour, setSelectedJour] = useState<Jour>('Lundi')
  const [selectedDebut, setSelectedDebut] = useState<HeureDebut>('08:30')
  const [selectedFin, setSelectedFin] = useState<HeureFin>('11:00')
  const [moduleCode, setModuleCode] = useState('')
  const [idFormateur, setIdFormateur] = useState('')
  const [idSalle, setIdSalle] = useState('')
  const [idGroupe, setIdGroupe] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [seancesData, formateursData, sallesData, groupesData] = await Promise.all([
        seancesService.getAll(),
        formateursService.getAll(),
        sallesService.getAll(),
        groupesService.getAll()
      ])
      
      // Map names to seances
      const mappedSeances = seancesData.map(s => {
        const formateur = formateursData.find(f => f.id === s.id_formateur)
        const salle = sallesData.find(sa => sa.id === s.id_salle)
        const groupe = groupesData.find(g => g.id === s.id_groupe)
        
        return {
          ...s,
          nom_formateur: formateur?.nom_prenom || 'غير معروف',
          nom_salle: salle?.nom_salle || 'غير معروف',
          code_groupe: groupe?.code_groupe || 'غير معروف'
        }
      })

      setSeances(mappedSeances)
      setFormateurs(formateursData)
      setSalles(sallesData)
      setGroupes(groupesData.filter(g => !g.en_stage)) // Only non-stage groups
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openModal(jour: Jour, debut: HeureDebut, fin: HeureFin) {
    if (formateurs.length === 0 || salles.length === 0 || groupes.length === 0) {
      toast.error('يجب إضافة المكونين والقاعات والأفواج أولاً')
      return
    }

    setSelectedJour(jour)
    setSelectedDebut(debut)
    setSelectedFin(fin)
    setModuleCode('')
    
    // Auto-select based on current filter if applicable
    setIdFormateur(viewType === 'formateur' && selectedFilterId ? selectedFilterId : formateurs[0].id!)
    setIdGroupe(viewType === 'groupe' && selectedFilterId ? selectedFilterId : groupes[0].id!)
    setIdSalle(salles[0].id!)
    
    setConflictMsg('')
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!moduleCode || !idFormateur || !idSalle || !idGroupe) {
      toast.error('الرجاء ملء جميع الحقول')
      return
    }

    const newSeance = {
      jour: selectedJour,
      heure_debut: selectedDebut,
      heure_fin: selectedFin,
      module_code: moduleCode,
      id_formateur: idFormateur,
      id_salle: idSalle,
      id_groupe: idGroupe
    }

    // Check conflicts
    const conflict = await seancesService.checkConflict(newSeance)
    if (conflict.hasConflict) {
      setConflictMsg(conflict.message)
      return
    }

    try {
      await seancesService.add(newSeance)
      toast.success('تمت الإضافة بنجاح')
      setIsModalOpen(false)
      loadData()
    } catch (error) {
      toast.error('حدث خطأ أثناء حفظ الحصة')
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (window.confirm('هل أنت متأكد من حذف هذه الحصة؟')) {
      try {
        await seancesService.delete(id)
        toast.success('تم حذف الحصة')
        loadData()
      } catch (error) {
        toast.error('حدث خطأ أثناء الحذف')
      }
    }
  }

  // Filter seances based on current view
  const filteredSeances = seances.filter(s => {
    if (viewType === 'formateur' && selectedFilterId) return s.id_formateur === selectedFilterId
    if (viewType === 'groupe' && selectedFilterId) return s.id_groupe === selectedFilterId
    return true
  })

  function getSeanceForCell(jour: Jour, debut: HeureDebut) {
    return filteredSeances.find(s => s.jour === jour && s.heure_debut === debut)
  }

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'الجدول الزمني للحصص' : 'Emploi du Temps'}</h1>
          <p>{lang === 'ar' ? 'تخطيط وبرمجة الحصص الأسبوعية' : 'Planification et programmation hebdomadaire des séances'}</p>
        </div>
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select 
            className="form-select" 
            style={{ width: 170, padding: '10px 14px', fontSize: '14.5px', fontWeight: 600 }}
            value={viewType}
            onChange={(e) => {
              setViewType(e.target.value as any)
              setSelectedFilterId('')
            }}
          >
            <option value="global">{lang === 'ar' ? 'عرض شامل' : 'Vue Globale'}</option>
            <option value="formateur">{lang === 'ar' ? 'حسب المكون' : 'Par Formateur'}</option>
            <option value="groupe">{lang === 'ar' ? 'حسب الفوج' : 'Par Groupe'}</option>
          </select>

          {viewType === 'formateur' && (
            <select 
              className="form-select" 
              style={{ width: 220, padding: '10px 14px', fontSize: '14.5px' }}
              value={selectedFilterId}
              onChange={(e) => setSelectedFilterId(e.target.value)}
            >
              <option value="">{lang === 'ar' ? '-- اختر المكون --' : '-- Choisir le formateur --'}</option>
              {formateurs.map((f) => <option key={f.id} value={f.id}>{f.nom_prenom}</option>)}
            </select>
          )}

          {viewType === 'groupe' && (
            <select 
              className="form-select" 
              style={{ width: 220, padding: '10px 14px', fontSize: '14.5px' }}
              value={selectedFilterId}
              onChange={(e) => setSelectedFilterId(e.target.value)}
            >
              <option value="">{lang === 'ar' ? '-- اختر الفوج --' : '-- Choisir le groupe --'}</option>
              {groupes.map((g) => <option key={g.id} value={g.id}>{g.code_groupe}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="page-body" style={{ flex: 1, paddingBottom: 0 }}>
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (viewType !== 'global' && !selectedFilterId) ? (
          <div className="empty-state">
            <div className="empty-state-icon">👆</div>
            <h3>الرجاء تحديد عنصر</h3>
            <p>اختر من القائمة أعلاه لعرض الجدول الخاص به</p>
          </div>
        ) : (
          <div className="timetable-container" style={{ height: 'calc(100vh - 160px)' }}>
            <table className="timetable-grid">
              <thead>
                <tr>
                  <th className="time-col">الأيام / الأوقات</th>
                  {TIME_SLOTS.map(slot => (
                    <th key={slot.debut}>{slot.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {JOURS.map(jour => (
                  <tr key={jour}>
                    <td className="time-col">{jour}</td>
                    {TIME_SLOTS.map(slot => {
                      const seance = getSeanceForCell(jour, slot.debut)
                      
                      return (
                        <td key={`${jour}-${slot.debut}`} className="timetable-cell">
                          {seance ? (
                            <div className="cell-content">
                              <div className="seance-chip">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <span className="chip-module">{seance.module_code}</span>
                                  <Trash2 size={12} color="rgba(255,255,255,0.7)" style={{ cursor: 'pointer' }} onClick={(e) => handleDelete(seance.id!, e)} />
                                </div>
                                {viewType !== 'formateur' && <span className="chip-detail">👨‍🏫 {seance.nom_formateur}</span>}
                                {viewType !== 'groupe' && <span className="chip-detail">👥 {seance.code_groupe}</span>}
                                <span className="chip-detail">🚪 {seance.nom_salle}</span>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="cell-empty"
                              onClick={() => openModal(jour, slot.debut, slot.fin)}
                            >
                              <Plus size={20} />
                            </div>
                          )}
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

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">برمجة حصة جديدة</h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="badge badge-primary"><CalendarDays size={14}/> {selectedJour}</span>
              <span className="badge badge-success">{selectedDebut} - {selectedFin}</span>
            </div>

            {conflictMsg && (
              <div className="conflict-alert">
                <AlertTriangle size={16} />
                <span>{conflictMsg}</span>
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">المادة / الوحدة (Module)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: M01 - Algorithm"
                  value={moduleCode}
                  onChange={(e) => {
                    setModuleCode(e.target.value)
                    setConflictMsg('') // Clear conflict msg on change
                  }}
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">المكون (Formateur)</label>
                <select 
                  className="form-select"
                  value={idFormateur}
                  onChange={(e) => {
                    setIdFormateur(e.target.value)
                    setConflictMsg('')
                  }}
                >
                  {formateurs.map(f => <option key={f.id} value={f.id}>{f.nom_prenom}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">الفوج (Groupe)</label>
                <select 
                  className="form-select"
                  value={idGroupe}
                  onChange={(e) => {
                    setIdGroupe(e.target.value)
                    setConflictMsg('')
                  }}
                >
                  {groupes.map(g => <option key={g.id} value={g.id}>{g.code_groupe}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">القاعة / الورشة</label>
                <select 
                  className="form-select"
                  value={idSalle}
                  onChange={(e) => {
                    setIdSalle(e.target.value)
                    setConflictMsg('')
                  }}
                >
                  {salles.map(s => <option key={s.id} value={s.id}>{s.nom_salle} - {s.type_salle}</option>)}
                </select>
              </div>
              
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary">
                  تأكيد وحفظ
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
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
