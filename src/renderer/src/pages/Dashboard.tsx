import React, { useEffect, useState } from 'react'
import { Users, DoorOpen, BookOpen, UsersRound, CalendarDays, TrendingUp } from 'lucide-react'
import { formateursService, sallesService, filieresService, groupesService, seancesService } from '../services/firebaseService'
import type { NavPage } from '../types'

interface DashboardProps {
  onNavigate: (page: NavPage) => void
}

export default function Dashboard({ onNavigate }: DashboardProps): React.ReactElement {
  const [stats, setStats] = useState({ formateurs: 0, salles: 0, filieres: 0, groupes: 0, seances: 0, enStage: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      try {
        const [formateurs, salles, filieres, groupes, seances] = await Promise.all([
          formateursService.getAll(),
          sallesService.getAll(),
          filieresService.getAll(),
          groupesService.getAll(),
          seancesService.getAll()
        ])
        setStats({
          formateurs: formateurs.length,
          salles: salles.length,
          filieres: filieres.length,
          groupes: groupes.length,
          seances: seances.length,
          enStage: groupes.filter(g => g.en_stage).length
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  const statCards = [
    { label: 'المكونون', value: stats.formateurs, icon: <Users size={24} color="white" />, color: '#4f46e5', page: 'formateurs' as NavPage },
    { label: 'القاعات والورشات', value: stats.salles, icon: <DoorOpen size={24} color="white" />, color: '#06b6d4', page: 'salles' as NavPage },
    { label: 'الشعب', value: stats.filieres, icon: <BookOpen size={24} color="white" />, color: '#8b5cf6', page: 'filieres' as NavPage },
    { label: 'الأفواج', value: stats.groupes, icon: <UsersRound size={24} color="white" />, color: '#f59e0b', page: 'groupes' as NavPage },
    { label: 'الحصص المبرمجة', value: stats.seances, icon: <CalendarDays size={24} color="white" />, color: '#10b981', page: 'timetable' as NavPage },
    { label: 'أفواج في التدريب', value: stats.enStage, icon: <TrendingUp size={24} color="white" />, color: '#ef4444', page: 'groupes' as NavPage }
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-header-info">
          <h1>لوحة القيادة</h1>
          <p>نظرة عامة على نظام إدارة استعمال الزمن</p>
        </div>
        <div className="badge badge-success">
          <span>●</span> النظام يعمل بشكل طبيعي
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <>
            <div className="stats-grid fade-in-up">
              {statCards.map((card, i) => (
                <div
                  key={i}
                  className="stat-card"
                  style={{ '--card-color': card.color } as React.CSSProperties}
                  onClick={() => onNavigate(card.page)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="stat-icon" style={{ background: card.color }}>
                    {card.icon}
                  </div>
                  <div className="stat-info">
                    <h3>{card.value}</h3>
                    <p>{card.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="dashboard-grid fade-in-up">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">🚀 بدء سريع</h3>
                </div>
                <div className="recent-list">
                  {[
                    { label: 'إضافة مكون جديد', page: 'formateurs' as NavPage, color: '#4f46e5' },
                    { label: 'إضافة قاعة جديدة', page: 'salles' as NavPage, color: '#06b6d4' },
                    { label: 'برمجة حصة في الجدول', page: 'timetable' as NavPage, color: '#10b981' },
                    { label: 'البحث عن قاعة شاغرة', page: 'vacances' as NavPage, color: '#f59e0b' },
                    { label: 'تصدير الجداول PDF', page: 'export' as NavPage, color: '#8b5cf6' }
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="recent-item"
                      onClick={() => onNavigate(item.page)}
                      role="button"
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="recent-item-icon" style={{ background: item.color }}>
                        <span style={{ fontSize: 14 }}>→</span>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">📊 ملخص النظام</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span className="badge badge-primary">{stats.formateurs} مكون</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>المكونون المسجلون</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span className="badge badge-success">{stats.seances} حصة</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>الحصص المبرمجة</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span className="badge badge-warning">{stats.enStage} فوج</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>أفواج في التدريب الميداني</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <span className="badge" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--accent-light)', border: '1px solid rgba(6,182,212,0.2)' }}>{stats.salles} قاعة</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>القاعات والورشات</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
