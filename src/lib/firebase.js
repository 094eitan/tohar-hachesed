// web/src/lib/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBQBrpImGfbfoKR3ffcvsw2OWlQ4nhyKLo",
  authDomain: "tohar-hachesed.firebaseapp.com",
  projectId: "tohar-hachesed",
  storageBucket: "tohar-hachesed.firebasestorage.app",
  messagingSenderId: "823378299378",
  appId: "1:823378299378:web:37733f63ed27c38af6836b"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export { serverTimestamp }
