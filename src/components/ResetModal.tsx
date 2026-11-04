import React, { useState } from 'react';
import { 
  Building2, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  X,
  ShieldCheck,
  Save
} from 'lucide-react';
import { TenantInfo } from '../types';

interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantInfo;
  onUpdateTenant: (updates: Partial<TenantInfo>) => void;
  onResetCleanSlate: () => void;
  stats: {
    quotesCount: number;
    projectsCount: number;
    ticketsCount: number;
    jobsCount: number;
    assetsCount: number;
    productsCount: number;
  };
}

export const ResetModal: React.FC<ResetModalProps> = ({
  isOpen,
  onClose,
  tenant,
  onUpdateTenant,
  onResetCleanSlate,
  stats
}) => {
  const [orgName, setOrgName] = useState(tenant.name || '');
  const [gstin, setGstin] = useState(tenant.gstin || '');
  const [state, setState] = useState(tenant.state || 'Maharashtra (27)');
  const [contactEmail, setContactEmail] = useState(tenant.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(tenant.contactPhone || '');
  const [pan, setPan] = useState(tenant.pan || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSaveOrganization = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateTenant({
      name: orgName.trim(),
      gstin: gstin.trim(),
      state: state.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      pan: pan.trim(),
      isConfigured: true
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-scaleUp">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Organization & Workspace Setup</h3>
              <p className="text-xs text-slate-400">Configure your company identity and manage persistent database state</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Metrics Bar */}
        <div className="px-6 pt-5 pb-2">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300">Live Enterprise Database:</span>
              <span className="font-mono font-bold text-emerald-400 uppercase">
                Zero Mock Data (Authentic Records Only)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-center text-[11px]">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Quotes</span>
              <span className="font-mono font-bold text-white text-xs">{stats.quotesCount}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Projects</span>
              <span className="font-mono font-bold text-white text-xs">{stats.projectsCount}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px]">ITSM</span>
              <span className="font-mono font-bold text-white text-xs">{stats.ticketsCount}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Field Jobs</span>
              <span className="font-mono font-bold text-white text-xs">{stats.jobsCount}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Assets</span>
              <span className="font-mono font-bold text-white text-xs">{stats.assetsCount}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Products</span>
              <span className="font-mono font-bold text-white text-xs">{stats.productsCount}</span>
            </div>
          </div>
        </div>

        {/* Organization Form */}
        <div className="p-6 space-y-4">
          <form onSubmit={handleSaveOrganization} className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Company & Tax Profile</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Company / Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Apex IT Services Ltd"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">GSTIN Number</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">State / Province</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra (27)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Company PAN</label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  placeholder="e.g. AAAAA0000A"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="operations@company.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98200 00000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-emerald-400">
                {savedSuccess ? 'Organization details saved to server.' : ''}
              </span>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Organization Details</span>
              </button>
            </div>
          </form>

          {/* Clean Slate Action */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div>
              <h5 className="font-bold text-xs text-white">Reset Database to Clean Slate</h5>
              <p className="text-[11px] text-slate-400">Clear all records and start fresh with zero items.</p>
            </div>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to initialize a 100% clean slate with 0 records?')) {
                  onResetCleanSlate();
                  onClose();
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Initialize Clean Slate</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-Tenant Scoped • Changes Saved Permanently</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
