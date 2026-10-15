import React from 'react'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  DoorOpen,
  BookOpen,
  UsersRound,
  CalendarDays,
  Search,
  FileDown,
  Wifi,
  ChevronRight,
  Network,
  Grid3X3,
  Database
} from 'lucide-react'
import type { NavPage } from '../types'
import { useTranslation } from '../lib/i18n'
import ofpptLogo from '../assets/ofppt_logo.jpg'

interface SidebarProps {
  currentPage: NavPage
  onNavigate: (page: NavPage) => void
  isOpen?: boolean
  onToggle?: () => void
}

export default function Sidebar({ currentPage, onNavigate, isOpen = true, onToggle }: SidebarProps): React.ReactElement {
  const { t } = useTranslation()

  const navItems = [
    { id: 'hub' as NavPage, label: 'nav.hub', icon: <LayoutDashboard size={22} />, section: 'nav.section.main' },
    { id: 'dashboard' as NavPage, label: 'nav.dashboard', icon: <Grid3X3 size={22} /> },
    { id: 'formateurs' as NavPage, label: 'nav.formateurs', icon: <Users size={22} />, section: 'nav.section.data' },
    { id: 'stage' as NavPage, label: 'nav.stage', icon: <Briefcase size={22} /> },
    { id: 'dn' as NavPage, label: 'nav.dn', icon: <Database size={22} /> },
    { id: 'dna' as NavPage, label: 'nav.dna', icon: <Network size={22} /> },
    { id: 'salle_grid' as NavPage, label: 'nav.salle_grid', icon: <Grid3X3 size={22} /> },
    { id: 'salles' as NavPage, label: 'nav.salles', icon: <DoorOpen size={22} /> },
    { id: 'filieres' as NavPage, label: 'nav.filieres', icon: <BookOpen size={22} /> },
    { id: 'groupes' as NavPage, label: 'nav.groupes', icon: <UsersRound size={22} /> },
    { id: 'timetable' as NavPage, label: 'nav.timetable', icon: <CalendarDays size={22} />, section: 'nav.section.plan' },
    { id: 'export' as NavPage, label: 'nav.export', icon: <FileDown size={22} />, section: 'nav.section.reports' }
  ]

  let lastSection = ''

  return (
    <aside className={`sidebar ${!isOpen ? 'collapsed' : ''}`}>
      <div className="sidebar-inner">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img 
              src={ofpptLogo} 
              alt="OFPPT Logo" 
              style={{ width: 95, height: 95, borderRadius: 12, objectFit: 'contain', background: '#fff', flexShrink: 0, padding: 4 }} 
            />
            <div className="sidebar-logo-text">
              <h2>Gestion du Temps</h2>
              <span>OFPPT - ISTA</span>
            </div>
          </div>
          {onToggle && (
            <button
              className="sidebar-collapse-btn"
              onClick={onToggle}
              title="Masquer le menu (Ctrl+B)"
              aria-label="Toggle menu"
            >
              <ChevronRight size={18} />
            </button>
          )}
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
                  style={{ textAlign: 'left' }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {t(item.label)}
                </button>
              </React.Fragment>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-badge" style={{ fontSize: '13px', padding: '9px 12px' }}>
            <div className="connection-dot" />
            <Wifi size={16} />
            <span>{t('sidebar.connected')}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
