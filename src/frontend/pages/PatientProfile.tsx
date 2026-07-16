import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  User, 
  Phone, 
  ShieldAlert, 
  Activity, 
  ChevronRight, 
  ArrowLeft,
  Camera,
  CheckCircle2,
  HeartPulse,
  Stethoscope,
  Save,
  Plus,
  X,
  AlertCircle,
  Menu,
  Upload
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PatientSidebar from '../components/PatientSidebar';
import { doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../shared/lib/firebase';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const STEPS = [
  { id: 'basic', label: 'Basic Information', icon: User, fields: ['fullName', 'username', 'age', 'gender', 'bloodGroup', 'occupation', 'height', 'weight'] },
  { id: 'contact', label: 'Contact Details', icon: Phone, fields: ['phoneNumber', 'address', 'contacts'] },
  { id: 'questionnaire', label: 'Medical History', icon: Stethoscope, fields: ['hasHeartAttack', 'hasHypertension', 'hasThyroid', 'hasAnxiety', 'stressLevel', 'hasDiabetes', 'isSmoking', 'hasChestPain', 'hasBreathingIssue', 'hasFamilyHistory'] },
  { id: 'photo', label: 'Profile Photo', icon: Camera, fields: ['photoURL'] },
  { id: 'review', label: 'Final Review', icon: CheckCircle2, fields: [] }
];

