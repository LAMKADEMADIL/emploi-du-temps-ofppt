import React from 'react'
import {
  LayoutDashboard,
  Users,
  DoorOpen,
  BookOpen,
  UsersRound,
  CalendarDays,
  Search,
  FileDown,
  Wifi,
  Globe
} from 'lucide-react'
import type { NavPage } from '../types'
import { useTranslation, Language } from '../lib/i18n'

interface SidebarProps {
  currentPage: NavPage
  onNavigate: (page: NavPage) => void
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps): React.ReactElement {
  const { t, lang, setLang } = useTranslation()

  const navItems = [
    { id: 'dashboard' as NavPage, label: 'nav.dashboard', icon: <LayoutDashboard size={18} />, section: 'nav.section.main' },
    { id: 'formateurs' as NavPage, label: 'nav.formateurs', icon: <Users size={18} />, section: 'nav.section.data' },
    { id: 'salles' as NavPage, label: 'nav.salles', icon: <DoorOpen size={18} /> },
    { id: 'filieres' as NavPage, label: 'nav.filieres', icon: <BookOpen size={18} /> },
    { id: 'groupes' as NavPage, label: 'nav.groupes', icon: <UsersRound size={18} /> },
    { id: 'timetable' as NavPage, label: 'nav.timetable', icon: <CalendarDays size={18} />, section: 'nav.section.plan' },
    { id: 'vacances' as NavPage, label: 'nav.vacances', icon: <Search size={18} /> },
    { id: 'export' as NavPage, label: 'nav.export', icon: <FileDown size={18} />, section: 'nav.section.reports' }
  ]

  let lastSection = ''

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">📅</div>
          <div className="sidebar-logo-text">
            <h2>{t('app.title')}</h2>
            <span>{t('app.subtitle')}</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const showSection = item.section && item.section !== lastSection
          if (item.section) lastSection = item.section

          return (
            <React.Fragment key={item.id}>
              {showSection && (
                <div className="nav-section-label">{t(item.section!)}</div>
              )}
              <button
                className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}
              >
                <span className="nav-icon">{item.icon}</span>
                {t(item.label)}
              </button>
            </React.Fragment>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button 
            className={`btn btn-sm ${lang === 'ar' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1 }}
            onClick={() => setLang('ar')}
          >
            <Globe size={14} /> العربية
          </button>
          <button 
            className={`btn btn-sm ${lang === 'fr' ? 'btn-primary' : 'btn-secondary'}`} 
            style={{ flex: 1 }}
            onClick={() => setLang('fr')}
          >
            <Globe size={14} /> Français
          </button>
        </div>
        
        <div className="connection-badge">
          <div className="connection-dot" />
          <Wifi size={14} />
          <span>{t('sidebar.connected')}</span>
        </div>
      </div>
    </aside>
  )
}
