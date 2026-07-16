import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-[32px] premium-shadow p-8 md:p-12 text-center border border-slate-100">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <AlertCircle className="w-10 h-10 text-accent-maroon" />
            </div>
            
            <h1 className="text-2xl font-black text-slate-900 tracking-tight italic mb-4">System Protocol Failure</h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-relaxed mb-10">
              The application encountered an unexpected runtime exception. Security protocols have isolated the crash.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 mb-10 text-left overflow-hidden">
               <p className="text-[10px] font-mono text-slate-500 break-words opacity-70 italic">
                 {this.state.error?.message || 'Unknown clinical exception'}
               </p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={this.handleReload}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-900/10"
              >
                <RefreshCw className="w-4 h-4" /> Reinitialize System
              </button>
              
              <button 
                onClick={this.handleReset}
                className="w-full py-4 bg-white text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
              >
                <Home className="w-4 h-4" /> Return to Selection
              </button>
            </div>
            
            <p className="mt-10 text-[9px] font-black text-slate-300 uppercase tracking-widest">
              HeartSync Diagnostics Terminal v4.0.2
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
