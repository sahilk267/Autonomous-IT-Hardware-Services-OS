import React, { useState, useEffect } from 'react';
import { 
  Laptop, 
  ShieldCheck, 
  TrendingDown, 
  Calendar, 
  UserCheck, 
  UserX, 
  CheckCircle2, 
  AlertTriangle, 
  QrCode, 
  RefreshCw, 
  DollarSign, 
  Server, 
  Wrench, 
  Layers,
  Sparkles,
  Plus,
  Truck,
  FileText,
  ArrowRight,
  ShieldAlert,
  Copy,
  Check,
  X
} from 'lucide-react';
import { AssetItem, SoftwareLicense, AMCContract, RMAClaim, CustomerAccount } from '../types';

interface AssetAMCManagerProps {
  customers: CustomerAccount[];
  assets: AssetItem[];
  licenses: SoftwareLicense[];
  amcs: AMCContract[];
  rmaClaims: RMAClaim[];
  onCreateRMA: (claim: Pick<RMAClaim, 'assetTag' | 'faultSymptom'>) => Promise<RMAClaim | null>;
  onUpdateRMA: (id: string, updates: Partial<RMAClaim>) => Promise<RMAClaim | null>;
  onReclaimLicenses: (licenseId: string) => void;
  onUpdateAssetStatus: (assetId: string, status: AssetItem['status']) => void;
  fieldEngineers: { id: string; name: string; username: string }[];
  canManageAssignments: boolean;
  onAssignAsset: (assetId: string, assignedUserId: string | null) => void;
  onExecuteJML: (type: 'JOINER' | 'LEAVER', employeeName: string) => void;
  onAddAsset?: (asset: AssetItem) => void;
  onAddAMC?: (amc: AMCContract) => void;
  isCleanSlate?: boolean;
}

