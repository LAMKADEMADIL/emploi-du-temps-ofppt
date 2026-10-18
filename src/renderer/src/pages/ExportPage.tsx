import React, { useState, useEffect, useRef } from 'react'
import { FileDown, Users, UsersRound, Search, FolderOpen, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import {
  formateursService,
  groupesService,
  sallesService,
  filieresService,
  planningSallesService,
  seancesService
} from '../services/firebaseService'
import type { Formateur, Groupe, Salle, Filiere, Seance } from '../types'
import { useTranslation } from '../lib/i18n'
import ofpptLogo from '../assets/ofppt_logo.jpg'

interface TimetableSlotData {
  module: string
  formateur: string
  salle: string
  groupe: string
}

const JOURS_LIST = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const TS_LABELS = ['08H30 - 11H00', '11H00 - 13H30', '13H30 - 16H00', '16H00 - 18H30']

export default function ExportPage(): React.ReactElement {
  const [formateurs, setFormateurs] = useState<Formateur[]>([])
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [salles, setSalles] = useState<Salle[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [planningSallesMap, setPlanningSallesMap] = useState<Record<string, any>>({})
  const [seancesList, setSeancesList] = useState<Seance[]>([])

  const [loading, setLoading] = useState(true)
  const [searchFormateur, setSearchFormateur] = useState('')
  const [searchGroupe, setSearchGroupe] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [lastExportPath, setLastExportPath] = useState<{ folderName: string; targetDir: string; filePath: string } | null>(null)

  // Offscreen element for PDF rendering
  const [printData, setPrintData] = useState<{
    type: 'groupe' | 'formateur'
    title: string
    subTitle: string
    codeOrName: string
    meta: Record<string, string>
    grid: Record<string, TimetableSlotData | null> // key: `${jour}__${slotIdx}`
  } | null>(null)

  const printSheetRef = useRef<HTMLDivElement>(null)
  const { lang } = useTranslation()

  // Load all necessary data from Firebase
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [fData, gData, sData, filData, psData, seancesData] = await Promise.all([
          formateursService.getAll().catch(() => []),
          groupesService.getAll().catch(() => []),
          sallesService.getAll().catch(() => []),
          filieresService.getAll().catch(() => []),
          planningSallesService.getAll().catch(() => ({} as Record<string, any>)),
          seancesService.getAll().catch(() => [])
        ])

        setFormateurs(fData)
        setGroupes(gData.filter(g => !g.en_stage).sort((a, b) => a.code_groupe.localeCompare(b.code_groupe)))
        setSalles(sData)
        setFilieres(filData)
        setPlanningSallesMap(psData || {})
        setSeancesList(seancesData || [])
      } catch (error) {
        console.error(error)
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل البيانات' : 'Erreur lors du chargement des données')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [lang])

  // Helper: Get schedule for a specific Groupe
  function buildGroupeSchedule(targetGroupe: Groupe): Record<string, TimetableSlotData | null> {
    const grid: Record<string, TimetableSlotData | null> = {}
    const grpCodeNorm = targetGroupe.code_groupe.toUpperCase().replace(/\s+/g, '')

    JOURS_LIST.forEach(jour => {
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        grid[`${jour}__${sIdx}`] = null
      }
    })

    // 1. From planning_salles (primary timetable source)
    for (const [key, cell] of Object.entries(planningSallesMap)) {
      if (!cell || !cell.groupeId) continue
      const parts = key.split('__')
      if (parts.length < 3) continue
      const cellJour = parts[0].toUpperCase()
      const salleNom = parts[1].toUpperCase()
      const tsIdx = parseInt(parts[2], 10)
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 3) continue

      const cellGrp = String(cell.groupeId).toUpperCase().replace(/\s+/g, '')
      const matchesGroup = (targetGroupe.id && targetGroupe.id === cell.groupeId) || cellGrp === grpCodeNorm

      if (matchesGroup) {
        const formateur = formateurs.find(f =>
          (f.id && f.id === cell.formateurId) ||
          (f.nom_prenom && f.nom_prenom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
          (f.nom && f.nom.toUpperCase().includes(String(cell.formateurId).toUpperCase())) ||
          String(cell.formateurId).toUpperCase().includes((f.nom_prenom || '').toUpperCase())
        )
        const profName = formateur
          ? (formateur.nom && formateur.prenom ? `${formateur.nom} ${formateur.prenom}` : formateur.nom_prenom || formateur.nom || cell.formateurId).toUpperCase()
          : String(cell.formateurId).toUpperCase()

        grid[`${cellJour}__${tsIdx}`] = {
          module: cell.module || 'M',
          formateur: profName,
          salle: salleNom,
          groupe: targetGroupe.code_groupe
        }
      }
    }

    // 2. From seances (fallback/secondary)
    for (const seance of seancesList) {
      const seanceGrp = String(seance.code_groupe || seance.id_groupe || '').toUpperCase().replace(/\s+/g, '')
      const matchesGroup = (targetGroupe.id && targetGroupe.id === seance.id_groupe) || seanceGrp === grpCodeNorm
      if (!matchesGroup) continue

      const tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut)
      if (tsIdx === -1) continue

      const cellJour = (seance.jour || '').toUpperCase()
      const gridKey = `${cellJour}__${tsIdx}`

      if (!grid[gridKey]) {
        const formateur = formateurs.find(f => f.id === seance.id_formateur)
        const salle = salles.find(s => s.id === seance.id_salle)
        grid[gridKey] = {
          module: seance.module_code || 'M',
          formateur: (formateur?.nom_prenom || seance.nom_formateur || 'FORMATEUR').toUpperCase(),
          salle: (salle?.nom_salle || seance.nom_salle || 'SALLE').toUpperCase(),
          groupe: targetGroupe.code_groupe
        }
      }
    }

    return grid
  }

  // Helper: Get schedule for a specific Formateur
  function buildFormateurSchedule(targetFormateur: Formateur): Record<string, TimetableSlotData | null> {
    const grid: Record<string, TimetableSlotData | null> = {}
    const profNameNorm = (targetFormateur.nom_prenom || `${targetFormateur.nom || ''} ${targetFormateur.prenom || ''}`).toUpperCase().trim()

    JOURS_LIST.forEach(jour => {
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        grid[`${jour}__${sIdx}`] = null
      }
    })

    // 1. From planning_salles
    for (const [key, cell] of Object.entries(planningSallesMap)) {
      if (!cell || !cell.formateurId) continue
      const parts = key.split('__')
      if (parts.length < 3) continue
      const cellJour = parts[0].toUpperCase()
      const salleNom = parts[1].toUpperCase()
      const tsIdx = parseInt(parts[2], 10)
      if (isNaN(tsIdx) || tsIdx < 0 || tsIdx > 3) continue

      const cellProfNorm = String(cell.formateurId).toUpperCase().trim()
      const matchesProf = (targetFormateur.id && targetFormateur.id === cell.formateurId) ||
        cellProfNorm === profNameNorm ||
        (profNameNorm && (cellProfNorm.includes(profNameNorm) || profNameNorm.includes(cellProfNorm)))

      if (matchesProf) {
        const groupe = groupes.find(g => (g.id && g.id === cell.groupeId) || g.code_groupe.toUpperCase() === String(cell.groupeId).toUpperCase())
        const grpCode = groupe ? groupe.code_groupe : String(cell.groupeId)

        grid[`${cellJour}__${tsIdx}`] = {
          module: cell.module || 'M',
          formateur: profNameNorm,
          salle: salleNom,
          groupe: grpCode
        }
      }
    }

    // 2. From seances
    for (const seance of seancesList) {
      const matchesProf = (targetFormateur.id && targetFormateur.id === seance.id_formateur) ||
        (seance.nom_formateur && seance.nom_formateur.toUpperCase() === profNameNorm)
      if (!matchesProf) continue

      const tsIdx = ['08:30', '11:00', '13:30', '16:00'].indexOf(seance.heure_debut)
      if (tsIdx === -1) continue

      const cellJour = (seance.jour || '').toUpperCase()
      const gridKey = `${cellJour}__${tsIdx}`

      if (!grid[gridKey]) {
        const salle = salles.find(s => s.id === seance.id_salle)
        const groupe = groupes.find(g => g.id === seance.id_groupe)
        grid[gridKey] = {
          module: seance.module_code || 'M',
          formateur: profNameNorm,
          salle: (salle?.nom_salle || seance.nom_salle || 'SALLE').toUpperCase(),
          groupe: groupe?.code_groupe || seance.code_groupe || 'GROUPE'
        }
      }
    }

    return grid
  }

  // Generate PDF from off-screen rendered DOM element
  async function generateCurrentPdfBase64(): Promise<string> {
    if (!printSheetRef.current) throw new Error('Print container ref not ready')

    // Wait slightly for any font/image to settle
    await new Promise(resolve => setTimeout(resolve, 80))

    const canvas = await html2canvas(printSheetRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    const pdfWidth = pdf.internal.pageSize.getWidth()   // 297mm
    const pdfHeight = pdf.internal.pageSize.getHeight() // 210mm
    const margin = 8
    const availWidth = pdfWidth - margin * 2
    const availHeight = pdfHeight - margin * 2

    const imgProps = pdf.getImageProperties(imgData)
    const ratio = imgProps.width / imgProps.height

    let renderWidth = availWidth
    let renderHeight = renderWidth / ratio

    if (renderHeight > availHeight) {
      renderHeight = availHeight
      renderWidth = renderHeight * ratio
    }

    const x = margin + (availWidth - renderWidth) / 2
    const y = margin + (availHeight - renderHeight) / 2

    pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight)
    const dataUri = pdf.output('datauristring')
    return dataUri.split(',')[1]
  }

  // Save PDF directly to Desktop inside the specified folder
  async function saveToDesktop(folderName: string, fileName: string, base64Data: string) {
    if ((window as any).api?.savePdfToDesktop) {
      return await (window as any).api.savePdfToDesktop({ folderName, fileName, base64Data })
    } else if ((window as any).electron?.ipcRenderer?.invoke) {
      return await (window as any).electron.ipcRenderer.invoke('save-pdf-to-desktop', { folderName, fileName, base64Data })
    } else {
      // Browser fallback (download directly)
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      return { success: true, filePath: fileName, folderName, targetDir: 'Téléchargements' }
    }
  }

  // Open the created desktop folder
  async function handleOpenFolder(targetDir: string) {
    if ((window as any).api?.openDesktopFolder) {
      await (window as any).api.openDesktopFolder(targetDir)
    } else if ((window as any).electron?.ipcRenderer?.invoke) {
      await (window as any).electron.ipcRenderer.invoke('open-desktop-folder', targetDir)
    } else {
      toast('تم الحفظ في جهازك بنجاح', { icon: '📁' })
    }
  }

  // Export single Groupe
  async function exportSingleGroupe(groupe: Groupe) {
    try {
      setExportingId(groupe.id || groupe.code_groupe)
      toast.loading(
        lang === 'ar' ? `جاري إنشاء جدول الفوج ${groupe.code_groupe}...` : `Génération du planning ${groupe.code_groupe}...`,
        { id: 'export-toast' }
      )

      const grid = buildGroupeSchedule(groupe)
      const filiereObj = filieres.find(f => f.id === groupe.id_filiere || f.code_filiere === groupe.filiere)
      const anneeLabel = groupe.annee === 2 ? '2ème Année' : '1ère Année'
      const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2026/2027'
      const periode = localStorage.getItem('periode_application_groupe') || 'Du 01/09/2026 au 30/06/2027'

      setPrintData({
        type: 'groupe',
        title: 'EMPLOI DU TEMPS DU GROUPE',
        subTitle: `ANNEE DE FORMATION : ${anneeFormation}`,
        codeOrName: groupe.code_groupe,
        meta: {
          'DRGC': 'Direction Régionale Grand Casablanca',
          'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
          'Filière': filiereObj ? `${filiereObj.code_filiere} - ${filiereObj.nom_filiere}` : (groupe.filiere || 'Filière'),
          'Groupe': groupe.code_groupe,
          'Niveau': anneeLabel,
          'Période': periode,
          'Mode de formation': 'FPA / Résidentiel'
        },
        grid
      })

      // Wait a tick for state to render into print ref
      await new Promise(r => setTimeout(r, 120))

      const base64Data = await generateCurrentPdfBase64()
      const folderName = groupe.code_groupe.trim()
      const fileName = `${groupe.code_groupe.trim()}_Emploi_du_Temps.pdf`

      const saveResult = await saveToDesktop(folderName, fileName, base64Data)

      if (saveResult && saveResult.success) {
        setLastExportPath({
          folderName: saveResult.folderName || folderName,
          targetDir: saveResult.targetDir || folderName,
          filePath: saveResult.filePath || fileName
        })

        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700 }}>
                {lang === 'ar'
                  ? `تم حفظ ملف الفوج (${folderName}) بنجاح!`
                  : `Planning du groupe (${folderName}) sauvegardé !`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {lang === 'ar'
                  ? `سطح المكتب > مجلد [${folderName}] > ${fileName}`
                  : `Bureau > Dossier [${folderName}] > ${fileName}`}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => {
                  toast.dismiss(t.id)
                  if (saveResult.targetDir) handleOpenFolder(saveResult.targetDir)
                }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد على سطح المكتب' : 'Ouvrir le dossier sur le Bureau'}
              </button>
            </div>
          ),
          { id: 'export-toast', duration: 7000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف على سطح المكتب' : 'Erreur lors de la sauvegarde sur le Bureau', { id: 'export-toast' })
      }
    } catch (err: any) {
      console.error(err)
      toast.error(lang === 'ar' ? 'فشل التصدير' : 'Échec de l\'exportation', { id: 'export-toast' })
    } finally {
      setExportingId(null)
    }
  }

  // Export single Formateur
  async function exportSingleFormateur(formateur: Formateur) {
    try {
      const profName = formateur.nom_prenom || `${formateur.nom || ''} ${formateur.prenom || ''}`.trim() || 'Formateur'
      setExportingId(formateur.id || profName)
      toast.loading(
        lang === 'ar' ? `جاري إنشاء جدول الأستاذ ${profName}...` : `Génération du planning ${profName}...`,
        { id: 'export-toast' }
      )

      const grid = buildFormateurSchedule(formateur)
      const anneeFormation = localStorage.getItem('annee_formation_formateur') || '2026/2027'
      const periode = localStorage.getItem('periode_application_formateur') || 'Du 01/09/2026 au 30/06/2027'

      setPrintData({
        type: 'formateur',
        title: 'EMPLOI DU TEMPS DU FORMATEUR',
        subTitle: `ANNEE DE FORMATION : ${anneeFormation}`,
        codeOrName: profName,
        meta: {
          'DRGC': 'Direction Régionale Grand Casablanca',
          'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
          'Formateur': profName,
          'Matricule': formateur.matricule || '-',
          'Spécialité': formateur.specialite || formateur.matiere || 'Technique',
          'Période': periode,
          'Statut': 'Statutaire'
        },
        grid
      })

      await new Promise(r => setTimeout(r, 120))

      const base64Data = await generateCurrentPdfBase64()
      const folderName = profName.replace(/[\\/:*?"<>|]/g, '_').trim()
      const fileName = `${folderName}_Emploi_du_Temps.pdf`

      const saveResult = await saveToDesktop(folderName, fileName, base64Data)

      if (saveResult && saveResult.success) {
        setLastExportPath({
          folderName: saveResult.folderName || folderName,
          targetDir: saveResult.targetDir || folderName,
          filePath: saveResult.filePath || fileName
        })

        toast.success(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700 }}>
                {lang === 'ar'
                  ? `تم حفظ ملف الأستاذ (${folderName}) بنجاح!`
                  : `Planning du formateur (${folderName}) sauvegardé !`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {lang === 'ar'
                  ? `سطح المكتب > مجلد [${folderName}] > ${fileName}`
                  : `Bureau > Dossier [${folderName}] > ${fileName}`}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 4, alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12, gap: 5 }}
                onClick={() => {
                  toast.dismiss(t.id)
                  if (saveResult.targetDir) handleOpenFolder(saveResult.targetDir)
                }}
              >
                <FolderOpen size={14} />
                {lang === 'ar' ? 'فتح المجلد على سطح المكتب' : 'Ouvrir le dossier sur le Bureau'}
              </button>
            </div>
          ),
          { id: 'export-toast', duration: 7000 }
        )
      } else {
        toast.error(lang === 'ar' ? 'حدث خطأ أثناء حفظ الملف' : 'Erreur de sauvegarde', { id: 'export-toast' })
      }
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'فشل التصدير' : 'Échec de l\'exportation', { id: 'export-toast' })
    } finally {
      setExportingId(null)
    }
  }

  // Export ALL Groupes (Global) - Each in its own desktop folder
  async function exportAllGroupes() {
    if (groupes.length === 0) {
      toast.error(lang === 'ar' ? 'لا توجد أفواج للتصدير' : 'Aucun groupe à exporter')
      return
    }

    try {
      setBulkProgress({ current: 0, total: groupes.length, label: 'Démarrage de l\'exportation...' })
      let exportedCount = 0

      for (let i = 0; i < groupes.length; i++) {
        const g = groupes[i]
        setBulkProgress({
          current: i + 1,
          total: groupes.length,
          label: lang === 'ar' ? `جاري معالجة الفوج ${g.code_groupe} (${i + 1}/${groupes.length})...` : `Traitement du groupe ${g.code_groupe} (${i + 1}/${groupes.length})...`
        })

        const grid = buildGroupeSchedule(g)
        const filiereObj = filieres.find(f => f.id === g.id_filiere || f.code_filiere === g.filiere)
        const anneeLabel = g.annee === 2 ? '2ème Année' : '1ère Année'
        const anneeFormation = localStorage.getItem('annee_formation_groupe') || '2026/2027'
        const periode = localStorage.getItem('periode_application_groupe') || 'Du 01/09/2026 au 30/06/2027'

        setPrintData({
          type: 'groupe',
          title: 'EMPLOI DU TEMPS DU GROUPE',
          subTitle: `ANNEE DE FORMATION : ${anneeFormation}`,
          codeOrName: g.code_groupe,
          meta: {
            'DRGC': 'Direction Régionale Grand Casablanca',
            'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
            'Filière': filiereObj ? `${filiereObj.code_filiere} - ${filiereObj.nom_filiere}` : (g.filiere || 'Filière'),
            'Groupe': g.code_groupe,
            'Niveau': anneeLabel,
            'Période': periode,
            'Mode de formation': 'FPA / Résidentiel'
          },
          grid
        })

        await new Promise(r => setTimeout(r, 100))
        const base64Data = await generateCurrentPdfBase64()
        const folderName = g.code_groupe.trim()
        const fileName = `${folderName}_Emploi_du_Temps.pdf`

        await saveToDesktop(folderName, fileName, base64Data)
        exportedCount++
      }

      toast.success(
        lang === 'ar'
          ? `🎉 تم بنجاح تصدير جميع الأفواج (${exportedCount})! تم إنشاء مجلد لكل فوج على سطح المكتب وبداخله ملف الـ PDF الخاص به.`
          : `🎉 Succès ! ${exportedCount} groupes exportés sur le Bureau dans leurs dossiers respectifs.`
      )
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء التصدير الشامل' : 'Erreur lors de l\'export global')
    } finally {
      setBulkProgress(null)
    }
  }

  // Export ALL Formateurs (Global)
  async function exportAllFormateurs() {
    if (formateurs.length === 0) {
      toast.error(lang === 'ar' ? 'لا يوجد مكونين للتصدير' : 'Aucun formateur à exporter')
      return
    }

    try {
      setBulkProgress({ current: 0, total: formateurs.length, label: 'Démarrage de l\'exportation...' })
      let exportedCount = 0

      for (let i = 0; i < formateurs.length; i++) {
        const f = formateurs[i]
        const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || `Formateur_${i + 1}`

        setBulkProgress({
          current: i + 1,
          total: formateurs.length,
          label: lang === 'ar' ? `جاري معالجة الأستاذ ${profName} (${i + 1}/${formateurs.length})...` : `Traitement du formateur ${profName} (${i + 1}/${formateurs.length})...`
        })

        const grid = buildFormateurSchedule(f)
        const anneeFormation = localStorage.getItem('annee_formation_formateur') || '2026/2027'
        const periode = localStorage.getItem('periode_application_formateur') || 'Du 01/09/2026 au 30/06/2027'

        setPrintData({
          type: 'formateur',
          title: 'EMPLOI DU TEMPS DU FORMATEUR',
          subTitle: `ANNEE DE FORMATION : ${anneeFormation}`,
          codeOrName: profName,
          meta: {
            'DRGC': 'Direction Régionale Grand Casablanca',
            'Complexe/EFP': 'CFP IMME / ISTA MY RACHID',
            'Formateur': profName,
            'Matricule': f.matricule || '-',
            'Spécialité': f.specialite || f.matiere || 'Technique',
            'Période': periode,
            'Statut': 'Statutaire'
          },
          grid
        })

        await new Promise(r => setTimeout(r, 100))
        const base64Data = await generateCurrentPdfBase64()
        const folderName = profName.replace(/[\\/:*?"<>|]/g, '_').trim()
        const fileName = `${folderName}_Emploi_du_Temps.pdf`

        await saveToDesktop(folderName, fileName, base64Data)
        exportedCount++
      }

      toast.success(
        lang === 'ar'
          ? `🎉 تم بنجاح تصدير جميع المكونين (${exportedCount}) في مجلداتهم على سطح المكتب!`
          : `🎉 Succès ! ${exportedCount} formateurs exportés sur le Bureau.`
      )
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء التصدير الشامل' : 'Erreur lors de l\'export global')
    } finally {
      setBulkProgress(null)
    }
  }

  // Filtered lists
  const filteredFormateurs = formateurs.filter(f => {
    const term = searchFormateur.toLowerCase().trim()
    if (!term) return true
    const name = (f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`).toLowerCase()
    const matricule = (f.matricule || '').toLowerCase()
    return name.includes(term) || matricule.includes(term)
  })

  const filteredGroupes = groupes.filter(g => {
    const term = searchGroupe.toLowerCase().trim()
    if (!term) return true
    return g.code_groupe.toLowerCase().includes(term)
  })

  return (
    <div className="fade-in-up">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>{lang === 'ar' ? 'تصدير التقارير وجداول الحصص (PDF)' : 'Export des Rapports & Emplois du Temps (PDF)'}</h1>
          <p>
            {lang === 'ar'
              ? 'يتم تنزيل كل ملف مباشرة على سطح المكتب داخل مجلد يحمل اسم الفوج أو الأستاذ'
              : 'Chaque fichier est automatiquement enregistré sur le Bureau dans un dossier portant le nom du groupe ou du formateur'}
          </p>
        </div>

        {lastExportPath && (
          <button
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontWeight: 600 }}
            onClick={() => handleOpenFolder(lastExportPath.targetDir)}
          >
            <FolderOpen size={18} color="#059669" />
            {lang === 'ar' ? `فتح آخر مجلد (${lastExportPath.folderName})` : `Ouvrir dossier (${lastExportPath.folderName})`}
          </button>
        )}
      </div>

      {/* ── Bulk Progress Banner ── */}
      {bulkProgress && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08))',
          border: '1.5px solid #10b981',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={18} className="animate-spin" color="#10b981" />
              {bulkProgress.label}
            </span>
            <span style={{ color: '#059669', fontSize: 15 }}>
              {bulkProgress.current} / {bulkProgress.total} ({Math.round((bulkProgress.current / bulkProgress.total) * 100)}%)
            </span>
          </div>
          <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981, #059669)',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>
      )}

      {/* ── Page Body ── */}
      <div className="page-body">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <div className="dashboard-grid">

            {/* ══════════════════════════════════════════════════════════
                CARD 1: PLANNINGS DES FORMATEURS
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="card-header" style={{ marginBottom: 16 }}>
                <h3 className="card-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Users size={22} color="var(--primary)" />
                  {lang === 'ar' ? 'جداول المكونين (Formateurs)' : 'Plannings des Formateurs'}
                </h3>
                <span className="badge badge-info" style={{ fontSize: 12 }}>
                  {formateurs.length} {lang === 'ar' ? 'مكون' : 'formateurs'}
                </span>
              </div>

              {/* Global Button */}
              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginBottom: 16,
                  padding: '13px 20px',
                  fontSize: '15px',
                  fontWeight: 700,
                  gap: '10px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
                }}
                disabled={!!bulkProgress}
                onClick={exportAllFormateurs}
              >
                <FileDown size={19} />
                {lang === 'ar'
                  ? 'تصدير جميع المكونين (مجلد لكل أستاذ على المكتب)'
                  : 'Exporter tous les formateurs (Dossier / Bureau)'}
              </button>

              {/* Quick Search */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={16} style={{ position: 'absolute', top: 12, left: lang === 'ar' ? undefined : 12, right: lang === 'ar' ? 12 : undefined, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'بحث سريع عن مكون...' : 'Rechercher un formateur...'}
                  value={searchFormateur}
                  onChange={(e) => setSearchFormateur(e.target.value)}
                  style={{
                    width: '100%',
                    padding: lang === 'ar' ? '9px 36px 9px 12px' : '9px 12px 9px 36px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    background: 'var(--bg-secondary)'
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>{lang === 'ar' ? 'تصدير فردي :' : 'Export individuel :'}</span>
                <span style={{ fontSize: 11, fontWeight: 400 }}>{filteredFormateurs.length} {lang === 'ar' ? 'نتيجة' : 'trouvé(s)'}</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 6 }}>
                {filteredFormateurs.map((f) => {
                  const profName = f.nom_prenom || `${f.nom || ''} ${f.prenom || ''}`.trim() || 'Formateur'
                  const isCurrentExporting = exportingId === (f.id || profName)
                  return (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        transition: 'transform 0.15s ease, border-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{profName}</span>
                        {f.matricule && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mle: {f.matricule}</span>}
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, gap: '7px' }}
                        disabled={!!exportingId || !!bulkProgress}
                        onClick={() => exportSingleFormateur(f)}
                      >
                        {isCurrentExporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {lang === 'ar' ? 'جاري الحفظ...' : 'Sauvegarde...'}
                          </>
                        ) : (
                          <>
                            <FileDown size={15} />
                            {lang === 'ar' ? 'تصدير للمكتب' : 'Exporter'}
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                CARD 2: PLANNINGS DES GROUPES (Demande de l'utilisateur)
            ══════════════════════════════════════════════════════════ */}
            <div className="card" style={{ padding: '24px', border: '1.5px solid rgba(16, 185, 129, 0.4)' }}>
              <div className="card-header" style={{ marginBottom: 16 }}>
                <h3 className="card-title" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <UsersRound size={22} color="#059669" />
                  {lang === 'ar' ? 'جداول الأفواج (Groupes)' : 'Plannings des Groupes'}
                </h3>
                <span className="badge" style={{ fontSize: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid #10b981' }}>
                  {groupes.length} {lang === 'ar' ? 'فوج' : 'groupes'}
                </span>
              </div>

              {/* Global Button with Emerald Green gradient */}
              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  marginBottom: 16,
                  padding: '13px 20px',
                  fontSize: '15px',
                  fontWeight: 700,
                  gap: '10px',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
                disabled={!!bulkProgress}
                onClick={exportAllGroupes}
              >
                <FileDown size={19} />
                {lang === 'ar'
                  ? 'تصدير جدول جميع الأفواج (مجلد لكل فوج على سطح المكتب)'
                  : 'Exporter tous les groupes (Dossier / Bureau)'}
              </button>

              {/* Quick Search for Groups */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={16} style={{ position: 'absolute', top: 12, left: lang === 'ar' ? undefined : 12, right: lang === 'ar' ? 12 : undefined, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'بحث سريع عن فوج (مثال: AEFGT101)...' : 'Rechercher un groupe (ex: AEFGT101)...'}
                  value={searchGroupe}
                  onChange={(e) => setSearchGroupe(e.target.value)}
                  style={{
                    width: '100%',
                    padding: lang === 'ar' ? '9px 36px 9px 12px' : '9px 12px 9px 36px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    background: 'var(--bg-secondary)'
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>{lang === 'ar' ? 'تصدير فردي (سطح المكتب > مجلد اسم الفوج) :' : 'Export individuel (Bureau > Dossier du groupe) :'}</span>
                <span style={{ fontSize: 11, fontWeight: 400 }}>{filteredGroupes.length} {lang === 'ar' ? 'فوج' : 'groupe(s)'}</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 6 }}>
                {filteredGroupes.map((g) => {
                  const isCurrentExporting = exportingId === (g.id || g.code_groupe)
                  return (
                    <div
                      key={g.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        transition: 'transform 0.15s ease, border-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#10b981'
                        }} />
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                          {g.code_groupe}
                        </span>
                        {g.filiere && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>
                            {g.filiere}
                          </span>
                        )}
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 700,
                          gap: '7px',
                          color: '#059669',
                          borderColor: '#10b981'
                        }}
                        disabled={!!exportingId || !!bulkProgress}
                        onClick={() => exportSingleGroupe(g)}
                      >
                        {isCurrentExporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            {lang === 'ar' ? 'جاري الحفظ...' : 'Sauvegarde...'}
                          </>
                        ) : (
                          <>
                            <FileDown size={15} />
                            {lang === 'ar' ? 'تصدير للمكتب' : 'Exporter'}
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          OFF-SCREEN OFFICIAL OFPPT DOCUMENT TEMPLATE (Captured by html2canvas)
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: 1140,
          background: '#ffffff',
          color: '#000000',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          zIndex: -999,
          pointerEvents: 'none'
        }}
      >
        {printData && (
          <div
            ref={printSheetRef}
            style={{
              padding: 24,
              background: '#ffffff',
              border: '2.5px solid #000000',
              boxSizing: 'border-box',
              width: 1140
            }}
          >
            {/* Header: Logo + Title */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '2.5px solid #000000', paddingBottom: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '2px solid #000000', paddingRight: 12 }}>
                <img src={ofpptLogo} alt="OFPPT Logo" style={{ width: 110, height: 75, objectFit: 'contain' }} />
              </div>
              <div style={{ textAlign: 'center', paddingLeft: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.2, color: '#1e293b', marginBottom: 2 }}>
                  ROYAUME DU MAROC - OFPPT
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: '2px 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {printData.title} : <span style={{ color: '#0f766e' }}>{printData.codeOrName}</span>
                </h1>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#334155' }}>
                  {printData.subTitle}
                </div>
              </div>
            </div>

            {/* Metadata Table */}
            <div style={{ borderBottom: '2px solid #000000', padding: '10px 14px', fontSize: 13, lineHeight: '22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.2fr', rowGap: 4, columnGap: 16 }}>
                {Object.entries(printData.meta).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', gap: 6 }}>
                    <strong style={{ minWidth: 100, color: '#0f172a' }}>{key} :</strong>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly Timetable Table */}
            <div style={{ marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
                <thead>
                  {/* Row 1: Time labels */}
                  <tr>
                    <th style={{ width: 100, padding: '8px 4px', border: '1.5px solid #000000', background: '#d1d5db', fontWeight: 900, textAlign: 'center', fontSize: 12 }}>
                      JOUR / CRÉNEAU
                    </th>
                    {TS_LABELS.map((lbl, idx) => (
                      <th
                        key={idx}
                        style={{
                          padding: '8px 4px',
                          border: '1.5px solid #000000',
                          background: '#e5e7eb',
                          fontWeight: 900,
                          fontSize: 12,
                          textAlign: 'center'
                        }}
                      >
                        {lbl}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {JOURS_LIST.map((jour) => (
                    <tr key={jour} style={{ height: 68 }}>
                      <td
                        style={{
                          padding: '6px 4px',
                          border: '1.5px solid #000000',
                          background: '#f3f4f6',
                          fontWeight: 900,
                          fontSize: 13,
                          textAlign: 'center',
                          letterSpacing: 0.5
                        }}
                      >
                        {jour}
                      </td>

                      {[0, 1, 2, 3].map((slotIdx) => {
                        const cell = printData.grid[`${jour}__${slotIdx}`]
                        return (
                          <td
                            key={slotIdx}
                            style={{
                              border: '1.5px solid #000000',
                              padding: 6,
                              verticalAlign: 'middle',
                              textAlign: 'center',
                              background: cell ? '#f0fdf4' : '#ffffff'
                            }}
                          >
                            {cell ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 12.5, fontWeight: 900, color: '#065f46' }}>
                                  {cell.module}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>
                                  {printData.type === 'groupe' ? cell.formateur : cell.groupe}
                                </span>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', background: '#e2e8f0', padding: '1px 6px', borderRadius: 3 }}>
                                  {cell.salle}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 22, paddingTop: 10, borderTop: '1.5px solid #000000', fontSize: 13 }}>
              <div style={{ textAlign: 'center' }}>
                <strong>Visa du Formateur / Coordinateur</strong>
              </div>
              <div style={{ textAlign: 'center' }}>
                <strong>Visa du Directeur du Complexe / Chef d'Etablissement</strong>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
