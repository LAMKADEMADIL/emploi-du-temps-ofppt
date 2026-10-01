import React, { useState } from 'react'
import './assets/main.css'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import FormateursPage from './pages/FormateursPage'
import SallesPage from './pages/SallesPage'
import FilieresPage from './pages/FilieresPage'
import GroupesPage from './pages/GroupesPage'
import TimetablePage from './pages/TimetablePage'
import VacancesPage from './pages/VacancesPage'
import ExportPage from './pages/ExportPage'
import type { NavPage } from './types'
import { Toaster } from 'react-hot-toast'

function App(): React.ReactElement {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard')

  const renderPage = (): React.ReactElement => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />
      case 'formateurs': return <FormateursPage />
      case 'salles': return <SallesPage />
      case 'filieres': return <FilieresPage />
      case 'groupes': return <GroupesPage />
      case 'timetable': return <TimetablePage />
      case 'vacances': return <VacancesPage />
      case 'export': return <ExportPage />
      default: return <Dashboard onNavigate={setCurrentPage} />
    }
  }

  return (
    <div className="app-layout">
      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontFamily: 'Cairo, Inter, sans-serif',
            fontSize: '13px',
            direction: 'rtl'
          }
        }}
      />
      <main className="main-content">
        {renderPage()}
      </main>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  )
}

export default App
