import React, { useState } from 'react'
import { Search, DoorOpen, UsersRound } from 'lucide-react'
import { seancesService } from '../services/firebaseService'
import { JOURS, TIME_SLOTS, type Jour, type HeureDebut } from '../types'
import { useTranslation } from '../lib/i18n'

export default function VacancesPage(): React.ReactElement {
  const [jour, setJour] = useState<Jour>('Lundi')
  const [heureDebut, setHeureDebut] = useState<HeureDebut>('08:30')
  const [searchType, setSearchType] = useState<'salle' | 'groupe'>('salle')
  const { lang } = useTranslation()
  
  const [results, setResults] = useState<string[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setHasSearched(false)
    
    try {
      if (searchType === 'salle') {
        const salles = await seancesService.findSallesVides(jour, heureDebut)
        setResults(salles)
      } else {
        const groupes = await seancesService.findGroupesVides(jour, heureDebut)
        setResults(groupes)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
      setHasSearched(true)
    }
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'البحث عن الشواغر' : 'Recherche des Disponibilités'}</h1>
          <p>{lang === 'ar' ? 'البحث عن القاعات الشاغرة أو الأفواج المتاحة في وقت محدد' : 'Recherche des salles libres et groupes disponibles par créneau horaire'}</p>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: '28px' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ fontSize: '17px' }}>
              <Search size={20} /> {lang === 'ar' ? 'محرك البحث عن الشواغر' : 'Moteur de recherche'}
            </h3>
          </div>
          
          <form onSubmit={handleSearch}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '14px', fontWeight: 600 }}>
                {lang === 'ar' ? 'نوع البحث' : 'Type de recherche'}
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className={`btn ${searchType === 'salle' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '12px 18px', fontSize: '14.5px', fontWeight: 600, gap: '8px' }}
                  onClick={() => { setSearchType('salle'); setHasSearched(false) }}
                >
                  <DoorOpen size={18} /> {lang === 'ar' ? 'القاعات الشاغرة' : 'Salles libres'}
                </button>
                <button
                  type="button"
                  className={`btn ${searchType === 'groupe' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '12px 18px', fontSize: '14.5px', fontWeight: 600, gap: '8px' }}
                  onClick={() => { setSearchType('groupe'); setHasSearched(false) }}
                >
                  <UsersRound size={18} /> {lang === 'ar' ? 'الأفواج المتاحة' : 'Groupes disponibles'}
                </button>
              </div>
            </div>

            <div className="form-row" style={{ marginTop: 20 }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '14px', fontWeight: 600 }}>
                  {lang === 'ar' ? 'اليوم' : 'Jour'}
                </label>
                <select 
                  className="form-select"
                  style={{ padding: '11px 14px', fontSize: '14.5px' }}
                  value={jour}
                  onChange={(e) => setJour(e.target.value as Jour)}
                >
                  {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '14px', fontWeight: 600 }}>
                  {lang === 'ar' ? 'الحصة الزمنية' : 'Créneau horaire'}
                </label>
                <select 
                  className="form-select"
                  style={{ padding: '11px 14px', fontSize: '14.5px' }}
                  value={heureDebut}
                  onChange={(e) => setHeureDebut(e.target.value as HeureDebut)}
                >
                  {TIME_SLOTS.map(slot => (
                    <option key={slot.debut} value={slot.debut}>{slot.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 24, padding: '13px', fontSize: '15px', fontWeight: 600, gap: '8px' }}>
              <Search size={18} /> {lang === 'ar' ? 'ابحث الآن' : 'Rechercher maintenant'}
            </button>
          </form>

          {loading && (
            <div className="loading-spinner"><div className="spinner" /></div>
          )}

          {!loading && hasSearched && (
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }} className="fade-in-up">
              <h4 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                النتائج ({results.length})
              </h4>
              
              {results.length === 0 ? (
                <div style={{ padding: 16, background: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, color: 'var(--danger-light)', textAlign: 'center', fontSize: 13 }}>
                  لا توجد {searchType === 'salle' ? 'قاعات شاغرة' : 'أفواج متاحة'} في هذا الوقت.
                </div>
              ) : (
                <div className="vacances-result">
                  {results.map((item, i) => (
                    <span key={i} className="vacances-chip">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
