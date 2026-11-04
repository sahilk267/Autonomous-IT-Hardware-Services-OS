import React from 'react';
import { 
  Building2, 
  Send, 
  ShieldCheck, 
  Activity, 
  CheckCircle2, 
  Clock,
  Sparkles,
  Users,
  RotateCcw,
  Database
} from 'lucide-react';
import { UserRole, TenantInfo, OperatingMode } from '../types';

interface HeaderProps {
  tenant: TenantInfo;
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  pendingApprovalsCount: number;
  onOpenTelegram: () => void;
  activeTab: string;
  operatingMode?: OperatingMode;
  onOperatingModeChange?: (mode: OperatingMode) => void;
  isCleanSlate?: boolean;
  onOpenResetModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  tenant,
  currentRole,
  onRoleChange,
  pendingApprovalsCount,
  onOpenTelegram,
  operatingMode = 'HYBRID',
  onOperatingModeChange,
  isCleanSlate = false,
  onOpenResetModal
}) => {
  const roleLabels: Record<UserRole, { title: string; badge: string; desc: string }> = {
    BUSINESS_OWNER: { title: 'Business Owner & MD', badge: 'Apex Command', desc: 'Full autonomous approval & financial governance' },
    SALES_MANAGER: { title: 'Sales & Presales Lead', badge: 'Sales Engine', desc: 'BOM generation, pricing & customer quotes' },
    ENTERPRISE_IT_HEAD: { title: 'Enterprise IT CIO', badge: 'ITSM & CMDB', desc: 'Service desk, SLA, assets & procurement' },
    FIELD_ENGINEER: { title: 'Field Technician', badge: 'Field Service', desc: 'On-site jobs, check-ins, parts & sign-offs' },
    PROCUREMENT_LEAD: { title: 'Procurement Lead', badge: 'Supply Chain', desc: 'RFQs, supplier scores & stock replenishment' }
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between py-3 gap-3">
          
          {/* Brand & Organization */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-lg shadow-inner text-white tracking-wider">
                APX
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base tracking-tight text-white">{tenant.name}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Active Tenant
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
                  <span>GSTIN: {tenant.gstin}</span>
                  <span className="text-slate-600">•</span>
                  <span>{tenant.state}</span>
                </p>
              </div>
            </div>

            {/* Mobile Telegram quick access */}
            <button
              onClick={onOpenTelegram}
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/40 text-xs font-medium"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram</span>
              {pendingApprovalsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>
          </div>

          {/* Center: Autonomous Orchestration Status & Operating Mode Pill */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/70 rounded-full px-3.5 py-1.5 text-xs">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-medium">Auto-Executed:</span>
              <span className="text-emerald-400 font-semibold">90%</span>
              <span className="text-slate-500">|</span>
              <span className="text-amber-300 font-semibold">10% Exception</span>
            </div>

            {/* Operating Mode Selector (Blueprint Section 2 & 157) */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-indigo-700/60 rounded-full px-3 py-1 text-xs text-slate-300 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Mode:</span>
              <select
                value={operatingMode}
                onChange={(e) => onOperatingModeChange && onOperatingModeChange(e.target.value as OperatingMode)}
                className="bg-transparent text-indigo-200 font-semibold text-xs focus:outline-none cursor-pointer"
                title="Select Platform Operating Model"
              >
                <option value="HYBRID" className="bg-slate-900 text-white">⚡ Hybrid Enterprise Mode</option>
                <option value="MODEL_A_MARKETPLACE" className="bg-slate-900 text-white">🛒 Model A: Open Marketplace</option>
                <option value="MODEL_B_MANAGED_IT" className="bg-slate-900 text-white">🛡️ Model B: Platform-Managed IT</option>
                <option value="MODEL_C_ENTERPRISE_OS" className="bg-slate-900 text-white">🏢 Model C: Enterprise IT OS</option>
              </select>
            </div>
          </div>

          {/* Right Side: Persona Switcher & Telegram Action */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Persona Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs">
              <Users className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <select
                value={currentRole}
                onChange={(e) => onRoleChange(e.target.value as UserRole)}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer pr-2"
                title="Switch Operating Persona"
              >
                <option value="BUSINESS_OWNER" className="bg-slate-900 text-white">👑 Business Owner & MD</option>
                <option value="SALES_MANAGER" className="bg-slate-900 text-white">💼 Sales & Presales Lead</option>
                <option value="ENTERPRISE_IT_HEAD" className="bg-slate-900 text-white">🏢 Enterprise IT CIO</option>
                <option value="FIELD_ENGINEER" className="bg-slate-900 text-white">🔧 Field Technician</option>
                <option value="PROCUREMENT_LEAD" className="bg-slate-900 text-white">📦 Procurement Lead</option>
              </select>
            </div>

            {/* Organization Setup Button */}
            {onOpenResetModal && (
              <button
                onClick={onOpenResetModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-slate-800 hover:bg-slate-700/90 border-slate-700 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer transition shadow-sm"
                title="Configure Company Profile & Workspace Setup"
              >
                <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Organization</span>
              </button>
            )}

            {/* Telegram Command Center Button */}
            <button
              onClick={onOpenTelegram}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Open Telegram Owner Command & Approval Hub"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Telegram Hub</span>
              {pendingApprovalsCount > 0 ? (
                <span className="px-1.5 py-0.2 bg-amber-400 text-slate-950 rounded-full font-bold text-[10px] animate-pulse">
                  {pendingApprovalsCount} Action
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
