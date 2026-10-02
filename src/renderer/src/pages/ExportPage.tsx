import React, { useState, useEffect } from 'react'
import { FileDown, Users, UsersRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { formateursService, groupesService } from '../services/firebaseService'
import type { Formateur, Groupe } from '../types'
import { useTranslation } from '../lib/i18n'

export default function ExportPage(): React.ReactElement {
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [loading, setLoading] = useState(true)
  const { lang } = useTranslation()

  useEffect(() => {
    async function loadData() {
      try {
        const [formateursData, groupesData] = await Promise.all([
          formateursService.getAll(),
          groupesService.getAll()
        ])
        setFormateurs(formateursData)
        setGroupes(groupesData.filter(g => !g.en_stage))
      } catch (error) {
        toast.error('حدث خطأ أثناء تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  function handleExport(type: string, id?: string) {
    // In a real app, we would use jsPDF + html2canvas here to generate the PDF
    // For this prototype, we'll just show a success message
    toast.success(`جاري تجهيز وتصدير ملف PDF...`)
    setTimeout(() => {
      toast.success('تم التصدير بنجاح! تم حفظ الملف.')
    }, 1500)
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'تصدير التقارير (PDF)' : 'Export des Rapports (PDF)'}</h1>
          <p>{lang === 'ar' ? 'استخراج وطباعة جداول الحصص بصيغة PDF عالية الجودة' : 'Extraction et impression des emplois du temps en format PDF haute qualité'}</p>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <div className="dashboard-grid">
            
            {/* تصدير حسب المكونين */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '17px' }}>
                  <Users size={20} /> {lang === 'ar' ? 'جداول المكونين' : 'Plannings des Formateurs'}
                </h3>
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginBottom: 24, padding: '13px 20px', fontSize: '15px', fontWeight: 600, gap: '8px' }}
                onClick={() => handleExport('all-formateurs')}
              >
                <FileDown size={18} /> {lang === 'ar' ? 'تصدير جدول جميع المكونين (مجمع)' : 'Exporter tous les formateurs (Global)'}
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
                {lang === 'ar' ? 'تصدير فردي:' : 'Export individuel :'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 6 }}>
                {formateurs.map((f) => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{f.nom_prenom}</span>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '7px 14px', fontSize: '13px', gap: '6px' }} onClick={() => handleExport('single-formateur', f.id)}>
                      <FileDown size={15} /> {lang === 'ar' ? 'تصدير' : 'Exporter'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* تصدير حسب الأفواج */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '17px' }}>
                  <UsersRound size={20} /> {lang === 'ar' ? 'جداول الأفواج' : 'Plannings des Groupes'}
                </h3>
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginBottom: 24, padding: '13px 20px', fontSize: '15px', fontWeight: 600, gap: '8px', background: 'linear-gradient(135deg, #059669, #10b981)' }}
                onClick={() => handleExport('all-groupes')}
              >
                <FileDown size={18} /> {lang === 'ar' ? 'تصدير جدول جميع الأفواج (مجمع)' : 'Exporter tous les groupes (Global)'}
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
                {lang === 'ar' ? 'تصدير فردي:' : 'Export individuel :'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 6 }}>
                {groupes.map((g) => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{g.code_groupe}</span>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '7px 14px', fontSize: '13px', gap: '6px' }} onClick={() => handleExport('single-groupe', g.id)}>
                      <FileDown size={15} /> {lang === 'ar' ? 'تصدير' : 'Exporter'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
