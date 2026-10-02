import React, { useState, useEffect } from 'react'
import {
  Users,
  DoorOpen,
  CalendarDays,
  UsersRound,
  Plus,
  Search,
  FileDown
} from 'lucide-react'
import {
  formateursService,
  sallesService,
  groupesService,
  seancesService
} from '../services/firebaseService'
import type { NavPage } from '../types'
import { useTranslation } from '../lib/i18n'

interface DashboardProps {
  onNavigate: (page: NavPage) => void
}

export default function Dashboard({ onNavigate }: DashboardProps): React.ReactElement {
  const [stats, setStats] = useState({
    formateurs: 0,
    salles: 0,
    groupesStage: 0,
    seances: 0
  })
  const { t } = useTranslation()

  useEffect(() => {
    async function fetchStats() {
      try {
        const [f, s, g, se] = await Promise.all([
          formateursService.getAll(),
          sallesService.getAll(),
          groupesService.getAll(),
          seancesService.getAll()
        ])
        
        setStats({
          formateurs: f.length,
          salles: s.length,
          groupesStage: g.filter(x => x.en_stage).length,
          seances: se.length
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div className="page-header-info">
          <h1>{t('dash.title')}</h1>
          <p>{t('dash.subtitle')}</p>
        </div>
        <div className="badge badge-success">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          {t('dash.status')}
        </div>
      </div>

      <div className="page-body">
        <div className="stats-grid">
          <div className="stat-card" style={{ '--card-color': 'var(--primary)' } as any}>
            <div className="stat-icon"><Users size={28} color="white" /></div>
            <div className="stat-info">
              <h3>{stats.formateurs}</h3>
              <p>{t('dash.stat.formateurs')}</p>
            </div>
          </div>
          
          <div className="stat-card" style={{ '--card-color': 'var(--accent)' } as any}>
            <div className="stat-icon"><CalendarDays size={28} color="white" /></div>
            <div className="stat-info">
              <h3>{stats.seances}</h3>
              <p>{t('dash.stat.seances')}</p>
            </div>
          </div>
          
          <div className="stat-card" style={{ '--card-color': 'var(--warning)' } as any}>
            <div className="stat-icon"><UsersRound size={28} color="white" /></div>
            <div className="stat-info">
              <h3>{stats.groupesStage}</h3>
              <p>{t('dash.stat.stage')}</p>
            </div>
          </div>
          
          <div className="stat-card" style={{ '--card-color': 'var(--success)' } as any}>
            <div className="stat-icon"><DoorOpen size={28} color="white" /></div>
            <div className="stat-info">
              <h3>{stats.salles}</h3>
              <p>{t('dash.stat.salles')}</p>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="card" style={{ padding: '24px' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '17px' }}>{t('dash.quickStart')}</h3>
            </div>
            <div className="recent-list">
              <button className="recent-item" onClick={() => onNavigate('formateurs')} style={{ border: 'none', background: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'start' }}>
                <div className="recent-item-icon" style={{ background: 'rgba(79, 70, 229, 0.15)', color: 'var(--primary-light)' }}>
                  <Plus size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dash.addFormateur')}</h4>
                </div>
              </button>
              
              <button className="recent-item" onClick={() => onNavigate('salles')} style={{ border: 'none', background: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'start' }}>
                <div className="recent-item-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success-light)' }}>
                  <DoorOpen size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dash.addSalle')}</h4>
                </div>
              </button>

              <button className="recent-item" onClick={() => onNavigate('timetable')} style={{ border: 'none', background: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'start' }}>
                <div className="recent-item-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning-light)' }}>
                  <CalendarDays size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dash.addSeance')}</h4>
                </div>
              </button>
              
              <button className="recent-item" onClick={() => onNavigate('vacances')} style={{ border: 'none', background: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'start' }}>
                <div className="recent-item-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-light)' }}>
                  <Search size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dash.findSalle')}</h4>
                </div>
              </button>

              <button className="recent-item" onClick={() => onNavigate('export')} style={{ border: 'none', background: 'var(--bg-secondary)', cursor: 'pointer', textAlign: 'start' }}>
                <div className="recent-item-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger-light)' }}>
                  <FileDown size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t('dash.exportPdf')}</h4>
                </div>
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '17px' }}>{t('dash.summary')}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: 18, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('dash.stat.formateurs')}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary-light)' }}>{stats.formateurs}</div>
              </div>
              <div style={{ padding: 18, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('dash.stat.seances')}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-light)' }}>{stats.seances}</div>
              </div>
              <div style={{ padding: 18, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{t('dash.stat.stage')}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--warning-light)' }}>{stats.groupesStage}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
