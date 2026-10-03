import React from 'react'
import { Grid3X3, Trash2 } from 'lucide-react'
import { useTranslation } from '../lib/i18n'

export default function SalleGridPage(): React.ReactElement {
  const { lang } = useTranslation()

  // Placeholder data for the visual structure
  const jours = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
  const timeslots = ['08H30 à 11H00', '11H00 à 13H30', '13H30 à 16H00', '16H00 à 18H30']
  const salles = [
    'SALLE 01', 'SALLE 02', 'SALLE 03', 'SALLE 05', 'SALLE 06',
    'SALLE 08', 'SALLE 09', 'SALLE 10', 'SALLE 11', 'SALLE INFO',
    'AT EB', 'AT TFM', 'AT EEI', 'AT PC', 'AT AEFGT', 'AT RVA1'
  ]

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg, #4ade80, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #15803d', color: 'white'
            }}>
              <Grid3X3 size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                {lang === 'ar' ? 'جدول القاعات (Salle)' : 'Planning des Salles (Salle)'}
              </h1>
              <p style={{ fontSize: 13.5, color: '#4b5563', margin: '3px 0 0 0' }}>
                {lang === 'ar'
                  ? 'عرض وتعديل جدول الحصص الخاص بكل قاعة (سيتم برمجته لاحقاً بناءً على طلبك)'
                  : 'Affichage et modification du planning par salle'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px',
              fontSize: '14px', fontWeight: 700, background: '#f3f4f6', color: '#374151',
              border: '1.5px solid #d1d5db', borderRadius: 'var(--radius-md)', cursor: 'pointer'
            }}
          >
            <Trash2 size={18} />
            Vider
          </button>
          <button
            type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px',
              fontSize: '14px', fontWeight: 700, background: '#f3f4f6', color: '#374151',
              border: '1.5px solid #d1d5db', borderRadius: 'var(--radius-md)', cursor: 'pointer'
            }}
          >
            <Trash2 size={18} />
            Vider par nom du formateur
          </button>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr>
                  <th colSpan={2} style={{ background: '#e5e7eb', border: '2px solid #000', padding: '10px' }}>
                    HEURE
                  </th>
                  {timeslots.map((t, i) => (
                    <th key={i} style={{ background: '#f3f4f6', border: '2px solid #000', padding: '10px', textAlign: 'center', fontWeight: 900 }}>
                      {t}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th style={{ background: '#e5e7eb', border: '2px solid #000', padding: '10px', width: 80, textAlign: 'center', fontWeight: 900 }}>
                    JOUR
                  </th>
                  <th style={{ background: '#f9fafb', border: '2px solid #000', padding: '10px', width: 120, textAlign: 'center', fontWeight: 900 }}>
                    Salle
                  </th>
                  {timeslots.map((_, i) => (
                    <th key={i} style={{ background: '#f9fafb', border: '2px solid #000', padding: '10px' }}></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jours.map(jour => (
                  <React.Fragment key={jour}>
                    {salles.map((salle, idx) => (
                      <tr key={`${jour}-${idx}`}>
                        {idx === 0 && (
                          <td rowSpan={salles.length} style={{ background: '#e5e7eb', border: '2px solid #000', padding: '10px', textAlign: 'center', fontWeight: 900, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            {jour}
                          </td>
                        )}
                        <td style={{ background: '#ffffff', border: '2px solid #000', padding: '10px', textAlign: 'center', fontWeight: 800 }}>
                          {salle}
                        </td>
                        {/* Empty cells for the 4 timeslots */}
                        <td style={{ border: '2px solid #000', padding: '10px', background: '#f8fafc' }}></td>
                        <td style={{ border: '2px solid #000', padding: '10px', background: '#f8fafc' }}></td>
                        <td style={{ border: '2px solid #000', padding: '10px', background: '#f8fafc' }}></td>
                        <td style={{ border: '2px solid #000', padding: '10px', background: '#f8fafc' }}></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
