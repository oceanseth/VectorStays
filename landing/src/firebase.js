import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  linkWithPopup,
  linkWithCredential,
  PhoneAuthProvider,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'

// Same project as the support-call portal (`vectorsupportagent`).
const config = {
  apiKey: 'AIzaSyBmEfpBq0Wp-AbJnwQNzwQSAcOwTHEbIEM',
  authDomain: 'vectorsupportagent.firebaseapp.com',
  databaseURL: 'https://vectorsupportagent-default-rtdb.firebaseio.com',
  projectId: 'vectorsupportagent',
  storageBucket: 'vectorsupportagent.firebasestorage.app',
  messagingSenderId: '898157976411',
  appId: '1:898157976411:web:a09a3c0ec6261ba6a3987e',
}

const app = initializeApp(config)
export const auth = getAuth(app)

export {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  linkWithPopup,
  linkWithCredential,
  PhoneAuthProvider,
  signOut,
  onAuthStateChanged,
}
