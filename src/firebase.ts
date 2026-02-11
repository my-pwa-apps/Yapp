import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyC9Uq8vj0-b7vgwqHcqKuLAPcZW5QlPpOw",
  authDomain: "yappin-d355d.firebaseapp.com",
  databaseURL: "https://yappin-d355d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "yappin-d355d",
  storageBucket: "yappin-d355d.firebasestorage.app",
  messagingSenderId: "703937348268",
  appId: "1:703937348268:web:dab16bf3f6ea68f4745509",
  measurementId: "G-74H0280Q4F",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export default app;
