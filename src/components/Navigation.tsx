import React from 'react';
import { 
  Bot, 
  Cpu, 
  Package, 
  Layers, 
  Wrench, 
  Receipt, 
  Activity,
  Send,
  Briefcase,
  Laptop,
  Sliders,
  Network,
  BarChart3
} from 'lucide-react';

export type TabKey = 
  | 'executive'
  | 'telegram' 
  | 'bom' 
  | 'inventory' 
  | 'itsm' 
  | 'field' 
  | 'projects' 
  | 'assets' 
  | 'finance' 
  | 'automation' 
  | 'integrations' 
  | 'events';

interface NavigationProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  pendingApprovalsCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  pendingApprovalsCount
}) => {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    {
      key: 'executive',
      label: 'Executive CIO Hub',
      icon: <BarChart3 className="w-4 h-4 text-emerald-400" />
    },
    {
      key: 'telegram',
      label: 'Telegram Command Hub',
      icon: <Send className="w-4 h-4 text-sky-400" />,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined
    },
    {
      key: 'bom',
      label: 'AI Sales & BOM Engine',
      icon: <Cpu className="w-4 h-4 text-indigo-400" />
    },
    {
      key: 'inventory',
      label: 'Inventory & Procurement RFQ',
      icon: <Package className="w-4 h-4 text-emerald-400" />
    },
    {
      key: 'projects',
      label: 'Projects & Marketplace',
      icon: <Briefcase className="w-4 h-4 text-indigo-300" />
    },
    {
      key: 'field',
      label: 'Field Dispatch & Sign-off',
      icon: <Wrench className="w-4 h-4 text-cyan-400" />
    },
    {
      key: 'itsm',
      label: 'ITSM Desk & CMDB Ops',
      icon: <Layers className="w-4 h-4 text-amber-400" />
    },
    {
      key: 'assets',
      label: 'Assets, AMC & SaaS',
      icon: <Laptop className="w-4 h-4 text-teal-400" />
    },
    {
      key: 'finance',
      label: 'Finance & GST Invoicing',
      icon: <Receipt className="w-4 h-4 text-purple-400" />
    },
    {
      key: 'automation',
      label: 'Automation Workflows',
      icon: <Sliders className="w-4 h-4 text-amber-300" />
    },
    {
      key: 'integrations',
      label: 'Integrations & Connectors',
      icon: <Network className="w-4 h-4 text-blue-400" />
    },
    {
      key: 'events',
      label: 'Event Bus & Audit Trail',
      icon: <Activity className="w-4 h-4 text-rose-400" />
    }
  ];

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-[57px] z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-none" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onSelectTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white shadow border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    typeof tab.badge === 'number'
                      ? 'bg-amber-500 text-slate-950 animate-pulse'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
