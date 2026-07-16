import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, get, set, update } from 'firebase/database';
import { auth, db, rtdb, handleFirestoreError, OperationType } from '../../shared/lib/firebase';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { createUserProfile } from '../../backend/services/firebaseService';

interface ToastType {
  message: string;
  type: 'success' | 'error';
}

interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  fullName?: string;
  role: 'patient' | 'doctor' | 'admin' | null;
  status: 'pending' | 'approved' | 'rejected';
  onboarded: boolean;
  onboardingCompleted?: boolean;
  createdAt?: any;
  
  // Patient Fields
  phoneNumber?: string;
  address?: string;
  bloodGroup?: string;
  age?: string | number;
  photoURL?: string;
  profileImage?: string;
  contacts?: any;
  isEmergency?: boolean;
  lastAlertId?: string;
  serialNumber?: string;
  
  // Doctor Fields
  specialization?: string;
  qualification?: string;
  hospitalName?: string;
  experience?: string;
  gender?: string;
  availability?: string;
  location?: any;
  doctorName?: string;
  doctorPhone?: string;
  doctorPhotoURL?: string;

  // Legacy/Onboarding Fields
  name?: string;
  contactNumber?: string;
  city?: string;
  state?: string;
  hospital?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isOnline: boolean;
  toast: ToastType | null;
  showToast: (message: string, type: 'success' | 'error') => void;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  login: (email: string, password: string) => Promise<UserProfile | null>;
  loginWithGoogle: () => Promise<UserProfile | null>;
  resetPassword: (email: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null,
  loading: true, 
  isOnline: true,
  toast: null, 
  showToast: () => {},
  updateProfileData: async () => {},
  login: async () => null,
  loginWithGoogle: async () => null,
  resetPassword: async () => {},
  signup: async () => {},
  logout: async () => {}
});

const Heart = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-maroon">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

