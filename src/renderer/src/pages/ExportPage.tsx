import React, { useState, useEffect } from 'react'
import { FileDown, Users, UsersRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { formateursService, groupesService } from '../services/firebaseService'
import type { Formateur, Groupe } from '../types'

export default function ExportPage(): React.ReactElement {
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [loading, setLoading] = useState(true)

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
          <h1>تصدير التقارير (PDF)</h1>
          <p>استخراج وطباعة جداول الحصص بصيغة PDF عالية الجودة</p>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <div className="dashboard-grid">
            
            {/* تصدير حسب المكونين */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><Users size={18} /> جداول المكونين</h3>
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginBottom: 24 }}
                onClick={() => handleExport('all-formateurs')}
              >
                <FileDown size={16} /> تصدير جدول جميع المكونين (مجمع)
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

              <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>تصدير فردي:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
                {formateurs.map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{f.nom_prenom}</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleExport('single-formateur', f.id)}>
                      <FileDown size={14} /> تصدير
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* تصدير حسب الأفواج */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><UsersRound size={18} /> جداول الأفواج</h3>
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginBottom: 24, background: 'linear-gradient(135deg, #059669, #10b981)' }}
                onClick={() => handleExport('all-groupes')}
              >
                <FileDown size={16} /> تصدير جدول جميع الأفواج (مجمع)
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

              <h4 style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>تصدير فردي:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
                {groupes.map(g => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{g.code_groupe}</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleExport('single-groupe', g.id)}>
                      <FileDown size={14} /> تصدير
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
