import React, { useState } from 'react'
import { DoorOpen, UsersRound, Search } from 'lucide-react'
import { seancesService } from '../services/firebaseService'
import { JOURS, TIME_SLOTS, type Jour, type HeureDebut } from '../types'
import SallesVidesGrid from '../components/SallesVidesGrid'

export default function VacancesPage(): React.ReactElement {
  const [tab, setTab] = useState<'table' | 'groupes'>(() => {
    const saved = localStorage.getItem('vacances_tab')
    return (saved === 'groupes' || saved === 'table') ? saved : 'table'
  })

  const handleTabChange = (newTab: 'table' | 'groupes') => {
    setTab(newTab)
    localStorage.setItem('vacances_tab', newTab)
  }
  const [jour, setJour] = useState<Jour>('Lundi')
  const [heureDebut, setHeureDebut] = useState<HeureDebut>('08:30')
  const [results, setResults] = useState<string[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSearchGroupes(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setHasSearched(false)

    try {
      const groupes = await seancesService.findGroupesVides(jour, heureDebut)
      setResults(Array.from(new Set(groupes)))
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
      setHasSearched(true)
    }
  }

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ gap: 16 }}>
        <div className="page-header-info">
          <h1>Trouver Salle Vide</h1>
          <p>Tableau récapitulatif hebdomadaire des salles et ateliers non occupés</p>
        </div>

        {/* ── Tabs: Salles Vides (Tableau) vs Groupes Disponibles ───────────── */}
        <div
          style={{
            display: 'flex',
            background: '#e2e8f0',
            borderRadius: 10,
            padding: 3,
            gap: 4
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange('table')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: tab === 'table' ? '#2563eb' : 'transparent',
              color: tab === 'table' ? '#ffffff' : '#475569',
              boxShadow: tab === 'table' ? '0 2px 6px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <DoorOpen size={16} />
            Tableau Salles Vides
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('groupes')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              background: tab === 'groupes' ? '#2563eb' : 'transparent',
              color: tab === 'groupes' ? '#ffffff' : '#475569',
              boxShadow: tab === 'groupes' ? '0 2px 6px rgba(37,99,235,0.35)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <UsersRound size={16} />
            Groupes Disponibles
          </button>
        </div>
      </div>

      {/* ── Page Body ──────────────────────────────────────────────────────── */}
      <div className="page-body">
        {tab === 'table' ? (
          <SallesVidesGrid />
        ) : (
          <div className="card" style={{ maxWidth: 680, margin: '0 auto', padding: '28px' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '17px' }}>
                <UsersRound size={20} /> Recherche des Groupes Disponibles
              </h3>
            </div>

            <form onSubmit={handleSearchGroupes}>
              <div className="form-row" style={{ marginTop: 10 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '14px', fontWeight: 600 }}>
                    Jour
                  </label>
                  <select
                    className="form-select"
                    style={{ padding: '11px 14px', fontSize: '14.5px' }}
                    value={jour}
                    onChange={e => setJour(e.target.value as Jour)}
                  >
                    {JOURS.map(j => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '14px', fontWeight: 600 }}>
                    Créneau horaire
                  </label>
                  <select
                    className="form-select"
                    style={{ padding: '11px 14px', fontSize: '14.5px' }}
                    value={heureDebut}
                    onChange={e => setHeureDebut(e.target.value as HeureDebut)}
                  >
                    {TIME_SLOTS.map(slot => (
                      <option key={slot.debut} value={slot.debut}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: '13px',
                  fontSize: '15px',
                  fontWeight: 600,
                  gap: '8px'
                }}
              >
                <Search size={18} /> Rechercher maintenant
              </button>
            </form>

            {loading && (
              <div className="loading-spinner"><div className="spinner" /></div>
            )}

            {!loading && hasSearched && (
              <div
                style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}
                className="fade-in-up"
              >
                <h4 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Groupes disponibles ({results.length})
                </h4>

                {results.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      background: 'rgba(239, 68, 68, 0.05)',
                      borderRadius: 8,
                      color: 'var(--danger-light)',
                      textAlign: 'center',
                      fontSize: 13
                    }}
                  >
                    Aucun groupe disponible sur ce créneau.
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
        )}
      </div>
    </div>
  )
}
