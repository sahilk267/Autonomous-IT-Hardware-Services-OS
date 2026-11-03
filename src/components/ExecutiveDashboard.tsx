import React, { useState } from 'react';
import { 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  DollarSign, 
  Sparkles, 
  FileCheck, 
  Package, 
  Award, 
  Send, 
  HelpCircle, 
  BarChart3, 
  ArrowUpRight, 
  Layers, 
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { TenantInfo, ITSMTicket, AssetItem, AMCContract, Quotation, ProductItem } from '../types';

interface ExecutiveDashboardProps {
  tenant: TenantInfo;
  onNavigateTab: (tab: any) => void;
  onTriggerQuickAction: (actionType: string) => void;
  isCleanSlate?: boolean;
  tickets?: ITSMTicket[];
  assets?: AssetItem[];
  amcs?: AMCContract[];
  quotes?: Quotation[];
  products?: ProductItem[];
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  tenant,
  onNavigateTab,
  onTriggerQuickAction,
  isCleanSlate = false,
  tickets = [],
  assets = [],
  amcs = [],
  quotes = [],
  products = []
}) => {
  // Enterprise AI Copilot State
  const [copilotQuery, setCopilotQuery] = useState('');
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState<{
    answer: string;
    metrics: { label: string; value: string }[];
    recommendedAction?: { label: string; actionType: string };
  } | null>(() => isCleanSlate ? {
    answer: "Clean Slate Mode active: 0 active incidents, 0 expiring warranties, and 0 hardware shortages. All 12 enterprise domains are initialized with pristine telemetry and ready for live operations.",
    metrics: [
      { label: "Active Incidents", value: "0 Logged" },
      { label: "Tracked Assets", value: "0 Units" },
      { label: "SLA Adherence", value: "100% Nominal" }
    ],
    recommendedAction: {
      label: "Post First Enterprise Project or Service Request",
      actionType: "CREATE_PROJECT"
    }
  } : {
    answer: "Currently, 14 assets have warranties expiring within the next 45 days. Three Lenovo ThinkPad T14 units and one Cisco 350-48P PoE switch require immediate AMC extension to prevent uncovered hardware outage risks. In addition, reclaiming 44 inactive Microsoft 365 E5 seats can lock ₹16.89L in annual OPEX savings.",
    metrics: [
      { label: "Expiring Hardware Assets", value: "14 Units" },
      { label: "Annual SaaS Waste Identified", value: "₹16.89 Lakhs" },
      { label: "SLA Risk Index", value: "Low (96.7% Compliant)" }
    ],
    recommendedAction: {
      label: "Draft 3-Way Spare RFQ & Reclaim M365 Licenses",
      actionType: "RECLAIM_AND_RFQ"
    }
  });

  // Calculate live dynamic metrics
  const criticalIncidentsCount = tickets.filter(t => t.priority === 'CRITICAL' && t.status !== 'RESOLVED').length;
  const managedAssetsCount = isCleanSlate ? assets.length : (assets.length > 0 ? assets.length : 8420);
  const contractsExpiringCount = isCleanSlate ? amcs.length : (amcs.length > 0 ? amcs.length : 11);
  const totalApprovedSpend = quotes
    .filter(q => q.status === 'APPROVED' || q.status === 'CLIENT_ACCEPTED')
    .reduce((acc, q) => acc + q.totalAmount, 0);
  const formattedMonthlySpend = isCleanSlate 
    ? (totalApprovedSpend > 0 ? `₹${(totalApprovedSpend / 100000).toFixed(2)}L` : '₹0.00')
    : '₹42.6L';

  // 3-Way Match State
  const [matchStatus, setMatchStatus] = useState<'MATCHED' | 'DISCREPANCY' | 'APPROVED'>('MATCHED');

  const handleCopilotSubmit = (queryText: string) => {
    const q = queryText || copilotQuery;
    if (!q.trim()) return;
    setIsCopilotThinking(true);

    setTimeout(() => {
      if (q.toLowerCase().includes('sla') || q.toLowerCase().includes('mumbai')) {
        setCopilotResponse({
          answer: "In the Mumbai region last month, overall SLA adherence reached 97.2% across 142 service requests. Average First Call Resolution (FCR) stood at 89.4%, and Mean Time To Resolution (MTTR) was 2.4 hours (well within the 4-hour SLA window).",
          metrics: [
            { label: "Mumbai SLA Adherence", value: "97.2%" },
            { label: "Avg MTTR", value: "2.4 Hours" },
            { label: "First Call Resolution", value: "89.4%" }
          ],
          recommendedAction: {
            label: "Export Regional SLA Audit PDF",
            actionType: "EXPORT_SLA"
          }
        });
      } else if (q.toLowerCase().includes('cost') || q.toLowerCase().includes('365') || q.toLowerCase().includes('saving')) {
        setCopilotResponse({
          answer: "Microsoft 365 Graph telemetry detected 44 inactive E5 enterprise licenses (no login recorded past 30 days). Reclaiming these licenses and downgrading 12 idle contractor seats to Exchange Online Kiosk reduces your annual software bill by ₹16.89 Lakhs.",
          metrics: [
            { label: "Inactive E5 Licenses", value: "44 Seats" },
            { label: "Identified Annual Wastage", value: "₹16,89,600" },
            { label: "Target Renewal Savings", value: "18.4%" }
          ],
          recommendedAction: {
            label: "Auto-Reclaim Inactive Seats Now",
            actionType: "RECLAIM_SEATS"
          }
        });
      } else {
        setCopilotResponse({
          answer: `Analysis complete for: "${q}". The infrastructure health index remains high at 91/100 with zero active P1 network outages. Storage pool IOPS on Core VMware cluster is operating at 64% capacity with 2.1TB head room.`,
          metrics: [
            { label: "System Uptime", value: "99.98%" },
            { label: "Network Latency", value: "12ms (Intra-DC)" },
            { label: "Audit Trail Status", value: "Tamper-Proof Logged" }
          ],
          recommendedAction: {
            label: "Inspect RMM Telemetry",
            actionType: "VIEW_RMM"
          }
        });
      }
      setIsCopilotThinking(false);
    }, 900);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            Executive CIO & Enterprise IT Operations Control Plane
          </h1>
          <p className="text-sm text-slate-400">
            Real-time IT health score, SLA compliance, 3-way match procurement verification, and natural-language AI copilot.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-300">Live IT Health: <strong className="text-emerald-400">{isCleanSlate ? '100% Clean Baseline' : '91% Optimal'}</strong></span>
          </div>
        </div>
      </div>

      {/* Blueprint Metric Highlights (Section 60) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">IT Health Score</span>
          <div className="text-xl font-bold font-mono text-emerald-400">{isCleanSlate ? '100%' : '91%'}</div>
          <span className="text-[10px] text-slate-500">Tier-3 Standards</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Critical Incidents</span>
          <div className="text-xl font-bold font-mono text-rose-400">{criticalIncidentsCount} Open</div>
          <span className="text-[10px] text-slate-500">{criticalIncidentsCount === 0 ? 'Zero Outages' : 'All within SLA'}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">SLA Compliance</span>
          <div className="text-xl font-bold font-mono text-cyan-400">{isCleanSlate ? '100%' : '96.7%'}</div>
          <span className="text-[10px] text-emerald-400">{isCleanSlate ? 'Zero Breaches' : '+1.2% MoM'}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Managed Assets</span>
          <div className="text-xl font-bold font-mono text-white">{managedAssetsCount}</div>
          <span className="text-[10px] text-amber-400 font-bold">{isCleanSlate ? '0 At Risk' : '126 At Risk'}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Monthly IT Spend</span>
          <div className="text-xl font-bold font-mono text-white">{formattedMonthlySpend}</div>
          <span className="text-[10px] text-slate-500">Capex + Opex</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Potential Savings</span>
          <div className="text-xl font-bold font-mono text-amber-400">{isCleanSlate ? '₹0.00' : '₹5.2L'}</div>
          <span className="text-[10px] text-slate-400">Identified by AI</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Contracts Expiring</span>
          <div className="text-xl font-bold font-mono text-purple-400">{contractsExpiringCount} AMCs</div>
          <span className="text-[10px] text-slate-500">{isCleanSlate ? '0 Active' : '< 60 Days'}</span>
        </div>
      </div>

      {/* Enterprise AI Copilot Card (Section 142 & 143) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">Enterprise IT Executive AI Copilot (Natural-Language Telemetry)</h2>
              <p className="text-xs text-slate-400">Ask strategic questions about asset health, SLA trends, vendor delays, and cost leakages.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-950 px-2.5 py-1 rounded-md border border-indigo-800">
            Permission-Scoped RAG Active
          </span>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-slate-400 text-[11px] font-mono self-center">Quick Inquiries:</span>
          {[
            "Kaunse assets ki warranty 30 din mein expire hogi?",
            "Mumbai office mein last month ka SLA kya tha?",
            "Microsoft 365 mein kitna unnecessary cost ho raha hai?",
            "Kaunse vendors sabse zyada late delivery karte hain?"
          ].map((promptText, i) => (
            <button
              key={i}
              onClick={() => {
                setCopilotQuery(promptText);
                handleCopilotSubmit(promptText);
              }}
              className="px-3 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs transition cursor-pointer"
            >
              "{promptText}"
            </button>
          ))}
        </div>

        {/* Query Input Box */}
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl p-2">
          <Search className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
          <input
            type="text"
            value={copilotQuery}
            onChange={(e) => setCopilotQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCopilotSubmit(copilotQuery)}
            placeholder="Type any executive query in plain English or Hindi..."
            className="w-full bg-transparent text-white text-xs placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={() => handleCopilotSubmit(copilotQuery)}
            disabled={isCopilotThinking}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isCopilotThinking ? 'Querying Graph...' : 'Ask Copilot'}</span>
          </button>
        </div>

        {/* Copilot Response Box */}
        {copilotResponse && (
          <div className="p-4 rounded-xl bg-slate-950 border border-indigo-900/50 space-y-3 text-xs">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Copilot Executive Synthesis:
              </span>
            </div>

            <p className="text-slate-200 leading-relaxed text-xs">
              {copilotResponse.answer}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {copilotResponse.metrics.map((m, idx) => (
                <div key={idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">{m.label}</span>
                  <span className="font-bold text-white text-sm mt-0.5 block">{m.value}</span>
                </div>
              ))}
            </div>

            {copilotResponse.recommendedAction && (
              <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                <button
                  onClick={() => onTriggerQuickAction(copilotResponse.recommendedAction!.actionType)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition shadow flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Execute Recommendation: {copilotResponse.recommendedAction.label}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid: 3-Way Match (Section 23) & Vendor Scorecards (Section 26) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Module A: Enterprise 3-Way Match Verification */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-xs">
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-cyan-400" />
                Automated 3-Way Match Verification (Audit Proof)
              </h3>
              <p className="text-slate-400 text-[11px]">
                Validates Purchase Order (PO) ↔ Goods Receipt Note (GRN) ↔ Vendor GST Invoice.
              </p>
            </div>

            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
              matchStatus === 'APPROVED'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
            }`}>
              {matchStatus}
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Document 1: PO */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono text-indigo-400 font-bold block">1. Purchase Order</span>
                <span className="font-bold text-white">#PO-2026-0812 (Savex Technologies)</span>
                <span className="text-slate-500 text-[11px] block">10x Dell OptiPlex 7010 Micro @ ₹51,800</span>
              </div>
              <span className="font-mono font-bold text-white">₹5,18,000</span>
            </div>

            {/* Document 2: GRN */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold block">2. Warehouse Goods Receipt (GRN)</span>
                <span className="font-bold text-white">#GRN-10492 (Mumbai DC Locker 4)</span>
                <span className="text-slate-500 text-[11px] block">10/10 Serialized Hardware Units Received & QA Tested</span>
              </div>
              <span className="text-emerald-400 font-mono font-bold">100% Received</span>
            </div>

            {/* Document 3: Invoice */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono text-purple-400 font-bold block">3. Vendor Tax Invoice</span>
                <span className="font-bold text-white">#INV-SAV-99120 (HSN 8471 + 18% GST)</span>
                <span className="text-slate-500 text-[11px] block">Taxable ₹5,18,000 + CGST/SGST ₹93,240</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">₹6,11,240</span>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-slate-800">
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Variance: ₹0.00 (Zero Discrepancy)
            </span>

            {matchStatus !== 'APPROVED' ? (
              <button
                onClick={() => {
                  setMatchStatus('APPROVED');
                  alert("3-Way Match Approved: Payment released to vendor escrow settlement queue.");
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition shadow"
              >
                Approve & Release Payment
              </button>
            ) : (
              <span className="text-xs text-slate-400 font-mono">Payment Authorized</span>
            )}
          </div>
        </div>

        {/* Module B: Vendor Scorecards (Section 26 & 31) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-xs">
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Authorized Vendor Performance Scorecards
              </h3>
              <p className="text-slate-400 text-[11px]">
                Multi-dimensional rating based on delivery SLA, price competitiveness, and RMA turnaround.
              </p>
            </div>
            <span className="text-emerald-400 font-mono text-[10px] font-bold">OEM Certified</span>
          </div>

          <div className="space-y-3">
            {[
              { name: "Savex Technologies Pvt Ltd", score: 96.4, brands: "Dell, Fortinet, HP", rmaSla: "48h", delivery: "98.2%" },
              { name: "Redington India Limited", score: 94.8, brands: "Cisco, Microsoft, APC", rmaSla: "72h", delivery: "95.6%" },
              { name: "Ingram Micro India", score: 92.1, brands: "Lenovo, Schneider, Adobe", rmaSla: "72h", delivery: "93.4%" }
            ].map((v, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white text-sm">{v.name}</span>
                    <span className="text-slate-400 text-[11px] block">Brands: {v.brands}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-amber-400">{v.score}/100</span>
                    <span className="text-[10px] text-slate-500 block">Vendor Index</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1 text-slate-400 border-t border-slate-800/60">
                  <div>On-Time Delivery: <strong className="text-emerald-400">{v.delivery}</strong></div>
                  <div>RMA Resolution SLA: <strong className="text-white">{v.rmaSla}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
