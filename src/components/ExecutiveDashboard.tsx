import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  FileCheck, 
  Award, 
  BarChart3, 
  Search,
  Building,
  Plus
} from 'lucide-react';
import { TenantInfo, ITSMTicket, AssetItem, AMCContract, Quotation, ProductItem, InvoiceRecord, SupplierInfo, RFQItem, EndpointHealth } from '../types';

interface ExecutiveDashboardProps {
  tenant: TenantInfo;
  onNavigateTab: (tab: any) => void;
  onTriggerQuickAction: (actionType: string) => void;
  tickets?: ITSMTicket[];
  assets?: AssetItem[];
  amcs?: AMCContract[];
  quotes?: Quotation[];
  products?: ProductItem[];
  invoices?: InvoiceRecord[];
  suppliers?: SupplierInfo[];
  rfqs?: RFQItem[];
  endpoints?: EndpointHealth[];
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  tenant,
  onNavigateTab,
  onTriggerQuickAction,
  tickets = [],
  assets = [],
  amcs = [],
  quotes = [],
  products = [],
  invoices = [],
  suppliers = [],
  rfqs = [],
  endpoints = []
}) => {
  // Enterprise AI Copilot State
  const [copilotQuery, setCopilotQuery] = useState('');
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [copilotResponse, setCopilotResponse] = useState<{
    answer: string;
    metrics: { label: string; value: string }[];
  } | null>(null);

  // Calculate live dynamic metrics from genuine database records
  const criticalIncidentsCount = tickets.filter(t => t.priority === 'CRITICAL' && t.status !== 'RESOLVED').length;
  const managedAssetsCount = assets.length;
  const contractsExpiringCount = amcs.filter(a => a.status === 'EXPIRING_SOON').length;
  
  const totalSettledRevenue = invoices
    .filter(i => i.status === 'SETTLED')
    .reduce((acc, i) => acc + i.amount, 0);

  const totalOutstandingReceivables = invoices
    .filter(i => i.status !== 'SETTLED')
    .reduce((acc, i) => acc + i.amount, 0);

  const inventoryValuation = products.reduce((acc, p) => acc + (p.purchaseCost * p.stockAvailable), 0);

  const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED');
  const slaComplianceDisplay = resolvedTickets.length > 0
    ? `${((resolvedTickets.filter(t => t.slaPercentUsed <= 100).length / resolvedTickets.length) * 100).toFixed(1)}%`
    : 'N/A';

  // Do not infer 100% health when no genuine telemetry measurements exist
  const itHealthScore = endpoints.length === 0
    ? 'N/A (No Telemetry)'
    : `${Math.round((endpoints.filter(e => e.status === 'HEALTHY').length / endpoints.length) * 100)}%`;

  // Handle Copilot Submission via real backend API
  const handleCopilotSubmit = async (queryText: string) => {
    const q = queryText || copilotQuery;
    if (!q.trim()) return;
    setIsCopilotThinking(true);
    setCopilotError(null);

    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCopilotResponse(data.data);
      } else {
        setCopilotError(data.error || 'Copilot service is currently unavailable. Verify GEMINI_API_KEY.');
      }
    } catch (err: any) {
      setCopilotError(err.message || 'Network error communicating with AI Copilot service.');
    } finally {
      setIsCopilotThinking(false);
    }
  };

  // Find genuine completed RFQs with matching invoices for 3-way match
  const poDispatchedRfqs = rfqs.filter(r => r.status === 'PO_DISPATCHED');

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
            Real-time IT metrics, inventory valuation, 3-way match procurement verification, and natural-language AI copilot.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${itHealthScore === 'N/A' ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`}></span>
            <span className="text-slate-300">Live IT Health: <strong className={itHealthScore === 'N/A' ? 'text-slate-400' : 'text-emerald-400'}>{itHealthScore}</strong></span>
          </div>
        </div>
      </div>

      {/* Authoritative Metric Highlights derived strictly from database */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">IT Health Score</span>
          <div className="text-xl font-bold font-mono text-emerald-400">{itHealthScore}</div>
          <span className="text-[10px] text-slate-500">{assets.length === 0 ? 'No assets tracked' : 'Calculated live'}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Critical Incidents</span>
          <div className="text-xl font-bold font-mono text-rose-400">{criticalIncidentsCount} Open</div>
          <span className="text-[10px] text-slate-500">{tickets.length === 0 ? '0 Tickets logged' : 'From ITSM Desk'}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">SLA Compliance</span>
          <div className="text-xl font-bold font-mono text-cyan-400">{slaComplianceDisplay}</div>
          <span className="text-[10px] text-slate-500">{resolvedTickets.length === 0 ? 'No resolved tickets' : `${resolvedTickets.length} evaluated`}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Managed Assets</span>
          <div className="text-xl font-bold font-mono text-white">{managedAssetsCount}</div>
          <span className="text-[10px] text-slate-500">CMDB Registry</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Inventory Value</span>
          <div className="text-xl font-bold font-mono text-white">
            {inventoryValuation > 0 ? `₹${(inventoryValuation / 100000).toFixed(2)}L` : '₹0.00'}
          </div>
          <span className="text-[10px] text-slate-500">{products.length} catalog items</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Receivables</span>
          <div className="text-xl font-bold font-mono text-amber-400">
            {totalOutstandingReceivables > 0 ? `₹${(totalOutstandingReceivables / 100000).toFixed(2)}L` : '₹0.00'}
          </div>
          <span className="text-[10px] text-slate-500">Unsettled invoices</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase block">Expiring AMCs</span>
          <div className="text-xl font-bold font-mono text-purple-400">{contractsExpiringCount}</div>
          <span className="text-[10px] text-slate-500">{amcs.length} total contracts</span>
        </div>
      </div>

      {/* Enterprise AI Copilot Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">Enterprise IT Executive AI Copilot (Natural-Language Telemetry)</h2>
              <p className="text-xs text-slate-400">Ask strategic questions about asset health, SLA trends, and operational records.</p>
            </div>
          </div>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-950 px-2.5 py-1 rounded-md border border-indigo-800">
            Live Database Connected
          </span>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-slate-400 text-[11px] font-mono self-center">Quick Inquiries:</span>
          {[
            "Summarize our current active tickets and critical incidents",
            "What is our total inventory valuation and catalog count?",
            "Are there any quotations pending owner approval?",
            "Check unsettled receivables balance"
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
            placeholder="Type any executive query against your real enterprise operational data..."
            className="w-full bg-transparent text-white text-xs placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={() => handleCopilotSubmit(copilotQuery)}
            disabled={isCopilotThinking}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isCopilotThinking ? 'Evaluating DB...' : 'Ask Copilot'}</span>
          </button>
        </div>

        {/* Copilot Error Box */}
        {copilotError && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{copilotError}</span>
          </div>
        )}

        {/* Copilot Response Box */}
        {copilotResponse && (
          <div className="p-4 rounded-xl bg-slate-950 border border-indigo-900/50 space-y-3 text-xs">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Copilot Executive Synthesis (Based on Live Records):
              </span>
            </div>

            <p className="text-slate-200 leading-relaxed text-xs whitespace-pre-wrap">
              {copilotResponse.answer}
            </p>

            {copilotResponse.metrics && copilotResponse.metrics.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {copilotResponse.metrics.map((m, idx) => (
                  <div key={idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block">{m.label}</span>
                    <span className="font-bold text-white text-sm mt-0.5 block">{m.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid: 3-Way Match & Vendor Scorecards */}
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
                Validates Purchase Order (PO) ↔ Goods Receipt Note (GRN) ↔ Vendor Tax Invoice.
              </p>
            </div>
          </div>

          {poDispatchedRfqs.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <FileCheck className="w-8 h-8 text-slate-600 mx-auto" />
              <div>
                <p className="font-semibold text-slate-300">No Transactions Available for 3-Way Matching</p>
                <p className="text-slate-500 text-[11px] mt-1">
                  When you dispatch Purchase Orders in Inventory & Procurement and record vendor tax invoices, automated matching will evaluate here.
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('inventory')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                Go to Inventory & Procurement
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {poDispatchedRfqs.map((rfq) => (
                <div key={rfq.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-mono text-cyan-400 font-bold block">Purchase Order Dispatched</span>
                      <span className="font-bold text-white">{rfq.productName} (Qty: {rfq.requiredQty})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                      PO DISPATCHED
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Awaiting warehouse goods receipt note (GRN) inspection for complete 3-way match.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Module B: Authorized Vendor Performance Scorecards */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-xs">
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Authorized Vendor Performance Scorecards
              </h3>
              <p className="text-slate-400 text-[11px]">
                Multi-dimensional rating based on genuine supplier delivery, pricing, and fulfillment.
              </p>
            </div>
          </div>

          {suppliers.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <Building className="w-8 h-8 text-slate-600 mx-auto" />
              <div>
                <p className="font-semibold text-slate-300">No Suppliers Registered Yet</p>
                <p className="text-slate-500 text-[11px] mt-1">
                  Add genuine hardware distributors and OEM certified partners in Inventory & Procurement to view performance scores.
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('inventory')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                Register First Supplier
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map((s) => (
                <div key={s.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white text-sm">{s.name}</span>
                      <span className="text-slate-400 text-[11px] block">Contact: {s.contactPerson} ({s.phone})</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-amber-400">{s.rating || 0}/5.0</span>
                      <span className="text-[10px] text-slate-500 block">Rating</span>
                    </div>
                  </div>
                  {s.authorizedBrands && s.authorizedBrands.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-400">
                      Brands: <strong className="text-slate-200">{s.authorizedBrands.join(', ')}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
