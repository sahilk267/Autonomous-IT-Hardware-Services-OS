import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Search, 
  Sparkles, 
  ShieldCheck, 
  Star, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  DollarSign, 
  ChevronRight, 
  Sliders, 
  Award, 
  MapPin, 
  Plus, 
  Send,
  Wrench,
  HelpCircle,
  TrendingUp,
  Unlock,
  Layers,
  Target,
  Scale,
  Check,
  PlusCircle,
  AlertTriangle,
  FolderGit2,
  X
} from 'lucide-react';
import { Project, Proposal, ProviderProfile, ProjectMilestone, CRMOpportunity, MarketplaceDispute } from '../types';

interface ProjectMarketplaceProps {
  projects: Project[];
  proposals: Proposal[];
  providers: ProviderProfile[];
  crmOpportunities: CRMOpportunity[];
  marketplaceDisputes: MarketplaceDispute[];
  onCreateCRM: (opp: Partial<CRMOpportunity>) => Promise<CRMOpportunity | null>;
  onAdvanceCRM: (id: string, stage: CRMOpportunity['stage']) => Promise<CRMOpportunity | null>;
  onCreateDispute: (claim: { projectId: string; reason: string; customerClaim: string; disputedAmount: number }) => Promise<MarketplaceDispute | null>;
  onRecordDisputeDecision: (id: string, decision: NonNullable<MarketplaceDispute['resolutionDecision']>) => Promise<MarketplaceDispute | null>;
  onReleaseMilestone: (projectId: string, milestoneId: string) => void;
  onAcceptProposal: (projectId: string, proposalId: string) => void;
  onCreateProject: (newProject: Partial<Project>) => void;
  onRequestDiagnosticBooking: (diagnosisSummary: string, estimatedCost: number) => void;
  onAddProposal?: (proposal: Partial<Proposal>) => void;
  isCleanSlate?: boolean;
}