export const AssetAMCManager: React.FC<AssetAMCManagerProps> = ({
  customers,
  assets,
  licenses,
  amcs,
  rmaClaims,
  onCreateRMA,
  onUpdateRMA,
  onReclaimLicenses,
  onUpdateAssetStatus,
  fieldEngineers,
  canManageAssignments,
  onAssignAsset,
  onExecuteJML,
  onAddAsset,
  onAddAMC
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ASSETS' | 'LICENSES' | 'AMC' | 'JML' | 'RMA'>('ASSETS');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // RMA State - starts empty
  const [showNewRmaModal, setShowNewRmaModal] = useState(false);
  const [newRmaAssetTag, setNewRmaAssetTag] = useState(assets[0]?.assetTag || '');
  const [newRmaSymptom, setNewRmaSymptom] = useState('');
  const [newRmaCourier, setNewRmaCourier] = useState('');
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  // Asset Registration Modal State
  const [showAddAssetModal, setShowAddAssetModal] = useState(false);
  const [newAssetCustomerId, setNewAssetCustomerId] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetTag, setNewAssetTag] = useState('');
  const [newAssetSerial, setNewAssetSerial] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState<AssetItem['category']>('Laptop');
  const [newAssetBrand, setNewAssetBrand] = useState('');
  const [newAssetModel, setNewAssetModel] = useState('');
  const [newAssetUser, setNewAssetUser] = useState('');
  const [newAssetDept, setNewAssetDept] = useState('IT Operations');
  const [newAssetLocation, setNewAssetLocation] = useState('');
  const [newAssetCost, setNewAssetCost] = useState('');
  const [newAssetWarranty, setNewAssetWarranty] = useState('');

  // AMC Modal State
  const [showAddAmcModal, setShowAddAmcModal] = useState(false);
  const [newAmcCustomerId, setNewAmcCustomerId] = useState('');
  const [newAmcType, setNewAmcType] = useState<AMCContract['type']>('COMPREHENSIVE');
  const [newAmcDeviceCount, setNewAmcDeviceCount] = useState('1');
  const [newAmcAnnualValue, setNewAmcAnnualValue] = useState('');
  const [newAmcSlaHours, setNewAmcSlaHours] = useState('4');

  const handleAddAmcSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const customer = customers.find(c => c.id === newAmcCustomerId);
    if (!customer) return;

    const newAmc: AMCContract = {
      id: `amc-${Date.now()}`,
      contractNumber: `AMC-${Date.now().toString().slice(-6)}`,
      customerId: customer.id,
      clientName: customer.name,
      type: newAmcType,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      deviceCount: parseInt(newAmcDeviceCount, 10) || 1,
      annualValue: parseInt(newAmcAnnualValue, 10) || 0,
      slaResponseHours: parseInt(newAmcSlaHours, 10) || 4,
      status: 'ACTIVE',
      nextPMDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    if (onAddAMC) {
      onAddAMC(newAmc);
    }
    setShowAddAmcModal(false);
    setNewAmcCustomerId('');
  };

  const handleAddAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName || !newAssetTag || !newAssetCustomerId) return;

    const newAsset: AssetItem = {
      customerId: newAssetCustomerId,
      id: `ast-${Date.now()}`,
      assetTag: newAssetTag.toUpperCase(),
      serialNumber: newAssetSerial.trim() || 'UNTRACKED',
      name: newAssetName,
      category: newAssetCategory,
      brand: newAssetBrand,
      model: newAssetModel || newAssetName,
      assignedUser: newAssetUser,
      department: newAssetDept,
      location: newAssetLocation,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchaseCost: parseInt(newAssetCost, 10) || 0,
      warrantyExpiresAt: newAssetWarranty,
      status: newAssetUser.includes('Unassigned') ? 'AVAILABLE_IN_STOCK' : 'IN_USE'
    };

    if (onAddAsset) {
      onAddAsset(newAsset);
    }
    setShowAddAssetModal(false);
    setNewAssetCustomerId('');
    setNewAssetName('');
    setNewAssetTag('');
    setNewAssetSerial('');
    setNewAssetModel('');
  };

  // JML Modal / Form
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [jmlEmployeeName, setJmlEmployeeName] = useState('');
  const [jmlRole, setJmlRole] = useState('');
  const [jmlDept, setJmlDept] = useState('Engineering');

  const filteredAssets = assets.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          a.assetTag.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          a.assignedUser.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || a.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const totalAssetValue = assets.reduce((acc, a) => acc + a.purchaseCost, 0);
  const totalWastedLicenseSpend = licenses.reduce((acc, l) => acc + l.annualWastedSpend, 0);

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Laptop className="w-6 h-6 text-emerald-400" />
            Enterprise Asset Management, SaaS License & AMC Hub
          </h1>
          <p className="text-sm text-slate-400">
            Serialized asset tracking, SaaS ghost seat reclamation, AMC renewal scheduling, and Joiner/Mover/Leaver (JML) workflows.
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setActiveSubTab('ASSETS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'ASSETS'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            Assets Lifecycle
          </button>
          <button
            onClick={() => setActiveSubTab('LICENSES')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'LICENSES'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            SaaS Cost Optimizer
          </button>
          <button
            onClick={() => setActiveSubTab('AMC')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'AMC'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            AMC & Maintenance
          </button>
          <button
            onClick={() => setActiveSubTab('JML')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'JML'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
            Joiner / Leaver (JML)
          </button>
          <button
            onClick={() => setActiveSubTab('RMA')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'RMA'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-rose-400" />
            Warranty & RMA Claims
          </button>
        </div>
      </div>

      {noticeBanner && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-emerald-200 text-xs flex items-center justify-between shadow">
          <span>{noticeBanner}</span>
          <button onClick={() => setNoticeBanner(null)} className="text-emerald-400 hover:text-white font-bold ml-3 cursor-pointer">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Total Tracked Asset Value</span>
          <div className="text-xl font-bold text-white mt-1">₹{(totalAssetValue / 100000).toFixed(2)} Lakhs</div>
          <div className="text-xs text-emerald-400 mt-1">{assets.length} Serialized CIs in CMDB</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Identified SaaS Waste</span>
          <div className="text-xl font-bold text-amber-400 mt-1">₹{(totalWastedLicenseSpend / 100000).toFixed(2)} Lakhs/yr</div>
          <div className="text-xs text-slate-400 mt-1">
            {licenses.reduce((acc, l) => acc + (l.totalPurchased - l.currentlyAssigned), 0) > 0
              ? `${licenses.reduce((acc, l) => acc + (l.totalPurchased - l.currentlyAssigned), 0)} Inactive Ghost Seats`
              : 'Zero Unassigned Seats'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Active AMC Contracts</span>
          <div className="text-xl font-bold text-cyan-400 mt-1">{amcs.length} Enterprise AMCs</div>
          <div className="text-xs text-emerald-400 mt-1">
            {amcs.length > 0 ? 'Preventive Maintenance Scheduled' : 'No Active AMCs'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400 uppercase font-mono">Spare Pool Readiness</span>
          <div className="text-xl font-bold text-slate-200 mt-1">
            {assets.filter(a => a.status === 'IN_INVENTORY' || a.status === 'AVAILABLE').length} Available
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {assets.length > 0 ? 'Rapid Hardware Swap Buffer' : 'No Spares Enrolled'}
          </div>
        </div>
      </div>

      {/* VIEW 1: ASSETS LIFECYCLE */}
      {activeSubTab === 'ASSETS' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Asset Tag, Serial, User..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => setShowAddAssetModal(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Asset</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {['ALL', 'Workstation', 'Laptop', 'Switch', 'UPS'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
                    selectedCategory === cat
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Assets Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {filteredAssets.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <Laptop className="w-12 h-12 text-slate-600 mx-auto" />
                <h4 className="font-bold text-white text-sm">No Enterprise Assets Found</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {assets.length === 0
                    ? 'Asset CMDB is currently empty in Clean Slate mode. Register your first serialized hardware asset.'
                    : 'No hardware assets match the selected category filter or search query.'}
                </p>
                <button
                  onClick={() => setShowAddAssetModal(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register First Asset</span>
                </button>
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Asset Tag & Serial</th>
                    <th className="py-3 px-4">Hardware Item</th>
                    <th className="py-3 px-4">Assigned User & Dept</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Purchase Cost</th>
                    <th className="py-3 px-4">Warranty Expiry</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-emerald-400 flex items-center gap-1">
                          <QrCode className="w-3.5 h-3.5" />
                          {asset.assetTag}
                        </div>
                        <div className="text-[10px] text-slate-500">{asset.serialNumber}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{asset.name}</div>
                        <div className="text-slate-400 text-[11px]">{asset.model}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">{asset.assignedUser}</div>
                        <div className="text-[10px] text-slate-500">{asset.department}</div>
                        {canManageAssignments && (
                          <label className="block mt-1 text-[10px] text-slate-400">
                            Assigned service engineer
                            <select aria-label={`Engineer assigned to asset ${asset.assetTag}`}
                              value={asset.assignedUserId || ''}
                              onChange={e => onAssignAsset(asset.id, e.target.value || null)}
                              className="block w-full mt-1 bg-slate-950 border border-slate-700 p-1 rounded text-xs text-white">
                              <option value="">Unassigned (private)</option>
                              {fieldEngineers.map(engineer => (
                                <option key={engineer.id} value={engineer.id}>{engineer.name} ({engineer.username})</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {asset.location}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        ₹{asset.purchaseCost.toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {asset.warrantyExpiresAt}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          asset.status === 'IN_USE'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : asset.status === 'AVAILABLE_IN_STOCK'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : asset.status === 'UNDER_REPAIR'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {asset.status.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageAssignments && (asset.status === 'IN_USE' ? (
                            <button
                              onClick={() => onUpdateAssetStatus(asset.id, 'UNDER_REPAIR')}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold border border-slate-700 cursor-pointer"
                            >
                              Send to Repair
                            </button>
                          ) : (
                            <button
                              onClick={() => onUpdateAssetStatus(asset.id, 'IN_USE')}
                              className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-[11px] font-semibold border border-emerald-800 cursor-pointer"
                            >
                              Re-allocate
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: SAAS LICENSE COST OPTIMIZER */}
      {activeSubTab === 'LICENSES' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-amber-400" />
                  Autonomous SaaS License & Inactive Seat Reclamation
                </h2>
                <p className="text-xs text-slate-400">
                  Microsoft 365, Adobe CC, and Fortinet endpoint seat utilization with real-time Microsoft Graph API telemetry.
                </p>
              </div>

              <span className="text-xs font-mono px-3 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                Potential Savings: ₹{(totalWastedLicenseSpend / 100000).toFixed(2)} Lakhs/yr
              </span>
            </div>

            {/* License Cards */}
            {licenses.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-950/40 rounded-xl border border-slate-800">
                <TrendingDown className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="font-bold text-white text-sm">No Active SaaS Licenses Tracked</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Connect Microsoft 365, Google Workspace, or Adobe Admin Console to automatically discover inactive ghost seats and reclaim annual spend.
                </p>
              </div>
            ) : (
            <div className="space-y-4 pt-2">
              {licenses.map((lic) => {
                const utilizationPercent = Math.round((lic.activeLast30Days / lic.purchasedSeats) * 100);
                return (
                  <div
                    key={lic.id}
                    className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base">{lic.softwareName}</h3>
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-[10px]">
                            {lic.publisher}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">{lic.tier} • Renewal: <strong className="text-slate-200">{lic.renewalDate}</strong></div>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-xs text-slate-500 font-mono block">Annual Waste</span>
                        <span className="text-lg font-bold font-mono text-amber-400">
                          ₹{lic.annualWastedSpend.toLocaleString('en-IN')}/yr
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar & Seat Metrics */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">
                          Utilization: <strong className="text-white">{lic.activeLast30Days} Active</strong> / {lic.purchasedSeats} Purchased
                        </span>
                        <span className="text-amber-400 font-bold">
                          {lic.unusedSeats} Ghost / Inactive Seats ({lic.unusedSeats} x ₹{lic.costPerSeatPerYear.toLocaleString('en-IN')})
                        </span>
                      </div>

                      <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden flex">
                        <div className="bg-emerald-500 h-full" style={{ width: `${utilizationPercent}%` }}></div>
                        <div className="bg-amber-500 h-full" style={{ width: `${100 - utilizationPercent}%` }}></div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-xs">
                      <span className="text-slate-500 font-mono text-[11px]">
                        Last Scanned via Graph API: 12 minutes ago
                      </span>

                      {lic.unusedSeats > 0 ? (
                        <button
                          onClick={() => onReclaimLicenses(lic.id)}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer transition flex items-center gap-1.5 shadow"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Reclaim {lic.unusedSeats} Unused Licenses (Save ₹{lic.annualWastedSpend.toLocaleString('en-IN')})
                        </button>
                      ) : (
                        <span className="text-emerald-400 font-bold flex items-center gap-1 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Optimal 100% Seat Utilization
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: AMC & CONTRACTS */}
      {activeSubTab === 'AMC' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Annual Maintenance Contracts (AMC) & SLAs</h2>
                <p className="text-xs text-slate-400">
                  Comprehensive and non-comprehensive contracts, device coverage, and scheduled preventive maintenance visits.
                </p>
              </div>

              <button
                onClick={() => setShowAddAmcModal(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New AMC Contract</span>
              </button>
            </div>

            {amcs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-950/40 rounded-xl border border-slate-800">
                <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="font-bold text-white text-sm">No Active AMC Contracts</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No Annual Maintenance Contracts active in Clean Slate mode. Create customer contracts or onboard enterprise accounts.
                </p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              {amcs.map((amc) => (
                <div
                  key={amc.id}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-bold text-cyan-400">{amc.contractNumber}</span>
                      <h3 className="text-base font-bold text-white mt-0.5">{amc.clientName}</h3>
                      <span className="text-slate-400 font-mono text-[11px]">{amc.type}</span>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      amc.status === 'ACTIVE'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {amc.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">Device Fleet</span>
                      <div className="text-white font-bold text-sm">{amc.deviceCount} Managed Units</div>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">Annual Value</span>
                      <div className="text-emerald-400 font-bold font-mono text-sm">
                        ₹{amc.annualValue.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">SLA Response</span>
                      <div className="text-white font-bold">{amc.slaResponseHours} Hours Onsite</div>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">Next Preventive Maintenance</span>
                      <div className="text-cyan-400 font-bold font-mono">{amc.nextPMDate}</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>Valid: {amc.startDate} to {amc.endDate}</span>
                    <button
                      onClick={() => setNoticeBanner(`Preventative maintenance visit scheduled for ${amc.clientName}.`)}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                    >
                      Schedule PM Visit
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 4: JOINER / MOVER / LEAVER (JML) AUTOMATION */}
      {activeSubTab === 'JML' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 text-xs">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-cyan-400" />
                Autonomous Employee Joiner / Mover / Leaver (JML) Workflows
              </h2>
              <p className="text-slate-400">
                1-click full lifecycle IT onboarding & offboarding: automated laptop allocation, Entra ID account creation, M365 license allocation, and zero-day asset recovery.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Employee Full Name</label>
                <input
                  type="text"
                  value={jmlEmployeeName}
                  onChange={(e) => setJmlEmployeeName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Role Title</label>
                <input
                  type="text"
                  value={jmlRole}
                  onChange={(e) => setJmlRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Department</label>
                <select
                  value={jmlDept}
                  onChange={(e) => setJmlDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Finance">Finance</option>
                  <option value="Sales">Sales</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>
            </div>

            {/* Action Cards: Joiner vs Leaver */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <UserCheck className="w-4 h-4" />
                  <span>Execute Joiner (New Hire)</span>
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px]">
                  <li>✓ Allocate available ThinkPad T14 from IT Store Locker</li>
                  <li>✓ Provision Entra ID SSO & Corporate Mailbox</li>
                  <li>✓ Assign Microsoft 365 E5 license from reclaimed pool</li>
                  <li>✓ Dispatch Welcome Kit with secure password vault token</li>
                </ul>
                <button
                  onClick={() => onExecuteJML('JOINER', jmlEmployeeName)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer transition shadow"
                >
                  Trigger Onboarding Pipeline
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <UserX className="w-4 h-4" />
                  <span>Execute Leaver (Employee Exit)</span>
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px]">
                  <li>✓ Suspend Entra ID credentials and active VPN sessions</li>
                  <li>✓ Revoke M365 E5 license (returns to pool, saves ₹38,400)</li>
                  <li>✓ Initiate remote BitLocker wipe / asset retrieval ticket</li>
                  <li>✓ Archive mailbox to compliance storage tier</li>
                </ul>
                <button
                  onClick={() => onExecuteJML('LEAVER', jmlEmployeeName)}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer transition shadow"
                >
                  Trigger Exit & De-provisioning
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Sub-Tab 5: Warranty & RMA Claims (Blueprint Section 29 & 30) */}
      {activeSubTab === 'RMA' && (
        <div className="space-y-6">
          {/* Top Bar with Log Claim Button */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-rose-400" />
                OEM Hardware Warranty & RMA Claims Lifecycle
              </h3>
              <p className="text-xs text-slate-400">
                End-to-end tracking from fault telemetry to OEM case validation, reverse logistics courier pickup, replacement delivery, and CMDB serial update.
              </p>
            </div>

            <button
              onClick={() => setShowNewRmaModal(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs transition shadow cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Log New RMA Hardware Claim</span>
            </button>
          </div>

          {/* RMA Claims Cards */}
          {rmaClaims.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <Truck className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="font-bold text-white text-sm">No Active Warranty or RMA Claims</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No hardware equipment is currently flagged for OEM repair or replacement in Clean Slate mode.
              </p>
              <button
                onClick={() => setShowNewRmaModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 text-white font-semibold text-xs transition inline-flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Log Hardware RMA Claim</span>
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rmaClaims.map((claim) => {
              const stageBadge: Record<RMAClaim['stage'], { label: string; color: string }> = {
                FAULT_LOGGED: { label: '1. Fault Logged', color: 'bg-slate-800 text-slate-300 border-slate-700' },
                OEM_APPROVED: { label: '2. OEM Authorized', color: 'bg-indigo-950 text-indigo-300 border-indigo-700' },
                IN_TRANSIT: { label: '3. In Transit to Depot', color: 'bg-amber-950 text-amber-300 border-amber-700' },
                SERVICE_CENTER: { label: '4. At OEM Service Center', color: 'bg-rose-950 text-rose-300 border-rose-700' },
                REPLACED_RETURN: { label: '5. Replacement Shipped', color: 'bg-sky-950 text-sky-300 border-sky-700' },
                TESTED_CLOSED: { label: '6. Tested & Re-deployed', color: 'bg-emerald-950 text-emerald-300 border-emerald-700' }
              };

              return (
                <div key={claim.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{claim.rmaNumber}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${stageBadge[claim.stage].color}`}>
                          {stageBadge[claim.stage].label}
                        </span>
                      </div>
                      <h4 className="font-semibold text-xs text-white mt-1">{claim.assetName}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Tag: <strong className="text-slate-300">{claim.assetTag}</strong> | S/N: <strong className="text-slate-300">{claim.serialNumber}</strong>
                      </p>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex-shrink-0">
                      {claim.warrantyStatus === 'ACTIVE_WARRANTY' ? 'Warranty recorded active' : claim.warrantyStatus === 'UNVERIFIED' ? 'Warranty unverified' : claim.warrantyStatus === 'EXTENDED_CARE' ? 'Extended care' : 'Out of warranty'}
                    </span>
                  </div>

                  {/* Fault Symptom */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block mb-1">Diagnosed Fault Symptom:</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{claim.faultSymptom}</p>
                  </div>

                  {/* OEM Case & Courier Logistics */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">OEM Case Number</span>
                      <span className="font-mono font-bold text-indigo-400 text-xs">{claim.oemCaseNumber}</span>
                      <span className="text-[10px] text-slate-400 block">{claim.oemBrand}</span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-mono block">Air Waybill (AWB)</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(claim.courierTracking);
                            setCopiedTracking(claim.id);
                            setTimeout(() => setCopiedTracking(null), 2000);
                          }}
                          className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                          title="Copy tracking number"
                        >
                          {copiedTracking === claim.id ? <Check className="w-3 h-3 text-emerald-400 inline" /> : <Copy className="w-3 h-3 inline" />}
                        </button>
                      </div>
                      <span className="font-mono font-bold text-sky-400 text-xs">{claim.courierTracking}</span>
                      <span className="text-[10px] text-slate-400 block">{claim.courierPartner}</span>
                    </div>
                  </div>

                  {/* Interactive Status Advancement */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Created: {claim.createdAt}</span>

                    {claim.stage !== 'TESTED_CLOSED' ? (
                      <button
                        onClick={async () => {
                          const nextStageMap: Record<RMAClaim['stage'], RMAClaim['stage']> = {
                            FAULT_LOGGED: 'OEM_APPROVED', OEM_APPROVED: 'IN_TRANSIT',
                            IN_TRANSIT: 'SERVICE_CENTER', SERVICE_CENTER: 'REPLACED_RETURN',
                            REPLACED_RETURN: 'TESTED_CLOSED', TESTED_CLOSED: 'TESTED_CLOSED'
                          };
                          const nextStage = nextStageMap[claim.stage];
                          const changes: Partial<RMAClaim> = { stage: nextStage };
                          if (nextStage === 'OEM_APPROVED') {
                            const caseNumber = window.prompt('Enter the verified OEM case number:')?.trim();
                            if (!caseNumber) return;
                            changes.oemCaseNumber = caseNumber;
                          }
                          if (nextStage === 'IN_TRANSIT') {
                            const courier = window.prompt('Enter the actual courier company:')?.trim();
                            if (!courier) return;
                            const awb = window.prompt('Enter actual tracking/AWB:')?.trim();
                            if (!awb) return;
                            changes.courierPartner = courier;
                            changes.courierTracking = awb;
                          }
                          const saved = await onUpdateRMA(claim.id, changes);
                          if (saved) setNoticeBanner(`RMA #${saved.rmaNumber} saved as ${saved.stage}; external dispatch is not implied.`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <span>Advance Stage</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Closed & Verified in CMDB</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {/* New RMA Modal */}
          {showNewRmaModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <Truck className="w-5 h-5 text-rose-400" />
                    Log OEM RMA Hardware Claim
                  </h3>
                  <button 
                    onClick={() => setShowNewRmaModal(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Select Impacted Asset</label>
                    <select
                      value={newRmaAssetTag}
                      onChange={(e) => setNewRmaAssetTag(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
                    >
                      {assets.map(a => (
                        <option key={a.id} value={a.assetTag} className="bg-slate-900">
                          {a.name} ({a.assetTag} - {a.brand})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Hardware Failure Symptom & Event Logs</label>
                    <textarea
                      rows={3}
                      placeholder="Describe symptoms, e.g. RAID controller battery warning, intermittent reboot, blown capacitor, or display backlight failure..."
                      value={newRmaSymptom}
                      onChange={(e) => setNewRmaSymptom(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Designated Reverse Logistics Partner</label>
                    <select
                      value={newRmaCourier}
                      onChange={(e) => setNewRmaCourier(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
                    >
                      <option value="BlueDart Apex Priority" className="bg-slate-900">BlueDart Apex Priority (Critical Spare Air)</option>
                      <option value="DTDC Express Prime" className="bg-slate-900">DTDC Express Prime</option>
                      <option value="FedEx India Critical" className="bg-slate-900">FedEx India Critical Parts Dispatch</option>
                      <option value="Delhivery Surface Pro" className="bg-slate-900">Delhivery Surface Pro (Server Racks/Chassis)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowNewRmaModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!newRmaSymptom.trim() || !assets.some(a => a.assetTag === newRmaAssetTag)) {
                        setNoticeBanner('Choose a registered asset and enter its actual fault.');
                        return;
                      }
                      const saved = await onCreateRMA({ assetTag: newRmaAssetTag, faultSymptom: newRmaSymptom.trim() });
                      if (!saved) {
                        setNoticeBanner('RMA was not saved. No external dispatch occurred.');
                        return;
                      }
                      setShowNewRmaModal(false);
                      setNewRmaSymptom('');
                      setNoticeBanner(`RMA ${saved.rmaNumber} recorded; OEM, warranty and courier confirmation are pending.`);
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs cursor-pointer shadow"
                  >
                    Record RMA Claim
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Hardware Asset Modal */}
      {showAddAssetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Laptop className="w-5 h-5 text-emerald-400" />
                Register Hardware Asset & QR Tag
              </h3>
              <button 
                onClick={() => setShowAddAssetModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAssetSubmit} className="space-y-3.5 text-xs">
              <label className="block text-slate-300 font-semibold">
                Registered Customer *
                <select aria-label="Asset customer" required value={newAssetCustomerId}
                  onChange={e => setNewAssetCustomerId(e.target.value)}
                  className="block w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2 text-white">
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Asset Tag *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AST-110"
                    value={newAssetTag}
                    onChange={(e) => setNewAssetTag(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Serial Number</label>
                  <input
                    type="text"
                    placeholder="e.g. SN-8921820"
                    value={newAssetSerial}
                    onChange={(e) => setNewAssetSerial(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Device Name / Specification *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ThinkPad X1 Carbon Gen 11 (32GB RAM, 1TB SSD)"
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={newAssetCategory}
                    onChange={(e) => setNewAssetCategory(e.target.value as AssetItem['category'])}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Laptop" className="bg-slate-900">Laptop</option>
                    <option value="Workstation" className="bg-slate-900">Workstation</option>
                    <option value="Server" className="bg-slate-900">Server</option>
                    <option value="Switch" className="bg-slate-900">Switch</option>
                    <option value="Firewall" className="bg-slate-900">Firewall</option>
                    <option value="UPS" className="bg-slate-900">UPS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Brand / OEM</label>
                  <input
                    type="text"
                    value={newAssetBrand}
                    onChange={(e) => setNewAssetBrand(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Assigned Custodian / User</label>
                  <input
                    type="text"
                    placeholder="e.g. Unassigned (Stock Pool) or John Doe"
                    value={newAssetUser}
                    onChange={(e) => setNewAssetUser(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Department</label>
                  <input
                    type="text"
                    value={newAssetDept}
                    onChange={(e) => setNewAssetDept(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Location</label>
                  <input
                    type="text"
                    value={newAssetLocation}
                    onChange={(e) => setNewAssetLocation(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    value={newAssetCost}
                    onChange={(e) => setNewAssetCost(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Warranty Expiry</label>
                  <input
                    type="date"
                    value={newAssetWarranty}
                    onChange={(e) => setNewAssetWarranty(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAssetModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shadow"
                >
                  Add Asset to CMDB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add AMC Contract Modal */}
      {showAddAmcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Register New AMC Contract</h3>
              </div>
              <button
                onClick={() => setShowAddAmcModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAmcSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Registered Customer *</label>
                <select aria-label="AMC customer" required value={newAmcCustomerId}
                  onChange={e => setNewAmcCustomerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white">
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Contract Coverage Type</label>
                  <select
                    value={newAmcType}
                    onChange={(e) => setNewAmcType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Comprehensive">Comprehensive (Parts + Labour)</option>
                    <option value="Non-Comprehensive">Non-Comprehensive (Labour Only)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Managed Units / Fleet Size</label>
                  <input
                    type="number"
                    value={newAmcDeviceCount}
                    onChange={(e) => setNewAmcDeviceCount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Annual Contract Value (₹)</label>
                  <input
                    type="number"
                    value={newAmcAnnualValue}
                    onChange={(e) => setNewAmcAnnualValue(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Onsite SLA Target (Hours)</label>
                  <input
                    type="number"
                    value={newAmcSlaHours}
                    onChange={(e) => setNewAmcSlaHours(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddAmcModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shadow"
                >
                  Create AMC Contract
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
