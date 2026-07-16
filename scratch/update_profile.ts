import { initializeApp } from "firebase/app";
import { getDatabase, ref, update } from "firebase/database";
import { initializeFirestore, doc, setDoc } from "firebase/firestore";

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
const rtdb = getDatabase(app);
const db = initializeFirestore(app, {});

const uid = "m1uph2bX7SVd9Wbyge1AMqAmq093";

const cleanProfile = {
  fullName: "Shivani",
  name: "Shivani",
  email: "shivanigundlapalli@gmail.com",
  age: "24",
  gender: "Female",
  bloodGroup: "O+",
  height: "162",
  weight: "52",
  occupation: "Software Engineer",
  phoneNumber: "+91 93475 92994",
  address: "Madhapur, Hyderabad, Telangana, India",
  onboardingCompleted: true,
  onboarded: true,
  medicalHistory: {
    hasHeartAttack: false,
    hasHypertension: false,
    hasThyroid: false,
    hasAnxiety: false,
    stressLevel: 3,
    hasDiabetes: false,
    isSmoking: false,
    hasChestPain: false,
    hasBreathingIssue: false,
    hasFamilyHistory: false
  },
  emergencyContacts: {
    family: {
      name: "Siva",
      phone: "+91 93475 92994",
      whatsapp: true
    },
    friend: {
      name: "Pranav",
      phone: "+91 93475 92994",
      whatsapp: true
    },
    guardian: {
      name: "Siva",
      phone: "+91 93475 92994",
      whatsapp: true
    }
  }
};

async function runUpdate() {
  console.log("Updating RTDB...");
  const rtdbRef = ref(rtdb, `users/${uid}`);
  await update(rtdbRef, {
    onboarded: true,
    onboardingCompleted: true,
    profile: {
      name: cleanProfile.fullName,
      email: cleanProfile.email,
      age: cleanProfile.age,
      gender: cleanProfile.gender,
      bloodGroup: cleanProfile.bloodGroup,
      height: cleanProfile.height,
      weight: cleanProfile.weight,
      occupation: cleanProfile.occupation,
      phoneNumber: cleanProfile.phoneNumber,
      address: cleanProfile.address,
      medicalHistory: cleanProfile.medicalHistory,
      emergencyContacts: cleanProfile.emergencyContacts
    }
  });

  console.log("Updating Firestore...");
  const firestoreRef = doc(db, "users", uid);
  await setDoc(firestoreRef, {
    uid: uid,
    role: "patient",
    status: "approved",
    onboarded: true,
    onboardingCompleted: true,
    ...cleanProfile
  }, { merge: true });

  console.log("Done updating profile for Shivani!");
  process.exit(0);
}

runUpdate().catch(console.error);
