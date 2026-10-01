import { db } from '../lib/firebase'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'

const DEMO_FORMATEURS = [
  { matricule: '12345', nom_prenom: 'Ahmed Benali' },
  { matricule: '23456', nom_prenom: 'Fatima Zohra El Amrani' },
  { matricule: '34567', nom_prenom: 'Youssef Idrissi' },
  { matricule: '45678', nom_prenom: 'Najat Benhaddou' },
  { matricule: '56789', nom_prenom: 'Omar El Fassi' },
]

const DEMO_SALLES = [
  { nom_salle: 'S101', type_salle: 'Salle' as const },
  { nom_salle: 'S102', type_salle: 'Salle' as const },
  { nom_salle: 'S103', type_salle: 'Salle' as const },
  { nom_salle: 'A01 - Informatique', type_salle: 'Atelier' as const },
  { nom_salle: 'A02 - Réseau', type_salle: 'Atelier' as const },
]

const DEMO_FILIERES = [
  { code_filiere: 'TSDI', nom_filiere: 'Développement Informatique' },
  { code_filiere: 'TEMI', nom_filiere: 'Électromécanique Industrielle' },
  { code_filiere: 'TSGE', nom_filiere: 'Gestion des Entreprises' },
]

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

    // Add salles
    for (const s of DEMO_SALLES) {
      await addDoc(collection(db, 'salles'), { ...s, createdAt: serverTimestamp() })
    }

    // Add filieres and then groupes
    for (const filiere of DEMO_FILIERES) {
      const fRef = await addDoc(collection(db, 'filieres'), { ...filiere, createdAt: serverTimestamp() })
      
      // Add 2 groupes per filiere
      await addDoc(collection(db, 'groupes'), {
        code_groupe: `${filiere.code_filiere} 101`,
        id_filiere: fRef.id,
        en_stage: false,
        createdAt: serverTimestamp()
      })
      await addDoc(collection(db, 'groupes'), {
        code_groupe: `${filiere.code_filiere} 201`,
        id_filiere: fRef.id,
        en_stage: filiere.code_filiere === 'TEMI', // TEMI is in stage
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
