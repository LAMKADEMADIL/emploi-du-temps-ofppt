import { db } from '../lib/firebase'
import { collection, getDocs, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

// ── القائمة الرسمية للقاعات (27 قاعة) ─────────────────────────────────────
const SALLES_OFFICIELLES = [
  { nom_salle: 'SALLE 01',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 02',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 03',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 05',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 06',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 08',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 09',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 10',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE 11',   type_salle: 'Salle'   as const },
  { nom_salle: 'SALLE INFO', type_salle: 'Salle'   as const },
  { nom_salle: 'AT EB',      type_salle: 'Atelier' as const },
  { nom_salle: 'AT TFM',     type_salle: 'Atelier' as const },
  { nom_salle: 'AT EEI',     type_salle: 'Atelier' as const },
  { nom_salle: 'AT PC',      type_salle: 'Atelier' as const },
  { nom_salle: 'AT AEFGT',   type_salle: 'Atelier' as const },
  { nom_salle: 'AT RVA1',    type_salle: 'Atelier' as const },
  { nom_salle: 'AT RVA2',    type_salle: 'Atelier' as const },
  { nom_salle: 'AT RVA3',    type_salle: 'Atelier' as const },
  { nom_salle: 'AT CPA',     type_salle: 'Atelier' as const },
  { nom_salle: 'AT OPCM1',   type_salle: 'Atelier' as const },
  { nom_salle: 'AT OPCM2',   type_salle: 'Atelier' as const },
  { nom_salle: 'AT MA',      type_salle: 'Atelier' as const },
  { nom_salle: 'AT MOAB',    type_salle: 'Atelier' as const },
  { nom_salle: 'AT TREM',    type_salle: 'Atelier' as const },
  { nom_salle: 'AT TEMI1',   type_salle: 'Atelier' as const },
  { nom_salle: 'AT ESA',     type_salle: 'Atelier' as const },
  { nom_salle: 'AT TEMI2',   type_salle: 'Atelier' as const },
]

// الأسماء القديمة/الخاطئة التي يجب استبدالها
const OLD_SALLE_NAMES = ['S101', 'S102', 'S103', 'A01 - Informatique', 'A02 - Réseau']

const DEMO_FORMATEURS = [
  { matricule: '12345', nom_prenom: 'Ahmed Benali' },
  { matricule: '23456', nom_prenom: 'Fatima Zohra El Amrani' },
  { matricule: '34567', nom_prenom: 'Youssef Idrissi' },
  { matricule: '45678', nom_prenom: 'Najat Benhaddou' },
  { matricule: '56789', nom_prenom: 'Omar El Fassi' },
]

const DEMO_FILIERES = [
  { code_filiere: 'TSDI', nom_filiere: 'Développement Informatique' },
  { code_filiere: 'TEMI', nom_filiere: 'Électromécanique Industrielle' },
  { code_filiere: 'TSGE', nom_filiere: 'Gestion des Entreprises' },
]

// ── ترحيل تلقائي للقاعات إلى القائمة الرسمية ──────────────────────────────
export async function migrateSalles(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'salles'))
    if (snap.empty) return

    const existingNames = snap.docs.map(d => (d.data() as any).nom_salle as string)

    // إذا وُجد أي اسم قديم → استبدل الكل
    const hasOld = existingNames.some(n => OLD_SALLE_NAMES.includes(n))
    if (!hasOld) return // already correct

    console.log('Migrating salles to official list...')
    // حذف القديمة
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
    // إضافة الرسمية
    for (const s of SALLES_OFFICIELLES) {
      await addDoc(collection(db, 'salles'), { ...s, createdAt: serverTimestamp() })
    }
    console.log('Salles migrated successfully!')
  } catch (error) {
    console.error('Error migrating salles:', error)
  }
}

export async function seedDemoData(): Promise<boolean> {
  try {
    // Check if data already exists
    const formateursSnap = await getDocs(collection(db, 'formateurs'))
    if (!formateursSnap.empty) {
      console.log('Data already exists, skipping seed.')
      return false
    }

    console.log('Seeding demo data...')

    // Add formateurs
    for (const f of DEMO_FORMATEURS) {
      await addDoc(collection(db, 'formateurs'), { ...f, createdAt: serverTimestamp() })
    }

    // Add salles (official list)
    for (const s of SALLES_OFFICIELLES) {
      await addDoc(collection(db, 'salles'), { ...s, createdAt: serverTimestamp() })
    }

    // Add filieres and then groupes
    for (const filiere of DEMO_FILIERES) {
      const fRef = await addDoc(collection(db, 'filieres'), { ...filiere, createdAt: serverTimestamp() })
      await addDoc(collection(db, 'groupes'), {
        code_groupe: `${filiere.code_filiere} 101`,
        id_filiere: fRef.id,
        en_stage: false,
        createdAt: serverTimestamp()
      })
      await addDoc(collection(db, 'groupes'), {
        code_groupe: `${filiere.code_filiere} 201`,
        id_filiere: fRef.id,
        en_stage: filiere.code_filiere === 'TEMI',
        createdAt: serverTimestamp()
      })
    }

    console.log('Demo data seeded successfully!')
    return true
  } catch (error) {
    console.error('Error seeding demo data:', error)
    return false
  }
}

