import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Mail, AlertCircle, KeyRound, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  isSetupRequired: boolean;
  onLoginSuccess: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  isSetupRequired,
  onLoginSuccess
}) => {
  const [isSetup, setIsSetup] = useState(isSetupRequired);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync if prop changes
  React.useEffect(() => {
    setIsSetup(isSetupRequired);
  }, [isSetupRequired]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSetup) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (username.trim().length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = isSetup ? '/api/auth/setup' : '/api/auth/login';
      const body = isSetup 
        ? { username: username.trim(), password, name: name.trim(), email: email.trim(), setupToken }
        : { username: username.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Network error during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-lg shadow-inner text-white tracking-wider">
            APX
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Apex Autonomous IT OS</h2>
            <p className="text-xs text-slate-400 font-mono">
              {isSetup ? 'First-Time Administrator Setup' : 'Administrator & Operator Sign-In'}
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {isSetup ? (
            <>
              <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-900/60 text-blue-300 text-xs leading-relaxed">
                <span className="font-semibold block mb-0.5">Initial Security Setup Required:</span>
                Create the authoritative Business Owner & Lead Administrator credentials. No default or hardcoded credentials exist.
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vikram Sharma"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Official Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@apex-it.internal"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>
            </>
          ) : null}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSetup ? 'admin' : 'Enter username'}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSetup ? 'Min 8 characters (scrypt-hashed)' : 'Enter password'}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
          </div>

          {isSetup && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">One-time Setup Token (production)</label>
              <input
                type="password"
                value={setupToken}
                onChange={e => setSetupToken(e.target.value)}
                placeholder="APEX_INITIAL_SETUP_TOKEN from server environment"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
          )}

          {isSetup && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Confirm Password</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{isSetup ? 'Initialize Administrator & Launch OS' : 'Authenticate & Access OS'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="bg-slate-950/60 p-4 border-t border-slate-800/80 text-[11px] text-slate-500 text-center font-mono">
          Authoritative Session • scrypt KDF • Server-Side RBAC
        </div>

      </div>
    </div>
  );
};
