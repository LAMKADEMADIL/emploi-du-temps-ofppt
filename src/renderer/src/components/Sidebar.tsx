import React from 'react'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  DoorOpen,
  BookOpen,
  UsersRound,
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
import ofpptLogo from '../assets/ofppt_logo_round.png'

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
    { id: 'formateurs' as NavPage, label: 'nav.formateurs', icon: <Users size={22} />, section: 'nav.section.data' },
    { id: 'stage' as NavPage, label: 'nav.stage', icon: <Briefcase size={22} /> },
    { id: 'dn' as NavPage, label: 'nav.dn', icon: <Database size={22} /> },
    { id: 'dna' as NavPage, label: 'nav.dna', icon: <Network size={22} /> },
    { id: 'salle_grid' as NavPage, label: 'nav.salle_grid', icon: <Grid3X3 size={22} /> },
    { id: 'salles' as NavPage, label: 'nav.salles', icon: <DoorOpen size={22} /> },
    { id: 'filieres' as NavPage, label: 'nav.filieres', icon: <BookOpen size={22} /> },
    { id: 'groupes' as NavPage, label: 'nav.groupes', icon: <UsersRound size={22} /> },
    { id: 'export' as NavPage, label: 'nav.export', icon: <FileDown size={22} />, section: 'nav.section.reports' }
  ]

  let lastSection = ''

  return (
    <aside className={`sidebar ${!isOpen ? 'collapsed' : ''}`}>
      <div className="sidebar-inner">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div 
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06)',
                border: '1.5px solid rgba(226, 232, 240, 0.8)',
                flexShrink: 0,
                padding: 2,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <img 
                src={ofpptLogo} 
                alt="OFPPT Logo" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  borderRadius: '50%',
                  objectFit: 'contain'
                }} 
              />
            </div>
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