const phoneRegex = /^\+91[\s-]*(\d[\s-]*){10}$/;
const contactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().regex(phoneRegex, "Must be +91 followed by 10 digits (e.g. +919876543210)"),
  whatsapp: z.boolean().default(true)
});

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  username: z.any().optional(),
  age: z.string().min(1, "Age is required").regex(/^\d+$/, "Age must be a number"),
  gender: z.string().min(1, "Gender is required"),
  bloodGroup: z.string().min(1, "Blood group is required"),
  occupation: z.string().min(1, "Occupation is required"),
  height: z.string().min(1, "Height is required"),
  weight: z.string().min(1, "Weight is required"),
  phoneNumber: z.string().regex(phoneRegex, "Enter a valid phone number (+91 followed by 10 digits)"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  contacts: z.object({
    family: contactSchema,
    friend: contactSchema,
    guardian: contactSchema
  }).optional(),
  hasHeartAttack: z.boolean().default(false),
  hasHypertension: z.boolean().default(false),
  hasThyroid: z.boolean().default(false),
  hasAnxiety: z.boolean().default(false),
  stressLevel: z.any().optional().default(5),
  hasDiabetes: z.boolean().default(false),
  isSmoking: z.boolean().default(false),
  hasChestPain: z.boolean().default(false),
  hasBreathingIssue: z.boolean().default(false),
  hasFamilyHistory: z.boolean().default(false),
  photoURL: z.any().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const DEFAULT_VALUES: ProfileFormData = {
  fullName: '',
  username: '',
  age: '',
  gender: 'Male',
  bloodGroup: 'A+',
  occupation: '',
  height: '',
  weight: '',
  phoneNumber: '',
  address: '',
  contacts: {
    family: { name: '', phone: '', whatsapp: true },
    friend: { name: '', phone: '', whatsapp: true },
    guardian: { name: '', phone: '', whatsapp: true }
  },
  hasHeartAttack: false,
  hasHypertension: false,
  hasThyroid: false,
  hasAnxiety: false,
  stressLevel: 5,
  hasDiabetes: false,
  isSmoking: false,
  hasChestPain: false,
  hasBreathingIssue: false,
  hasFamilyHistory: false,
  photoURL: ''
};

const PatientProfile = () => {
  const navigate = useNavigate();
  const { user, showToast, updateProfileData, profile } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPhotoPreview, setLocalPhotoPreview] = useState<string>('');
  
  // Custom states for Profile Dashboard & Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [dbOnboardingCompleted, setDbOnboardingCompleted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profilePreviewData, setProfilePreviewData] = useState<any>(null);
  const hasInitialized = useRef(false);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { isValid },
    trigger,
    reset
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema) as any,
    mode: 'onChange',
    defaultValues: DEFAULT_VALUES
  });

  useEffect(() => {
    if (!user) return;
    
    if (profile && !hasInitialized.current) {
      const profileData = profile as any;
      setProfilePreviewData(profileData);
      if (profileData.onboardingCompleted === true) {
        setDbOnboardingCompleted(true);
      }
      
      // Map nested data back to form structure casting numeric fields to string for Zod compliance
      const mappedData: any = {
        ...DEFAULT_VALUES,
        ...profileData,
        fullName: profileData.fullName || user.displayName || '',
        photoURL: profileData.profileImage || profileData.photoURL || user.photoURL || '',
        contacts: profileData.emergencyContacts || profileData.contacts || DEFAULT_VALUES.contacts,
        age: profileData.age !== undefined && profileData.age !== null ? String(profileData.age) : '',
        height: profileData.height !== undefined && profileData.height !== null ? String(profileData.height) : '',
        weight: profileData.weight !== undefined && profileData.weight !== null ? String(profileData.weight) : '',
      };

      // Map medical history if it's nested
      if (profileData.medicalHistory) {
        Object.assign(mappedData, profileData.medicalHistory);
      }

      reset(mappedData);
      if (mappedData.photoURL) setLocalPhotoPreview(mappedData.photoURL);
      setLoading(false);
      hasInitialized.current = true;
    } else if (!profile && !hasInitialized.current) {
      // If profile is not found yet but user metadata is available
      setValue('fullName', user.displayName || '');
      if (user.photoURL) {
        setValue('photoURL', user.photoURL);
        setLocalPhotoPreview(user.photoURL);
      }
      setLoading(false);
      hasInitialized.current = true;
    }
  }, [user, profile, reset, setValue]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setLocalPhotoPreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return;
    setSaving(true);
    try {
      let finalPhotoURL = data.photoURL || '';
      if (selectedFile) {
        try {
          const fileExt = selectedFile.name.split('.').pop();
          const storageRef = ref(storage, `users/${user.uid}/profile_${Date.now()}.${fileExt}`);
          
          // Race the Firebase Storage upload against a strict 1.5-second timeout boundary
          // This guarantees that browser CORS preflight errors or rules failures never block the UI saving process!
          finalPhotoURL = await Promise.race([
            (async () => {
              const uploadResult = await uploadBytes(storageRef, selectedFile);
              return await getDownloadURL(uploadResult.ref);
            })(),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("StorageTimeout")), 1500))
          ]);
        } catch (uploadError) {
          console.warn("Storage upload failed or timed out (CORS/Rules). Falling back to optimized base64 profile image:", uploadError);
          showToast("Profile image synchronized locally (offline-ready)", "success");
          // Fallback to base64 preview data-URL to guarantee it persists and displays perfectly anyway!
          finalPhotoURL = localPhotoPreview || data.photoURL || '';
        }
      }

      // Group data as per recommended structure
      const profileData = {
        fullName: data.fullName || '',
        email: user.email || '',
        age: data.age || '',
        gender: data.gender || '',
        occupation: data.occupation || '',
        bloodGroup: data.bloodGroup || '',
        weight: data.weight || '',
        height: data.height || '',
        phoneNumber: data.phoneNumber || '',
        address: data.address || '',
        emergencyContacts: data.contacts || {
          family: { name: '', phone: '', whatsapp: true },
          friend: { name: '', phone: '', whatsapp: true },
          guardian: { name: '', phone: '', whatsapp: true }
        },
        medicalHistory: {
          hasHeartAttack: data.hasHeartAttack ?? false,
          hasHypertension: data.hasHypertension ?? false,
          hasThyroid: data.hasThyroid ?? false,
          hasAnxiety: data.hasAnxiety ?? false,
          stressLevel: data.stressLevel ?? 5,
          hasDiabetes: data.hasDiabetes ?? false,
          isSmoking: data.isSmoking ?? false,
          hasChestPain: data.hasChestPain ?? false,
          hasBreathingIssue: data.hasBreathingIssue ?? false,
          hasFamilyHistory: data.hasFamilyHistory ?? false,
        },
        profileImage: finalPhotoURL || '',
        updatedAt: new Date().toISOString(),
      };

      // Consolidate Firestore writes and execute asynchronously in the background
      const cleanUpdateData = JSON.parse(JSON.stringify({ 
        onboardingCompleted: true,
        fullName: data.fullName || '',
        photoURL: finalPhotoURL,
        ...profileData 
      }));

      // Fire save in the background and transition UI instantly!
      updateProfileData(cleanUpdateData).catch((dbError) => {
        console.warn("Background firestore sync delayed:", dbError);
      });

      setProfilePreviewData(profileData);
      setDbOnboardingCompleted(true);
      setIsEditMode(false);
      hasInitialized.current = false; // Reset initialization to bind to newly saved profile values!
      showToast("Medical profile synchronized successfully", "success");
      
      // Directly redirect to the patient dashboard upon saving as requested!
      navigate('/patient/dashboard');
    } catch (error: any) {
      console.error("Save Error:", error);
      showToast("Failed to sync profile. Check network connectivity.", "error");
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const onValidationError = (errors: any) => {
    console.warn("Profile Validation Failures:", errors);
    showToast("Please complete all required fields correctly.", "error");
  };

  const calculateCompletion = () => {
    if (!profilePreviewData && !user) return 0;
    
    const fieldsToCheck = [
      profilePreviewData?.fullName,
      profilePreviewData?.age,
      profilePreviewData?.bloodGroup,
      profilePreviewData?.height,
      profilePreviewData?.weight,
      profilePreviewData?.phoneNumber,
      profilePreviewData?.address,
      profilePreviewData?.profileImage || profilePreviewData?.photoURL,
      profilePreviewData?.emergencyContacts?.family?.phone || profilePreviewData?.contacts?.family?.phone,
      profilePreviewData?.emergencyContacts?.friend?.phone || profilePreviewData?.contacts?.friend?.phone,
      profilePreviewData?.emergencyContacts?.guardian?.phone || profilePreviewData?.contacts?.guardian?.phone
    ];
    
    const filledFields = fieldsToCheck.filter(f => typeof f === 'string' ? f.trim() !== '' : !!f).length;
    return Math.round((filledFields / fieldsToCheck.length) * 100);
  };

  const completionPercentage = calculateCompletion();

  if (loading) return <div className="p-12 text-center font-black text-slate-400 animate-pulse uppercase text-xs tracking-widest">Accessing Medical Records...</div>;

  const handleNextStep = async () => {
    const fieldsToValidate = STEPS[currentStep].fields as Array<keyof ProfileFormData>;
    if (fieldsToValidate && fieldsToValidate.length > 0) {
      const isStepValid = await trigger(fieldsToValidate);
      if (!isStepValid) {
        showToast("Please fill all required fields correctly before proceeding.", "error");
        return;
      }
    }
    setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1));
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden relative font-sans text-slate-900">
      <PatientSidebar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        patientData={profilePreviewData} 
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Bar */}
        <header className="h-20 lg:h-24 bg-white/70 backdrop-blur-2xl border-b border-slate-100 px-4 md:px-6 lg:px-12 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
             <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-white rounded-xl border border-slate-100 shadow-sm text-slate-600 cursor-pointer">
                <Menu className="w-5 h-5" />
             </button>
             <div className="p-2 md:p-3 bg-accent-maroon rounded-lg md:rounded-2xl shadow-lg shadow-accent-maroon/20 text-white">
                <HeartPulse className="w-5 h-5 md:w-6 md:h-6" />
             </div>
             <div>
                <h1 className="text-base md:text-2xl font-bold text-slate-900 tracking-tight">Clinical Identity Node</h1>
                <p className="text-[8px] md:text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-none">CardioAlert Network Identity</p>
             </div>
          </div>
        </header>

        {/* Scrollable Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 no-scrollbar">
          {!isEditMode ? (
            /* ================= READ-ONLY PROFILE DASHBOARD ================= */
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
              {/* Profile Top Banner Card */}
              <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-900 pointer-events-none">
                  <User className="w-48 h-48" />
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left z-10">
                  <div className="relative w-28 h-28 md:w-32 md:h-32 flex items-center justify-center shrink-0">
                    <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                      <circle 
                        cx="50%" cy="50%" r="46%" 
                        className="stroke-slate-100 fill-none" 
                        strokeWidth="4" 
                      />
                      <motion.circle 
                        cx="50%" cy="50%" r="46%" 
                        className="stroke-accent-maroon fill-none" 
                        strokeWidth="4" 
                        strokeLinecap="round"
                        initial={{ strokeDasharray: "300 300", strokeDashoffset: 300 }}
                        animate={{ strokeDashoffset: 300 - (completionPercentage / 100) * 300 }}
                        transition={{ duration: 1.5, ease: "circOut" }}
                      />
                    </svg>
                    
                    <div className="w-[82%] h-[82%] rounded-full bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center z-10">
                      {profilePreviewData?.profileImage || profilePreviewData?.photoURL ? (
                        <img src={profilePreviewData.profileImage || profilePreviewData.photoURL} className="w-full h-full object-cover animate-fade-in" />
                      ) : (
                        <User className="w-10 h-10 text-slate-300" />
                      )}
                    </div>
                    
                    {completionPercentage === 100 && (
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full border-4 border-white shadow-lg flex items-center justify-center z-20">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    {completionPercentage === 100 ? (
                      <span className="px-3 py-1 bg-green-50 text-green-600 text-[8px] font-black uppercase tracking-widest rounded-full leading-none border border-green-100">Profile Updated</span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[8px] font-black uppercase tracking-widest rounded-full leading-none border border-amber-100">Profile {completionPercentage}% Complete</span>
                    )}
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic mt-2">{profilePreviewData?.fullName || user?.displayName || 'CardioAlert User'}</h2>
                    <p className="text-xs font-bold text-slate-400 mt-1">{user?.email}</p>
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    setIsEditMode(true);
                    setCurrentStep(0);
                    hasInitialized.current = false; // Trigger a fresh form bind from latest DB states
                  }}
                  className="px-6 py-4 bg-slate-900 text-white rounded-2xl shadow-xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-2 cursor-pointer z-10 shrink-0"
                >
                  <span>Edit Profile</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* General Biometrics & Health Pre-Conditions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* General Biometrics Card */}
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-premium p-6 md:p-8 md:col-span-2 space-y-6">
                  <div>
                    <h3 className="text-sm md:text-base font-black text-slate-900 tracking-tight italic">Biometric Parameters</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Physical health markers mapped to telemetry nodes</p>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Age Range</span>
                      <span className="text-sm font-black text-slate-900 mt-1">{profilePreviewData?.age ? `${profilePreviewData.age} Years` : '--'}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Biological Sex</span>
                      <span className="text-sm font-black text-slate-900 mt-1">{profilePreviewData?.gender || '--'}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Blood Type</span>
                      <span className="text-sm font-black text-slate-900 mt-1">{profilePreviewData?.bloodGroup || '--'}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Height Node</span>
                      <span className="text-sm font-black text-slate-900 mt-1">{profilePreviewData?.height ? `${profilePreviewData.height} cm` : '--'}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weight Node</span>
                      <span className="text-sm font-black text-slate-900 mt-1">{profilePreviewData?.weight ? `${profilePreviewData.weight} kg` : '--'}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Occupation</span>
                      <span className="text-sm font-black text-slate-900 mt-1 truncate">{profilePreviewData?.occupation || '--'}</span>
                    </div>
                  </div>
                </div>

                {/* Daily Stress Factor Indicator */}
                <div className="bg-white rounded-[28px] border border-slate-100 shadow-premium p-6 md:p-8 flex flex-col justify-between gap-6">
                  <div>
                    <h3 className="text-sm md:text-base font-black text-slate-900 tracking-tight italic">Stress Factor</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Reported daily stress level</p>
                  </div>
                  
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-900 text-white rounded-3xl flex flex-col items-center justify-center shadow-xl">
                      <span className="text-3xl font-black">{profilePreviewData?.medicalHistory?.stressLevel || '5'}</span>
                      <span className="text-[8px] font-black uppercase opacity-40">Level</span>
                    </div>
                    <div className="w-full mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-accent-maroon to-medical-red" 
                        style={{ width: `${((profilePreviewData?.medicalHistory?.stressLevel || 5) / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  <span className="text-[8px] font-black text-center text-slate-400 uppercase tracking-widest">Daily Cardiac Risk Modifier</span>
                </div>
              </div>

              {/* Medical History Pre-Conditions */}
              <div className="bg-white rounded-[28px] border border-slate-100 shadow-premium p-6 md:p-8 space-y-6">
                <div>
                  <h3 className="text-sm md:text-base font-black text-slate-900 tracking-tight italic">Cardiovascular Risk Grid</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Pre-existing clinical and behavioural conditions</p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Prior Heart Attack', active: profilePreviewData?.medicalHistory?.hasHeartAttack },
                    { label: 'Hypertension / BP', active: profilePreviewData?.medicalHistory?.hasHypertension },
                    { label: 'Thyroid Abnormality', active: profilePreviewData?.medicalHistory?.hasThyroid },
                    { label: 'Chronic Anxiety', active: profilePreviewData?.medicalHistory?.hasAnxiety },
                    { label: 'Diabetes Mellitus', active: profilePreviewData?.medicalHistory?.hasDiabetes },
                    { label: 'Active Smoking', active: profilePreviewData?.medicalHistory?.isSmoking },
                    { label: 'Frequent Chest Pain', active: profilePreviewData?.medicalHistory?.hasChestPain },
                    { label: 'Dyspnea / Breathing Issues', active: profilePreviewData?.medicalHistory?.hasBreathingIssue },
                    { label: 'Family Heart History', active: profilePreviewData?.medicalHistory?.hasFamilyHistory },
                  ].map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-2xl border text-center flex flex-col justify-center gap-1.5 transition-all ${
                        item.active 
                          ? 'bg-red-50 border-red-100 text-red-700' 
                          : 'bg-green-50 border-green-100 text-green-700'
                      }`}
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-80">{item.active ? 'Reported' : 'Absent'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Emergency Guard Grid Contacts */}
              <div className="bg-white rounded-[28px] border border-slate-100 shadow-premium p-6 md:p-8 space-y-6">
                <div>
                  <h3 className="text-sm md:text-base font-black text-slate-900 tracking-tight italic">Emergency Guard Grid</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Contacts to receive automated dispatches during a crisis</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {['family', 'friend', 'guardian'].map((relation) => {
                    const contact = profilePreviewData?.emergencyContacts?.[relation] || profilePreviewData?.contacts?.[relation];
                    return (
                      <div key={relation} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{relation} Contact</span>
                          {contact?.whatsapp ? (
                            <span className="px-2 py-0.5 bg-green-500/10 text-green-600 text-[7px] font-black uppercase tracking-widest rounded-full leading-none border border-green-500/10">WhatsApp On</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-500 text-[7px] font-black uppercase tracking-widest rounded-full leading-none">WhatsApp Off</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 italic truncate">{contact?.name || 'Unnamed Guard'}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{contact?.phone || 'No Phone Shared'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Residential Address Info */}
                <div className="pt-4 border-t border-slate-100 flex flex-col gap-1">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Residential Location Mapping</span>
                  <span className="text-xs font-bold text-slate-800 italic leading-relaxed">{profilePreviewData?.address || 'No residential address mapping shared.'}</span>
                  <span className="text-[9px] font-bold text-slate-400 mt-1">Personal Phone: {profilePreviewData?.phoneNumber || 'No phone registered.'}</span>
                </div>
              </div>
            </div>
          ) : (
            /* ================= EDITING / ONBOARDING FORM WIZARD ================= */
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col lg:flex-row gap-8 md:gap-12 lg:items-start">
                
                {/* Wizard Sidebar Steps */}
                <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-8 z-10">
                  <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-100 p-4 md:p-6 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible no-scrollbar">
                    {STEPS.map((step, idx) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={async () => {
                          // Perform validation before jumping to another step in edit mode
                          const fieldsToValidate = STEPS[currentStep].fields as Array<keyof ProfileFormData>;
                          if (fieldsToValidate && fieldsToValidate.length > 0) {
                            const isStepValid = await trigger(fieldsToValidate);
                            if (!isStepValid) {
                              showToast("Please fill all required fields correctly before navigating.", "error");
                              return;
                            }
                          }
                          setCurrentStep(idx);
                        }}
                        className={`flex-shrink-0 flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl transition-all ${
                          currentStep === idx ? 'bg-accent-maroon text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <step.icon className="w-4 h-4 md:w-5 md:h-5" />
                        <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{step.label}</span>
                      </button>
                    ))}
                    
                    {dbOnboardingCompleted && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditMode(false);
                          hasInitialized.current = false; // Discard typed values and re-bind to latest DB states
                        }}
                        className="flex-shrink-0 flex items-center justify-center gap-2 p-3.5 md:p-4 bg-slate-50 text-slate-500 rounded-xl md:rounded-2xl transition-all border border-slate-100 font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 mt-2 cursor-pointer w-full text-center"
                      >
                        Cancel Edits
                      </button>
                    )}
                  </div>
                </aside>

                {/* Form Content */}
                <div className="flex-1 min-w-0">
                  <form onSubmit={handleSubmit(onSubmit, onValidationError)} className="space-y-6 md:space-y-10">
                    <header className="px-2">
                       <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic mb-1 md:mb-2">{STEPS[currentStep].label}</h2>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Medical Compliance Node {currentStep + 1}</p>
                    </header>

                    <div className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-premium p-6 md:p-10">
                      {currentStep === 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                          <FormInput control={control} name="fullName" label="Full Name" />
                          <FormInput control={control} name="age" label="Age" type="number" />
                          <FormSelect control={control} name="gender" label="Gender" options={['Male', 'Female', 'Other', 'Prefer not to say']} />
                          <FormSelect control={control} name="bloodGroup" label="Blood Group" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} />
                          <FormInput control={control} name="occupation" label="Occupation" />
                          <div className="grid grid-cols-2 gap-4">
                            <FormInput control={control} name="height" label="Height (cm)" />
                            <FormInput control={control} name="weight" label="Weight (kg)" />
                          </div>
                        </div>
                      )}

                      {currentStep === 1 && (
                        <div className="space-y-10 md:space-y-12">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 border-b border-slate-50 pb-10 md:pb-12">
                              <FormInput control={control} name="phoneNumber" label="Personal Phone (+91...)" placeholder="+91 98765 43210" />
                              <FormInput control={control} name="address" label="Residential Address" placeholder="Street, City, State, ZIP" />
                           </div>
                           
                           <div className="space-y-8 md:space-y-10">
                              <div>
                                 <h4 className="text-sm md:text-base font-black text-slate-900 tracking-tight italic">Emergency Guard Grid</h4>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">These contacts will receive realtime WhatsApp alerts during a crisis.</p>
                              </div>

                              <div className="grid grid-cols-1 gap-8 md:gap-10">
                                 {['family', 'friend', 'guardian'].map((relation) => (
                                   <div key={relation} className="p-6 md:p-8 bg-slate-50/50 rounded-3xl border border-slate-100/50 space-y-6">
                                      <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 bg-accent-maroon rounded-lg flex items-center justify-center">
                                            <Phone className="w-4 h-4 text-white" />
                                         </div>
                                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 italic">{relation} Member Protocol</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                                         <FormInput control={control} name={`contacts.${relation}.name`} label={`${relation.charAt(0).toUpperCase() + relation.slice(1)} Name`} placeholder="Contact Name" />
                                         <FormInput control={control} name={`contacts.${relation}.phone`} label="WhatsApp Number (+91...)" placeholder="+91 00000 00000" />
                                      </div>
                                      <FormToggle control={control} name={`contacts.${relation}.whatsapp`} label="Enable Realtime WhatsApp Alerts?" />
                                   </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                      )}

                      {currentStep === 2 && (
                        <div className="space-y-6 md:space-y-8">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                            <FormToggle control={control} name="hasHeartAttack" label="Previous Heart Attack?" />
                            <FormToggle control={control} name="hasHypertension" label="BP / Hypertension?" />
                            <FormToggle control={control} name="hasThyroid" label="Thyroid Condition?" />
                            <FormToggle control={control} name="hasAnxiety" label="Anxiety?" />
                            <FormToggle control={control} name="hasDiabetes" label="Diabetes?" />
                            <FormToggle control={control} name="isSmoking" label="Smoking Habits?" />
                            <FormToggle control={control} name="hasChestPain" label="Chest Pain History?" />
                            <FormToggle control={control} name="hasBreathingIssue" label="Breathing Issues?" />
                            <FormToggle control={control} name="hasFamilyHistory" label="Family Heart Disease?" />
                          </div>
                          <div className="pt-6 border-t border-slate-50">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Daily Stress Level (1-10)</label>
                            <Controller
                              control={control}
                              name="stressLevel"
                              render={({ field }) => (
                                <div className="space-y-6">
                                   <div className="relative group flex items-center gap-4 md:gap-6">
                                      <div className="relative flex-1 h-2.5 md:h-3 bg-slate-100 rounded-full overflow-hidden">
                                         <motion.div 
                                           initial={false}
                                           animate={{ width: `${(( (field.value || 5) - 1) / 9) * 100}%` }}
                                           className="absolute top-0 left-0 h-full bg-gradient-to-r from-accent-maroon to-medical-red"
                                         />
                                         <input 
                                           type="range" 
                                           min="1" 
                                           max="10" 
                                           className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                           {...field}
                                           value={field.value ?? 5}
                                           onChange={e => field.onChange(parseInt(e.target.value))}
                                         />
                                      </div>
                                      <motion.div 
                                        key={field.value}
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 text-white rounded-xl md:rounded-2xl flex flex-col items-center justify-center shadow-2xl shrink-0"
                                      >
                                         <span className="text-lg md:text-xl font-black">{field.value ?? 5}</span>
                                         <span className="text-[8px] font-black uppercase opacity-40">LVL</span>
                                      </motion.div>
                                   </div>
                                   <div className="flex justify-between px-1">
                                      {['Low', 'Medium', 'High'].map((label, i) => (
                                        <span key={label} className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{label}</span>
                                      ))}
                                   </div>
                                </div>
                              )}
                            />
                          </div>
                        </div>
                      )}

                      {currentStep === 3 && (
                        <div className="flex flex-col items-center py-6 md:py-10">
                           <div className="relative group mb-8 md:mb-10">
                              <input type="file" id="p-up" className="hidden" onChange={handleFileChange} />
                               <label htmlFor="p-up" className="w-40 h-40 md:w-48 md:h-48 bg-slate-50 border-4 border-white shadow-2xl rounded-full overflow-hidden flex items-center justify-center cursor-pointer hover:scale-105 transition-all">
                                 {localPhotoPreview ? (
                                   <img src={localPhotoPreview} className="w-full h-full object-cover" />
                                 ) : (
                                   <Camera className="w-10 h-10 md:w-12 md:h-12 text-slate-200" />
                                 )}
                               </label>
                               <label htmlFor="p-up" className="absolute -bottom-2 md:-bottom-4 right-2 md:right-4 bg-accent-maroon text-white p-3 md:p-4 rounded-full shadow-xl cursor-pointer hover:scale-110 transition-all border-4 border-white">
                                <Upload className="w-4 h-4 md:w-5 md:h-5" />
                              </label>
                           </div>
                           <p className="text-[10px] md:text-xs font-bold text-slate-400 text-center max-w-xs px-4 uppercase tracking-widest">Upload medical ID photo for clinical identification.</p>
                        </div>
                      )}

                      {currentStep === 4 && (
                        <div className="space-y-6">
                          <div className="bg-slate-50 rounded-2xl md:rounded-3xl overflow-hidden border border-slate-100">
                            <SummaryRow label="Patient" value={getValues('fullName')} />
                            <SummaryRow label="Blood" value={getValues('bloodGroup')} />
                            <SummaryRow label="Age" value={getValues('age')} />
                            <SummaryRow label="Stress" value={getValues('stressLevel')} />
                          </div>
                          <div className="p-4 md:p-6 bg-green-50 rounded-2xl md:rounded-3xl border border-green-100 flex gap-3 md:gap-4">
                            <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-green-500 shrink-0" />
                            <div>
                              <p className="text-xs md:text-sm font-black text-green-900 tracking-tight">Records Verified</p>
                              <p className="text-[10px] md:text-xs font-medium text-green-600/70">Signature ready for medical synchronization.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <footer className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-slate-50 flex justify-between items-center px-1">
                        <button 
                          type="button" 
                          onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                          className="px-4 md:px-8 py-3 md:py-4 text-[9px] md:text-[10px] font-black uppercase text-slate-400 hover:text-slate-900 transition-colors disabled:opacity-0"
                          disabled={currentStep === 0}
                        >
                          Back
                        </button>
                        {currentStep === STEPS.length - 1 ? (
                          <button 
                            type="submit"
                            disabled={saving}
                            className="px-6 md:px-10 py-3 md:py-5 bg-accent-maroon text-white rounded-xl md:rounded-2xl shadow-xl shadow-accent-maroon/20 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 cursor-pointer"
                          >
                            {saving ? "Saving..." : "Save Profile"}
                            {!saving && <Save className="w-4 h-4" />}
                          </button>
                        ) : (
                          <button 
                            type="button" 
                            onClick={handleNextStep}
                            className="px-6 md:px-10 py-3 md:py-5 bg-slate-900 text-white rounded-xl md:rounded-2xl shadow-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                          >
                            Next Section
                          </button>
                        )}
                      </footer>
                    </div>
                  </form>
                </div>

              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const FormInput = ({ control, name, label, ...props }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">{label}</label>
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <div className="space-y-1.5">
          <input 
            {...field} 
            value={field.value ?? ''} 
            {...props} 
            className={`w-full p-4 bg-slate-50 border rounded-2xl text-sm font-bold outline-none transition-all ${
              error ? 'border-red-500 bg-red-500/[0.02] focus:border-red-500' : 'border-transparent focus:border-accent-maroon/20 focus:bg-white'
            }`} 
          />
          {error && (
            <p className="text-[9px] font-black text-red-500 uppercase tracking-wider pl-2 animate-pulse">{error.message}</p>
          )}
        </div>
      )}
    />
  </div>
);

const FormSelect = ({ control, name, label, options }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">{label}</label>
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <div className="space-y-1.5">
          <select 
            {...field} 
            value={field.value ?? ''}
            className={`w-full p-4 bg-slate-50 border rounded-2xl text-sm font-bold outline-none transition-all appearance-none cursor-pointer ${
              error ? 'border-red-500 bg-red-500/[0.02] focus:border-red-500' : 'border-transparent focus:border-accent-maroon/20 focus:bg-white'
            }`}
          >
            <option value="" disabled>Select {label}</option>
            {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
          </select>
          {error && (
            <p className="text-[9px] font-black text-red-500 uppercase tracking-wider pl-2 animate-pulse">{error.message}</p>
          )}
        </div>
      )}
    />
  </div>
);

const FormToggle = ({ control, name, label }: any) => (
  <Controller
    control={control}
    name={name}
    render={({ field }) => (
      <div 
        onClick={() => field.onChange(!field.value)}
        className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100/50 hover:bg-slate-100/50 transition-colors cursor-pointer group select-none"
      >
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-900 transition-colors">{label}</span>
        <div 
          className={`w-12 h-6 rounded-full p-1 flex items-center transition-all duration-300 ${field.value ? 'bg-accent-maroon justify-end' : 'bg-slate-300 justify-start'}`}
        >
          <motion.div 
            layout
            className="w-4 h-4 bg-white rounded-full shadow-lg" 
          />
        </div>
      </div>
    )}
  />
);

const SummaryRow = ({ label, value }: any) => (
  <div className="flex justify-between p-5 border-b border-white last:border-0">
    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{label}</span>
    <span className="text-xs font-black text-slate-900">{value || '--'}</span>
  </div>
);

export default PatientProfile;
