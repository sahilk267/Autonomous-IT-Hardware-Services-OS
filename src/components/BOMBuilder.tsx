import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  FileText, 
  ArrowRight, 
  Send, 
  DollarSign, 
  ShieldAlert, 
  Layers, 
  Sliders, 
  Printer,
  ChevronDown,
  X
} from 'lucide-react';
import { BOMSolution, BOMItem, Quotation, ProductItem } from '../types';

const emptyBOMSolution: BOMSolution = {
  id: 'sol-blank',
  solutionName: 'New Architecture Solution',
  category: 'Custom Architecture',
  summary: 'Clean enterprise Bill of Materials canvas. Add hardware components, servers, or networking items.',
  compatibilityStatus: 'UNVERIFIED',
  compatibilityNotes: 'BOM is currently empty. Add catalog components or run AI architecting to evaluate compatibility.',
  recommendedMargin: 15,
  items: [],
  servicesIncluded: [],
  autonomousNextSteps: [
    'Add catalog products or run AI solution architecting to build BOM'
  ]
};

interface BOMBuilderProps {
  products: ProductItem[];
  onGenerateQuote: (solution: BOMSolution, customerName: string, customerGstin: string, discount: number) => void;
  onRequestTelegramApproval: (quote: Quotation) => void;
  isCleanSlate?: boolean;
}

