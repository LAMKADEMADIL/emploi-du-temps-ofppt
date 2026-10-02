// ============================
// TYPES - نظام إدارة استعمال الزمن
// ============================

export interface Formateur {
  id?: string
  matricule: string
  nom_prenom: string   // kept for backward compatibility
  prenom?: string
  nom?: string
  createdAt?: Date
}

export interface Salle {
  id?: string
  nom_salle: string
  type_salle: 'Salle' | 'Atelier'
  createdAt?: Date
}

export interface Filiere {
  id?: string
  code_filiere: string
  nom_filiere: string
  createdAt?: Date
}

export interface Groupe {
  id?: string
  code_groupe: string
  en_stage: boolean
  id_filiere: string
  nom_filiere?: string // joined field
  createdAt?: Date
}

export interface Seance {
  id?: string
  jour: Jour
  heure_debut: HeureDebut
  heure_fin: HeureFin
  module_code: string
  id_formateur: string
  nom_formateur?: string // joined field
  id_salle: string
  nom_salle?: string // joined field
  id_groupe: string
  code_groupe?: string // joined field
  createdAt?: Date
}

// ============================
// ENUMS
// ============================

export type Jour =
  | 'Lundi'
  | 'Mardi'
  | 'Mercredi'
  | 'Jeudi'
  | 'Vendredi'
  | 'Samedi'

export type HeureDebut = '08:30' | '11:00' | '13:30' | '16:00'
export type HeureFin = '11:00' | '13:30' | '16:00' | '18:30'

// ============================
// CONSTANTS
// ============================

export const JOURS: Jour[] = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi'
]

export const TIME_SLOTS: { debut: HeureDebut; fin: HeureFin; label: string }[] = [
  { debut: '08:30', fin: '11:00', label: '08:30 - 11:00' },
  { debut: '11:00', fin: '13:30', label: '11:00 - 13:30' },
  { debut: '13:30', fin: '16:00', label: '13:30 - 16:00' },
  { debut: '16:00', fin: '18:30', label: '16:00 - 18:30' }
]

export type NavPage =
  | 'dashboard'
  | 'formateurs'
  | 'stage'
  | 'salles'
  | 'filieres'
  | 'groupes'
  | 'timetable'
  | 'vacances'
  | 'export'
