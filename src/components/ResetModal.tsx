import React from 'react';
import { 
  RefreshCw, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  X,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetCleanSlate: () => void;
  onResetDemoSuite: () => void;
  isCleanSlate: boolean;
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
  onResetCleanSlate,
  onResetDemoSuite,
  isCleanSlate,
  stats
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-scaleUp">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">System Data & Workspace State Manager</h3>
              <p className="text-xs text-slate-400">Switch between testing sample data and 100% clean production slate</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current State Status Banner */}
        <div className="px-6 pt-5 pb-2">
          <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
            isCleanSlate 
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' 
              : 'bg-indigo-950/40 border-indigo-800/80 text-indigo-300'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-current animate-ping"></span>
              <span className="font-semibold">Active Workspace State:</span>
              <span className="font-mono font-bold uppercase">
                {isCleanSlate ? 'Clean Slate (0 Mock Records)' : 'Full Demo Test Suite Active'}
              </span>
            </div>
            <span className="text-[11px] font-mono opacity-80">Auto-saved to Browser</span>
          </div>

          {/* Quick Metrics Bar */}
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

        {/* Modal Actions */}
        <div className="p-6 space-y-4">
          
          {/* Option 1: Clean Slate / Fresh Start */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-rose-900/60 transition space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Start Fresh (100% Clean Slate)</h4>
                  <p className="text-xs text-slate-400">
                    Wipes all dummy leads, quotes, tickets, field jobs, assets, RFQs, and projects.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use this mode when you are ready to input your actual real-world IT products, customer leads, and production service tickets. No mock or placeholder entries will remain.
            </p>

            <button
              onClick={() => {
                onResetCleanSlate();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-98"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Wipe Mock Data & Start Fresh</span>
            </button>
          </div>

          {/* Option 2: Restore Demo Suite */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-800/60 transition space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Restore End-to-End Demo Suite</h4>
                  <p className="text-xs text-slate-400">
                    Pre-populates all 12 modules with integrated test cases for evaluation.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Restores Dell workstations, Cisco switch RFQs, Mumbai Metro projects, Telegram autonomous notifications, and Fortinet field dispatches for iterative demonstration.
            </p>

            <button
              onClick={() => {
                onResetDemoSuite();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg active:scale-98"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restore Pre-Seeded Demo Data</span>
            </button>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>State changes persist across sessions & browser tabs</span>
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
