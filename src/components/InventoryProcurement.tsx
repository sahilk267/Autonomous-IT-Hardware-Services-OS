import React, { useState } from 'react';
import { 
  Package, 
  AlertCircle, 
  Search, 
  Filter, 
  TrendingDown, 
  Truck, 
  ShieldCheck, 
  FileCheck, 
  CheckCircle2, 
  Send, 
  ArrowRight,
  RefreshCw,
  Building,
  Layers,
  Plus,
  X
} from 'lucide-react';
import { ProductItem, SupplierInfo, RFQItem } from '../types';

interface InventoryProcurementProps {
  products: ProductItem[];
  suppliers: SupplierInfo[];
  rfqs: RFQItem[];
  onDispatchPO: (rfqId: string, supplierId: string) => void;
  onAddProduct?: (newProduct: ProductItem) => void;
  onCreateRFQ?: (newRfq: RFQItem) => void;
  isCleanSlate?: boolean;
}

export const InventoryProcurement: React.FC<InventoryProcurementProps> = ({
  products,
  suppliers,
  rfqs,
  onDispatchPO,
  onAddProduct,
  onCreateRFQ,
  isCleanSlate = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'inventory' | 'rfqs' | 'deadstock'>('inventory');
  const [dispatchedPOs, setDispatchedPOs] = useState<Record<string, string>>({});

  // Add Product Modal State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('Dell');
  const [newProdCat, setNewProdCat] = useState<ProductItem['category']>('Desktop');
  const [newProdSpecs, setNewProdSpecs] = useState('');
  const [newProdCost, setNewProdCost] = useState('45000');
  const [newProdPrice, setNewProdPrice] = useState('52000');
  const [newProdQty, setNewProdQty] = useState('10');
  const [newProdLocation, setNewProdLocation] = useState('Mumbai Hub (Rack A-12)');

  // Create RFQ Modal State
  const [showNewRfqModal, setShowNewRfqModal] = useState(false);
  const [newRfqName, setNewRfqName] = useState('');
  const [newRfqSku, setNewRfqSku] = useState('');
  const [newRfqQty, setNewRfqQty] = useState('5');
  const [newRfqUrgency, setNewRfqUrgency] = useState<'CRITICAL' | 'STANDARD'>('CRITICAL');

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handlePOAction = (rfqId: string, supplierId: string) => {
    setDispatchedPOs({ ...dispatchedPOs, [rfqId]: supplierId });
    onDispatchPO(rfqId, supplierId);
  };

  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim()) return;

    const cost = parseInt(newProdCost, 10) || 0;
    const price = parseInt(newProdPrice, 10) || 0;
    const qty = parseInt(newProdQty, 10) || 1;

    const newProd: ProductItem = {
      id: `prod-${Date.now()}`,
      sku: newProdSku.trim().toUpperCase(),
      name: newProdName.trim(),
      brand: newProdBrand,
      category: newProdCat,
      specs: newProdSpecs.trim() || 'Standard enterprise hardware specification',
      purchaseCost: cost,
      marketPrice: price + 2000,
      sellingPrice: price,
      minPrice: cost + 1000,
      targetMarginPercent: 15,
      stockAvailable: qty,
      stockReserved: 0,
      warehouseLocation: newProdLocation,
      hsn: '84713010',
      gstPercent: 18,
      warrantyYears: 3,
      serialTrackingRequired: true
    };

    if (onAddProduct) {
      onAddProduct(newProd);
    }
    setShowAddProductModal(false);
    setNewProdName('');
    setNewProdSku('');
    setNewProdSpecs('');
  };

  const handleCreateRfqSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRfqName.trim()) return;

    const qty = parseInt(newRfqQty, 10) || 1;
    const estimatedCost = 35000;

    const newRfq: RFQItem = {
      id: `rfq-${Date.now().toString().slice(-4)}`,
      productName: newRfqName.trim(),
      requiredQty: qty,
      urgency: newRfqUrgency,
      status: 'OPEN',
      supplierQuotes: [
        {
          supplierId: 'sup-1',
          supplierName: 'Redington India Ltd',
          unitCost: estimatedCost,
          leadTimeDays: 2,
          inStock: true,
          recommended: true
        },
        {
          supplierId: 'sup-2',
          supplierName: 'Ingram Micro India',
          unitCost: estimatedCost + 1200,
          leadTimeDays: 1,
          inStock: true,
          recommended: false
        }
      ]
    };

    if (onCreateRFQ) {
      onCreateRFQ(newRfq);
    }
    setShowNewRfqModal(false);
    setNewRfqName('');
    setNewRfqSku('');
  };

  // Dynamic KPI calculation
  const totalPhysicalStockValue = products.reduce((acc, p) => acc + (p.purchaseCost * p.stockAvailable), 0);
  const totalReservedStockValue = products.reduce((acc, p) => acc + (p.purchaseCost * p.stockReserved), 0);
  const activeShortagesCount = rfqs.length;

  const formattedStockValue = isCleanSlate && products.length === 0
    ? '₹0.00'
    : `₹${(totalPhysicalStockValue / 100000).toFixed(2)} Lakhs`;

  const formattedReservedValue = isCleanSlate && products.length === 0
    ? '₹0.00'
    : `₹${(totalReservedStockValue / 100000).toFixed(2)} Lakhs`;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-400" />
            Inventory & Autonomous Procurement RFQ Engine
          </h1>
          <p className="text-sm text-slate-400">
            Real-time multi-warehouse serialized stock tracking, automated shortage replenishment, and distributor RFQ comparison.
          </p>
        </div>

        {/* Sub-Navigation */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTab === 'inventory' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Warehouse Stock ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('rfqs')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rfqs' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Autonomous RFQs</span>
            <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
              {rfqs.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('deadstock')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeTab === 'deadstock' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Dead Stock Engine
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Total Physical Stock Value</span>
          <div className="text-xl font-bold text-white mt-1">{formattedStockValue}</div>
          <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <span>{isCleanSlate && products.length === 0 ? 'Awaiting Inward Stock' : 'Across Mumbai & Pune Hubs'}</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Reserved for Open Orders</span>
          <div className="text-xl font-bold text-amber-400 mt-1">{formattedReservedValue}</div>
          <div className="text-xs text-slate-400 mt-1">{isCleanSlate && products.length === 0 ? '0 Open Commitments' : 'Allocated capacity reserved'}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Active Shortages / RFQs</span>
          <div className="text-xl font-bold text-rose-400 mt-1">{activeShortagesCount} Replenishments</div>
          <div className="text-xs text-slate-400 mt-1">{activeShortagesCount === 0 ? 'No Critical Shortages' : 'Awaiting PO dispatch'}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Top Distributor Rating</span>
          <div className="text-xl font-bold text-sky-400 mt-1">Redington India (96%)</div>
          <div className="text-xs text-slate-400 mt-1">0.3% Defect • 2-Day Delivery SLA</div>
        </div>
      </div>

      {/* Tab 1: Warehouse Inventory */}
      {activeTab === 'inventory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search SKU, brand, model, specs..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => setShowAddProductModal(true)}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Inward Stock</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-none">
              {['ALL', 'Desktop', 'Laptop', 'Networking', 'Server', 'Power', 'Peripheral'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
                    selectedCategory === cat
                      ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white bg-slate-950/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Table or Empty State */}
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <Package className="w-12 h-12 text-slate-600 mx-auto" />
              <h4 className="font-bold text-white text-sm">No Inventory Records</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {products.length === 0
                  ? 'Inventory is empty in Clean Slate mode. Inward your first enterprise hardware SKU to begin tracking.'
                  : 'No hardware matches the selected category filter or search query.'}
              </p>
              <button
                onClick={() => setShowAddProductModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Inward First Stock Record</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Product Details & Specs</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-right">Cost</th>
                    <th className="py-3 px-3 text-right">Selling</th>
                    <th className="py-3 px-3 text-right">Margin %</th>
                    <th className="py-3 px-3 text-center">Available</th>
                    <th className="py-3 px-3 text-center">Reserved</th>
                    <th className="py-3 px-4">Warehouse Location</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredProducts.map((p) => {
                    const margin = (((p.sellingPrice - p.purchaseCost) / p.sellingPrice) * 100).toFixed(1);
                    const isLowStock = p.stockAvailable <= 3;
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{p.name}</div>
                          <div className="text-[11px] text-slate-400 line-clamp-1">{p.specs}</div>
                          <div className="font-mono text-[10px] text-indigo-400 mt-0.5">
                            SKU: {p.sku} • HSN: {p.hsn}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                          ₹{p.purchaseCost.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-white">
                          ₹{p.sellingPrice.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-400 font-semibold">
                          {margin}%
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold">
                          <span className={isLowStock ? 'text-rose-400' : 'text-emerald-400'}>
                            {p.stockAvailable}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-amber-400">
                          {p.stockReserved}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px] font-mono">
                          {p.warehouseLocation}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {p.stockAvailable === 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold text-[10px]">
                              OUT OF STOCK
                            </span>
                          ) : isLowStock ? (
                            <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold text-[10px]">
                              LOW STOCK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-[10px]">
                              HEALTHY
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Autonomous RFQ Comparison Matrix */}
      {activeTab === 'rfqs' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-400" />
                Autonomous RFQ Dispatch & Multi-Distributor Comparison
              </h3>
              <button
                onClick={() => setShowNewRfqModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                <span>+ Raise Autonomous RFQ</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              When safety stock thresholds breach, the platform automatically requests commercial quotes from authorized national distributors (Redington, Ingram Micro, Savex) and scores them based on Price, Lead Time, and RMA reliability.
            </p>

            {rfqs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <RefreshCw className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="font-bold text-white text-sm">No Active RFQs in Queue</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  All inventory items are currently above their safety stock minimums, or you are in Clean Slate mode.
                </p>
                <button
                  onClick={() => setShowNewRfqModal(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition"
                >
                  Create Custom RFQ
                </button>
              </div>
            ) : (

            <div className="space-y-6">
              {rfqs.map((rfq) => {
                const poStatus = dispatchedPOs[rfq.id];
                return (
                  <div key={rfq.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <span className="text-xs font-mono text-emerald-400 font-bold">RFQ REF: {rfq.id.toUpperCase()}</span>
                        <h4 className="font-bold text-sm text-white">{rfq.productName}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono text-xs">
                          Required: {rfq.requiredQty} Units
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono text-xs font-bold">
                          Urgency: {rfq.urgency}
                        </span>
                      </div>
                    </div>

                    {/* Distributor Quotes Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
                      {rfq.supplierQuotes.map((sq) => {
                        const isRecommended = sq.recommended;
                        const isChosen = poStatus === sq.supplierId;
                        return (
                          <div
                            key={sq.supplierId}
                            className={`p-3.5 rounded-xl border relative ${
                              isRecommended
                                ? 'bg-emerald-950/30 border-emerald-500/60'
                                : 'bg-slate-900 border-slate-800'
                            }`}
                          >
                            {isRecommended && (
                              <span className="absolute -top-2.5 right-3 px-2 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] uppercase tracking-wider">
                                AI Best Total Value
                              </span>
                            )}

                            <div className="font-bold text-white text-xs mb-1">{sq.supplierName}</div>
                            
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between text-slate-400">
                                <span>Unit Rate:</span>
                                <span className="font-mono font-bold text-white">₹{sq.unitCost.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Lead Time:</span>
                                <span className="font-mono text-emerald-400 font-semibold">{sq.leadTimeDays} Days</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>Availability:</span>
                                <span className={sq.inStock ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
                                  {sq.inStock ? 'Immediate Dispatch' : 'Backordered'}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-slate-800/80">
                              {isChosen ? (
                                <div className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 font-bold text-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  PO #PO-902 Dispatched
                                </div>
                              ) : (
                                <button
                                  onClick={() => handlePOAction(rfq.id, sq.supplierId)}
                                  className={`w-full py-1.5 rounded-lg font-semibold text-xs cursor-pointer transition ${
                                    isRecommended
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                  }`}
                                >
                                  {isRecommended ? '1-Click Approve PO' : 'Select Distributor'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        <strong>3-Way Match Guarantee:</strong> Once delivered, platform automatically reconciles Purchase Order vs Goods Received Note (GRN) vs Vendor Tax Invoice before initiating settlement.
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Tab 3: Dead Stock Liquidator */}
      {activeTab === 'deadstock' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-amber-400" />
              Dead Stock & Inventory Aging Intelligence
            </h3>
            <span className="text-xs font-mono text-amber-400 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-800">
              Aging Threshold &gt; 90 Days
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            AI detects slow-moving enterprise inventory to recommend automated liquidation strategies: bundling with high-margin laptops, reseller clearance discount, or OEM return credit.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-white">Seagate IronWolf Pro 8TB Enterprise NAS HDD</h4>
                  <span className="text-xs text-slate-400 font-mono">Stock Age: 112 Days • 6 Units in Stock</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono text-xs">Low Velocity</span>
              </div>
              <div className="text-xs text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-800">
                <strong className="text-sky-400">AI Recommendation:</strong> Bundle 2 units with every Dell PowerEdge R760 Server deal at 8% concession to clear capital and prevent depreciation.
              </div>
              <button 
                onClick={() => alert("Autonomous Bundle Promotion Created: 8TB HDD now auto-suggested in Server BOMs.")}
                className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs cursor-pointer transition"
              >
                Apply Bundle Rule to Server Deals
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-white">Kingston 32GB DDR4 3200MHz ECC Server RAM</h4>
                  <span className="text-xs text-slate-400 font-mono">Stock Age: 98 Days • 10 Units in Stock</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-mono text-xs">Tech Transition</span>
              </div>
              <div className="text-xs text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-800">
                <strong className="text-sky-400">AI Recommendation:</strong> Flash offer to 4 existing AMC clients running older Gen14 servers before Q3 closing.
              </div>
              <button 
                onClick={() => alert("Campaign Dispatched: WhatsApp flash offer sent to 4 eligible server AMC clients.")}
                className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs cursor-pointer transition"
              >
                Trigger Targeted AMC Customer Outreach
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inward New Stock / Register Product */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span>Inward Inventory SKU / Asset</span>
              </h3>
              <button
                onClick={() => setShowAddProductModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Product Description / Model</label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="e.g. Lenovo ThinkPad T14 Gen 4 Intel Core i7"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">SKU Code</label>
                  <input
                    type="text"
                    required
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    placeholder="e.g. LNV-TP-T14-G4"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Brand</label>
                  <input
                    type="text"
                    required
                    value={newProdBrand}
                    onChange={(e) => setNewProdBrand(e.target.value)}
                    placeholder="e.g. Lenovo"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={newProdCat}
                    onChange={(e) => setNewProdCat(e.target.value as ProductItem['category'])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Laptop">Laptop</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Server">Server</option>
                    <option value="Networking">Networking</option>
                    <option value="Power">Power / UPS</option>
                    <option value="Storage">Storage / NAS</option>
                    <option value="Peripheral">Peripheral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Warehouse Location</label>
                  <input
                    type="text"
                    value={newProdLocation}
                    onChange={(e) => setNewProdLocation(e.target.value)}
                    placeholder="e.g. Mumbai Hub (Rack A-12)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Technical Specs</label>
                <input
                  type="text"
                  value={newProdSpecs}
                  onChange={(e) => setNewProdSpecs(e.target.value)}
                  placeholder="e.g. Core i7-1365U, 16GB RAM, 512GB NVMe SSD, Win 11 Pro"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    required
                    value={newProdCost}
                    onChange={(e) => setNewProdCost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Inward Qty</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newProdQty}
                    onChange={(e) => setNewProdQty(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Save Inward Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Autonomous RFQ */}
      {showNewRfqModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                <span>Raise Autonomous Procurement RFQ</span>
              </h3>
              <button
                onClick={() => setShowNewRfqModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRfqSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Product Description</label>
                <input
                  type="text"
                  required
                  value={newRfqName}
                  onChange={(e) => setNewRfqName(e.target.value)}
                  placeholder="e.g. Cisco CBS350-24T-4G Managed Gigabit Switch"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">SKU / Model Ref</label>
                <input
                  type="text"
                  value={newRfqSku}
                  onChange={(e) => setNewRfqSku(e.target.value)}
                  placeholder="e.g. CBS350-24T-4G-IN"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Required Units</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newRfqQty}
                    onChange={(e) => setNewRfqQty(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Replenishment Urgency</label>
                  <select
                    value={newRfqUrgency}
                    onChange={(e) => setNewRfqUrgency(e.target.value as 'CRITICAL' | 'STANDARD')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="CRITICAL">Critical (Within 24h)</option>
                    <option value="STANDARD">Standard (3-5 Days)</option>
                  </select>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                On dispatch, this RFQ is immediately transmitted via EDI & API to Redington, Ingram Micro, and Savex for real-time price matching.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewRfqModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  Dispatch RFQ to Distributors
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