export const ProjectMarketplace: React.FC<ProjectMarketplaceProps> = ({
  projects,
  proposals,
  providers,
  crmOpportunities,
  marketplaceDisputes,
  onCreateCRM,
  onAdvanceCRM,
  onCreateDispute,
  onRecordDisputeDecision,
  onReleaseMilestone,
  onAcceptProposal,
  onCreateProject,
  onRequestDiagnosticBooking,
  onAddProposal
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'PROJECTS' | 'PACKAGES' | 'PROVIDERS' | 'AI_DIAGNOSIS' | 'CRM_PIPELINE' | 'DISPUTES'>('PROJECTS');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // CRM Pipeline State - starts empty
  const [showNewOppModal, setShowNewOppModal] = useState(false);
  const [newOppClient, setNewOppClient] = useState('');
  const [newOppTitle, setNewOppTitle] = useState('');
  const [newOppValue, setNewOppValue] = useState(0);
  const [newOppProvider, setNewOppProvider] = useState('');

  // Dispute State - starts empty
  const [selectedDisputeId, setSelectedDisputeId] = useState<string>('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeProjectId, setDisputeProjectId] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeClaim, setDisputeClaim] = useState('');
  const [disputeAmount, setDisputeAmount] = useState('');
  const [arbitrationResolutionNote, setArbitrationResolutionNote] = useState('');
  const [mpNotice, setMpNotice] = useState<string | null>(null);

  const [selectedTierByPackage, setSelectedTierByPackage] = useState<Record<string, 'Basic' | 'Standard' | 'Enterprise'>>({
    'pkg-1': 'Standard',
    'pkg-2': 'Standard',
    'pkg-3': 'Standard',
    'pkg-4': 'Standard'
  });

  const servicePackages = [
    {
      id: 'pkg-1',
      title: 'Windows Server 2025 Cluster & Active Directory Setup',
      category: 'Server & OS',
      mode: 'On-Site & Remote',
      slaHours: '4h Response',
      rating: 4.9,
      reviewCount: 38,
      providerCount: 12,
      description: 'Standardized enterprise deployment with Active Directory Forest, DNS, DHCP, GPO hardening, and backup scheduling.',
      scope: ['AD DS Role deployment & OU structure', 'LAPS & BitLocker GPO hardening', 'Automated bare-metal backup task', 'Handover documentation'],
      exclusions: ['Hardware procurement', 'Data recovery from damaged disks'],
      tiers: [
        { name: 'Basic', price: 14500, deliverables: 'Single standalone server, local backup, 15 user accounts', warrantyDays: 30 },
        { name: 'Standard', price: 34000, deliverables: 'Dual-node failover cluster, Hyper-V setup, 100 users, GPO baseline', warrantyDays: 60 },
        { name: 'Enterprise', price: 68000, deliverables: 'Geo-redundant multi-site AD, ADFS SSO, Disaster Recovery Runbook', warrantyDays: 90 }
      ]
    },
    {
      id: 'pkg-2',
      title: 'Fortinet Next-Gen Firewall & SD-WAN Branch Deployment',
      category: 'Network Security',
      mode: 'On-Site',
      slaHours: '2h SLA',
      rating: 4.95,
      reviewCount: 52,
      providerCount: 16,
      description: 'High-availability perimeter security configuration, IPS/IDS inspection, dual-ISP WAN failover, and zero-trust remote access.',
      scope: ['HA clustering (A-P / A-A)', 'Dual-WAN load balancing & BGP', 'FortiClient Zero Trust Network Access (ZTNA)', 'Threat prevention rule tuning'],
      exclusions: ['ISP bandwidth line provisioning', 'Rack cabling beyond 2 meters'],
      tiers: [
        { name: 'Basic', price: 18000, deliverables: 'Single FortiGate 60F/70F, 1 ISP, SSL-VPN for 25 staff', warrantyDays: 30 },
        { name: 'Standard', price: 38000, deliverables: 'High-Availability cluster, dual WAN auto-failover, IPS/AV policies', warrantyDays: 60 },
        { name: 'Enterprise', price: 85000, deliverables: 'Full SD-WAN hub-and-spoke mesh, syslog SIEM forwarder, SOC handover', warrantyDays: 90 }
      ]
    },
    {
      id: 'pkg-3',
      title: 'Microsoft 365 & Entra ID Hybrid Tenant Migration',
      category: 'Cloud Migration',
      mode: 'Remote Only',
      slaHours: '4h SLA',
      rating: 4.88,
      reviewCount: 64,
      providerCount: 21,
      description: 'End-to-end migration from on-prem Exchange/IMAP to Microsoft 365 with password hash sync and MFA enrollment policies.',
      scope: ['Entra Connect Cloud Sync setup', 'Cutover or staged mailbox migration', 'SharePoint Online document mapping', 'Conditional access security baseline'],
      exclusions: ['Microsoft 365 subscription billing', 'Third-party add-in licensing'],
      tiers: [
        { name: 'Basic', price: 24000, deliverables: 'Up to 35 mailboxes, cutover migration, mobile Outlook config', warrantyDays: 30 },
        { name: 'Standard', price: 58000, deliverables: 'Up to 150 users, SharePoint/Teams data migration, Intune MAM', warrantyDays: 60 },
        { name: 'Enterprise', price: 120000, deliverables: '500+ users, hybrid Exchange federation, DLP & Information Protection', warrantyDays: 90 }
      ]
    },
    {
      id: 'pkg-4',
      title: 'Cat6A 48-Node Structured Cabling & Fluke Certification',
      category: 'Enterprise Cabling',
      mode: 'On-Site',
      slaHours: 'Next Day',
      rating: 4.92,
      reviewCount: 41,
      providerCount: 9,
      description: 'ISO/IEC 11801 certified structured cabling with CommScope / Schneider Cat6A, patch panel termination, and Fluke DSX-5000 test report.',
      scope: ['Conduit cable pulling & termination', 'Patch panel keystones & rack dressing', 'Fluke cable channel & permanent link certification', 'Detailed as-built port labeling map'],
      exclusions: ['Civil trenching or core wall drilling', 'Core switch supply'],
      tiers: [
        { name: 'Basic', price: 19500, deliverables: 'Up to 24 network nodes, wire dressing, continuity testing', warrantyDays: 90 },
        { name: 'Standard', price: 42000, deliverables: 'Up to 48 network nodes, 42U rack dressing, Fluke channel report', warrantyDays: 180 },
        { name: 'Enterprise', price: 88000, deliverables: 'Up to 96 nodes, dual 10G fiber backbone, 25-year manufacturer warranty', warrantyDays: 365 }
      ]
    }
  ];

  // New Project Modal State
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [newCategory, setNewCategory] = useState<Project['category']>('Cloud Migration');
  const [newScope, setNewScope] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState('');

  // Submit Proposal Modal State
  const [showAddProposalModal, setShowAddProposalModal] = useState(false);
  const [propBidProvider, setPropBidProvider] = useState('');
  const [propBidAmount, setPropBidAmount] = useState('');
  const [propBidDays, setPropBidDays] = useState('14');
  const [propBidApproach, setPropBidApproach] = useState('');

  // AI Diagnosis State - Starts clean, requires actual user input
  const [symptomText, setSymptomText] = useState('');
  const [deviceType, setDeviceType] = useState('Server Infrastructure');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    diagnosisSummary: string;
    rootCauses: string[];
    fixLevel: string;
    estimatedCost: number;
    recommendedProviderType: string;
  } | null>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];
  const projectProposals = proposals.filter(p => p.projectId === selectedProject?.id);

  const handleRunDiagnosis = async () => {
    if (!symptomText.trim()) {
      setMpNotice('Please enter the reported symptom or error log details to diagnose.');
      return;
    }
    setIsDiagnosing(true);
    try {
      const res = await fetch('/api/ai/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptom: symptomText,
          deviceType,
          urgency: 'HIGH'
        })
      });
      const data = await res.json();
      if (data.data) {
        setDiagnosticResult({
          diagnosisSummary: data.data.diagnosisSummary,
          rootCauses: data.data.rootCauseHypothesis || ['Diagnosis indicates hardware investigation required'],
          fixLevel: data.data.recommendedFixLevel || 'L2_ON_SITE',
          estimatedCost: data.data.requiredParts?.reduce((acc: number, p: any) => acc + p.cost, 0) || 0,
          recommendedProviderType: 'Certified Enterprise Field Engineer'
        });
      } else {
        setMpNotice(data.error || 'AI Diagnosis service unavailable. Please configure GEMINI_API_KEY.');
      }
    } catch (e: any) {
      setMpNotice(e.message || 'Diagnostic service error.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleCreateProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newClient.trim()) {
      setMpNotice('Project title and client organization name are required.');
      return;
    }

    const budgetNum = newBudget.trim() ? Number(newBudget) : 0;
    if (!Number.isFinite(budgetNum) || budgetNum < 0) {
      setMpNotice('Enter a valid non-negative project budget.');
      return;
    }
    const hasMilestoneInput = Boolean(newMilestoneTitle.trim() || newMilestoneAmount || newMilestoneDueDate);
    const milestoneAmount = Number(newMilestoneAmount);
    if (hasMilestoneInput && (!newMilestoneTitle.trim() || !newMilestoneDueDate ||
        !Number.isFinite(milestoneAmount) || milestoneAmount <= 0 || milestoneAmount > budgetNum)) {
      setMpNotice('Optional milestone requires a title, actual due date and positive amount within budget.');
      return;
    }
    const newProj: Partial<Project> = {
      title: newTitle.trim(),
      clientName: newClient.trim(),
      clientLocation: '',
      budget: budgetNum,
      category: newCategory,
      scopeDescription: newScope.trim(),
      deliverables: [],
      skillsRequired: [],
      // No fabricated dates, payment holds, statuses or author-supplied identifiers.
      milestones: hasMilestoneInput ? [{
        title: newMilestoneTitle.trim(), amount: milestoneAmount, dueDate: newMilestoneDueDate
      } as ProjectMilestone] : []
    };

    onCreateProject(newProj);
    setShowNewProjectModal(false);
    setNewTitle('');
    setNewScope('');
    setNewMilestoneTitle('');
    setNewMilestoneAmount('');
    setNewMilestoneDueDate('');
  };

  const handleAddProposalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(propBidAmount), days = Number(propBidDays);
    if (!selectedProjectId || !propBidProvider.trim() || !propBidAmount.trim() || !propBidDays.trim() ||
        !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(days) || days < 1) {
      setMpNotice('Enter a real provider name, positive commercial bid and explicit turnaround days.');
      return;
    }
    // No fabricated ratings, identities, credentials, certification or matching scores.
    const proposal: Partial<Proposal> = {
      projectId: selectedProjectId, providerName: propBidProvider.trim(),
      commercialBid: amount, timelineDays: days, technicalApproach: propBidApproach.trim()
    };
    if (onAddProposal) onAddProposal(proposal);
    setShowAddProposalModal(false);
    setPropBidProvider(''); setPropBidAmount(''); setPropBidDays(''); setPropBidApproach('');
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Banner & Mode Switcher */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-indigo-400" />
            Enterprise IT Project Marketplace & AI Matching
          </h1>
          <p className="text-sm text-slate-400">
            Project proposals, internal milestone progress, provider information and AI diagnostic assistance. No escrow, payout or provider certification is automated.
          </p>
        </div>

        {/* Sub-tab Pill Switcher */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setActiveSubTab('PROJECTS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'PROJECTS'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Projects & Bidding
          </button>
          <button
            onClick={() => setActiveSubTab('PACKAGES')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'PACKAGES'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Ready-Made Packages
          </button>
          <button
            onClick={() => setActiveSubTab('PROVIDERS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'PROVIDERS'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            AI Provider Directory
          </button>
          <button
            onClick={() => setActiveSubTab('AI_DIAGNOSIS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'AI_DIAGNOSIS'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Customer AI Diagnosis
          </button>
          <button
            onClick={() => setActiveSubTab('CRM_PIPELINE')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'CRM_PIPELINE'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-rose-400" />
            CRM & Deals Funnel
          </button>
          <button
            onClick={() => setActiveSubTab('DISPUTES')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'DISPUTES'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            Dispute Arbitration
          </button>
        </div>
      </div>

      {mpNotice && (
        <div className="p-3 bg-indigo-950/80 border border-indigo-700 rounded-xl text-indigo-200 text-xs flex items-center justify-between shadow">
          <span>{mpNotice}</span>
          <button onClick={() => setMpNotice(null)} className="text-indigo-400 hover:text-white font-bold ml-3 cursor-pointer">✕</button>
        </div>
      )}

      {/* VIEW 1: PROJECTS & PROPOSALS */}
      {activeSubTab === 'PROJECTS' && (
        <div className="space-y-6">
          
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-slate-400">Filter By:</span>
              {['ALL', 'Cloud Migration', 'Enterprise Cabling', 'Network Security'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                    filterCategory === cat
                      ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowNewProjectModal(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Post Enterprise Project
            </button>
          </div>

          {/* Master Detail Grid: Left Projects List, Right Project Detail + Proposal Bids */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 1 Col: Projects List */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block px-1">
                Active Projects ({projects.length})
              </span>

              {projects.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-3 bg-slate-900 border border-slate-800 rounded-2xl">
                  <FolderGit2 className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">No active enterprise projects in queue.</p>
                  <button
                    onClick={() => setShowNewProjectModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                  >
                    + Post Project
                  </button>
                </div>
              ) : (
                projects
                  .filter(p => filterCategory === 'ALL' || p.category === filterCategory)
                  .map((proj) => {
                    const isSelected = proj.id === selectedProjectId;
                    return (
                      <div
                        key={proj.id}
                        onClick={() => setSelectedProjectId(proj.id)}
                        className={`p-4 rounded-2xl border transition cursor-pointer text-left space-y-2 ${
                          isSelected
                            ? 'bg-slate-900 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono font-bold text-indigo-400">{proj.projectCode}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                          proj.status === 'PROPOSALS_OPEN'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {proj.status.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-white line-clamp-1">{proj.title}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2">{proj.scopeDescription}</p>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-xs">
                        <span className="font-mono font-bold text-emerald-400">
                          ₹{(proj.budget).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                          {proj.proposalsCount} Bids Received
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right 2 Cols: Selected Project Details & Bids / Proposals Comparison */}
            <div className="lg:col-span-2 space-y-6">
              {selectedProject ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                  
                  {/* Project Header */}
                  <div className="border-b border-slate-800 pb-4 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono text-xs font-bold">
                          {selectedProject.projectCode}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{selectedProject.category}</span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-400 block font-mono">Total Project Budget</span>
                        <span className="text-xl font-bold font-mono text-emerald-400">
                          ₹{selectedProject.budget.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <h2 className="text-xl font-bold text-white">{selectedProject.title}</h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>Client: <strong className="text-slate-200">{selectedProject.clientName}</strong></span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-400" />
                        {selectedProject.clientLocation}
                      </span>
                    </div>
                  </div>

                  {/* Scope & Deliverables */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono uppercase text-slate-400 font-bold">Scope of Work</h3>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                      {selectedProject.scopeDescription}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-mono text-slate-400 font-bold uppercase block">Key Deliverables</span>
                        <ul className="space-y-1 text-slate-300">
                          {selectedProject.deliverables.map((d, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-mono text-slate-400 font-bold uppercase block">Required Technical Certifications</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProject.skillsRequired.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Internal milestones: no escrow or payment-provider control */}
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-mono uppercase text-slate-400 font-bold">
                        Internal Work Milestones (No Escrow or Payment Processing)
                      </h3>
                      <span className="text-xs font-mono text-slate-400">
                        {selectedProject.milestones.filter(m => m.status === 'COMPLETED').length}/{selectedProject.milestones.length} Completed
                      </span>
                    </div>

                    <div className="space-y-2">
                      {selectedProject.milestones.map((m) => (
                        <div
                          key={m.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 gap-3 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{m.title}</span>
                              <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                m.status === 'RELEASED'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : m.status === 'ESCROW_HELD'
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                  : m.status === 'IN_PROGRESS'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {m.status.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">Target Due Date: {m.dueDate}</div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span className="font-mono font-bold text-white text-sm">
                              ₹{m.amount.toLocaleString('en-IN')}
                            </span>

                            {(m.status === 'PENDING_FUNDING' || m.status === 'IN_PROGRESS') && (
                              <button
                                onClick={() => onReleaseMilestone(selectedProject.id, m.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition flex items-center gap-1 shadow"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {m.status === 'PENDING_FUNDING' ? 'Start Work' : 'Mark Work Complete'}
                              </button>
                            )}
                            {(m.status === 'ESCROW_HELD' || m.status === 'RELEASED') && (
                              <span className="text-amber-300 text-[10px]">Legacy payment state: unverified</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Proposal Comparison Matrix */}
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-mono uppercase text-slate-400 font-bold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        AI Proposal Comparison Matrix ({projectProposals.length} Submitted Bids)
                      </h3>
                      <button
                        onClick={() => setShowAddProposalModal(true)}
                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1 shadow transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Submit Proposal / Bid</span>
                      </button>
                    </div>

                    {projectProposals.length > 0 ? (
                      <div className="space-y-3">
                        {projectProposals.map((prop) => (
                          <div
                            key={prop.id}
                            className={`p-4 rounded-xl border space-y-3 ${
                              prop.status === 'SHORTLISTED'
                                ? 'bg-indigo-950/30 border-indigo-600/60 ring-1 ring-indigo-500/30'
                                : 'bg-slate-950 border-slate-800'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-white text-sm">{prop.providerName}</h4>
                                  {prop.providerVerified && (
                                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                                  )}
                                  <span className="text-[11px] text-amber-300">
                                    {prop.providerVerified && prop.providerRating > 0 ? `Rating: ${prop.providerRating}` : 'Provider not independently verified'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Turnaround: <strong className="text-slate-200">{prop.timelineDays} Calendar Days</strong>
                                </div>
                              </div>

                              <div className="flex sm:flex-col sm:items-end justify-between items-center gap-1">
                                <span className="text-base font-bold font-mono text-emerald-400">
                                  ₹{prop.commercialBid.toLocaleString('en-IN')}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 font-mono text-[10px] font-bold">
                                  Match not independently verified
                                </span>
                              </div>
                            </div>

                            {/* AI Explanation Pill */}
                            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 text-xs space-y-1">
                              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Provider Verification:
                              </span>
                              <p className="text-slate-300 text-[11px] leading-relaxed">
                                Provider ratings, OEM credentials and AI matching are not independently verified in this system.
                              </p>
                            </div>

                            {/* Technical Approach & Certifications */}
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pt-2 border-t border-slate-800 text-xs">
                              <div className="text-amber-300 text-[11px]">
                                OEM certifications are not verified. Submitted technical approach is self-reported.
                              </div>

                              <div className="flex items-center gap-2">
                                {prop.status === 'SUBMITTED' && selectedProject.status === 'PROPOSALS_OPEN' && (
                                  <button
                                    onClick={() => onAcceptProposal(selectedProject.id, prop.id)}
                                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer transition shadow"
                                  >
                                    Accept & Award Project
                                  </button>
                                )}
                              </div>
                            </div>

                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-500 space-y-3">
                        <p>No proposals recorded. No external supplier or service provider has been notified automatically.</p>
                        <button
                          onClick={() => setShowAddProposalModal(true)}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Submit First Bid / Proposal</span>
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto">
                    <FolderGit2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">No Enterprise Project Selected</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Create a real project or review recorded proposals and work milestones. Payments and escrow are not integrated.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNewProjectModal(true)}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer shadow-lg inline-flex items-center gap-2 transition active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Post Enterprise Project</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* VIEW: READY-MADE SERVICE PACKAGES (Blueprint Section 6) */}
      {activeSubTab === 'PACKAGES' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  Standardized Enterprise IT Service Packages (Fixed-Price SLA Bundles)
                </h2>
                <p className="text-xs text-slate-400">
                  Pre-architected scopes with guaranteed completion SLAs, certified technician dispatch, and escrow protection.
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-3 py-1.5 rounded-xl border border-emerald-800 shrink-0">
                100% Guaranteed SLA Delivery
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {servicePackages.map((pkg) => {
              const currentTier = selectedTierByPackage[pkg.id] || 'Standard';
              const activeTierData = pkg.tiers.find(t => t.name === currentTier) || pkg.tiers[1];

              return (
                <div key={pkg.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                            {pkg.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            {pkg.slaHours}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {pkg.mode}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-1.5">{pkg.title}</h3>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="flex items-center gap-1 text-amber-400 font-mono text-xs font-bold justify-end">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          {pkg.rating}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{pkg.reviewCount} Reviews</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {pkg.description}
                    </p>

                    {/* Tier Selector */}
                    <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800 grid grid-cols-3 gap-1 text-xs">
                      {(['Basic', 'Standard', 'Enterprise'] as const).map((tName) => {
                        const isSel = currentTier === tName;
                        const tObj = pkg.tiers.find(t => t.name === tName);
                        return (
                          <button
                            key={tName}
                            type="button"
                            onClick={() => setSelectedTierByPackage(prev => ({ ...prev, [pkg.id]: tName }))}
                            className={`py-2 rounded-lg font-bold transition cursor-pointer text-center ${
                              isSel ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="block text-xs">{tName}</span>
                            <span className="block text-[10px] font-mono text-emerald-300 mt-0.5">
                              ₹{tObj ? (tObj.price / 1000).toFixed(1) : 0}k
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Tier Breakdown */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white text-xs">{currentTier} Package Inclusions</span>
                        <span className="font-mono text-emerald-400 font-bold text-sm">
                          ₹{activeTierData.price.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px]">
                        {activeTierData.deliverables}
                      </p>
                      <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span>Warranty: <strong className="text-white">{activeTierData.warrantyDays} Days Guarantee</strong></span>
                        <span className="text-indigo-400">{pkg.providerCount} Providers Available</span>
                      </div>
                    </div>

                    {/* Scope List */}
                    <div className="space-y-1.5 text-xs">
                      <span className="text-[11px] font-mono text-slate-400 font-semibold block">Deliverable Checklist:</span>
                      <div className="grid grid-cols-1 gap-1">
                        {pkg.scope.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-slate-300 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Booking Action */}
                  <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Escrow Deposit: 100% Protected
                    </span>
                    <button
                      onClick={() => {
                        onRequestDiagnosticBooking(`${pkg.title} [${currentTier} Tier]`, activeTierData.price);
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer transition shadow flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Book Package (₹{activeTierData.price.toLocaleString('en-IN')})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: AI PROVIDER DIRECTORY */}
      {activeSubTab === 'PROVIDERS' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-400" />
                  Verified IT Service Companies, MSPs & Certified Engineers
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time SLA compliance, OEM partnerships, geographical coverage, and live technician capacity.
                </p>
              </div>

              <div className="text-xs font-mono bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-emerald-400">
                100% KYC & OEM Verified Partners
              </div>
            </div>

            {/* Provider Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
              {providers.map((prov) => (
                <div
                  key={prov.id}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition shadow-lg flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-base flex items-center gap-1.5">
                          {prov.name}
                          {prov.verified && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{prov.tagline}</p>
                      </div>

                      <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono font-bold">
                        {prov.currentCapacity}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">Rating & Jobs</span>
                        <div className="font-bold text-white flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {prov.rating} ({prov.reviewsCount})
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">SLA Compliance</span>
                        <div className="font-bold text-emerald-400 font-mono">
                          {prov.slaPerformance}%
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">Hourly Rate</span>
                        <div className="font-bold text-white font-mono">
                          ₹{prov.hourlyRate}/hr
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">Distance Radius</span>
                        <div className="font-bold text-slate-300 font-mono">
                          {prov.distanceKm} km away
                        </div>
                      </div>
                    </div>

                    {/* Certifications */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">OEM Authorizations</span>
                      <div className="flex flex-wrap gap-1">
                        {prov.certifications.map((c, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 text-indigo-300 border border-indigo-900/50 font-mono text-[10px]">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      {prov.city}
                    </span>
                    <button
                      onClick={() => setMpNotice(`Direct dispatch request initiated for ${prov.name}.`)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 cursor-pointer"
                    >
                      Book Engineer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: CUSTOMER AI DIAGNOSIS WIZARD */}
      {activeSubTab === 'AI_DIAGNOSIS' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-base font-bold text-white">Customer AI IT Diagnosis & Problem Solver</h2>
                <p className="text-xs text-slate-400">
                  Describe symptoms in plain English or Hindi. AI diagnoses hardware vs software faults and recommends exact resolution.
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Equipment / Workload Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Laptop / Desktop', 'Server Infrastructure', 'Network Switch / Firewall', 'Storage & SAN'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setDeviceType(cat)}
                      className={`p-2 rounded-xl text-xs font-semibold cursor-pointer border transition ${
                        deviceType === cat
                          ? 'bg-indigo-950 text-indigo-300 border-indigo-600'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Describe the Glitch / Symptom</label>
                <textarea
                  rows={3}
                  value={symptomText}
                  onChange={(e) => setSymptomText(e.target.value)}
                  placeholder="e.g. Dell Latitude laptop freezing after 15 mins of video calling, bottom panel heating up"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleRunDiagnosis}
                  disabled={isDiagnosing || !symptomText.trim()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer flex items-center gap-2 shadow-lg"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{isDiagnosing ? 'Analyzing Telemetry & Knowledge Base...' : 'Run Autonomous Diagnosis'}</span>
                </button>
              </div>
            </div>

            {/* Diagnostic Outcome Box */}
            {diagnosticResult && (
              <div className="p-5 rounded-2xl bg-slate-950 border border-indigo-950 ring-1 ring-indigo-500/20 space-y-4 text-xs">
                <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold">AI Diagnosis Hypothesis</span>
                    <h3 className="font-bold text-white text-sm mt-0.5">{diagnosticResult.diagnosisSummary}</h3>
                  </div>

                  <span className="px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 font-mono text-xs font-bold border border-indigo-800">
                    {diagnosticResult.fixLevel}
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-slate-400 font-bold block">Probable Root Causes:</span>
                  <ul className="space-y-1 text-slate-300">
                    {diagnosticResult.rootCauses.map((rc, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{rc}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 text-[10px] uppercase font-mono block">Estimated Repair / Parts Cost</span>
                    <span className="font-mono font-bold text-emerald-400 text-base">
                      ₹{diagnosticResult.estimatedCost.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 text-[10px] uppercase font-mono block">Recommended Match</span>
                    <span className="font-bold text-white text-sm">
                      {diagnosticResult.recommendedProviderType}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => onRequestDiagnosticBooking(diagnosticResult.diagnosisSummary, diagnosticResult.estimatedCost)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition shadow flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Dispatch On-Site Engineer Based on This Diagnosis
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 5: PROVIDER SALES CRM & OPPORTUNITY PIPELINE (Blueprint Section 32 & 77) */}
      {activeSubTab === 'CRM_PIPELINE' && (
        <div className="space-y-6">
          {/* Header & Pipeline KPIs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-rose-400" />
                MSP Sales CRM & Deal Conversion Pipeline
              </h3>
              <p className="text-xs text-slate-400">
                End-to-end deal progression from inbound procurement lead to RFP proposal, technical scoping, negotiation, and won contract.
              </p>
            </div>

            <button
              onClick={() => setShowNewOppModal(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold text-xs transition shadow cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Add Prospect / RFP Lead</span>
            </button>
          </div>

          {/* CRM Kanban Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { stage: 'LEAD', label: '1. Inbound Lead', color: 'border-slate-700 bg-slate-900/60' },
              { stage: 'QUALIFIED', label: '2. Scoped & Qualified', color: 'border-blue-900/80 bg-blue-950/20' },
              { stage: 'TECHNICAL_SCOPING', label: '3. Technical Scoping', color: 'border-indigo-900/80 bg-indigo-950/20' },
              { stage: 'PROPOSAL_SENT', label: '4. Proposal Sent', color: 'border-amber-900/80 bg-amber-950/20' },
              { stage: 'NEGOTIATION', label: '5. Negotiation', color: 'border-purple-900/80 bg-purple-950/20' },
              { stage: 'WON', label: '6. Won & Escrowed', color: 'border-emerald-900/80 bg-emerald-950/20' }
            ].map(col => {
              const colOpps = crmOpportunities.filter(o => o.stage === col.stage);
              const colSum = colOpps.reduce((acc, curr) => acc + curr.value, 0);

              return (
                <div key={col.stage} className={`rounded-xl border p-3 flex flex-col space-y-3 ${col.color}`}>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-[11px] font-bold text-white">{col.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-300">
                      {colOpps.length}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 font-bold">
                    ₹{(colSum / 1000).toFixed(0)}k pipeline
                  </div>

                  <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[500px]">
                    {colOpps.map(opp => (
                      <div key={opp.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs shadow-sm hover:border-slate-700 transition">
                        <div className="flex justify-between items-start gap-1">
                          <h5 className="font-semibold text-white text-[11px] leading-snug">{opp.title}</h5>
                          <span className="text-[10px] font-mono text-amber-400 font-bold whitespace-nowrap">
                            {opp.winProbability}%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">{opp.clientName}</p>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                          <span className="font-mono text-white font-semibold">₹{(opp.value / 1000).toFixed(0)}k</span>
                          <span className="text-slate-500 font-mono">{opp.expectedCloseDate}</span>
                        </div>

                        {opp.stage !== 'WON' && (
                          <button
                            onClick={async () => {
                              const nextStageMap: Record<CRMOpportunity['stage'], CRMOpportunity['stage']> = {
                                LEAD: 'QUALIFIED',
                                QUALIFIED: 'TECHNICAL_SCOPING',
                                TECHNICAL_SCOPING: 'PROPOSAL_SENT',
                                PROPOSAL_SENT: 'NEGOTIATION',
                                NEGOTIATION: 'WON',
                                WON: 'WON'
                              };
                              const nextStage = nextStageMap[opp.stage];
                              if (!nextStage) {
                                setMpNotice('This legacy CRM stage cannot be advanced automatically.');
                                return;
                              }
                              const saved = await onAdvanceCRM(opp.id, nextStage);
                              if (saved) setMpNotice(`CRM ${saved.title} moved to ${saved.stage} and persisted.`);
                            }}
                            className="w-full py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-indigo-300 font-semibold border border-slate-800 transition cursor-pointer"
                          >
                            Advance Stage →
                          </button>
                        )}
                      </div>
                    ))}
                    {colOpps.length === 0 && (
                      <div className="text-center py-6 text-slate-600 text-[10px]">Empty stage</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Opportunity Modal */}
          {showNewOppModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl text-xs">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-rose-400" />
                    New CRM Opportunity
                  </h4>
                  <button onClick={() => setShowNewOppModal(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Deal Title / RFP Subject</label>
                    <input
                      type="text"
                      placeholder="e.g. 50-Seat Hybrid Cloud Infrastructure"
                      value={newOppTitle}
                      onChange={e => setNewOppTitle(e.target.value)}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Client Company</label>
                    <input
                      type="text"
                      placeholder="e.g. Reliance Retail Logistics"
                      value={newOppClient}
                      onChange={e => setNewOppClient(e.target.value)}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Estimated Value (₹)</label>
                    <input
                      type="number"
                      value={newOppValue}
                      onChange={e => setNewOppValue(Number(e.target.value))}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setShowNewOppModal(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!newOppTitle.trim() || !newOppClient.trim() || !Number.isFinite(newOppValue) || newOppValue < 0) {
                        setMpNotice('Enter the real client, deal title and valid amount.');
                        return;
                      }
                      const saved = await onCreateCRM({
                        clientName: newOppClient.trim(), title: newOppTitle.trim(), value: newOppValue
                      });
                      if (!saved) {
                        setMpNotice('CRM opportunity not saved. Please review server validation.');
                        return;
                      }
                      setShowNewOppModal(false);
                      setNewOppTitle('');
                      setNewOppClient('');
                      setNewOppValue(0);
                      setMpNotice(`CRM Opportunity "${saved.title}" saved to the server.`);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer shadow"
                  >
                    Save Deal to Pipeline
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 6: ESCROW DISPUTE RESOLUTION & ARBITRATION (Blueprint Section 37 & 40) */}
      {activeSubTab === 'DISPUTES' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-400" />
                Marketplace Escrow Dispute & Arbitration Center
              </h3>
              <p className="text-xs text-slate-400">
                Record project disputes and internal recommendations. This app does not hold escrow or process refunds.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                {marketplaceDisputes.filter(d => !d.status.startsWith('RESOLVED')).length} Active Disputes Under Review
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={projects.length === 0}
              onClick={() => { setDisputeProjectId(projects[0]?.id || ''); setShowDisputeModal(true); }}
              className="px-3 py-2 rounded-lg bg-amber-700 text-white text-xs disabled:opacity-40"
            >Record Project Dispute</button>
            {projects.length === 0 && <span className="text-xs text-slate-500">Create a real project first</span>}
          </div>
          {showDisputeModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4">
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  const amount = Number(disputeAmount);
                  if (!disputeProjectId || !disputeReason.trim() || !disputeClaim.trim() ||
                      !Number.isFinite(amount) || amount <= 0) {
                    setMpNotice('Project, actual reason, customer statement and positive disputed amount required.');
                    return;
                  }
                  const saved = await onCreateDispute({
                    projectId: disputeProjectId, reason: disputeReason.trim(),
                    customerClaim: disputeClaim.trim(), disputedAmount: amount
                  });
                  if (!saved) { setMpNotice('Dispute not recorded.'); return; }
                  setSelectedDisputeId(saved.id);
                  setShowDisputeModal(false);
                  setDisputeReason(''); setDisputeClaim(''); setDisputeAmount('');
                  setMpNotice(`Dispute ${saved.disputeNumber} recorded. No escrow funds held or moved.`);
                }}
                className="w-full max-w-lg bg-slate-900 border border-amber-900 rounded-xl p-6 space-y-4"
              >
                <h3 className="text-white font-bold">New Internal Dispute Record</h3>
                <label className="block text-xs text-slate-300">Existing project</label>
                <select required value={disputeProjectId} onChange={e => setDisputeProjectId(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2 border border-slate-700 rounded">
                  {projects.map(project => <option key={project.id} value={project.id}>{project.projectCode} — {project.title}</option>)}
                </select>
                <label className="block text-xs text-slate-300">Reason</label>
                <input required value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2 border border-slate-700 rounded" />
                <label className="block text-xs text-slate-300">Customer statement</label>
                <textarea required value={disputeClaim} onChange={e => setDisputeClaim(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2 border border-slate-700 rounded" rows={3} />
                <label className="block text-xs text-slate-300">Amount in dispute (₹), not escrow held</label>
                <input type="number" min={0.01} step="0.01" required value={disputeAmount}
                  onChange={e => setDisputeAmount(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2 border border-slate-700 rounded" />
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowDisputeModal(false)} className="px-3 py-2 text-slate-300">Cancel</button>
                  <button type="submit" className="px-3 py-2 bg-amber-700 text-white rounded">Save Dispute</button>
                </div>
              </form>
            </div>
          )}

          {/* Master-Detail Disputes */}
          {marketplaceDisputes.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Scale className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Active Escrow Disputes</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  No dispute records have been filed in this workspace. No escrow status is inferred.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Dispute Cases */}
            <div className="lg:col-span-4 space-y-3">
              {marketplaceDisputes.map(dispute => {
                const isSelected = selectedDisputeId === dispute.id;
                const isResolved = dispute.status.startsWith('RESOLVED');
                return (
                  <div
                    key={dispute.id}
                    onClick={() => setSelectedDisputeId(dispute.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-800 border-amber-500 ring-1 ring-amber-500 shadow-md' 
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="font-mono text-amber-400 font-bold">{dispute.disputeNumber}</span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[9px] ${
                        isResolved
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {dispute.status}
                      </span>
                    </div>

                    <h4 className="font-semibold text-xs text-white my-1">{dispute.projectTitle}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Disputed amount: <strong className="text-amber-400">₹{dispute.disputedAmount.toLocaleString()}</strong>
                    </p>
                    <div className="text-[10px] text-slate-500 mt-2 flex justify-between">
                      <span>Customer: {dispute.customerName}</span>
                      <span>{dispute.createdAt}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Dispute Adjudication Workspace */}
            <div className="lg:col-span-8">
              {(() => {
                const activeDispute = marketplaceDisputes.find(d => d.id === selectedDisputeId) || marketplaceDisputes[0];
                if (!activeDispute) return <div className="p-8 text-slate-500 text-xs">No dispute selected</div>;
                const isResolved = activeDispute.status.startsWith('RESOLVED');

                return (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            {activeDispute.disputeNumber}
                          </span>
                          <span className="font-mono text-xs text-slate-400">Project: {activeDispute.projectId}</span>
                        </div>
                        <h2 className="text-lg font-bold text-white mt-1">{activeDispute.projectTitle}</h2>
                        <p className="text-xs text-slate-400 mt-1">
                          Parties: <strong className="text-white">{activeDispute.customerName}</strong> (Client) vs <strong className="text-white">{activeDispute.providerName}</strong> (Provider)
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase font-mono block">Disputed Amount (not held in escrow)</span>
                        <div className="text-2xl font-bold font-mono text-emerald-400">
                          ₹{activeDispute.disputedAmount.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Claims Statement Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Client Claim */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-rose-900/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-rose-400 uppercase font-mono flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Client Grievance & Claim
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed italic">
                          "{activeDispute.customerClaim}"
                        </p>
                      </div>

                      {/* Provider Defense */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-indigo-400 uppercase font-mono flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Provider Submission & Defense
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed italic">
                          "{activeDispute.providerRebuttal}"
                        </p>
                      </div>
                    </div>

                    {/* AI Mediation Recommendation */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-indigo-900/60 space-y-2">
                      <span className="text-xs font-bold text-indigo-300 uppercase font-mono flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        Mediation Notes (only if recorded)
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {activeDispute.aiMediationVerdict}
                      </p>
                    </div>

                    {/* Resolution Status & Arbitration Actions */}
                    {isResolved ? (
                      <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-300">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Historical dispute status (verify external payment records)</span>
                        </div>
                        <p className="text-emerald-400/90 text-[11px]">
                          <strong>Ruling Status:</strong> {activeDispute.status}
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <span className="text-xs font-bold text-white uppercase font-mono block">
                          Record Internal Recommendation (no money movement):
                        </span>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <button
                            onClick={async () => {
                              const saved = await onRecordDisputeDecision(activeDispute.id, 'RELEASE_RECOMMENDED');
                              if (saved) setMpNotice('Provider release recommendation recorded; no funds transferred.');
                            }}
                            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer text-center"
                          >
                            Recommend Release (no payment)
                          </button>

                          <button
                            onClick={async () => {
                              const saved = await onRecordDisputeDecision(activeDispute.id, 'REFUND_RECOMMENDED');
                              if (saved) setMpNotice('Refund recommendation recorded; no money returned.');
                            }}
                            className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition cursor-pointer text-center"
                          >
                            Recommend Refund (no payment)
                          </button>

                          <button
                            onClick={async () => {
                              const saved = await onRecordDisputeDecision(activeDispute.id, 'REWORK_RECOMMENDED');
                              if (saved) setMpNotice('Rework recommendation recorded; provider not contacted.');
                            }}
                            className="p-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition cursor-pointer text-center"
                          >
                            Recommend Provider Rework
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>

          </div>
          )}
        </div>
      )}

      {/* Modal: Post New Project */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Post New Enterprise IT Project</h3>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProjectSubmit} className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Project Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Cisco Core Switch & Firewall Redundancy Setup"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Client Company</label>
                  <input
                    type="text"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="e.g. Nexus FinTech Tower"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Total Budget (₹)</label>
                  <input
                    type="number"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="Cloud Migration">Cloud Migration</option>
                  <option value="Enterprise Cabling">Enterprise Cabling</option>
                  <option value="Network Security">Network Security</option>
                  <option value="Hardware Overhaul">Hardware Overhaul</option>
                  <option value="Disaster Recovery">Disaster Recovery</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Scope of Work & Deliverables</label>
                <textarea
                  rows={3}
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  placeholder="Describe technical requirements, number of nodes, and required SLA."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="border-t border-slate-700 pt-3 space-y-2">
                <p className="text-amber-300 text-xs">Optional actual work milestone — no automatic financing or escrow</p>
                <input aria-label="Milestone title" value={newMilestoneTitle}
                  onChange={e => setNewMilestoneTitle(e.target.value)}
                  placeholder="Milestone title (optional)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                <div className="grid grid-cols-2 gap-3">
                  <input aria-label="Milestone amount" type="number" min="0.01" step="0.01"
                    value={newMilestoneAmount} onChange={e => setNewMilestoneAmount(e.target.value)}
                    placeholder="Amount in ₹" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                  <input aria-label="Milestone due date" type="date" value={newMilestoneDueDate}
                    onChange={e => setNewMilestoneDueDate(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                >
                  Publish Project & Notify Providers
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Proposal Modal */}
      {showAddProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base text-white">Submit Commercial Bid / Proposal</h3>
              </div>
              <button
                onClick={() => setShowAddProposalModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProposalSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Service Provider / SI Entity Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Certified Networks Pvt Ltd"
                  value={propBidProvider}
                  onChange={(e) => setPropBidProvider(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Commercial Bid (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 180000"
                    value={propBidAmount}
                    onChange={(e) => setPropBidAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Estimated Turnaround (Days) *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={propBidDays}
                    onChange={(e) => setPropBidDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Technical Architecture Summary</label>
                <textarea
                  rows={3}
                  placeholder="Detail delivery methodology, OEM redundancy, and SLA compliance..."
                  value={propBidApproach}
                  onChange={(e) => setPropBidApproach(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-indigo-950/20 border border-indigo-800/40 rounded-xl text-indigo-300 text-[11px] space-y-1">
                <span className="font-bold block">Internal Proposal Record:</span>
                <span>• Submitted bid and technical approach are unverified; no AI matching or OEM checks were performed</span>
                <span className="block">• Provider verification and escrow/payment settlement are not integrated</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddProposalModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer shadow"
                >
                  Submit Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
