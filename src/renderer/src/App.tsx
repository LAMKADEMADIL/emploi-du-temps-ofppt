import React, { useState, useEffect } from 'react'
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
import { Toaster, toast } from 'react-hot-toast'
import { I18nProvider, useTranslation } from './lib/i18n'
import { seedDemoData } from './lib/seedData'

function AppContent(): React.ReactElement {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard')
  const { lang } = useTranslation()

  useEffect(() => {
    seedDemoData().then((seeded) => {
      if (seeded) {
        toast.success(lang === 'ar' ? '✅ تم تحميل البيانات التجريبية!' : '✅ Données de démonstration chargées!')
      }
    })
  }, [])

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
        position={lang === 'ar' ? 'bottom-left' : 'bottom-right'}
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#1a1a2e',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '12px',
            fontFamily: 'Cairo, Inter, sans-serif',
            fontSize: '13px',
            direction: lang === 'ar' ? 'rtl' : 'ltr',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
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

function App(): React.ReactElement {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}

export default App
