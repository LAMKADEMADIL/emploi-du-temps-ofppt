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
  Wifi
} from 'lucide-react'
import type { NavPage } from '../types'

interface SidebarProps {
  currentPage: NavPage
  onNavigate: (page: NavPage) => void
}

interface NavItem {
  id: NavPage
  label: string
  icon: React.ReactNode
  section?: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'لوحة القيادة', icon: <LayoutDashboard size={18} />, section: 'رئيسي' },
  { id: 'formateurs', label: 'المكونون', icon: <Users size={18} />, section: 'البيانات الأساسية' },
  { id: 'salles', label: 'القاعات والورشات', icon: <DoorOpen size={18} /> },
  { id: 'filieres', label: 'الشعب', icon: <BookOpen size={18} /> },
  { id: 'groupes', label: 'الأفواج', icon: <UsersRound size={18} /> },
  { id: 'timetable', label: 'جدول الحصص', icon: <CalendarDays size={18} />, section: 'التخطيط' },
  { id: 'vacances', label: 'الشواغر', icon: <Search size={18} /> },
  { id: 'export', label: 'التصدير PDF', icon: <FileDown size={18} />, section: 'التقارير' }
]

export default function Sidebar({ currentPage, onNavigate }: SidebarProps): React.ReactElement {
  let lastSection = ''

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">📅</div>
          <div className="sidebar-logo-text">
            <h2>استعمال الزمن</h2>
            <span>OFPPT - ISTA</span>
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
                <div className="nav-section-label">{item.section}</div>
              )}
              <button
                className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            </React.Fragment>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="connection-badge">
          <div className="connection-dot" />
          <Wifi size={14} />
          <span>Firebase متصل</span>
        </div>
      </div>
    </aside>
  )
}
