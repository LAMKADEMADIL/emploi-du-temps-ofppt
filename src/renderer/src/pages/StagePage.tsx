import React, { useState, useEffect, useRef } from 'react'
import {
  Briefcase,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
  Download,
  Search,
  Check,
  Building2,
  Layers,
  Sparkles
} from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { groupesService, filieresService } from '../services/firebaseService'
import type { Groupe, Filiere } from '../types'
import { useTranslation } from '../lib/i18n'

interface FiliereColumn {
  filiereCode: string
  annee: 1 | 2
  colCode: string // e.g. "TEMI100", "TEMI200"
  groupes: Groupe[]
  isAllInStage: boolean
  hasAnyInStage: boolean
}

export default function StagePage(): React.ReactElement {
  const { lang } = useTranslation()
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [filieres, setFilieres] = useState<Filiere[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAnnee, setFilterAnnee] = useState<'all' | '1' | '2'>('all')

  // Modals state
  const [isRemplirModalOpen, setIsRemplirModalOpen] = useState(false)
  const [remplirFiliere, setRemplirFiliere] = useState<string>('all')
  const [remplirAnnee, setRemplirAnnee] = useState<'all' | '1' | '2'>('all')
  const [remplirAction, setRemplirAction] = useState<'stage' | 'presentiel'>('stage')
  const [isApplyingRemplir, setIsApplyingRemplir] = useState(false)

  // Reset all modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Excel import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importedColumns, setImportedColumns] = useState<Array<{ colCode: string; groupes: string[] }>>([])
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData(): Promise<void> {
    try {
      setLoading(true)
      const [groupesData, filieresData] = await Promise.all([
        groupesService.getAll(),
        filieresService.getAll()
      ])

      const mapped = groupesData.map((g) => {
        const filiere = filieresData.find((f) => f.id === g.id_filiere)
        return { ...g, nom_filiere: filiere ? filiere.code_filiere : '' }
      })

      setGroupes(mapped)
      setFilieres(filieresData)
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء تحميل بيانات التداريب' : 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // Toggle single groupe stage status
  async function toggleGroupeStage(groupe: Groupe): Promise<void> {
    if (!groupe.id) return
    const newStatus = !groupe.en_stage
    try {
      // Optimistic update
      setGroupes((prev) =>
        prev.map((g) => (g.id === groupe.id ? { ...g, en_stage: newStatus } : g))
      )
      await groupesService.update(groupe.id, { en_stage: newStatus })
      toast.success(
        newStatus
          ? (lang === 'ar' ? `تم تحديد ${groupe.code_groupe} في فترة تدريب 💼` : `${groupe.code_groupe} mis en stage 💼`)
          : (lang === 'ar' ? `تم إنهاء فترة التدريب لـ ${groupe.code_groupe} 🏫` : `${groupe.code_groupe} remis en présentiel 🏫`),
        { duration: 2000 }
      )
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'فشل تحديث حالة الفوج' : 'Erreur lors de la mise à jour')
      loadData()
    }
  }

  // Toggle all groupes in a specific column (e.g. TEMI100)
  async function toggleColumnStage(col: FiliereColumn): Promise<void> {
    if (col.groupes.length === 0) return
    const targetStatus = !col.isAllInStage
    try {
      const ids = col.groupes.map((g) => g.id!).filter(Boolean)
      setGroupes((prev) =>
        prev.map((g) => (ids.includes(g.id!) ? { ...g, en_stage: targetStatus } : g))
      )
      await Promise.all(ids.map((id) => groupesService.update(id, { en_stage: targetStatus })))

      toast.success(
        targetStatus
          ? (lang === 'ar' ? `تم تحديد جميع أفواج ${col.colCode} في تدريب` : `Tous les groupes de ${col.colCode} mis en stage`)
          : (lang === 'ar' ? `تم إلغاء التدريب لأفواج ${col.colCode}` : `Tous les groupes de ${col.colCode} remis en cours`)
      )
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء التحديث' : 'Erreur lors de la mise à jour')
      loadData()
    }
  }

  // Remplir Stage Batch Action
  async function handleApplyRemplir(): Promise<void> {
    setIsApplyingRemplir(true)
    try {
      const isStage = remplirAction === 'stage'
      // Filter groupes matching criteria
      const toUpdate = groupes.filter((g) => {
        const matchesFiliere = remplirFiliere === 'all' || g.id_filiere === remplirFiliere
        const annee = detectAnnee(g.code_groupe)
        const matchesAnnee =
          remplirAnnee === 'all' ||
          (remplirAnnee === '1' && annee === 1) ||
          (remplirAnnee === '2' && annee === 2)
        return matchesFiliere && matchesAnnee
      })

      if (toUpdate.length === 0) {
        toast.error(lang === 'ar' ? 'لا يوجد أي فوج يطابق المعايير المحددة' : 'Aucun groupe ne correspond aux critères')
        setIsApplyingRemplir(false)
        return
      }

      await Promise.all(toUpdate.map((g) => groupesService.update(g.id!, { en_stage: isStage })))

      toast.success(
        lang === 'ar'
          ? `تم تحديث ${toUpdate.length} فوج بنجاح!`
          : `${toUpdate.length} groupe(s) mis à jour avec succès!`
      )
      setIsRemplirModalOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء تطبيق التداريب' : 'Erreur lors de la mise à jour')
    } finally {
      setIsApplyingRemplir(false)
    }
  }

  // Reset all stage to false
  async function handleResetAll(): Promise<void> {
    setIsResetting(true)
    try {
      const inStageGroupes = groupes.filter((g) => g.en_stage && g.id)
      await Promise.all(inStageGroupes.map((g) => groupesService.update(g.id!, { en_stage: false })))
      toast.success(
        lang === 'ar' ? 'تمت إعادة تعيين كافة الأفواج للتكوين الحضوري' : 'Tous les groupes ont été remis en présentiel'
      )
      setIsResetModalOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'حدث خطأ أثناء إعادة التعيين' : 'Erreur lors de la réinitialisation')
    } finally {
      setIsResetting(false)
    }
  }

  // Detect year from groupe code (OFPPT standard: '100' or starts with 1 -> Annee 1, '200' or 2 -> Annee 2)
  function detectAnnee(code: string): 1 | 2 {
    const match = code.match(/(\d+)/)
    if (match) {
      const numStr = match[1]
      if (numStr.startsWith('2')) return 2
      if (numStr.startsWith('1')) return 1
    }
    return 1
  }

  // Organize data into Excel-like columns (e.g. TEMI100, TEMI200, ESA100, ESA200...)
  const columns: FiliereColumn[] = []
  filieres.forEach((f) => {
    // Year 1 (100)
    if (filterAnnee === 'all' || filterAnnee === '1') {
      const g1 = groupes.filter(
        (g) =>
          g.id_filiere === f.id &&
          detectAnnee(g.code_groupe) === 1 &&
          (searchTerm ? g.code_groupe.toLowerCase().includes(searchTerm.toLowerCase()) : true)
      )
      columns.push({
        filiereCode: f.code_filiere,
        annee: 1,
        colCode: `${f.code_filiere}100`,
        groupes: g1,
        isAllInStage: g1.length > 0 && g1.every((g) => g.en_stage),
        hasAnyInStage: g1.some((g) => g.en_stage)
      })
    }

    // Year 2 (200)
    if (filterAnnee === 'all' || filterAnnee === '2') {
      const g2 = groupes.filter(
        (g) =>
          g.id_filiere === f.id &&
          detectAnnee(g.code_groupe) === 2 &&
          (searchTerm ? g.code_groupe.toLowerCase().includes(searchTerm.toLowerCase()) : true)
      )
      columns.push({
        filiereCode: f.code_filiere,
        annee: 2,
        colCode: `${f.code_filiere}200`,
        groupes: g2,
        isAllInStage: g2.length > 0 && g2.every((g) => g.en_stage),
        hasAnyInStage: g2.some((g) => g.en_stage)
      })
    }
  })

  // Calculate max rows across all columns so grid height is consistent
  const maxRows = Math.max(6, ...columns.map((c) => c.groupes.length))

  // Stats
  const totalGroupes = groupes.length
  const totalInStage = groupes.filter((g) => g.en_stage).length
  const totalPresentiel = totalGroupes - totalInStage
  const stagePercent = totalGroupes > 0 ? Math.round((totalInStage / totalGroupes) * 100) : 0

  // Download Sample STAGE Excel Template
  function downloadStageTemplate(): void {
    const headerRow: string[] = []
    const sampleRows: string[][] = [[], [], []]

    filieres.slice(0, 8).forEach((f) => {
      headerRow.push(`${f.code_filiere}100`, `${f.code_filiere}200`)
      sampleRows[0].push(`${f.code_filiere}101`, `${f.code_filiere}201`)
      sampleRows[1].push(`${f.code_filiere}102`, `${f.code_filiere}202`)
      sampleRows[2].push(`${f.code_filiere}103`, '')
    })

    if (headerRow.length === 0) {
      headerRow.push('TEMI100', 'TEMI200', 'ESA100', 'ESA200', 'TREM100', 'TREM200')
      sampleRows[0].push('TEMI105', 'TEMI201', 'ESA103', 'ESA201', 'TREM105', 'TREM201')
      sampleRows[1].push('TEMI106', 'TEMI202', 'ESA104', '', 'TREM106', '')
    }

    const aoa = [headerRow, ...sampleRows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'STAGE')
    XLSX.writeFile(wb, 'modele_stage_ofppt.xlsx')
  }

  // Handle Excel File Upload for STAGE sheet
  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        // Check if there's a sheet named "STAGE" (case insensitive)
        const stageSheetName =
          workbook.SheetNames.find((s) => s.trim().toUpperCase() === 'STAGE') ||
          workbook.SheetNames[0]

        if (!stageSheetName) {
          toast.error(lang === 'ar' ? 'الملف فارغ' : 'Fichier vide')
          return
        }

        const ws = workbook.Sheets[stageSheetName]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (!rows || rows.length < 2) {
          toast.error(lang === 'ar' ? 'لا توجد بيانات كافية في ورقة STAGE' : 'Données insuffisantes dans la feuille STAGE')
          return
        }

        const header = rows[0].map((c) => String(c ?? '').trim())
        const parsedCols: Array<{ colCode: string; groupes: string[] }> = []

        header.forEach((colCode, colIdx) => {
          if (!colCode) return
          const colGroupes: string[] = []
          for (let r = 1; r < rows.length; r++) {
            const val = String(rows[r][colIdx] ?? '').trim()
            if (val && !colGroupes.includes(val)) {
              colGroupes.push(val)
            }
          }
          if (colGroupes.length > 0) {
            parsedCols.push({ colCode, groupes: colGroupes })
          }
        })

        if (parsedCols.length === 0) {
          toast.error(lang === 'ar' ? 'لم يتم العثور على مجموعات في ورقة STAGE' : 'Aucun groupe trouvé dans la feuille STAGE')
          return
        }

        setImportedColumns(parsedCols)
        setIsImportModalOpen(true)
      } catch (err) {
        console.error(err)
        toast.error(lang === 'ar' ? 'فشل قراءة ورقة STAGE' : 'Erreur lors de la lecture de la feuille STAGE')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Confirm Import STAGE to Firebase
  async function handleConfirmImport(): Promise<void> {
    if (importedColumns.length === 0) return
    setIsImporting(true)
    try {
      let created = 0
      let updated = 0

      for (const col of importedColumns) {
        // Find or extract filiere code from colCode (e.g. "TEMI100" -> "TEMI")
        const filiereCode = col.colCode.replace(/\d+$/, '')
        let filiere = filieres.find((f) => f.code_filiere.toLowerCase() === filiereCode.toLowerCase())

        // If filiere doesn't exist, create it
        let filiereId = filiere?.id
        if (!filiereId) {
          filiereId = await filieresService.add({
            code_filiere: filiereCode,
            nom_filiere: filiereCode
          })
          filieres.push({ id: filiereId, code_filiere: filiereCode, nom_filiere: filiereCode })
        }

        for (const gCode of col.groupes) {
          const existing = groupes.find((g) => g.code_groupe.toLowerCase() === gCode.toLowerCase())
          if (existing && existing.id) {
            await groupesService.update(existing.id, { id_filiere: filiereId })
            updated++
          } else {
            await groupesService.add({
              code_groupe: gCode,
              id_filiere: filiereId,
              en_stage: false
            })
            created++
          }
        }
      }

      toast.success(
        lang === 'ar'
          ? `تم استيراد ${created} فوج جديد وتحديث ${updated} بنجاح!`
          : `${created} nouveau(x) groupe(s) et ${updated} mis à jour!`
      )
      setIsImportModalOpen(false)
      loadData()
    } catch (err) {
      console.error(err)
      toast.error(lang === 'ar' ? 'فشل حفظ الأفواج المستوردة' : "Erreur lors de l'enregistrement")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
        onChange={handleExcelUpload}
      />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg, #fef08a, #fde047)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #eab308', color: '#854d0e'
            }}>
              <Briefcase size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                {lang === 'ar' ? 'فترة التدريب الميداني (STAGE)' : 'Gestion des Stages en Entreprise'}
              </h1>
              <p style={{ fontSize: 13.5, color: '#4b5563', margin: '3px 0 0 0' }}>
                {lang === 'ar'
                  ? 'متابعة وتحديد وضعية التداريب للأفواج والشعب (السنة الأولى والثانية 100/200)'
                  : 'Affectation et suivi des périodes de stage par filière et groupe (100 / 200)'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Remplir Stage Button (Yellow Accent) */}
          <button
            type="button"
            onClick={() => setIsRemplirModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 22px',
              fontSize: '14px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #fde047, #eab308)',
              color: '#0a0a0a',
              border: '2px solid #ca8a04',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 14px rgba(234, 179, 8, 0.35)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            title={lang === 'ar' ? 'ملء وتحديد التداريب جماعياً' : 'Remplir les stages en lot'}
          >
            <Sparkles size={18} color="#0a0a0a" />
            {lang === 'ar' ? 'ملء التداريب (Remplir Stage)' : 'Remplir Stage'}
          </button>

          {/* Import Excel STAGE */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 18px',
              fontSize: '14px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            title={lang === 'ar' ? 'استيراد ورقة STAGE من ملف Excel' : 'Importer la feuille STAGE depuis Excel'}
          >
            <FileSpreadsheet size={18} />
            {lang === 'ar' ? 'استيراد ورقة STAGE' : 'Importer STAGE'}
          </button>

          {/* Reset all button */}
          {totalInStage > 0 && (
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '11px 16px',
                fontSize: '13.5px',
                fontWeight: 700,
                background: 'white',
                color: '#dc2626',
                border: '2px solid #fca5a5',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fee2e2'
                e.currentTarget.style.borderColor = '#dc2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white'
                e.currentTarget.style.borderColor = '#fca5a5'
              }}
              title={lang === 'ar' ? 'إلغاء وضعية التدريب لجميع الأفواج' : 'Remettre tous les groupes en présentiel'}
            >
              <RotateCcw size={16} />
              {lang === 'ar' ? 'إلغاء التداريب' : 'Réinitialiser'}
            </button>
          )}
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        {/* Statistics Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 20
        }}>
          {/* Card: Total Groupes */}
          <div style={{
            background: 'white',
            border: '1.5px solid #e5e7eb',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontWeight: 600 }}>
                {lang === 'ar' ? 'إجمالي الأفواج' : 'Total Groupes'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', margin: '4px 0 0 0' }}>
                {totalGroupes}
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#374151'
            }}>
              <Layers size={22} />
            </div>
          </div>

          {/* Card: En Stage (Yellow OFPPT) */}
          <div style={{
            background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
            border: '2px solid #fcd34d',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.15)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#92400e', margin: 0, fontWeight: 700 }}>
                {lang === 'ar' ? 'أفواج في فترة تدريب (En Stage)' : 'Groupes en Stage'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#78350f', margin: '4px 0 0 0' }}>
                {totalInStage}
                <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 8, color: '#b45309' }}>
                  ({stagePercent}%)
                </span>
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: '#fde047', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #eab308', color: '#713f12'
            }}>
              <Briefcase size={22} />
            </div>
          </div>

          {/* Card: En Présentiel (Green) */}
          <div style={{
            background: 'white',
            border: '1.5px solid #bbf7d0',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#166534', margin: 0, fontWeight: 600 }}>
                {lang === 'ar' ? 'أفواج في تكوين حضوري' : 'Groupes en Présentiel'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#14532d', margin: '4px 0 0 0' }}>
                {totalPresentiel}
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#15803d'
            }}>
              <CheckCircle2 size={22} />
            </div>
          </div>

          {/* Card: Total Filières */}
          <div style={{
            background: 'white',
            border: '1.5px solid #e5e7eb',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontWeight: 600 }}>
                {lang === 'ar' ? 'الشعب المتوفرة' : 'Filières actives'}
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', margin: '4px 0 0 0' }}>
                {filieres.length}
              </h3>
            </div>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#374151'
            }}>
              <Building2 size={22} />
            </div>
          </div>
        </div>



        {/* STAGE Grid Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : columns.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon">📋</div>
              <h3>{lang === 'ar' ? 'لا توجد بيانات شعب أو أفواج' : 'Aucune filière ou groupe trouvé'}</h3>
              <p>{lang === 'ar' ? 'قم بإضافة الشعب والأفواج للبدء في تتبع التداريب' : 'Ajoutez des filières et des groupes pour commencer'}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: columns.length * 130 }}>
                {/* Column Headers (Row 1 matching Excel STAGE) */}
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    {columns.map((col, idx) => {
                      const isYellow = col.hasAnyInStage
                      return (
                        <th
                          key={idx}
                          style={{
                            padding: '14px 10px',
                            minWidth: 125,
                            width: 130,
                            textAlign: 'center',
                            borderRight: '1.5px solid #d1d5db',
                            borderBottom: isYellow ? '3px solid #ca8a04' : '2px solid #d1d5db',
                            background: isYellow
                              ? 'linear-gradient(180deg, #fef08a 0%, #fde047 100%)'
                              : 'linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)',
                            color: '#0a0a0a',
                            userSelect: 'none',
                            transition: 'all 0.2s',
                            boxShadow: isYellow ? 'inset 0 0 0 1px #eab308' : 'none'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            {/* Column Code (TEMI100, TEMI200, etc.) */}
                            <span style={{ fontSize: 16, fontWeight: 900, color: '#0a0a0a', letterSpacing: 0.5 }}>
                              {col.colCode}
                            </span>

                            {/* Badge */}
                            <span style={{
                              fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
                              background: col.annee === 1 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                              color: col.annee === 1 ? '#1d4ed8' : '#6d28d9',
                              border: col.annee === 1 ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)'
                            }}>
                              {col.annee === 1 ? '1ère Année' : '2ème Année'}
                            </span>

                            {/* Quick Column Toggle Button */}
                            {col.groupes.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleColumnStage(col)
                                }}
                                style={{
                                  marginTop: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: 5,
                                  border: isYellow ? '1px solid #ca8a04' : '1px solid #d1d5db',
                                  background: isYellow ? '#eab308' : '#ffffff',
                                  color: isYellow ? '#ffffff' : '#374151',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                                title={col.isAllInStage ? 'إلغاء التدريب لجميع الأفواج في هذا العمود' : 'تحديد جميع الأفواج في هذا العمود في تدريب'}
                              >
                                {col.isAllInStage ? '✓ En Stage' : 'Remplir'}
                              </button>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                {/* Table Body (Rows 2+ matching Excel STAGE) */}
                <tbody>
                  {Array.from({ length: maxRows }).map((_, rowIdx) => (
                    <tr key={rowIdx} style={{ background: rowIdx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      {columns.map((col, colIdx) => {
                        const groupe = col.groupes[rowIdx]

                        if (!groupe) {
                          // Empty cell just like Excel
                          return (
                            <td
                              key={colIdx}
                              style={{
                                padding: '12px 10px',
                                textAlign: 'center',
                                borderRight: '1.5px solid #e5e7eb',
                                borderBottom: '1px solid #e5e7eb',
                                height: 56,
                                background: 'transparent'
                              }}
                            />
                          )
                        }

                        const isInStage = groupe.en_stage
                        return (
                          <td
                            key={colIdx}
                            onClick={() => toggleGroupeStage(groupe)}
                            style={{
                              padding: '8px 10px',
                              textAlign: 'center',
                              borderRight: '1.5px solid #e5e7eb',
                              borderBottom: '1px solid #e5e7eb',
                              height: 56,
                              cursor: 'pointer',
                              background: isInStage
                                ? 'linear-gradient(135deg, #fef9c3, #fef08a)'
                                : '#ffffff',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.03)'
                              e.currentTarget.style.zIndex = '5'
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.zIndex = 'auto'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                            title={isInStage ? 'انقر للتحويل إلى تكوين حضوري' : 'انقر للتحويل إلى فترة تدريب'}
                          >
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2
                            }}>
                              <span style={{
                                fontSize: 14.5,
                                fontWeight: 800,
                                color: '#0a0a0a',
                                letterSpacing: 0.3
                              }}>
                                {groupe.code_groupe}
                              </span>

                              {isInStage ? (
                                <span style={{
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  color: '#854d0e',
                                  background: 'rgba(234, 179, 8, 0.3)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3
                                }}>
                                  💼 Stage
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: '#6b7280'
                                }}>
                                  Cours
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* =========================================
          REMPLIR STAGE MODAL (نافذة ملء التداريب)
         ========================================= */}
      {isRemplirModalOpen && (
        <div className="modal-overlay" onClick={() => !isApplyingRemplir && setIsRemplirModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '95%' }}>
            {/* Modal Header */}
            <div className="modal-header" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, #fef08a, #fde047)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #ca8a04', color: '#713f12'
                }}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ fontSize: 20, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                    {lang === 'ar' ? 'ملء التداريب (Remplir Stage)' : 'Affectation Rapide des Stages'}
                  </h3>
                  <p style={{ fontSize: 13, color: '#4b5563', margin: '3px 0 0 0' }}>
                    {lang === 'ar' ? 'تحديد وضعية التدريب دفعة واحدة حسب الشعبة والسنة' : 'Affecter le statut de stage par filière et niveau'}
                  </p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsRemplirModalOpen(false)} disabled={isApplyingRemplir}>×</button>
            </div>

            {/* Modal Body */}
            <div>
              {/* Filiere Selector */}
              <div className="form-group">
                <label className="form-label">{lang === 'ar' ? 'الشعبة المعنية' : 'Filière'}</label>
                <select
                  className="form-select"
                  value={remplirFiliere}
                  onChange={(e) => setRemplirFiliere(e.target.value)}
                >
                  <option value="all">{lang === 'ar' ? '🌟 جميع الشعب (Toutes les filières)' : 'Toutes les filières'}</option>
                  {filieres.map((f) => (
                    <option key={f.id} value={f.id}>{f.code_filiere} - {f.nom_filiere}</option>
                  ))}
                </select>
              </div>

              {/* Year Selector */}
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">{lang === 'ar' ? 'السنة / المستوى الدراسي' : 'Année / Niveau'}</label>
                <select
                  className="form-select"
                  value={remplirAnnee}
                  onChange={(e) => setRemplirAnnee(e.target.value as 'all' | '1' | '2')}
                >
                  <option value="all">{lang === 'ar' ? 'جميع المستويات (1ère et 2ème année)' : 'Toutes les années (100 & 200)'}</option>
                  <option value="1">{lang === 'ar' ? 'السنة الأولى فقط (1ère Année - 100)' : '1ère Année uniquement (100)'}</option>
                  <option value="2">{lang === 'ar' ? 'السنة الثانية فقط (2ème Année - 200)' : '2ème Année uniquement (200)'}</option>
                </select>
              </div>

              {/* Action Selector */}
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">{lang === 'ar' ? 'الإجراء المراد تطبيقه' : 'Action à appliquer'}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setRemplirAction('stage')}
                    style={{
                      padding: '14px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                      border: remplirAction === 'stage' ? '2.5px solid #eab308' : '1.5px solid #e5e7eb',
                      background: remplirAction === 'stage' ? 'linear-gradient(135deg, #fffbeb, #fef08a)' : '#ffffff',
                      color: '#0a0a0a', transition: 'all 0.2s'
                    }}
                  >
                    <Briefcase size={20} color="#b45309" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{lang === 'ar' ? 'في فترة تدريب' : 'Mettre EN STAGE'}</div>
                    <div style={{ fontSize: 11.5, color: '#78350f', marginTop: 2 }}>{lang === 'ar' ? 'تلوين بالأصفر' : 'Statut Stage (Jaune)'}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRemplirAction('presentiel')}
                    style={{
                      padding: '14px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                      border: remplirAction === 'presentiel' ? '2.5px solid #16a34a' : '1.5px solid #e5e7eb',
                      background: remplirAction === 'presentiel' ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : '#ffffff',
                      color: '#0a0a0a', transition: 'all 0.2s'
                    }}
                  >
                    <CheckCircle2 size={20} color="#15803d" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{lang === 'ar' ? 'تكوين حضوري' : 'Remettre EN COURS'}</div>
                    <div style={{ fontSize: 11.5, color: '#166534', marginTop: 2 }}>{lang === 'ar' ? 'إنهاء التدريب' : 'Présentiel normal'}</div>
                  </button>
                </div>
              </div>

              {/* Preview affected count */}
              <div style={{
                marginTop: 20, padding: '12px 16px', borderRadius: 10,
                background: '#f9fafb', border: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: 13.5, color: '#4b5563', fontWeight: 600 }}>
                  {lang === 'ar' ? 'الأفواج المتأثرة بهذا التحديد:' : 'Groupes concernés :'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#0a0a0a' }}>
                  {
                    groupes.filter((g) => {
                      const matchesFiliere = remplirFiliere === 'all' || g.id_filiere === remplirFiliere
                      const annee = detectAnnee(g.code_groupe)
                      const matchesAnnee =
                        remplirAnnee === 'all' ||
                        (remplirAnnee === '1' && annee === 1) ||
                        (remplirAnnee === '2' && annee === 2)
                      return matchesFiliere && matchesAnnee
                    }).length
                  }{' '}
                  {lang === 'ar' ? 'فوج' : 'groupe(s)'}
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ marginTop: 24, justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isApplyingRemplir}
                onClick={() => setIsRemplirModalOpen(false)}
                style={{ padding: '10px 20px', fontSize: 14 }}
              >
                {lang === 'ar' ? 'إلغاء' : 'Annuler'}
              </button>
              <button
                type="button"
                disabled={isApplyingRemplir}
                onClick={handleApplyRemplir}
                style={{
                  padding: '10px 24px', borderRadius: 'var(--radius-md)', fontWeight: 800,
                  fontSize: 14, cursor: isApplyingRemplir ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #fde047, #eab308)', color: '#0a0a0a',
                  border: '1.5px solid #ca8a04',
                  boxShadow: '0 4px 14px rgba(234,179,8,0.35)', display: 'flex', alignItems: 'center', gap: 8
                }}
              >
                <Check size={16} />
                {isApplyingRemplir
                  ? (lang === 'ar' ? 'جاري التطبيق...' : 'Application en cours...')
                  : (lang === 'ar' ? 'تطبيق التحديد' : 'Appliquer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          RESET ALL STAGES CONFIRM MODAL
         ========================================= */}
      {isResetModalOpen && (
        <div className="modal-overlay" onClick={() => !isResetting && setIsResetModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430, textAlign: 'center' }}>
            <div style={{ padding: '30px 24px 20px' }}>
              <div style={{
                width: 70, height: 70, borderRadius: '50%',
                background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px', border: '3px solid #f87171'
              }}>
                <RotateCcw size={32} color="#b91c1c" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0a0a0a', marginBottom: 10 }}>
                {lang === 'ar' ? 'إلغاء وضعية التداريب للجميع' : 'Réinitialiser tous les stages'}
              </h3>
              <p style={{ fontSize: 14.5, color: '#4b5563', lineHeight: 1.6, marginBottom: 24 }}>
                {lang === 'ar'
                  ? `هل تريد إعادة تعيين جميع الأفواج (${totalInStage} فوج في تدريب حالياً) إلى وضع التكوين الحضوري العادي؟`
                  : `Voulez-vous remettre tous les ${totalInStage} groupe(s) actuellement en stage au statut présentiel ?`}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handleResetAll}
                  disabled={isResetting}
                  style={{
                    padding: '11px 26px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    cursor: isResetting ? 'not-allowed' : 'pointer', border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <RotateCcw size={15} />
                  {isResetting ? (lang === 'ar' ? 'جاري الإلغاء...' : 'En cours...') : (lang === 'ar' ? 'نعم، إعادة التعيين' : 'Oui, réinitialiser')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  disabled={isResetting}
                  style={{
                    padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', border: '2px solid #e5e7eb', background: 'white', color: '#374151'
                  }}
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          IMPORT EXCEL STAGE PREVIEW MODAL
         ========================================= */}
      {isImportModalOpen && (
        <div className="modal-overlay" onClick={() => !isImporting && setIsImportModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660, width: '95%' }}>
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669'
                }}>
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ fontSize: 20, fontWeight: 800, color: '#0a0a0a', margin: 0 }}>
                    {lang === 'ar' ? 'معاينة استيراد ورقة STAGE' : 'Aperçu de la feuille STAGE'}
                  </h3>
                  <p style={{ fontSize: 13, color: '#4b5563', margin: '3px 0 0 0' }}>
                    {lang === 'ar'
                      ? `تم العثور على ${importedColumns.length} عمود و ${importedColumns.reduce((sum, c) => sum + c.groupes.length, 0)} فوج`
                      : `${importedColumns.length} colonnes et ${importedColumns.reduce((sum, c) => sum + c.groupes.length, 0)} groupes trouvés`}
                  </p>
                </div>
              </div>
              <button className="modal-close" disabled={isImporting} onClick={() => setIsImportModalOpen(false)}>×</button>
            </div>

            {/* Hint */}
            <div style={{
              background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10,
              padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534', fontWeight: 600
            }}>
              {lang === 'ar'
                ? 'سيتم ربط المجموعات تلقائياً مع الشعب التابعة لها (TEMI, ESA, TREM, etc.) وتحديث قاعدة البيانات.'
                : 'Les groupes seront automatiquement associés à leurs filières respectives (TEMI, ESA, etc.).'}
            </div>

            {/* Preview Grid */}
            <div style={{
              maxHeight: 280, overflowY: 'auto', overflowX: 'auto',
              border: '1.5px solid #e5e7eb', borderRadius: 10, marginBottom: 20
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#0a0a0a' }}># العمود (Code)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#0a0a0a' }}>الشعبة المستنتجة</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#0a0a0a' }}>الأفواج المكتشفة</th>
                  </tr>
                </thead>
                <tbody>
                  {importedColumns.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0a0a0a' }}>{c.colCode}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#3b82f6' }}>{c.colCode.replace(/\d+$/, '')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {c.groupes.map((g, gi) => (
                            <span key={gi} style={{
                              fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                              background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd'
                            }}>
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="modal-footer" style={{ marginTop: 0, justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isImporting}
                onClick={() => setIsImportModalOpen(false)}
                style={{ padding: '10px 20px', fontSize: 14 }}
              >
                {lang === 'ar' ? 'إلغاء' : 'Annuler'}
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={handleConfirmImport}
                style={{
                  padding: '10px 24px', borderRadius: 'var(--radius-md)', fontWeight: 800,
                  fontSize: 14, cursor: isImporting ? 'not-allowed' : 'pointer', border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', gap: 8
                }}
              >
                <CheckCircle2 size={16} />
                {isImporting
                  ? (lang === 'ar' ? 'جاري الاستيراد...' : 'Importation en cours...')
                  : (lang === 'ar' ? 'تأكيد الحفظ' : 'Confirmer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
