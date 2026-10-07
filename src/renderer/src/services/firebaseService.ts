import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Formateur, Salle, Filiere, Groupe, Seance, Jour, HeureDebut } from '../types'

// ============================
// FORMATEURS SERVICE
// ============================
export const formateursService = {
  async getAll(): Promise<Formateur[]> {
    const q = query(collection(db, 'formateurs'), orderBy('nom_prenom'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Formateur))
  },

  async add(data: Omit<Formateur, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'formateurs'), {
      ...data,
      createdAt: serverTimestamp()
    })
    return ref.id
  },

  async update(id: string, data: Partial<Formateur>): Promise<void> {
    await updateDoc(doc(db, 'formateurs', id), data)
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'formateurs', id))
  },

  async deleteAll(): Promise<void> {
    const snap = await getDocs(collection(db, 'formateurs'))
    const promises = snap.docs.map((d) => deleteDoc(d.ref))
    await Promise.all(promises)
  }
}

// ============================
// SALLES SERVICE
// ============================
export const sallesService = {
  async getAll(): Promise<Salle[]> {
    const q = query(collection(db, 'salles'), orderBy('createdAt'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Salle))
  },

  async add(data: Omit<Salle, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'salles'), {
      ...data,
      createdAt: serverTimestamp()
    })
    return ref.id
  },

  async update(id: string, data: Partial<Salle>): Promise<void> {
    await updateDoc(doc(db, 'salles', id), data)
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'salles', id))
  },

  async deleteAll(): Promise<void> {
    const snap = await getDocs(collection(db, 'salles'))
    const promises = snap.docs.map((d) => deleteDoc(d.ref))
    await Promise.all(promises)
  }
}

// ============================
// FILIERES SERVICE
// ============================
export const filieresService = {
  async getAll(): Promise<Filiere[]> {
    const q = query(collection(db, 'filieres'), orderBy('code_filiere'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Filiere))
  },

  async add(data: Omit<Filiere, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'filieres'), {
      ...data,
      createdAt: serverTimestamp()
    })
    return ref.id
  },

  async update(id: string, data: Partial<Filiere>): Promise<void> {
    await updateDoc(doc(db, 'filieres', id), data)
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'filieres', id))
  }
}

// ============================
// GROUPES SERVICE
// ============================
export const groupesService = {
  async getAll(): Promise<Groupe[]> {
    const q = query(collection(db, 'groupes'), orderBy('code_groupe'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Groupe))
  },

  async add(data: Omit<Groupe, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'groupes'), {
      ...data,
      createdAt: serverTimestamp()
    })
    return ref.id
  },

  async update(id: string, data: Partial<Groupe>): Promise<void> {
    await updateDoc(doc(db, 'groupes', id), data)
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'groupes', id))
  }
}

// ============================
// SEANCES SERVICE
// ============================
export const seancesService = {
  async getAll(): Promise<Seance[]> {
    const snap = await getDocs(collection(db, 'seances'))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Seance))
  },

  async add(data: Omit<Seance, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'seances'), {
      ...data,
      createdAt: serverTimestamp()
    })
    return ref.id
  },

  async update(id: string, data: Partial<Seance>): Promise<void> {
    await updateDoc(doc(db, 'seances', id), data)
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'seances', id))
  },

  // ============================
  // CONFLICT DETECTION
  // ============================
  async checkConflict(
    seance: Omit<Seance, 'id'>,
    excludeId?: string
  ): Promise<{ hasConflict: boolean; message: string }> {
    const snap = await getDocs(collection(db, 'seances'))
    const allSeances = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Seance))
      .filter((s) => s.jour === seance.jour && s.heure_debut === seance.heure_debut)
      .filter((s) => s.id !== excludeId)

    // Check formateur conflict
    const formateurConflict = allSeances.find((s) => s.id_formateur === seance.id_formateur)
    if (formateurConflict) {
      return {
        hasConflict: true,
        message: `⚠️ تضارب: المكون محجوز في هذه الفترة (${seance.jour} ${seance.heure_debut})`
      }
    }

    // Check salle conflict
    const salleConflict = allSeances.find((s) => s.id_salle === seance.id_salle)
    if (salleConflict) {
      return {
        hasConflict: true,
        message: `⚠️ تضارب: القاعة محجوزة في هذه الفترة (${seance.jour} ${seance.heure_debut})`
      }
    }

    // Check groupe conflict
    const groupeConflict = allSeances.find((s) => s.id_groupe === seance.id_groupe)
    if (groupeConflict) {
      return {
        hasConflict: true,
        message: `⚠️ تضارب: المجموعة لديها حصة أخرى في هذه الفترة (${seance.jour} ${seance.heure_debut})`
      }
    }

    return { hasConflict: false, message: '' }
  },

  // ============================
  // FIND EMPTY SALLES
  // ============================
  async findSallesVides(jour: Jour, heureDebut: HeureDebut): Promise<string[]> {
    const [allSalles, allSeances] = await Promise.all([
      sallesService.getAll(),
      seancesService.getAll()
    ])

    const occupiedSalleIds = allSeances
      .filter((s) => s.jour === jour && s.heure_debut === heureDebut)
      .map((s) => s.id_salle)

    return allSalles
      .filter((s) => !occupiedSalleIds.includes(s.id!))
      .map((s) => s.nom_salle)
  },

  // ============================
  // FIND EMPTY GROUPES
  // ============================
  async findGroupesVides(jour: Jour, heureDebut: HeureDebut): Promise<string[]> {
    const [allGroupes, allSeances] = await Promise.all([
      groupesService.getAll(),
      seancesService.getAll()
    ])

    const occupiedGroupeIds = allSeances
      .filter((s) => s.jour === jour && s.heure_debut === heureDebut)
      .map((s) => s.id_groupe)

    return allGroupes
      .filter((g) => !occupiedGroupeIds.includes(g.id!) && !g.en_stage)
      .map((g) => g.code_groupe)
  }
}
