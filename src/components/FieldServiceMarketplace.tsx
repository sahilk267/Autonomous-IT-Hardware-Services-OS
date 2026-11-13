import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Navigation, 
  Phone, 
  Star, 
  FileText, 
  Plus, 
  Send,
  Calendar,
  AlertCircle,
  X,
  UserCheck,
  Check
} from 'lucide-react';
import { FieldJob, ProductItem, CustomerAccount } from '../types';

interface FieldServiceMarketplaceProps {
  customers: CustomerAccount[];
  jobs: FieldJob[];
  products: ProductItem[];
  onUpdateJobStatus: (jobId: string, nextStatus: FieldJob['status']) => void;
  onConsumePart: (jobId: string, productId: string, quantity: number) => void;
  onSignOffJob: (jobId: string) => void;
  onCreateJob?: (newJob: Partial<FieldJob>) => void;
  fieldEngineers: { id: string; name: string; username: string }[];
  canManageJobs: boolean;
  onAssignJob: (jobId: string, assignedUserId: string | null) => void;
  isCleanSlate?: boolean;
}

export const FieldServiceMarketplace: React.FC<FieldServiceMarketplaceProps> = ({
  customers,
  jobs,
  products,
  onUpdateJobStatus,
  onConsumePart,
  onSignOffJob,
  onCreateJob,
  fieldEngineers,
  canManageJobs,
  onAssignJob,
  isCleanSlate = false
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string>(isCleanSlate ? '' : (jobs[0]?.id || ''));
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partQuantity, setPartQuantity] = useState(1);

  // Dispatch Job Modal State
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchTitle, setDispatchTitle] = useState('');
  const [dispatchCustomerId, setDispatchCustomerId] = useState('');
  const [dispatchAddress, setDispatchAddress] = useState('');
  const [dispatchTech, setDispatchTech] = useState('');
  const [dispatchPhone, setDispatchPhone] = useState('');
  const [dispatchSlot, setDispatchSlot] = useState('');
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  useEffect(() => {
    setSelectedJobId(jobs[0]?.id || '');
  }, [jobs]);

  const selectedJob = (selectedJobId ? jobs.find(j => j.id === selectedJobId) : null) || (isCleanSlate ? null : jobs[0]) || null;

  const servicesCatalog = [
    {
      id: 'srv-1',
      title: 'Windows Server 2025 Active Directory & Hyper-V Cluster',
      category: 'Server Deployment',
      price: 24000,
      sla: 'Same Day Deployment',
      description: 'Bare-metal installation, RAID 10 configuration, Domain Controller setup, group policies, and automated VM backup schedules.'
    },
    {
      id: 'srv-2',
      title: 'Fortinet FortiGate Next-Gen Firewall Hardening & SSL-VPN',
      category: 'Network Security',
      price: 18000,
      sla: 'Within 4 Hours',
      description: 'Multi-VLAN isolation, intrusion prevention (IPS), web application filtering, and multi-factor VPN authentication for remote workforce.'
    },
    {
      id: 'srv-3',
      title: 'Fiber Optical Splicing, OTDR Testing & Cable Dressing',
      category: 'Structured Cabling',
      price: 14500,
      sla: 'Next Business Day',
      description: 'Core fusion splicing, decibel loss certification report, server rack management with customized Velcro dressing.'
    },
    {
      id: 'srv-4',
      title: 'Executive Laptop Chip-Level Repair & Thermal Optimization',
      category: 'Hardware Repair',
      price: 6500,
      sla: '24-Hour Turnaround',
      description: 'BGA chipset rework, power IC replacement, ultra-high performance thermal paste re-application, and diagnostic stress test.'
    }
  ];

  const handleNextStatus = () => {
    if (!selectedJob) return;
    const flow: FieldJob['status'][] = ['SCHEDULED', 'EN_ROUTE', 'CHECKED_IN', 'DIAGNOSING', 'PARTS_REPLACED', 'COMPLETED'];
    const currentIdx = flow.indexOf(selectedJob.status);
    if (currentIdx < flow.length - 1) {
      const next = flow[currentIdx + 1];
      onUpdateJobStatus(selectedJob.id, next);
    }
  };

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || !selectedPartId || !Number.isSafeInteger(partQuantity) || partQuantity <= 0) return;
    onConsumePart(selectedJob.id, selectedPartId, partQuantity);
    setSelectedPartId('');
    setPartQuantity(1);
  };

  const handleBookFromCatalog = (pkg: typeof servicesCatalog[0]) => {
    // Open dispatch modal with package title pre-filled to capture real customer, site and technician data
    setDispatchTitle(pkg.title);
    setShowDispatchModal(true);
  };

  const handleDispatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTitle.trim() || !dispatchCustomerId || !dispatchAddress.trim()) {
      setActionBanner('Job title, customer and address are required. Unassigned jobs are internal drafts.');
      return;
    }
    if (!onCreateJob) return;

    onCreateJob({
      title: dispatchTitle.trim(),
      customerId: dispatchCustomerId,
      customerName: customers.find(c => c.id === dispatchCustomerId)?.name || '',
      address: dispatchAddress.trim(),
      assignedUserId: dispatchTech || undefined,
      technicianName: fieldEngineers.find(u => u.id === dispatchTech)?.name || 'Unassigned',
      technicianPhone: dispatchPhone.trim() || 'N/A',
      status: 'SCHEDULED',
      scheduledTime: dispatchSlot.trim() || 'Scheduled Window',
      partsConsumed: []
    });

    setShowDispatchModal(false);
    setDispatchTitle('');
    setDispatchCustomerId('');
    setDispatchAddress('');
    setDispatchTech('');
    setDispatchPhone('');
    setDispatchSlot('');
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-cyan-400" />
            Field Service Management & On-Demand IT Marketplace
          </h1>
          <p className="text-sm text-slate-400">
            Internal job tracking and local staff assignments; GPS dispatch and customer e-sign are not integrated.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canManageJobs && <button
            onClick={() => setShowDispatchModal(true)}
            className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Field Job</span>
          </button>}
          <div className="text-xs bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-slate-300 font-mono">
            Live Dispatch: <span className="text-emerald-400 font-bold">{jobs.length} Jobs Active</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Field Job Stepper vs Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Active Job Execution Stepper */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* If multiple jobs exist, show job selector pills */}
          {jobs.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-mono text-slate-400 uppercase shrink-0">Jobs ({jobs.length}):</span>
              {jobs.map(j => (
                <button
                  key={j.id}
                  onClick={() => setSelectedJobId(j.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition cursor-pointer border ${
                    selectedJob?.id === j.id
                      ? 'bg-cyan-950 border-cyan-600 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {j.jobCode} • {j.title.slice(0, 22)}...
                </button>
              ))}
            </div>
          )}

          {selectedJob ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <span className="font-mono text-xs font-bold text-cyan-400">{selectedJob.jobCode}</span>
                  <h2 className="text-lg font-bold text-white mt-0.5">{selectedJob.title}</h2>
                </div>

                <span className="px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono text-xs font-bold">
                  {selectedJob.status.replace('_', ' ')}
                </span>
              </div>

              {/* Stepper Status Bar */}
              <div className="space-y-2">
                <span className="text-xs font-mono text-slate-400 uppercase">Field Job Milestone Lifecycle:</span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-[11px] text-center font-mono">
                  {['SCHEDULED', 'EN_ROUTE', 'CHECKED_IN', 'DIAGNOSING', 'PARTS_REPLACED', 'COMPLETED'].map((st, idx) => {
                    const activeIdx = ['SCHEDULED', 'EN_ROUTE', 'CHECKED_IN', 'DIAGNOSING', 'PARTS_REPLACED', 'COMPLETED'].indexOf(selectedJob.status);
                    const isDone = idx <= activeIdx;
                    return (
                      <div
                        key={st}
                        className={`p-2 rounded-lg border font-semibold ${
                          isDone
                            ? 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                            : 'bg-slate-950 border-slate-800 text-slate-500'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Job Details & Technician Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-mono">Customer & Site Address</span>
                  <div className="font-bold text-white text-sm">{selectedJob.customerName}</div>
                  <div className="text-slate-400 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{selectedJob.address}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-mono">Assigned Field Engineer</span>
                  <div className="font-bold text-white text-sm">{selectedJob.technicianName}</div>
                  {canManageJobs && (
                    <div className="my-2 text-xs">
                      <label htmlFor="field-assign" className="block text-slate-400 mb-1">Assign local field engineer</label>
                      <select id="field-assign" value={selectedJob.assignedUserId || ''}
                        onChange={e => onAssignJob(selectedJob.id, e.target.value || null)}
                        className="w-full bg-slate-950 text-white border border-slate-700 rounded-lg p-2">
                        <option value="">Unassigned — no external dispatch</option>
                        {fieldEngineers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
                      </select>
                      <p className="text-amber-300">Internal assignment; no outbound dispatch sent.</p>
                    </div>
                  )}
                  <div className="text-slate-400 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedJob.technicianPhone}</span>
                  </div>
                </div>
              </div>

              {/* Spare Parts Consumed on Job */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs uppercase text-slate-400">
                    Parts Consumed on Site (Auto-deducts from Warehouse)
                  </span>
                  <span className="text-xs text-emerald-400 font-mono">
                    Total Parts: ₹{selectedJob.partsConsumed.reduce((acc, p) => acc + p.cost, 0).toLocaleString('en-IN')}
                  </span>
                </div>

                {selectedJob.partsConsumed.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedJob.partsConsumed.map((part, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                        <span className="text-white font-medium">{part.partName}</span>
                        <span className="font-mono text-emerald-400 font-bold">₹{part.cost.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic p-2 bg-slate-950/50 rounded-lg border border-slate-800">
                    No spare parts logged yet.
                  </div>
                )}

                {/* Add Part Form */}
                <form onSubmit={handleAddPart} className="flex gap-2 text-xs">
                  <select
                    aria-label="Warehouse product"
                    value={selectedPartId}
                    onChange={e => setSelectedPartId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    required
                  >
                    <option value="">Select a real warehouse SKU</option>
                    {products.filter(p => p.stockAvailable - p.stockReserved > 0).map(p => (
                      <option key={p.id} value={p.id}>{p.sku} — {p.name} ({p.stockAvailable - p.stockReserved} available)</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    aria-label="Part quantity"
                    value={partQuantity}
                    onChange={e => setPartQuantity(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white"
                  />
                  <button
                    type="submit"
                    disabled={!selectedPartId || partQuantity <= 0}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold border border-slate-700 disabled:opacity-40"
                  >
                    Consume
                  </button>
                </form>
              </div>

              {selectedJob.status === 'PARTS_REPLACED' && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                  <strong className="text-white">Internal Completion Only</strong>
                  <p className="text-amber-300">Customer e-sign and payment are NOT verified.</p>
                  <button type="button" onClick={() => onSignOffJob(selectedJob.id)}
                    className="w-full py-2 rounded-lg bg-emerald-600 text-white font-bold">
                    Mark Work Complete (No E-Sign)
                  </button>
                </div>
              )}

              {/* Job Closed Banner */}
              {selectedJob.status === 'COMPLETED' && (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-bold block">Work Marked Completed Internally</span>
                    <span>No external customer signature or billing settlement was verified.</span>
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <span className="text-xs text-slate-500 font-mono">Scheduled: {selectedJob.scheduledTime}</span>
                {selectedJob.status !== 'COMPLETED' && selectedJob.status !== 'PARTS_REPLACED' && (
                  <button
                    onClick={handleNextStatus}
                    className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition cursor-pointer flex items-center gap-2"
                  >
                    <span>Advance to Next Step</span>
                  </button>
                )}
              </div>

            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto">
                <Wrench className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Active Field Service Jobs Dispatched</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  The field dispatch queue is clear. Dispatch an on-demand engineer or select a pre-configured service package from the catalog on the right.
                </p>
              </div>
              {canManageJobs && <button
                onClick={() => setShowDispatchModal(true)}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-lg inline-flex items-center gap-2 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Schedule Field Job</span>
              </button>}
            </div>
          )}

        </div>

        {/* Right 1 Col: Standard Services Catalog */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span>Standard IT Service Packages</span>
              <span className="text-[10px] font-mono text-cyan-400">Fixed Rate</span>
            </h3>

            <div className="space-y-3">
              {servicesCatalog.map((pkg) => (
                <div key={pkg.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs hover:border-cyan-800/60 transition">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-white text-xs leading-snug">{pkg.title}</h4>
                    <span className="font-mono font-bold text-emerald-400 whitespace-nowrap ml-2">
                      ₹{pkg.price.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">{pkg.description}</p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
                    <span className="text-cyan-400">Indicative: {pkg.sla}</span>
                    <span className="text-slate-400 font-sans">Standard Catalog Package</span>
                  </div>

                  <button
                    disabled={!canManageJobs}
                     onClick={() => handleBookFromCatalog(pkg)}
                    className="w-full py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 font-bold border border-cyan-800/80 text-[11px] transition cursor-pointer flex items-center justify-center gap-1"
                  >
                    <span>Prepare Job Draft</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Dispatch Modal */}
      {canManageJobs && showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">Dispatch Field Service Engineer</h3>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Service Requirement / Scope</label>
                <input
                  type="text"
                  value={dispatchTitle}
                  onChange={(e) => setDispatchTitle(e.target.value)}
                  placeholder="e.g. FortiGate Firewall Setup or Fiber Optical Splicing"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Registered Customer</label>
                  <select aria-label="Field job customer" required value={dispatchCustomerId}
                    onChange={e => setDispatchCustomerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">SLA Window / Schedule Slot</label>
                  <select
                    value={dispatchSlot}
                    onChange={(e) => setDispatchSlot(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Within 2 Hours (Critical P1)">Within 2 Hours (Critical P1)</option>
                    <option value="Same Day (Within 4 Hours)">Same Day (Within 4 Hours)</option>
                    <option value="Next Business Day (10:00 AM)">Next Business Day (10:00 AM)</option>
                    <option value="Weekend Maintenance Window">Weekend Maintenance Window</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Site Address & Location</label>
                <input
                  type="text"
                  value={dispatchAddress}
                  onChange={(e) => setDispatchAddress(e.target.value)}
                  placeholder="e.g. Floor 4, Cyber City, Gurgaon, HR"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Assign Technician</label>
                  <select
                    value={dispatchTech}
                    onChange={(e) => setDispatchTech(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Unassigned — internal draft</option>
                    {fieldEngineers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Technician Phone</label>
                  <input
                    type="text"
                    value={dispatchPhone}
                    onChange={(e) => setDispatchPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold cursor-pointer"
                >
                  Save Internal Job (Not Dispatched)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
