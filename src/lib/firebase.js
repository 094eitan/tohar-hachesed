// web/src/lib/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { getFirestore, serverTimestamp } from 'firebase/firestore'

// 🔑 הערכים שלך כפי שהדבקת מה-Console:
const firebaseConfig = {
  apiKey: "AIzaSyBQBrpImGfbfoKR3ffcvsw2OWlQ4nhyKLo",
  authDomain: "tohar-hachesed.firebaseapp.com",
  projectId: "tohar-hachesed",
  storageBucket: "tohar-hachesed.firebasestorage.app",
  messagingSenderId: "823378299378",
  appId: "1:823378299378:web:37733f63ed27c38af6836b"
  // measurementId לא נדרש לאתר שלנו
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// יצואי עזר שנשתמש בהם במסכים
export { RecaptchaVerifier, signInWithPhoneNumber, serverTimestamp }


