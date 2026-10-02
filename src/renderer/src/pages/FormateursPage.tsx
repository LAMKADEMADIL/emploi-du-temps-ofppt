import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
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
      setPhotoUrl(null)
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
    const confirmMsg = lang === 'ar'
      ? 'هل أنت متأكد من حذف هذا المكون؟'
      : 'Êtes-vous sûr de vouloir supprimer ce formateur ?'
    if (window.confirm(confirmMsg)) {
      try {
        await formateursService.delete(id)
        toast.success(lang === 'ar' ? 'تم الحذف بنجاح' : 'Supprimé avec succès')
        loadFormateurs()
      } catch {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Erreur lors de la suppression')
      }
    }
  }

  return (
    <div className="fade-in-up">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'إدارة المكونين' : 'Gestion des Formateurs'}</h1>
          <p>{lang === 'ar' ? 'إضافة، تعديل، أو حذف بيانات المكونين (الأساتذة)' : 'Ajouter, modifier ou supprimer les formateurs'}</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '11px 22px', fontSize: '14px', gap: '8px', fontWeight: 600 }}
          onClick={() => openModal()}
        >
          <Plus size={18} /> {lang === 'ar' ? 'إضافة مكون جديد' : 'Ajouter un formateur'}
        </button>
      </div>

      {/* Table */}
      <div className="page-body">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 40 }}><div className="spinner" /></div>
          ) : formateurs.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon">👥</div>
              <h3>{lang === 'ar' ? 'لا يوجد مكونون' : 'Aucun formateur'}</h3>
              <p>{lang === 'ar' ? 'قم بإضافة المكونين للبدء في استخدام النظام' : 'Ajoutez des formateurs pour commencer'}</p>
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
                            color: '#1a1a2e',
                            fontSize: 15
                          }}>{f.matricule}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 15, color: '#374151' }}>{prenomVal}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600, fontSize: 15, color: '#1a1a2e', textTransform: 'uppercase' }}>{nomVal}</span>
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
    </div>
  )
}

// Style helpers
const thStyle: React.CSSProperties = {
  padding: '14px 20px',
  fontWeight: 700,
  fontSize: 15,
  color: '#1a4d1a',
  textAlign: 'left',
  letterSpacing: 0.3,
  borderBottom: '2px solid rgba(255,255,255,0.3)'
}

const tdStyle: React.CSSProperties = {
  padding: '14px 20px',
  verticalAlign: 'middle'
}
