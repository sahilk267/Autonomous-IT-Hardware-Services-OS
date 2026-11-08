import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, UserX, KeyRound } from 'lucide-react';
import { UserAccount, UserRole } from '../types';

type StaffRole = Exclude<UserRole, 'BUSINESS_OWNER'>;
const assignableRoles: { value: StaffRole; label: string }[] = [
  { value: 'SALES_MANAGER', label: 'Sales manager' },
  { value: 'PROCUREMENT_LEAD', label: 'Procurement lead' },
  { value: 'ENTERPRISE_IT_HEAD', label: 'Enterprise IT head' },
  { value: 'FIELD_ENGINEER', label: 'Field engineer' }
];

interface StaffAccessPanelProps {
  isOwner: boolean;
  onReauthRequired: () => Promise<void>;
}

export const StaffAccessPanel: React.FC<StaffAccessPanelProps> = ({ isOwner, onReauthRequired }) => {
  const [staff, setStaff] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('FIELD_ENGINEER');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadStaff = async () => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/staff');
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.data)) throw new Error(data.error || 'Cannot load staff.');
      setStaff(data.data);
    } catch (error: any) {
      setMessage(error?.message || 'Unable to load staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStaff(); }, [isOwner]);

  const createStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email, role, temporaryPassword })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Staff creation failed.');
      // Never display the password in the list or keep it in a success notification.
      setTemporaryPassword(''); setUsername(''); setName(''); setEmail('');
      setMessage('Local staff account saved. Share temporary credentials privately; external Entra/SSO access was not provisioned.');
      await loadStaff();
    } catch (error: any) {
      setMessage(error?.message || 'Staff account was not saved.');
    } finally {
      setLoading(false);
    }
  };

  const disableStaff = async (user: UserAccount) => {
    if (!isOwner || user.role === 'BUSINESS_OWNER' || user.disabledAt) return;
    if (!window.confirm(`Disable ${user.username} and revoke all local sessions? This does NOT revoke Microsoft 365 or other external access.`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/staff/${encodeURIComponent(user.id)}/disable`, { method: 'PATCH' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Staff disable failed.');
      setMessage(`Local account ${user.username} disabled, sessions revoked. External identity access is NOT changed.`);
      await loadStaff();
    } catch (error: any) {
      setMessage(error?.message || 'Unable to disable user.');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.reauthenticationRequired) {
        throw new Error(data.error || 'Password change could not be confirmed.');
      }
      setCurrentPassword(''); setNewPassword('');
      // Password rotation invalidates every prior session. Immediately purge cached UI data.
      await onReauthRequired();
    } catch (error: any) {
      setMessage(error?.message || 'Password was not changed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Account Security &amp; Staff Access</h1>
          <p className="text-sm text-slate-400">Single-tenant local accounts only. No Microsoft 365, Entra ID or third-party deprovisioning is performed here.</p>
        </div>
      </div>
      {message && <div role="status" className="rounded-lg border border-amber-700 bg-amber-950/40 text-amber-200 p-3 text-xs">{message}</div>}
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <h2 className="font-bold text-white flex items-center gap-2"><KeyRound className="w-5 h-5" /> Change My Password</h2>
        <p className="text-xs text-slate-400">A successful change signs out every session. Sign in again using the new password.</p>
        <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-3">
          <input aria-label="Current password" type="password" autoComplete="current-password" value={currentPassword}
            required placeholder="Current password" onChange={e => setCurrentPassword(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm" />
          <input aria-label="New password" type="password" autoComplete="new-password" value={newPassword}
            required minLength={12} maxLength={128} placeholder="New password (min 12)" onChange={e => setNewPassword(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm" />
          <button type="submit" disabled={loading} className="rounded-lg bg-indigo-700 disabled:opacity-50 p-2 text-white text-sm font-semibold">Change Password &amp; Sign Out</button>
        </form>
      </section>
      {isOwner && (
        <>
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h2 className="font-bold text-white flex items-center gap-2"><UserPlus className="w-5 h-5" /> Create Staff Account</h2>
            <p className="text-xs text-amber-300">Owner-only. The password is not emailed or stored in plain text; deliver it through a private secure channel and have the staff member change it.</p>
            <form onSubmit={createStaff} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input aria-label="Staff username" required minLength={3} maxLength={40} value={username}
                onChange={e => setUsername(e.target.value)} placeholder="Username" autoComplete="off"
                className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm" />
              <input aria-label="Staff name" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Full name" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm" />
              <input aria-label="Staff email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email address" className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm" />
              <select aria-label="Staff role" value={role} onChange={e => setRole(e.target.value as StaffRole)}
                className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm">
                {assignableRoles.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
              <input aria-label="Initial temporary password" type="password" autoComplete="new-password" required
                minLength={12} maxLength={128} value={temporaryPassword} onChange={e => setTemporaryPassword(e.target.value)}
                placeholder="Temporary password (12–128 characters)"
                className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white text-sm" />
              <button type="submit" disabled={loading} className="rounded-lg bg-emerald-700 disabled:opacity-50 p-2 font-bold text-white text-sm">Create Local Staff</button>
            </form>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-white">Existing Local Accounts</h2>
              <button disabled={loading} onClick={() => void loadStaff()} className="text-xs underline text-cyan-300">Refresh</button>
            </div>
            {staff.length === 0 ? <p className="text-slate-400 text-sm">No account records loaded.</p> :
              <div className="space-y-2">
                {staff.map(user => (
                  <div key={user.id} className="flex flex-wrap items-center gap-3 justify-between p-3 border border-slate-800 rounded-lg">
                    <div>
                      <p className="text-white font-semibold text-sm">{user.name} — {user.username}</p>
                      <p className="text-slate-400 text-xs">{user.role} • {user.email} • {user.disabledAt ? 'Disabled' : 'Active locally'}</p>
                    </div>
                    {user.role !== 'BUSINESS_OWNER' && !user.disabledAt &&
                      <button type="button" disabled={loading} onClick={() => void disableStaff(user)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-900 text-rose-100 flex items-center gap-1 disabled:opacity-50">
                        <UserX className="w-3 h-3" /> Disable &amp; Revoke
                      </button>}
                  </div>
                ))}
              </div>}
          </section>
        </>
      )}
    </div>
  );
};