// Safe stringify helper for serializing profile metadata to LocalStorage
const safeStringify = (obj: any): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
      
      // Filter out DOM elements or other non-serializables that might cause issues
      if (value instanceof HTMLElement || value instanceof Window || value instanceof Document) {
        return "[DOM Element]";
      }
    }
    return value;
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('last_known_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastType | null>(null);

  const latestProfileRef = useRef<UserProfile | null>(profile);
  useEffect(() => {
    latestProfileRef.current = profile;
  }, [profile]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("Network Connection Restored", "success");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("Network Uplink Disconnected", "error");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync with Firebase RTDB connection state to monitor network switches/drops
    const connectedRef = ref(rtdb, ".info/connected");
    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      setIsOnline(isConnected);
      if (isConnected) {
        showToast("CardioAlert Grid Connected", "success");
      } else {
        if (navigator.onLine) {
          showToast("Uplink Interrupted. Reconnecting...", "error");
        }
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeConnected();
    };
  }, []);

  const logout = async () => {
    try {
      localStorage.removeItem('last_known_profile');
      setProfile(null);
    } catch (error) {
      console.error("Error during logout cleanup:", error);
    }
    await auth.signOut();
  };

  const login = async (email: string, password: string): Promise<UserProfile | null> => {
    try {
      setLoading(true);
      
      // Clinical validation
      if (!email || !password) {
        throw new Error("Clinical credentials required for node access.");
      }

      const cleanEmail = email.trim().toLowerCase();
      const isDemoDoctor = cleanEmail === 'doctor@heartsync.health';
      const isDemoPatient = cleanEmail === 'patient@heartsync.health';

      try {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (authError: any) {
        if ((isDemoDoctor || isDemoPatient) && 
            (authError.code === 'auth/user-not-found' || 
             authError.code === 'auth/invalid-credential' || 
             authError.code === 'auth/wrong-password')) {
          console.log("🔥 Initializing HeartSync Demo Node on the Firebase Grid...");
          const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          await updateProfile(userCred.user, { 
            displayName: isDemoDoctor ? "Dr. Sarah Connor" : "Shivani" 
          });

          if (isDemoDoctor) {
            await set(ref(rtdb, `users/${userCred.user.uid}`), {
              uid: userCred.user.uid,
              role: 'doctor',
              status: 'approved',
              onboarded: true,
              onboardingCompleted: true,
              doctorName: "Dr. Sarah Connor",
              doctorPhone: "+1 (555) 123-4567",
              createdAt: Date.now(),
              profile: {
                name: "Dr. Sarah Connor",
                specialization: "Interventional Cardiology",
                hospitalName: "Mayo Clinic",
                hospital: "Mayo Clinic",
                email: "doctor@heartsync.health",
                registrationNumber: "MD-99283-X",
                licenseId: "MD-99283-X",
                experience: "15",
                city: "Rochester",
                state: "MN",
                contactNumber: "+1 (555) 123-4567",
                emergencyAvailability: true
              }
            });

            try {
              const { doc, setDoc } = await import('firebase/firestore');
              await setDoc(doc(db, 'users', userCred.user.uid), {
                uid: userCred.user.uid,
                role: 'doctor',
                status: 'approved',
                onboarded: true,
                onboardingCompleted: true,
                name: "Dr. Sarah Connor",
                doctorName: "Dr. Sarah Connor",
                specialization: "Interventional Cardiology",
                hospitalName: "Mayo Clinic",
                hospital: "Mayo Clinic",
                email: "doctor@heartsync.health",
                registrationNumber: "MD-99283-X",
                licenseId: "MD-99283-X",
                experience: "15",
                city: "Rochester",
                state: "MN",
                contactNumber: "+1 (555) 123-4567",
                phoneNumber: "+1 (555) 123-4567",
                doctorPhone: "+1 (555) 123-4567",
                emergencyAvailability: true
              }, { merge: true });
            } catch (err) {
              console.warn("Firestore demo doctor creation delayed:", err);
            }
          } else {
            await set(ref(rtdb, `users/${userCred.user.uid}`), {
              uid: userCred.user.uid,
              role: 'patient',
              status: 'approved',
              onboarded: true,
              onboardingCompleted: true,
              createdAt: Date.now(),
              profile: {
                name: "Shivani",
                age: "24",
                gender: "Female",
                email: "patient@heartsync.health",
                phoneNumber: "+1 (555) 987-6543",
                address: "456 Cardiac Way, Suite 101"
              }
            });

            try {
              const { doc, setDoc } = await import('firebase/firestore');
              await setDoc(doc(db, 'users', userCred.user.uid), {
                uid: userCred.user.uid,
                role: 'patient',
                status: 'approved',
                onboarded: true,
                onboardingCompleted: true,
                name: "Shivani",
                email: "patient@heartsync.health",
                phoneNumber: "+1 (555) 987-6543"
              }, { merge: true });
            } catch (err) {
              console.warn("Firestore demo patient creation delayed:", err);
            }
          }
        } else {
          throw authError;
        }
      }

      const currentUser = auth.currentUser;
      if (currentUser) {
        const profileRef = ref(rtdb, `users/${currentUser.uid}`);
        const snap = await get(profileRef);
        if (snap.exists()) {
          const rawData = snap.val();
          const profileData = rawData.profile || {};
          const data = { 
            ...rawData, 
            ...profileData,
            fullName: profileData.name || rawData.fullName || profileData.fullName || '',
            displayName: profileData.name || rawData.displayName || profileData.displayName || ''
          } as UserProfile;
          setProfile(data);
          localStorage.setItem('last_known_profile', safeStringify(data));
          showToast("Node Link Established", "success");
          return data;
        }
      }
      showToast("Node Link Established", "success");
      return null;
    } catch (error: any) {
      // Intentionally omitting console.error to avoid React DevTools false-positive alarms for expected auth rejects
      let message = "Clinical authorization failed.";
      
      const errorCode = error.code;
      if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password') {
        message = "Invalid access key. Authentication rejected.";
      } else if (errorCode === 'auth/user-not-found') {
        message = "Medical ID not found in HeartSync Registry.";
      } else if (errorCode === 'auth/invalid-email') {
        message = "Malformed institutional email address.";
      } else if (errorCode === 'auth/too-many-requests') {
        message = "Identity locked due to multiple failed attempts.";
      } else if (errorCode === 'auth/network-request-failed') {
        message = "Clinical grid connection failure. Check uplink.";
      } else if (errorCode === 'auth/user-disabled') {
        message = "This medical practitioner node has been deactivated.";
      } else {
        message = error.message || "Institutional SSO failed.";
      }
      
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<UserProfile | null> => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      
      // Check if profile exists, if not initialize basic profile
      let profileSnap;
      try {
        profileSnap = await get(ref(rtdb, `users/${result.user.uid}`));
      } catch (err: any) {
        console.warn("Profile fetch delayed by network:", err.message);
        showToast("Identity sync delayed: Connecting to grid...", "error");
        return null;
      }
      
      let profileData: UserProfile | null = null;
      if (profileSnap && !profileSnap.exists()) {
        const newProfile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || '',
          fullName: result.user.displayName || 'Neural Entity',
          displayName: result.user.displayName || 'Neural Entity',
          role: null,
          status: 'approved',
          onboarded: false,
          onboardingCompleted: false,
          createdAt: Date.now()
        };
        await set(ref(rtdb, `users/${result.user.uid}`), {
          ...newProfile,
          profile: {
            name: result.user.displayName || 'Neural Entity',
            email: result.user.email || '',
            createdAt: Date.now()
          }
        });
        setProfile(newProfile);
        localStorage.setItem('last_known_profile', safeStringify(newProfile));
        profileData = newProfile;
      } else if (profileSnap && profileSnap.exists()) {
        const rawData = profileSnap.val();
        const profileInner = rawData.profile || {};
        profileData = {
          ...rawData,
          ...profileInner,
          fullName: profileInner.name || rawData.fullName || profileInner.fullName || '',
          displayName: profileInner.name || rawData.displayName || profileInner.displayName || ''
        } as UserProfile;
        setProfile(profileData);
        localStorage.setItem('last_known_profile', safeStringify(profileData));
      }

      showToast("Google Identity Synchronized", "success");
      return profileData;
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      let msg = "Identity sync failed.";
      
      if (error.code === 'auth/popup-closed-by-user') {
        msg = "Authentication window closed by user.";
        // Don't throw for simple closure, just toast
        showToast(msg, "error");
        return; 
      } else if (error.code === 'auth/cancelled-query') {
        msg = "Authentication request cancelled.";
      } else if (error.code === 'auth/network-request-failed') {
        msg = "Network error during sync.";
      } else if (error.code === 'auth/popup-blocked') {
        msg = "Popup blocked by browser security.";
      } else {
        msg = error.message || "Google authentication failed.";
      }
      
      showToast(msg, "error");
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("Identity recovery link sent to email.", "success");
    } catch (error: any) {
      console.error("Reset Error:", error);
      let msg = "Could not send recovery link.";
      if (error.code === 'auth/user-not-found') {
        msg = "E-health node not found.";
      } else if (error.code === 'auth/invalid-email') {
        msg = "Invalid e-health address.";
      }
      showToast(msg, "error");
      throw new Error(msg);
    }
  };

  const signup = async (email: string, password: string, fullName: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: fullName });
      
      // Initialize profile document using the new upgraded modular data architecture
      await createUserProfile(userCredential.user.uid, {
        name: fullName,
        age: '',
        gender: '',
        email: email
      });

      showToast("Neural Profile Registered", "success");
    } catch (error: any) {
      console.error("Signup Error:", error);
      let message = "Registry synchronization failed. Please try again.";
      if (error.code === 'auth/email-already-in-use') {
        message = "This e-health node is already registered. Please sign in.";
      } else if (error.code === 'auth/weak-password') {
        message = "Neural passkey is too weak. Enhance complexity.";
      } else if (error.code === 'auth/invalid-email') {
        message = "Invalid e-health address format.";
      }
      throw new Error(message);
    }
  };

  const updateProfileData = React.useCallback(async (data: Partial<UserProfile>) => {
    if (!auth.currentUser) return;
    
    // Optimistic update
    setProfile(prev => {
      const next = prev ? { ...prev, ...data } : { ...data } as UserProfile;
      try {
        localStorage.setItem('last_known_profile', safeStringify(next));
      } catch (e) {
        console.error("Persistence failed:", e);
      }
      return next;
    });
    
    try {
      const updates: any = {
        updatedAt: Date.now()
      };

      const profileFields = [
        'name', 'fullName', 'displayName', 'age', 'gender', 'occupation', 'bloodGroup', 
        'weight', 'height', 'phoneNumber', 'address', 'contacts', 
        'photoURL', 'medicalHistory', 'emergencyContacts', 'profileImage',
        'specialization', 'qualification', 'hospitalName', 'experience', 'availability', 'location',
        'contactNumber', 'city', 'state'
      ];

      Object.entries(data).forEach(([key, value]) => {
        if (profileFields.includes(key)) {
          const dbKey = (key === 'fullName' || key === 'displayName') ? 'name' : key;
          updates[`profile/${dbKey}`] = value;
        } else {
          updates[key] = value;
        }
      });

      // Execute RTDB update in the background (non-blocking)
      update(ref(rtdb, `users/${auth.currentUser.uid}`), updates).catch(err => {
        console.warn("RTDB profile update queued/delayed:", err);
      });

      // Execute Firestore update in the background (non-blocking)
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const firestoreUpdates: any = {
          updatedAt: serverTimestamp()
        };

        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined) {
            firestoreUpdates[key] = value;
          }
        });

        if (data.fullName) firestoreUpdates.name = data.fullName;
        if (data.displayName) firestoreUpdates.name = data.displayName;
        if (data.hospitalName) {
          firestoreUpdates.hospital = data.hospitalName;
          firestoreUpdates.hospitalName = data.hospitalName;
        }
        if (data.phoneNumber) firestoreUpdates.phoneNumber = data.phoneNumber;
        if (data.doctorPhone) firestoreUpdates.doctorPhone = data.doctorPhone;
        if (data.doctorPhotoURL) firestoreUpdates.photoURL = data.doctorPhotoURL;

        setDoc(userRef, firestoreUpdates, { merge: true }).catch(fsError => {
          console.warn("Firestore profile sync queued/delayed:", fsError);
        });
      } catch (fsError) {
        console.warn("Firestore profile structure set delayed:", fsError);
      }
    } catch (error) {
      console.error("Error updating profile data:", error);
      showToast("Sync Delayed: Offline update queued", "error");
      throw error;
    }
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeAuth: (() => void) | null = null;

    // Set persistence once on mount
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.error("Auth Persistence Error:", err);
    });

    unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      
      // Cleanup previous profile listener if it exists
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!authUser) {
        setProfile(null);
        localStorage.removeItem('last_known_profile');
        setLoading(false);
        return;
      }

      // If we have a cached profile that matches the user, we can immediately stop loading.
      // Otherwise, clear the profile and set loading state to true.
      const cached = latestProfileRef.current;
      if (cached && cached.uid === authUser.uid) {
        setLoading(false);
      } else {
        setProfile(null);
        localStorage.removeItem('last_known_profile');
        setLoading(true);
      }

      const profileRef = ref(rtdb, `users/${authUser.uid}`);
      
      unsubscribeProfile = onValue(profileRef, 
        (snap) => {
          if (snap.exists()) {
            const rawData = snap.val();
            const profileData = rawData.profile || {};
            // Flatten 'profile' field into the top-level object for UI compatibility
            const data = { 
              ...rawData, 
              ...profileData,
              fullName: profileData.name || rawData.fullName || profileData.fullName || '',
              displayName: profileData.name || rawData.displayName || profileData.displayName || ''
            } as UserProfile;
            
            // Check if user is still the same before setting state
            if (auth.currentUser && auth.currentUser.uid === authUser.uid) {
              setProfile(data);
              localStorage.setItem('last_known_profile', safeStringify(data));
            }
          } else {
            // No profile yet
            if (auth.currentUser && auth.currentUser.uid === authUser.uid) {
              setProfile(null);
            }
          }
          setLoading(false);
        },
        (err) => {
          console.error("Profile snapshot error:", err);
          setLoading(false);
        }
      );
    });

    return () => {
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
      if (typeof unsubscribeProfile === 'function') {
        unsubscribeProfile();
      }
    };
  }, []);

  const value = useMemo(() => ({ 
    user, 
    profile, 
    loading, 
    isOnline,
    toast, 
    showToast, 
    updateProfileData,
    login,
    loginWithGoogle,
    resetPassword,
    signup,
    logout 
  }), [user, profile, loading, isOnline, toast]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {toast && (
        <div className="fixed bottom-10 right-10 z-[100] animate-in fade-in slide-in-from-bottom-5">
          <div className={`p-4 rounded-2xl bg-white border shadow-2xl flex items-center gap-3 min-w-[300px] ${
            toast.type === 'success' ? 'border-accent-maroon/20 text-accent-maroon' : 'border-red-200 text-red-600'
          }`}>
            {toast.type === 'success' ? (
              <div className="p-1 bg-accent-maroon/10 rounded-full">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            ) : (
              <div className="p-1 bg-red-100 rounded-full">
                <AlertCircle className="w-4 h-4" />
              </div>
            )}
            <p className="font-bold">{toast.message}</p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
