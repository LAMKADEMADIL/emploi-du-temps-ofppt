import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCyihapUq7ZF5Ie_LXSrie-tKqufN6W9LI',
  authDomain: 'emploi-du-temps-ofppt-d9244.firebaseapp.com',
  projectId: 'emploi-du-temps-ofppt-d9244',
  storageBucket: 'emploi-du-temps-ofppt-d9244.firebasestorage.app',
  messagingSenderId: '396614226401',
  appId: '1:396614226401:web:7d8f74303739afe8c342a0',
  measurementId: 'G-PLST095TBB'
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
