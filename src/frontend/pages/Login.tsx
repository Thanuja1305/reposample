import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Mail, Lock, ArrowRight, ShieldCheck, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, profile, loading: authLoading, login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  // Auto redirect if already logged in
  React.useEffect(() => {
    if (!authLoading && user && profile?.role) {
      if (profile.role === 'admin') navigate('/admin');
      else if (profile.role === 'patient') navigate('/patient/dashboard');
      else if (profile.role === 'doctor') navigate('/doctor/dashboard');
      else navigate('/');
    } else if (!authLoading && user && profile && !profile.role) {
      navigate('/select-role');
    }
  }, [user, profile, authLoading, navigate]);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const loggedInProfile = await loginWithGoogle();
      if (loggedInProfile) {
        if (loggedInProfile.role === 'admin') navigate('/admin');
        else if (loggedInProfile.role === 'patient') navigate('/patient/dashboard');
        else if (loggedInProfile.role === 'doctor') navigate('/doctor/dashboard');
        else navigate('/select-role');
      } else {
        navigate('/select-role');
      }
    } catch (err: any) {
      setError(err.message || 'Google synchronization failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please provide a valid E-Health node address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setResetSent(true);
      setTimeout(() => {
        setResetMode(false);
        setResetSent(false);
      }, 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetMode) {
      handleResetPassword(e);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loggedInProfile = await login(email, password);
      if (loggedInProfile) {
        if (loggedInProfile.role === 'admin') navigate('/admin');
        else if (loggedInProfile.role === 'patient') navigate('/patient/dashboard');
        else if (loggedInProfile.role === 'doctor') navigate('/doctor/dashboard');
        else navigate('/select-role');
      } else {
        navigate('/select-role');
      }
    } catch (err: any) {
      setError(err.message || 'Node authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-accent-maroon/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-dark-navy/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="text-center mb-8 md:mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-6 md:mb-8 group">
            <div className="p-2 md:p-2.5 bg-accent-maroon rounded-xl md:rounded-2xl shadow-xl shadow-accent-maroon/20 group-hover:scale-110 transition-transform">
              <Heart className="w-5 h-5 md:w-6 md:h-6 text-white fill-white/20" />
            </div>
            <span className="text-xl md:text-2xl font-display font-black text-dark-navy tracking-tighter">HeartSync</span>
          </Link>
          <h2 className="text-2xl md:text-4xl font-display font-black text-dark-navy mb-3 tracking-tighter">
            {resetMode ? "Identity Recovery" : "Node Authentication"}
          </h2>
          <p className="text-muted text-sm md:text-base font-medium px-4 md:px-0">
            {resetMode 
              ? "Re-establish access to your neural clinical profile."
              : "Access your medical telemetry grid and clinical portal."}
          </p>
        </div>

        <div className="bg-white p-6 sm:p-10 md:p-12 rounded-[32px] md:rounded-[40px] border border-dark-navy/5 shadow-premium">
          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-medical-red/10 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-medical-red shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-medical-red leading-relaxed uppercase tracking-tight">{error}</p>
            </div>
          )}

          {resetSent && (
            <div className="mb-8 p-4 bg-green-50 border border-green-500/10 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-green-600 leading-relaxed uppercase tracking-tight">
                Recovery protocol initiated. Check your primary node mailbox.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">E-Health Node</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-6 py-5 bg-slate-50 border border-dark-navy/5 rounded-[24px] focus:bg-white focus:border-accent-maroon/20 outline-none transition-all font-bold text-dark-navy placeholder:text-muted/30"
                  placeholder="registry@heartsync.health"
                  autoComplete="username"
                  required
                />
                <Mail className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-muted/20" />
              </div>
            </div>

            {!resetMode && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Secure Passkey</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-6 py-5 bg-slate-50 border border-dark-navy/5 rounded-[24px] focus:bg-white focus:border-accent-maroon/20 outline-none transition-all font-bold text-dark-navy placeholder:text-muted/30"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <Lock className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-muted/20" />
                </div>
              </div>
            )}

            <div className="flex justify-end p-1">
              <button 
                type="button" 
                onClick={() => setResetMode(!resetMode)}
                className="text-[10px] font-black text-muted hover:text-accent-maroon uppercase tracking-widest transition-colors"
              >
                {resetMode ? "Return to Login?" : "Recover Identity?"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-5 bg-dark-navy text-white text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] shadow-2xl shadow-dark-navy/20 hover:bg-accent-maroon hover:shadow-accent-maroon/20 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {(loading && !googleLoading) ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {resetMode ? "Send Recovery Link" : "Establish Link"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {!resetMode && (
              <>
                <div className="relative flex items-center gap-4 my-8">
                  <div className="flex-1 h-px bg-dark-navy/5" />
                  <span className="text-[9px] font-black text-muted uppercase tracking-widest whitespace-nowrap">Neural Proxy</span>
                  <div className="flex-1 h-px bg-dark-navy/5" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading || googleLoading}
                  className="w-full py-5 bg-white border border-dark-navy/10 text-dark-navy text-[11px] font-black uppercase tracking-[0.25em] rounded-[24px] hover:bg-slate-50 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {googleLoading ? (
                    <div className="w-5 h-5 border-2 border-dark-navy/20 border-t-dark-navy rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Sync with Google
                    </>
                  )}
                </button>
              </>
            )}
          </form>

          <div className="mt-12 pt-8 border-t border-dark-navy/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs font-bold text-muted">
              Unverified Node?
            </p>
            <Link to="/signup" className="text-[10px] font-black text-accent-maroon uppercase tracking-widest hover:underline">
              Create Neural Profile
            </Link>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-12 flex justify-center items-center gap-3 opacity-40">
           <ShieldCheck className="w-5 h-5 text-dark-navy" />
           <p className="text-[9px] font-black text-dark-navy uppercase tracking-[0.3em]">Institutional Grade Encryption</p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
