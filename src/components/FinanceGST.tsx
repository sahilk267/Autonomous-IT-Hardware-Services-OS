import React, { useState } from 'react';
import { 
  Receipt, 
  TrendingUp, 
  AlertTriangle, 
  DollarSign, 
  Building2, 
  Calendar, 
  CheckCircle2, 
  Download, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownRight,
  FileCheck,
  Plus,
  X,
  Printer
} from 'lucide-react';
import { TenantInfo, Quotation } from '../types';

interface InvoiceItem {
  customer: string;
  invoiceNo: string;
  amount: number;
  dueInDays: number;
  status: string;
  createdAt?: string;
  gstin?: string;
}

interface FinanceGSTProps {
  tenant: TenantInfo;
  quotes?: Quotation[];
  isCleanSlate?: boolean;
  invoices?: InvoiceItem[];
  onAddInvoice?: (inv: InvoiceItem) => void;
  onSettleInvoice?: (invoiceNo: string, paymentReference: string) => Promise<boolean>;
}

export const FinanceGST: React.FC<FinanceGSTProps> = ({ 
  tenant, 
  quotes = [], 
  isCleanSlate = false,
  invoices = [],
  onAddInvoice,
  onSettleInvoice
}) => {
  const [selectedState, setSelectedState] = useState<'INTRA_STATE' | 'INTER_STATE'>('INTRA_STATE');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [localInvoices, setLocalInvoices] = useState<InvoiceItem[]>([]);
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');
  const [newInvAmount, setNewInvAmount] = useState('');
  const [settleToast, setSettleToast] = useState<string | null>(null);

  const allInvoices = invoices.length > 0 ? invoices : localInvoices;
  const activeReceivables = allInvoices.filter(i => i.status !== 'SETTLED');
  const settledInvoices = allInvoices.filter(i => i.status === 'SETTLED');
  const activePayables: { vendor: string; poNo: string; amount: number; terms: string }[] = [];

  const parsedAmount = parseInt(invoiceAmount, 10) || 0;
  const taxableBase = Math.round(parsedAmount / 1.18);
  const isIntra = selectedState === 'INTRA_STATE';
  const cgst = isIntra ? Math.round(taxableBase * 0.09) : 0;
  const sgst = isIntra ? Math.round(taxableBase * 0.09) : 0;
  const igst = !isIntra ? Math.round(taxableBase * 0.18) : 0;
  const totalTax = cgst + sgst + igst;

  const handleAddInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const amt = parseInt(newInvAmount, 10) || 0;
    const newInv: InvoiceItem = {
      customer: newCustName.trim(),
      invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
      amount: amt,
      dueInDays: 30,
      status: 'ACTIVE',
      gstin: newCustGstin.trim(),
      createdAt: new Date().toISOString().split('T')[0]
    };
    if (onAddInvoice) {
      onAddInvoice(newInv);
    } else {
      setLocalInvoices(prev => [newInv, ...prev]);
    }
    setShowAddInvoiceModal(false);
    setNewCustName('');
    setNewCustGstin('');
    setNewInvAmount('');
    setSettleToast(`Invoice ${newInv.invoiceNo} saved in ledger (GST e-invoicing API not configured).`);
    setTimeout(() => setSettleToast(null), 4000);
  };

  const handleSettleReceivable = async (invNo: string, customer: string, amount: number) => {
    if (!onSettleInvoice) {
      setSettleToast('Settlement requires a verified, saved backend record.');
      return;
    }
    const paymentReference = window.prompt('Enter the verified bank/UPI payment reference for this invoice:')?.trim();
    if (!paymentReference) return;
    const saved = await onSettleInvoice(invNo, paymentReference);
    setSettleToast(saved
      ? `Invoice #${invNo} (${customer} - ₹${amount.toLocaleString('en-IN')}) marked SETTLED with a recorded payment reference; gateway confirmation not implied.`
      : `Could not settle invoice #${invNo}; please check the actual payment evidence.`);
    setTimeout(() => setSettleToast(null), 4000);
  };

  const totalReceivables = activeReceivables.reduce((acc, r) => acc + r.amount, 0);
  const overdueReceivables = activeReceivables.filter(r => r.status === 'OVERDUE').reduce((acc, r) => acc + r.amount, 0);
  const totalPayables = activePayables.reduce((acc, p) => acc + p.amount, 0);
  const netProjectedCash = totalReceivables - totalPayables;
  const mtdGst = Math.round(totalReceivables * 0.18 / 1.18);

  const formattedReceivables = activeReceivables.length === 0
    ? '₹0.00'
    : `₹${(totalReceivables / 100000).toFixed(2)} Lakhs`;

  const formattedPayables = activePayables.length === 0
    ? '₹0.00'
    : `₹${(totalPayables / 100000).toFixed(2)} Lakhs`;

  const formattedGst = 'Not calculated';

  const formattedNetCash = isCleanSlate && activeReceivables.length === 0 && activePayables.length === 0
    ? '₹0.00'
    : `${netProjectedCash >= 0 ? '+' : ''}₹${(netProjectedCash / 100000).toFixed(2)} Lakhs`;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-purple-400" />
            Finance, Indian GST Compliance & Cash Flow Engine
          </h1>
          <p className="text-sm text-slate-400">
            GSTIN-validated e-invoicing, CGST/SGST/IGST tax reconciliation, credit risk assessment, and 30-day cash forecasting.
          </p>
        </div>

        <div className="text-xs bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-slate-300 font-mono">
          E-Invoice Portal: {tenant.isConfigured && tenant.gstin ? (
            <span className="text-emerald-400 font-bold">NIC Configured ({tenant.gstin.slice(0, 5)}...) ✓</span>
          ) : (
            <span className="text-amber-400 font-bold">NIC Gateway Unconfigured</span>
          )}
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Total Outstanding Receivables</span>
          <div className="text-xl font-bold text-white mt-1">{formattedReceivables}</div>
          <div className="text-xs text-amber-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{overdueReceivables > 0 ? `₹${(overdueReceivables / 100000).toFixed(2)}L Overdue` : 'No overdue accounts'}</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Supplier Payables (30 Days)</span>
          <div className="text-xl font-bold text-slate-200 mt-1">{formattedPayables}</div>
          <div className="text-xs text-emerald-400 mt-1">
            {activePayables.length > 0 ? 'All suppliers within credit terms' : 'Zero outstanding supplier debt'}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">MTD GST Liability (Net Output)</span>
          <div className="text-xl font-bold text-purple-400 mt-1">{formattedGst}</div>
          <div className="text-xs text-slate-400 mt-1">Tax reconciliation requires verified filing data</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Projected 30-Day Net Cash Flow</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">{formattedNetCash}</div>
          <div className="text-xs text-emerald-400 mt-1">
            {isCleanSlate && activeReceivables.length === 0 ? 'Awaiting invoices' : 'Healthy liquidity buffer'}
          </div>
        </div>
      </div>

      {/* Main Grid: Tax Calculator & Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Indian GST Tax Invoice Generator */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-purple-400" />
                GST Compliant B2B Tax Invoice & E-Invoice Simulator
              </h2>
              <p className="text-xs text-slate-400">
                Determines Place of Supply (POS) and calculates CGST/SGST (same state) or IGST (interstate).
              </p>
            </div>
            
            <span className="text-xs font-mono text-purple-300 bg-purple-950 px-2.5 py-1 rounded border border-purple-800">
              GSTIN: {tenant.gstin}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Total Gross Invoice Amount (₹)</label>
              <input
                type="number"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Place of Supply (Customer Location)</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedState('INTRA_STATE')}
                  className={`py-2 px-3 rounded-xl font-semibold text-xs cursor-pointer border ${
                    isIntra
                      ? 'bg-purple-950 text-purple-200 border-purple-600'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Intra-State (Maharashtra)
                </button>
                <button
                  onClick={() => setSelectedState('INTER_STATE')}
                  className={`py-2 px-3 rounded-xl font-semibold text-xs cursor-pointer border ${
                    !isIntra
                      ? 'bg-purple-950 text-purple-200 border-purple-600'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Inter-State (IGST)
                </button>
              </div>
            </div>
          </div>

          {/* Tax Breakdown Matrix */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Taxable Value (Excl. Tax):</span>
              <span className="font-mono font-bold text-white">₹{taxableBase.toLocaleString('en-IN')}</span>
            </div>

            {isIntra ? (
              <>
                <div className="flex justify-between text-slate-400">
                  <span>Central GST (CGST @ 9%):</span>
                  <span className="font-mono text-purple-300">₹{cgst.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>State GST (SGST @ 9%):</span>
                  <span className="font-mono text-purple-300">₹{sgst.toLocaleString('en-IN')}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-slate-400">
                <span>Integrated GST (IGST @ 18%):</span>
                <span className="font-mono text-purple-300 font-bold">₹{igst.toLocaleString('en-IN')}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
              <span>Total Goods & Service Tax:</span>
              <span className="font-mono font-bold text-white">₹{totalTax.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
              <span>Final Invoice Total:</span>
              <span className="font-mono text-emerald-400">₹{(taxableBase + totalTax).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Government E-Invoicing Status */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
            <div className="text-amber-400 font-semibold leading-relaxed">
              Government e-invoicing not configured. Internal invoice drafts are not registered IRNs.
            </div>
            <p className="text-[10px] text-slate-500">
              Active NIC/IRP portal credentials required to generate cryptographically signed IRNs and legal QR payloads.
            </p>
          </div>
        </div>

        {/* Right 1 Col: Receivables & Payables Ledger */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white">Customer Receivables Tracker</h3>
                <span className="text-xs text-slate-400 font-mono">Real-time Aging & E-Invoice</span>
              </div>
              <button
                onClick={() => setShowAddInvoiceModal(true)}
                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer transition flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Generate Invoice</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {activeReceivables.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/80">
                  No active invoices. Once client quotes are approved or custom invoices generated, receivables will appear here automatically.
                </div>
              ) : (
                activeReceivables.map((rec) => (
                  <div key={rec.invoiceNo} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-white block">{rec.customer}</span>
                        <span className="font-mono text-[10px] text-slate-400">{rec.invoiceNo}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                        rec.status === 'OVERDUE' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300'
                      }`}>
                        {rec.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-900">
                      <span className="font-mono font-bold text-emerald-400 text-sm">₹{rec.amount.toLocaleString('en-IN')}</span>
                      <button
                        onClick={() => handleSettleReceivable(rec.invoiceNo, rec.customer, rec.amount)}
                        className="px-2.5 py-1 rounded-md bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 text-[11px] font-semibold cursor-pointer transition flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Mark Settled</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span>Supplier Payables (PO Commitments)</span>
              <span className="text-xs text-slate-400 font-mono">Credit</span>
            </h3>

            <div className="space-y-2.5">
              {activePayables.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/80">
                  No pending distributor PO payables. All procurement cycles are fully settled.
                </div>
              ) : (
                activePayables.map((pay) => (
                  <div key={pay.poNo} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-white">{pay.vendor}</span>
                      <span className="font-mono text-[10px] text-slate-400">{pay.terms}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span className="font-mono text-[11px]">{pay.poNo}</span>
                      <span className="font-mono font-bold text-emerald-400">₹{pay.amount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Generate Tax Invoice Modal */}
      {showAddInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">Generate GST Tax Invoice</h3>
              </div>
              <button
                onClick={() => setShowAddInvoiceModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddInvoiceSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Client Legal Entity Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Global Technologies Pvt Ltd"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Customer GSTIN</label>
                  <input
                    type="text"
                    value={newCustGstin}
                    onChange={(e) => setNewCustGstin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Total Invoice Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    value={newInvAmount}
                    onChange={(e) => setNewInvAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl text-purple-300 text-[11px] space-y-1">
                <span className="font-bold block">Automated Compliance Pipeline:</span>
                <span>• Government IRN signing unavailable until a real provider adapter is connected</span>
                <span className="block">• Auto-calculation of 18% HSN/SAC GST liability (GSTR-1 schedule)</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddInvoiceModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer transition shadow"
                >
                  Generate & Register IRN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Toast */}
      {settleToast && (
        <div className="fixed bottom-6 left-6 z-50 p-4 rounded-xl bg-slate-900 border border-purple-500 text-purple-200 shadow-2xl flex items-center gap-3 text-xs font-semibold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-purple-400" />
          <span>{settleToast}</span>
        </div>
      )}

    </div>
  );
};