export const BOMBuilder: React.FC<BOMBuilderProps> = ({
  products,
  onGenerateQuote,
  onRequestTelegramApproval
}) => {
  const [requirementText, setRequirementText] = useState('');
  const [officeSize, setOfficeSize] = useState('');
  const [budgetTier, setBudgetTier] = useState<'Standard' | 'Enterprise' | 'Premium'>('Enterprise');
  const [isGenerating, setIsGenerating] = useState(false);

  // Active solution state - always starts empty
  const [currentSolution, setCurrentSolution] = useState<BOMSolution>(emptyBOMSolution);

  // Client Details Modal & Negotiation
  const [customerName, setCustomerName] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [negotiationText, setNegotiationText] = useState('');
  const [negotiationResult, setNegotiationResult] = useState<string | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  // Add Component Modal State
  const [showAddComponentModal, setShowAddComponentModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [addComponentQty, setAddComponentQty] = useState(1);
  const [addComponentCustomPrice, setAddComponentCustomPrice] = useState<number>(0);

  // Financial calculations
  const totalCost = currentSolution.items.reduce((acc, i) => acc + (i.purchaseCost * i.qty), 0);
  const totalItemsSelling = currentSolution.items.reduce((acc, i) => acc + (i.sellingPrice * i.qty), 0);
  const totalServices = currentSolution.servicesIncluded.reduce((acc, s) => acc + s.price, 0);
  const grossSubtotal = totalItemsSelling + totalServices;
  const netSubtotal = Math.max(0, grossSubtotal - discountAmount);
  const grossProfit = netSubtotal - totalCost;
  const marginPercent = netSubtotal > 0 ? ((grossProfit / netSubtotal) * 100) : 0;
  const isMarginException = netSubtotal <= 0 || marginPercent < 12.0;

  // Handle AI BOM Generation via Server Endpoint
  const handleAIGenerateBOM = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai/bom-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: requirementText,
          officeSize,
          preference: budgetTier
        })
      });

      const resData = await response.json();
      if (resData.success && resData.data) {
        setCurrentSolution({
          ...resData.data,
          id: `sol-${Date.now()}`
        });
        setAiErrorMessage(null);
      } else {
        setAiErrorMessage(resData.error || 'Gemini AI is not available. Please assemble components manually from catalog or configure GEMINI_API_KEY in .env.');
      }
    } catch (err: any) {
      console.error('Error generating BOM:', err);
      setAiErrorMessage('Network or server error while generating AI BOM.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle AI Customer Negotiation
  const handleSimulateNegotiation = () => {
    const rawParsed = parseInt(negotiationText.replace(/[^0-9]/g, ''), 10);
    if (isNaN(rawParsed) || rawParsed <= 0) {
      setNegotiationResult('⚠️ Please enter a specific discount amount in rupees (e.g. "Customer requested ₹25,000 discount").');
      return;
    }
    if (grossSubtotal <= 0) {
      setNegotiationResult('⚠️ Cannot evaluate negotiation on an empty BOM. Please add hardware components first.');
      return;
    }
    const requestedDiscount = rawParsed;
    if (requestedDiscount >= grossSubtotal) {
      setNegotiationResult(`🚨 Discount cannot exceed total BOM subtotal of ₹${grossSubtotal.toLocaleString('en-IN')}.`);
      return;
    }
    const testSubtotal = grossSubtotal - requestedDiscount;
    const testProfit = testSubtotal - totalCost;
    const testMargin = testSubtotal > 0 ? (testProfit / testSubtotal) * 100 : 0;

    if (testMargin >= 12.0) {
      setDiscountAmount(requestedDiscount);
      setNegotiationResult(
        `✅ ACCEPTED BY PRICING RULES: Margin remains at ${testMargin.toFixed(1)}% (within authorized 12.0% floor rule). Discount of ₹${requestedDiscount.toLocaleString('en-IN')} applied.`
      );
    } else {
      setNegotiationResult(
        `🚨 MARGIN EXCEPTION (${testMargin.toFixed(1)}% < 12.0% floor): Discount of ₹${requestedDiscount.toLocaleString('en-IN')} requires explicit Business Owner approval.`
      );
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-6 h-6 text-indigo-400" />
            AI Solution / BOM & Compatibility Engine
          </h1>
          <p className="text-sm text-slate-400">
            Translates natural language IT requirements into validated enterprise Bill of Materials (BOM), margin limits, and professional quotations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuoteModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg transition cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            Generate Quotation Document
          </button>
        </div>
      </div>

      {aiErrorMessage && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-center justify-between shadow">
          <span>{aiErrorMessage}</span>
          <button onClick={() => setAiErrorMessage(null)} className="text-rose-400 hover:text-white font-bold ml-3 cursor-pointer">✕</button>
        </div>
      )}

      {/* Requirement Input Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Client Requirement Prompt
          </label>
          <span className="text-xs text-slate-400">AI Architect: Gemini 3.8 Flash + Hardware Rules Matrix</span>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={requirementText}
            onChange={(e) => setRequirementText(e.target.value)}
            placeholder="e.g. 50-person BPO call center with dual headgear, Core i5, managed network, firewall & 4-hr SLA"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />

          <div className="flex items-center gap-2">
            <div className="w-24">
              <input
                type="number"
                value={officeSize}
                onChange={(e) => setOfficeSize(e.target.value)}
                placeholder="Users"
                title="Number of Users/Desktops"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleAIGenerateBOM}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Architecting BOM...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Build Solution BOM</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick prompt presets */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto text-xs scrollbar-none">
          <span className="text-slate-500 font-mono text-[11px]">Presets:</span>
          {[
            '25-User FinTech Branch Setup',
            'PACS Hospital Radiology Server Cluster',
            'BPO Call Center with 50 VoIP Workstations',
            '4-Server Virtualization SAN Storage Cluster'
          ].map((preset) => (
            <button
              key={preset}
              onClick={() => {
                setRequirementText(preset);
                setOfficeSize(preset.includes('50') ? '50' : preset.includes('25') ? '25' : '4');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] whitespace-nowrap cursor-pointer transition border border-slate-700"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Compatibility & Architecture Assessment Banner */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md ${
        currentSolution.compatibilityStatus === 'VERIFIED_COMPATIBLE'
          ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
          : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
      }`}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Hardware Compatibility Engine Status:</span>
              <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 border border-emerald-700">
                {currentSolution.compatibilityStatus}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">{currentSolution.compatibilityNotes}</p>
          </div>
        </div>

        <div className="text-xs text-slate-400 shrink-0 font-mono bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
          Rule Checklist: <span className="text-emerald-400 font-bold">PSU 80% Cap ✓</span> • <span className="text-emerald-400 font-bold">PoE 370W Budget ✓</span> • <span className="text-emerald-400 font-bold">DDR5 Speed ✓</span>
        </div>
      </div>

      {/* Main Grid: BOM Items & Financial Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: BOM Table & Services */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Hardware Items Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Bill of Materials (Hardware & Licenses)
                </h3>
                <span className="text-xs text-slate-400">Total {currentSolution.items.length} line items specified</span>
              </div>
              <span className="text-xs font-mono text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800">
                {currentSolution.solutionName}
              </span>
            </div>

            {currentSolution.items.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Bill of Materials is Empty</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    No hardware or software line items added yet in Clean Slate mode. Use the AI prompt builder above or add catalog components manually.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddComponentModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Component</span>
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Item & Specifications</th>
                        <th className="py-3 px-3 text-center">Qty</th>
                        <th className="py-3 px-3 text-right">Unit Cost</th>
                        <th className="py-3 px-3 text-right">Selling Price</th>
                        <th className="py-3 px-3 text-right">Total Price</th>
                        <th className="py-3 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {currentSolution.items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{item.name}</div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">{item.specs}</div>
                            <div className="text-[10px] font-mono text-indigo-400 mt-0.5">
                              SKU: {item.sku} • HSN: {item.hsn} • {item.warrantyYears}Y Warranty
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold">
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value, 10) || 1;
                                const updated = [...currentSolution.items];
                                updated[idx].qty = newQty;
                                setCurrentSolution({ ...currentSolution, items: updated });
                              }}
                              className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-center text-white"
                            />
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400">
                            ₹{item.purchaseCost.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-200">
                            <input
                              type="number"
                              value={item.sellingPrice}
                              onChange={(e) => {
                                const newPrice = parseInt(e.target.value, 10) || 0;
                                const updated = [...currentSolution.items];
                                updated[idx].sellingPrice = newPrice;
                                setCurrentSolution({ ...currentSolution, items: updated });
                              }}
                              className="w-24 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-right text-emerald-400 font-bold"
                            />
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-white">
                            ₹{(item.sellingPrice * item.qty).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => {
                                const updated = currentSolution.items.filter((_, i) => i !== idx);
                                setCurrentSolution({ ...currentSolution, items: updated });
                              }}
                              className="p-1 hover:text-rose-400 text-slate-500 transition cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => setShowAddComponentModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition border border-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Add Component from Catalog</span>
                  </button>
                  <span className="text-[11px] font-mono text-slate-400">
                    Total Hardware Value: <strong className="text-emerald-400">₹{totalItemsSelling.toLocaleString('en-IN')}</strong>
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Services & SLA Add-ons */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-emerald-400" />
              Turnkey Deployment & AMC Services
            </h3>

            <div className="space-y-2.5">
              {currentSolution.servicesIncluded.map((srv, idx) => (
                <div key={srv.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <div>
                    <span className="font-semibold text-white block">{srv.name}</span>
                    <span className="text-[11px] text-emerald-400 font-mono">SLA Commitment: {srv.sla}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white text-sm">₹{srv.price.toLocaleString('en-IN')}</span>
                    <button
                      onClick={() => {
                        const updated = currentSolution.servicesIncluded.filter((_, i) => i !== idx);
                        setCurrentSolution({ ...currentSolution, servicesIncluded: updated });
                      }}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Autonomous Next Steps */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-xs">
            <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] block mb-2">
              Autonomous Operating Actions Triggered:
            </span>
            <ul className="space-y-1.5 text-slate-400">
              {currentSolution.autonomousNextSteps.map((step, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Col: Margin Engine & Negotiation Simulator */}
        <div className="space-y-6">
          
          {/* Smart Margin & Pricing Engine */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Pricing & Margin Engine
              </span>
              <span className="text-[11px] font-mono text-slate-400">Policy: Min 12.0%</span>
            </h3>

            {/* Financial Breakdown */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Total Procurement Cost:</span>
                <span className="font-mono text-slate-200">₹{totalCost.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Gross Selling Value:</span>
                <span className="font-mono text-slate-200">₹{grossSubtotal.toLocaleString('en-IN')}</span>
              </div>

              {/* Discount Slider */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-semibold">Customer Concession / Discount:</span>
                  <span className="font-mono font-bold text-amber-400">₹{discountAmount.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200000"
                  step="5000"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-between text-slate-300 font-semibold pt-2 border-t border-slate-800">
                <span>Net Billing Subtotal:</span>
                <span className="font-mono text-white text-sm">₹{netSubtotal.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>GST (18% Applicable):</span>
                <span className="font-mono text-slate-300">₹{Math.round(netSubtotal * 0.18).toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-white font-bold text-base pt-2 border-t border-slate-800">
                <span>Grand Total (With GST):</span>
                <span className="font-mono text-emerald-400">
                  ₹{Math.round(netSubtotal * 1.18).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Margin Health Meter */}
            <div className={`p-4 rounded-xl border ${
              isMarginException
                ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
            }`}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-bold text-xs">Realized Gross Margin:</span>
                <span className="font-mono font-extrabold text-base">{marginPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    isMarginException ? 'bg-rose-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, marginPercent * 4))}%` }}
                ></div>
              </div>

              {isMarginException ? (
                <div className="mt-2.5 text-[11px] text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    <strong>OWNER APPROVAL REQUIRED:</strong> Margin is below 12.0% floor rule. This quote cannot be dispatched without Telegram authorization.
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 text-[11px] text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Within autonomous sales limits. Auto-approved for customer dispatch.</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => onGenerateQuote(currentSolution, customerName, customerGstin, discountAmount)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {isMarginException ? 'Submit to Telegram for Owner Approval' : 'Dispatch Quotation to Customer'}
              </button>
            </div>
          </div>

          {/* AI Customer Negotiation Simulator */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Autonomous Negotiation Simulator
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Test how the AI Sales Agent responds when a customer counter-offers a price reduction.
            </p>

            <div className="space-y-2">
              <input
                type="text"
                value={negotiationText}
                onChange={(e) => setNegotiationText(e.target.value)}
                placeholder="e.g. Can you give flat ₹1,00,000 discount for 25 units?"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={handleSimulateNegotiation}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                Run AI Negotiation Check
              </button>

              {negotiationResult && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-line mt-2">
                  {negotiationResult}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Professional Quotation PDF Modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-4xl w-full p-8 shadow-2xl relative my-8 font-sans">
            
            {/* Modal Top Actions */}
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-xs font-bold">
                  COMMERCIAL PROPOSAL & BOM
                </span>
                <span className="text-xs text-slate-500">Ref: QT-{Date.now().toString().slice(-6)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button
                  onClick={() => setShowQuoteModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Letterhead */}
            <div className="flex justify-between items-start pb-6 border-b">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">APEX SYSTEMS & SOLUTIONS PVT LTD</h2>
                <p className="text-xs text-slate-600 mt-1">
                  Technology Centre, BKC, Bandra East, Mumbai - 400051<br />
                  GSTIN: 27AAACA9823P1Z9 • State Code: 27 (Maharashtra)<br />
                  Email: enterprise@apexsystems.in • Phone: +91 22 6120 8800
                </p>
              </div>
              <div className="text-right text-xs">
                <div className="font-bold text-base text-blue-700">TAX QUOTATION</div>
                <div className="text-slate-600">Date: {new Date().toLocaleDateString('en-GB')}</div>
                <div className="text-slate-600">Validity: 14 Days from issuance</div>
              </div>
            </div>

            {/* Customer Details */}
            <div className="grid grid-cols-2 gap-4 py-4 border-b text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px]">QUOTED TO:</span>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{customerName}</div>
                <div className="text-slate-600">GSTIN: {customerGstin}</div>
                <div className="text-slate-600">Address: Level 5, Trade Hub, BKC, Mumbai</div>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-500 uppercase text-[10px]">SOLUTION ARCHITECTURE:</span>
                <div className="font-bold text-slate-900 mt-0.5">{currentSolution.solutionName}</div>
                <div className="text-slate-600">Deployment SLA: Within 48 Hours of PO</div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-4">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Item Description</th>
                    <th className="py-2 px-2 text-center">HSN</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Unit Rate</th>
                    <th className="py-2 px-3 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-800">
                  {currentSolution.items.map((item, i) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-950">{item.name}</div>
                        <div className="text-[11px] text-slate-600">{item.specs}</div>
                      </td>
                      <td className="py-2 px-2 text-center font-mono">{item.hsn}</td>
                      <td className="py-2 px-2 text-center font-bold">{item.qty}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{item.sellingPrice.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-bold font-mono">₹{(item.sellingPrice * item.qty).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {currentSolution.servicesIncluded.map((s, i) => (
                    <tr key={s.id} className="bg-slate-50">
                      <td className="py-2 px-3 text-slate-500">{currentSolution.items.length + i + 1}</td>
                      <td className="py-2 px-3 font-semibold text-blue-900">{s.name} ({s.sla})</td>
                      <td className="py-2 px-2 text-center font-mono">998313</td>
                      <td className="py-2 px-2 text-center font-bold">1</td>
                      <td className="py-2 px-3 text-right font-mono">₹{s.price.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-right font-bold font-mono">₹{s.price.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Tax Table */}
            <div className="flex justify-end pt-2 border-t">
              <div className="w-72 space-y-1.5 text-xs text-right">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Value:</span>
                  <span className="font-mono font-bold">₹{grossSubtotal.toLocaleString('en-IN')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount / Concession:</span>
                    <span className="font-mono font-bold">-₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-bold pt-1 border-t">
                  <span>Taxable Subtotal:</span>
                  <span className="font-mono">₹{netSubtotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>CGST @ 9%:</span>
                  <span className="font-mono">₹{Math.round(netSubtotal * 0.09).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST @ 9%:</span>
                  <span className="font-mono">₹{Math.round(netSubtotal * 0.09).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-slate-950 pt-2 border-t border-slate-900">
                  <span>Invoice Amount:</span>
                  <span className="font-mono text-blue-700">₹{Math.round(netSubtotal * 1.18).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Terms & Bank Details */}
            <div className="mt-8 pt-4 border-t text-[10px] text-slate-500 grid grid-cols-2 gap-4">
              <div>
                <strong>Terms & Conditions:</strong><br />
                1. 50% Advance along with formal Purchase Order, 50% upon physical delivery & verification.<br />
                2. OEM Hardware Warranty: 3 Years onsite direct from Dell & Cisco.<br />
                3. Deliveries subject to Mumbai Jurisdiction.
              </div>
              <div className="text-right">
                <strong>Bank NEFT Details:</strong><br />
                Account Name: Apex Systems & Solutions Pvt Ltd<br />
                Bank: HDFC Bank Ltd • Branch: BKC Complex, Mumbai<br />
                A/C No: 50200088992211 • IFSC: HDFC0000060
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Add Component Modal */}
      {showAddComponentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Add Component to BOM
              </h3>
              <button 
                onClick={() => setShowAddComponentModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select from Catalog</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const p = products.find(prod => prod.id === e.target.value);
                    if (p) setAddComponentCustomPrice(p.sellingPrice);
                  }}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  {products.length === 0 ? (
                    <option value="" className="bg-slate-900">No products in catalog</option>
                  ) : (
                    products.map(p => (
                      <option key={p.id} value={p.id} className="bg-slate-900">
                        {p.name} ({p.sku}) - ₹{p.sellingPrice.toLocaleString('en-IN')}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={addComponentQty}
                    onChange={(e) => setAddComponentQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    value={addComponentCustomPrice || products.find(p => p.id === selectedProductId)?.sellingPrice || 0}
                    onChange={(e) => setAddComponentCustomPrice(parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowAddComponentModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const prod = products.find(p => p.id === selectedProductId) || products[0];
                    if (!prod) {
                      setAiErrorMessage("Please select or add a catalog product before adding to BOM.");
                      return;
                    }
                    const newItem: BOMItem = {
                      id: `bi-${Date.now()}`,
                      category: prod.category as any,
                      sku: prod.sku,
                      name: prod.name,
                      brand: prod.brand,
                      specs: prod.specs,
                      qty: addComponentQty,
                      purchaseCost: prod.purchaseCost,
                      sellingPrice: addComponentCustomPrice || prod.sellingPrice,
                      warrantyYears: prod.warrantyYears,
                      hsn: prod.hsn,
                      gstPercent: prod.gstPercent
                    };
                    setCurrentSolution({
                      ...currentSolution,
                      items: [...currentSolution.items, newItem]
                    });
                    setShowAddComponentModal(false);
                    setAddComponentQty(1);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer shadow"
                >
                  Insert into BOM
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
