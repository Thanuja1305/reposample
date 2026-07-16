import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAccH7rClosmQwrreeseAmHpk3RhJN3M2I",
  authDomain: "heartsync-3b608.firebaseapp.com",
  databaseURL: "https://heartsync-3b608-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "heartsync-3b608",
  storageBucket: "heartsync-3b608.firebasestorage.app",
  messagingSenderId: "3825789912",
  appId: "1:3825789912:web:377c919c80a662ef0e20ad",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function check() {
  const dbRef = ref(db);
  try {
    const snapshot = await get(child(dbRef, `users`));
    if (snapshot.exists()) {
      const users = snapshot.val();
      for (const uid of Object.keys(users)) {
        const u = users[uid];
        console.log(`UID: ${uid}`);
        console.log(`  Role: ${u.role}`);
        console.log(`  Email: ${u.email || (u.profile && u.profile.email)}`);
        console.log(`  Profile:`, JSON.stringify(u.profile || {}, null, 2));
      }
    } else {
      console.log("No data available");
    }
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
}

check();
