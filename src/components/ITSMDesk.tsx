import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  AlertTriangle, 
  Clock, 
  Activity, 
  Server, 
  Laptop, 
  ShieldAlert, 
  CheckCircle2, 
  UserPlus, 
  Wrench, 
  RefreshCw,
  Zap,
  Play,
  BookOpen,
  Search,
  ThumbsUp,
  Check,
  Sparkles,
  Plus,
  X
} from 'lucide-react';
import { ITSMTicket, EndpointHealth, CMDBNode, KnowledgeArticle } from '../types';
import { initialKnowledgeArticles } from '../data/mockData';

interface ITSMDeskProps {
  tickets: ITSMTicket[];
  endpoints: EndpointHealth[];
  cmdbNodes: CMDBNode[];
  onResolveTicket: (ticketId: string) => void;
  onRemoteFix: (endpointId: string, actionName: string) => void;
  onCreateTicket?: (newTicket: Partial<ITSMTicket> & { description?: string; department?: string }) => void;
  onAddEndpoint?: (endpoint: EndpointHealth) => void;
  isCleanSlate?: boolean;
}

export const ITSMDesk: React.FC<ITSMDeskProps> = ({
  tickets,
  endpoints,
  cmdbNodes,
  onResolveTicket,
  onRemoteFix,
  onCreateTicket,
  onAddEndpoint,
  isCleanSlate = false
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'tickets' | 'rmm' | 'cmdb' | 'lifecycle' | 'kb'>('tickets');
  const [selectedTicketId, setSelectedTicketId] = useState<string>(tickets[0]?.id || '');
  const [simulatedOutageNode, setSimulatedOutageNode] = useState<string | null>(null);
  const [remediatingDevice, setRemediatingDevice] = useState<string | null>(null);

  // New Ticket Modal State
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRequester, setNewRequester] = useState('');
  const [newDept, setNewDept] = useState('Engineering');
  const [newPriority, setNewPriority] = useState<ITSMTicket['priority']>('HIGH');
  const [newCategory, setNewCategory] = useState<ITSMTicket['category']>('Network Outage');
  const [newDescription, setNewDescription] = useState('');

  // Endpoint Enrollment Modal State
  const [showEnrollEndpointModal, setShowEnrollEndpointModal] = useState(false);
  const [newEpDeviceName, setNewEpDeviceName] = useState('');
  const [newEpUser, setNewEpUser] = useState('');
  const [newEpOs, setNewEpOs] = useState('Windows 11 Pro 23H2 (x64)');

  const handleEnrollEndpointSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEpDeviceName.trim()) return;

    const newEndpoint: EndpointHealth = {
      id: `ep-${Date.now()}`,
      deviceName: newEpDeviceName.trim(),
      assignedUser: newEpUser.trim() || 'Unassigned',
      os: newEpOs,
      lastSeen: 'Just now',
      cpuLoad: 24,
      ramUsagePercent: 52,
      diskFreePercent: 68,
      batteryHealthPercent: 98,
      smartStatus: 'HEALTHY',
      antivirusStatus: 'UP_TO_DATE'
    };

    if (onAddEndpoint) {
      onAddEndpoint(newEndpoint);
    }
    setShowEnrollEndpointModal(false);
    setNewEpDeviceName('');
    setNewEpUser('');
  };

  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || tickets[0] || null;

  // Knowledge Base & RAG state
  const [kbArticles, setKbArticles] = useState<KnowledgeArticle[]>(
    isCleanSlate ? [] : initialKnowledgeArticles
  );
  const [kbSearchTerm, setKbSearchTerm] = useState('');
  const [selectedKbCat, setSelectedKbCat] = useState<string>('ALL');
  const [selectedArticleId, setSelectedArticleId] = useState<string>(
    isCleanSlate ? '' : (initialKnowledgeArticles[0]?.id || 'kb-1')
  );
  const [resolvedKbCount, setResolvedKbCount] = useState<number>(isCleanSlate ? 0 : 1565);
  const [copiedStepIndex, setCopiedStepIndex] = useState<number | null>(null);
  const [solvedBanner, setSolvedBanner] = useState<string | null>(null);

  useEffect(() => {
    if (isCleanSlate) {
      setKbArticles([]);
      setSelectedArticleId('');
      setResolvedKbCount(0);
      setSelectedTicketId('');
    } else {
      setKbArticles(initialKnowledgeArticles);
      setSelectedArticleId(initialKnowledgeArticles[0]?.id || 'kb-1');
      setResolvedKbCount(1565);
      setSelectedTicketId(tickets[0]?.id || '');
    }
  }, [isCleanSlate]);

  // Remote Shell & Support Modal State (Blueprint Section 21)
  const [remoteSessionDevice, setRemoteSessionDevice] = useState<EndpointHealth | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    'Apex RMM Remote Terminal Gateway v4.8 [Secure TLS 1.3 Session #RMM-9921]',
    'User consent confirmed: Authorized by user with time-stamped 2FA token',
    'Ready. Type or select any diagnostic command below to execute remotely.'
  ]);
  const [commandInput, setCommandInput] = useState('');
  const [isExecutingCmd, setIsExecutingCmd] = useState(false);

  const handleExecuteCommand = (cmdText: string) => {
    const command = (cmdText || commandInput).trim();
    if (!command) return;
    setIsExecutingCmd(true);
    setTerminalOutput(prev => [...prev, `PS C:\\Windows\\system32> ${command}`]);

    setTimeout(() => {
      let result = '';
      if (command.includes('gpupdate')) {
        result = 'Updating policy...\nComputer Policy update has completed successfully.\nUser Policy update has completed successfully.';
      } else if (command.includes('systeminfo')) {
        result = `OS Name: Microsoft Windows 11 Enterprise\nOS Version: 10.0.22631 N/A Build 22631\nSystem Manufacturer: ThinkPad T14 / Dell OptiPlex\nTotal Physical Memory: 32,580 MB\nHotfix(s): 14 Security Patches Installed.\nNetwork Adapter: Intel Wi-Fi 6E AX211 (IP: 192.168.10.142)`;
      } else if (command.includes('sfc')) {
        result = 'Beginning system scan.\nVerification 100% complete.\nWindows Resource Protection did not find any integrity violations.';
      } else if (command.includes('tasklist') || command.includes('cpu')) {
        result = 'Image Name                     PID Session Name        Mem Usage\nSystem                           4 Services                    124 K\nmsedge.exe                    8492 Console                 182,420 K\ncode.exe                     11048 Console                 245,880 K\nsvchost.exe                   1940 Services                 24,190 K';
      } else if (command.includes('netstat')) {
        result = '  Proto  Local Address          Foreign Address        State           PID\n  TCP    192.168.10.142:58210   52.167.214.18:443      ESTABLISHED     11048\n  TCP    192.168.10.142:58221   20.190.159.23:443      ESTABLISHED     8492';
      } else {
        result = `[OK] Command "${command}" executed with exit code 0. Standard output stream flushed.`;
      }
      setTerminalOutput(prev => [...prev, result]);
      setIsExecutingCmd(false);
      setCommandInput('');
    }, 600);
  };

  const handleRunRemediation = (endpointId: string, action: string) => {
    setRemediatingDevice(endpointId);
    setTimeout(() => {
      onRemoteFix(endpointId, action);
      setRemediatingDevice(null);
    }, 1200);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-amber-400" />
            Enterprise ITSM Desk, RMM & CMDB Operations
          </h1>
          <p className="text-sm text-slate-400">
            SLA-enforced incident management, real-time endpoint telemetry, and configuration dependency impact analysis.
          </p>
        </div>

        {/* Sub Navigation */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveSubTab('tickets')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'tickets' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Service Desk</span>
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {tickets.filter(t => t.status !== 'RESOLVED').length}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('rmm')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'rmm' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            RMM Endpoint Telemetry
          </button>
          <button
            onClick={() => setActiveSubTab('cmdb')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'cmdb' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            CMDB Dependency Graph
          </button>
          <button
            onClick={() => setActiveSubTab('lifecycle')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              activeSubTab === 'lifecycle' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Joiner / Mover / Leaver
          </button>
          <button
            onClick={() => setActiveSubTab('kb')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'kb' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Knowledge Base & RAG</span>
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: ITSM Service Desk */}
      {activeSubTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left 1 Col: Tickets List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-400">Incident Queue ({tickets.length})</span>
              </div>
              <button
                onClick={() => setShowNewTicketModal(true)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Ticket</span>
              </button>
            </div>

            <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
              {tickets.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-3">
                  <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">No active incident tickets in queue.</p>
                  <button
                    onClick={() => setShowNewTicketModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition cursor-pointer"
                  >
                    + Log Incident Ticket
                  </button>
                </div>
              ) : (
                tickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  const isCritical = t.priority === 'CRITICAL';
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`p-4 cursor-pointer transition ${
                        isSelected ? 'bg-slate-800/80 border-l-4 border-amber-500' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono font-bold text-slate-400">{t.ticketNumber}</span>
                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          isCritical ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse' :
                          t.priority === 'HIGH' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-blue-950 text-blue-300'
                        }`}>
                          {t.priority}
                        </span>
                      </div>

                      <h4 className="font-semibold text-sm text-white line-clamp-1 mb-1">{t.title}</h4>
                      
                      <div className="text-xs text-slate-400 flex items-center justify-between mt-2">
                        <span>{t.requesterName}</span>
                        <span className="font-mono text-emerald-400 text-[11px] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t.slaExpiresAt}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right 2 Cols: Ticket Detail & Auto-Action */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-amber-400 text-xs">{selectedTicket.ticketNumber}</span>
                      <span className="text-xs text-slate-400">• Category: {selectedTicket.category}</span>
                    </div>
                    <h2 className="text-lg font-bold text-white">{selectedTicket.title}</h2>
                  </div>

                  <span className={`px-3 py-1 rounded-full font-bold text-xs font-mono uppercase ${
                    selectedTicket.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-blue-950 text-blue-300 border border-blue-800'
                  }`}>
                    {selectedTicket.status}
                  </span>
                </div>

                {/* SLA Meter */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-semibold">SLA Window Consumption:</span>
                    <span className="font-mono text-amber-400 font-bold">{selectedTicket.slaPercentUsed}% Consumed ({selectedTicket.slaExpiresAt})</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${selectedTicket.slaPercentUsed > 75 ? 'bg-rose-500' : 'bg-amber-400'}`}
                      style={{ width: `${selectedTicket.slaPercentUsed}%` }}
                    ></div>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                    <span>Target First Response: 15 mins (Met ✓)</span>
                    <span>Target Resolution: 4 Hours Max</span>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Requester</span>
                    <span className="font-semibold text-white">{selectedTicket.requesterName}</span>
                    <span className="text-slate-400 block text-[11px]">{selectedTicket.requesterDept}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Assigned Engineer</span>
                    <span className="font-semibold text-white">{selectedTicket.assignedAgent}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Affected Hardware</span>
                    <span className="font-mono text-indigo-300">{selectedTicket.deviceAffected || 'N/A'}</span>
                  </div>
                </div>

                {/* Diagnostic Root Cause */}
                {selectedTicket.rootCause && (
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                      <Wrench className="w-4 h-4" />
                      AI Diagnostic Root Cause Hypothesis:
                    </span>
                    <p className="text-slate-300 leading-relaxed">{selectedTicket.rootCause}</p>
                  </div>
                )}

                {/* Remediation & Action Bar */}
                <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onResolveTicket(selectedTicket.id)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Resolved with Customer Sign-Off
                    </button>
                    <button
                      onClick={() => alert("Parts requisition auto-dispatched to inventory store.")}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 cursor-pointer"
                    >
                      Request Spare Part
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500">
                    Logged: {selectedTicket.createdAt}
                  </span>
                </div>

              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-4">
                <Layers className="w-12 h-12 text-slate-700 mx-auto" />
                <div>
                  <h4 className="font-bold text-slate-300 text-sm">No Incident Selected</h4>
                  <p className="text-xs text-slate-500 mt-1">Select an incident from the queue or log a new incident ticket to begin triage.</p>
                </div>
                <button
                  onClick={() => setShowNewTicketModal(true)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  + Log Incident Ticket
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Sub-Tab 2: RMM Endpoint Telemetry */}
      {activeSubTab === 'rmm' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  Live RMM Endpoint Telemetry & Autonomous Health Agent
                </h3>
                <p className="text-xs text-slate-400">
                  Continuous hardware health polling: CPU load, DDR5 memory pressure, NVMe SSD SMART life, and predictive battery degradation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEnrollEndpointModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Enroll Endpoint</span>
                </button>
                <span className="px-3 py-1.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-xs font-semibold">
                  RMM Agent v4.8 Active
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {endpoints.length === 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-4 col-span-full">
                  <Activity className="w-10 h-10 text-slate-700 mx-auto" />
                  <div>
                    <h4 className="font-bold text-slate-300 text-sm">No Endpoint Telemetry Enrolled</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">Deploy the Apex RMM Lightweight Agent onto Windows, macOS, or Linux endpoints to stream real-time telemetry.</p>
                  </div>
                  <button
                    onClick={() => setShowEnrollEndpointModal(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Enroll First Endpoint</span>
                  </button>
                </div>
              ) : (
                endpoints.map((ep) => {
                  const isRemediating = remediatingDevice === ep.id;
                  return (
                    <div key={ep.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-sm text-white">{ep.deviceName}</h4>
                        <span className="text-xs text-slate-400">{ep.assignedUser}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{ep.lastSeen}</span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                      OS: {ep.os}
                    </div>

                    {/* Meters */}
                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-0.5">
                          <span>CPU Load:</span>
                          <span className="font-mono font-bold text-white">{ep.cpuLoad}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                          <div className={`h-full ${ep.cpuLoad > 80 ? 'bg-rose-500' : 'bg-emerald-400'}`} style={{ width: `${ep.cpuLoad}%` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-400 mb-0.5">
                          <span>RAM Usage:</span>
                          <span className="font-mono font-bold text-white">{ep.ramUsagePercent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                          <div className={`h-full ${ep.ramUsagePercent > 85 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${ep.ramUsagePercent}%` }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-400 mb-0.5">
                          <span>Battery Health:</span>
                          <span className={`font-mono font-bold ${ep.batteryHealthPercent < 40 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {ep.batteryHealthPercent}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                          <div className={`h-full ${ep.batteryHealthPercent < 40 ? 'bg-rose-500' : 'bg-emerald-400'}`} style={{ width: `${ep.batteryHealthPercent}%` }}></div>
                        </div>
                      </div>
                    </div>

                    {/* SMART Disk status */}
                    <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                      <span className="text-slate-400">SMART Health:</span>
                      <span className={`font-bold font-mono px-2 py-0.5 rounded text-[10px] ${
                        ep.smartStatus === 'HEALTHY' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300 animate-pulse'
                      }`}>
                        {ep.smartStatus}
                      </span>
                    </div>

                    {/* Remote Remediation Trigger */}
                    <div className="pt-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleRunRemediation(ep.id, 'Disk Cleanup & Process Flush')}
                        disabled={isRemediating}
                        className="py-2 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 text-xs font-semibold border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        {isRemediating ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Remediating...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" />
                            <span>1-Click Fix</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setRemoteSessionDevice(ep);
                          setTerminalOutput([
                            `Apex RMM Remote Terminal Gateway v4.8 [Secure TLS 1.3 Session #${ep.id.toUpperCase()}]`,
                            `Connected to endpoint: ${ep.deviceName} (${ep.os})`,
                            `Assigned User: ${ep.assignedUser} • Consent verified via 2FA token`,
                            `Type or select any diagnostic command below.`
                          ]);
                        }}
                        className="py-2 px-2.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 text-xs font-semibold border border-indigo-700/60 transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Laptop className="w-3.5 h-3.5" />
                        <span>Remote Shell</span>
                      </button>
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Interactive CMDB Dependency Graph */}
      {activeSubTab === 'cmdb' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-amber-400" />
                CMDB Configuration Item & Cascading Impact Engine
              </h3>
              <p className="text-xs text-slate-400">
                Interactive topology showing upstream and downstream dependencies. Click a node to simulate component failure and view service impact.
              </p>
            </div>

            <button
              onClick={() => setSimulatedOutageNode(simulatedOutageNode ? null : 'cmdb-4')}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition cursor-pointer ${
                simulatedOutageNode
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {simulatedOutageNode ? 'Reset Outage Simulation' : 'Simulate Core Switch Failure'}
            </button>
          </div>

          {/* Visual Topology Diagram */}
          <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center text-xs">
              {cmdbNodes.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-3 col-span-full">
                  <Server className="w-10 h-10 text-slate-700 mx-auto" />
                  <h4 className="font-bold text-slate-300 text-sm">No CMDB Topology Discovered</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">Run network auto-discovery to map IT switches, hypervisors, and service dependency graphs.</p>
                </div>
              ) : (
                cmdbNodes.map((node) => {
                  const isDown = simulatedOutageNode === node.id || (simulatedOutageNode === 'cmdb-4' && ['cmdb-1', 'cmdb-2', 'cmdb-3'].includes(node.id));
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSimulatedOutageNode(simulatedOutageNode === node.id ? null : node.id)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        isDown
                          ? 'bg-rose-950/60 border-rose-600 text-rose-200 ring-2 ring-rose-500'
                          : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-[10px] font-mono text-slate-400 uppercase">{node.type}</div>
                      <div className="font-bold text-sm my-1 text-white">{node.name}</div>
                      <div className="font-mono text-[10px] text-indigo-400">{node.ipAddress}</div>
                      
                      <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] font-bold">
                        {isDown ? (
                          <span className="text-rose-400 animate-pulse">IMPACTED (DOWN)</span>
                        ) : (
                          <span className="text-emerald-400">OPERATIONAL</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Impact Assessment Box */}
            {simulatedOutageNode && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-200">
                <span className="font-bold block text-sm mb-1 text-rose-400">
                  🚨 CASCADING FAILURE IMPACT ANALYSIS:
                </span>
                <p>
                  Failure of Core Network Switch (Cisco CBS350) severs connectivity between the <strong>Trading API Gateway</strong> and the <strong>PostgreSQL High-Availability Cluster</strong>. 2 Enterprise client services are currently at risk. Automated failover route via Secondary SFP Uplink and Telegram Escalation initiated.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Joiner / Mover / Leaver Workflows */}
      {activeSubTab === 'lifecycle' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              Autonomous Employee Joiner / Mover / Leaver (JML) Workflows
            </h3>
            <span className="text-xs font-mono text-indigo-400 bg-indigo-950 px-2.5 py-1 rounded-lg border border-indigo-800">
              Zero-Touch IT Provisioning
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Automatically synchronizes HR events with hardware asset allocation, Microsoft 365 licensing, and VPN credentials.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm text-white">Joiner Package (New Hire)</span>
                <span className="text-xs text-emerald-400 font-mono">Auto-Trigger</span>
              </div>
              <p className="text-xs text-slate-400">
                Reserves Dell OptiPlex from warehouse, provisions Win 11 image, creates Entra ID user & issues M365 Business Premium license.
              </p>
              <button 
                onClick={() => alert("Simulation Triggered: New Joiner Workstation kit reserved in Mumbai Hub Bin A-14.")}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer"
              >
                Simulate New Joiner Onboarding
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm text-white">Mover Workflow (Dept Change)</span>
                <span className="text-xs text-sky-400 font-mono">Access Review</span>
              </div>
              <p className="text-xs text-slate-400">
                Audits current software licenses, updates department cost center, and reconfigures VLAN network group.
              </p>
              <button 
                onClick={() => alert("Simulation Triggered: License audit passed. Department cost center transferred.")}
                className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs cursor-pointer"
              >
                Simulate Department Transfer
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm text-white">Leaver Workflow (Offboarding)</span>
                <span className="text-xs text-rose-400 font-mono">Asset Recovery</span>
              </div>
              <p className="text-xs text-slate-400">
                Instantly revokes session tokens, schedules courier laptop recovery, releases SaaS licenses back into pool.
              </p>
              <button 
                onClick={() => alert("Simulation Triggered: Account suspended and courier return label generated.")}
                className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs cursor-pointer"
              >
                Simulate Employee Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 5: Self-Service Knowledge Base & AI RAG (Blueprint Section 14 & 19) */}
      {activeSubTab === 'kb' && (
        <div className="space-y-6">
          {/* KB Top Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow">
              <span className="text-xs text-slate-400 font-medium">Self-Service Deflection Rate</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-baseline gap-2">
                <span>{kbArticles.length === 0 ? '0.0%' : '42.8%'}</span>
                <span className="text-xs text-emerald-500 font-normal">{kbArticles.length === 0 ? 'Baseline' : '↑ 6.4% MoM'}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Issues solved before raising ticket</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow">
              <span className="text-xs text-slate-400 font-medium">Total Solved Without IT Helpdesk</span>
              <div className="text-2xl font-bold text-white mt-1 flex items-baseline gap-2">
                <span>{resolvedKbCount.toLocaleString()}</span>
                <span className="text-xs text-indigo-400 font-normal">Deflected</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Zero-cost autonomous resolutions</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow">
              <span className="text-xs text-slate-400 font-medium">Mean Time to Self-Resolve</span>
              <div className="text-2xl font-bold text-amber-300 mt-1 flex items-baseline gap-2">
                <span>2.4 min</span>
                <span className="text-xs text-slate-400 font-normal">avg</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">vs 3.8 hrs human response SLA</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow">
              <span className="text-xs text-slate-400 font-medium">Active RAG SOP Runbooks</span>
              <div className="text-2xl font-bold text-sky-400 mt-1 flex items-baseline gap-2">
                <span>{kbArticles.length}</span>
                <span className="text-xs text-slate-400 font-normal">Verified Articles</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Grounded in OEM & Enterprise Docs</p>
            </div>
          </div>

          {/* Success Banner if Solved */}
          {solvedBanner && (
            <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong>Self-Service Success:</strong> {solvedBanner}. IT ticket creation averted and employee downtime reduced to zero.
                </span>
              </div>
              <button 
                onClick={() => setSolvedBanner(null)}
                className="text-emerald-400 hover:text-white font-bold ml-4 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Search & Category Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search Knowledge Base articles, symptoms, or SOPs (e.g., VPN Error 98, BitLocker, Outlook OST, Printer)..."
                  value={kbSearchTerm}
                  onChange={(e) => setKbSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none py-1">
                {['ALL', 'Network & VPN', 'Windows & OS', 'Security & Auth', 'Hardware & Peripherals', 'SaaS & M365'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedKbCat(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      selectedKbCat === cat 
                        ? 'bg-indigo-600 text-white shadow' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Master-Detail Article View */}
          {kbArticles.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto">
                <BookOpen className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Knowledge Base SOP Runbooks</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Author Standard Operating Procedures (SOPs) and RAG runbooks to deflect repetitive IT tickets and empower autonomous user self-resolution.
                </p>
              </div>
              <button
                onClick={() => {
                  setKbArticles(initialKnowledgeArticles);
                  setSelectedArticleId(initialKnowledgeArticles[0]?.id || 'kb-1');
                  setResolvedKbCount(1565);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer shadow-lg inline-flex items-center gap-2 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Load Standard Enterprise IT SOP Library</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Article List */}
            <div className="lg:col-span-4 space-y-3">
              {kbArticles
                .filter(a => {
                  const matchesSearch = a.title.toLowerCase().includes(kbSearchTerm.toLowerCase()) ||
                                        a.tags.some(t => t.toLowerCase().includes(kbSearchTerm.toLowerCase())) ||
                                        a.summary.toLowerCase().includes(kbSearchTerm.toLowerCase());
                  const matchesCat = selectedKbCat === 'ALL' || a.category === selectedKbCat;
                  return matchesSearch && matchesCat;
                })
                .map((art) => {
                  const isSelected = selectedArticleId === art.id;
                  return (
                    <div
                      key={art.id}
                      onClick={() => setSelectedArticleId(art.id)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        isSelected 
                          ? 'bg-slate-800 border-indigo-500 ring-1 ring-indigo-500 shadow-md' 
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-indigo-300 font-medium border border-slate-800">
                          {art.category}
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                          <Check className="w-3 h-3" />
                          {art.solvedCount} solved
                        </span>
                      </div>
                      <h4 className="font-semibold text-xs text-white leading-snug my-1.5">
                        {art.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {art.summary}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                        {art.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 font-mono">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Right: Selected Article Detail & Interactive Runbook */}
            <div className="lg:col-span-8">
              {(() => {
                const activeArt = kbArticles.find(a => a.id === selectedArticleId) || kbArticles[0];
                if (!activeArt) return <div className="text-slate-500 text-xs p-6">No article selected</div>;

                return (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                    {/* Header */}
                    <div className="border-b border-slate-800 pb-4">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 font-mono text-[10px] border border-indigo-800">
                          {activeArt.category}
                        </span>
                        <div className="flex items-center gap-3 text-slate-400 text-xs">
                          <span>⏱️ {activeArt.readTime} read</span>
                          <span>👁️ {activeArt.views} views</span>
                          <span className="text-emerald-400 font-bold">✓ {activeArt.solvedCount} self-resolutions</span>
                        </div>
                      </div>

                      <h2 className="text-lg font-bold text-white leading-snug">
                        {activeArt.title}
                      </h2>
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                        {activeArt.summary}
                      </p>
                    </div>

                    {/* Problem Symptoms Identification */}
                    <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2">
                      <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Observed Symptoms & Diagnostic Check:
                      </h4>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {activeArt.symptoms.map((symptom, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{symptom}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Step-by-Step Resolution Runbook */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        Interactive Self-Service Execution Steps:
                      </h4>

                      <div className="space-y-3">
                        {activeArt.selfServiceSteps.map((step, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-indigo-400 font-mono">Step {idx + 1}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(step);
                                  setCopiedStepIndex(idx);
                                  setTimeout(() => setCopiedStepIndex(null), 2000);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 font-medium transition cursor-pointer flex items-center gap-1"
                              >
                                {copiedStepIndex === idx ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copied!</span>
                                  </>
                                ) : (
                                  <span>Copy Command</span>
                                )}
                              </button>
                            </div>
                            <p className="font-mono text-slate-200 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-[11px] break-all">
                              {step}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Interactive Feedback & Deflection Action */}
                    <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h5 className="font-semibold text-xs text-white">Did this SOP solve your problem?</h5>
                        <p className="text-[11px] text-slate-400">Your feedback helps tune the autonomous RAG recommendation engine.</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setResolvedKbCount(prev => prev + 1);
                            setSolvedBanner(`"${activeArt.title}" marked as resolved`);
                            setKbArticles(prev => prev.map(a => a.id === activeArt.id ? { ...a, solvedCount: a.solvedCount + 1 } : a));
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition cursor-pointer flex items-center gap-1.5"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>Yes, Issue Resolved!</span>
                        </button>

                        <button
                          onClick={() => {
                            alert(`Creating pre-filled ITSM Ticket with diagnostic summary from SOP: ${activeArt.title}. Assigning L2 network engineer.`);
                            setActiveSubTab('tickets');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                        >
                          Escalate to IT Helpdesk
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
          )}
        </div>
      )}

      {/* Remote Shell & Support Modal (Blueprint Section 21) */}
      {remoteSessionDevice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <div>
                  <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                    <span>Remote Terminal & Diagnostic Session: {remoteSessionDevice.deviceName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Encrypted TLS 1.3
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    User: {remoteSessionDevice.assignedUser} • IP: 192.168.10.142 • Consent Token: Verified
                  </span>
                </div>
              </div>

              <button
                onClick={() => setRemoteSessionDevice(null)}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                Terminate Session
              </button>
            </div>

            {/* Simulated Terminal Console */}
            <div className="p-4 bg-slate-950 flex-1 overflow-y-auto font-mono text-xs text-emerald-400 space-y-2 min-h-[320px]">
              {terminalOutput.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap leading-relaxed">
                  {line.startsWith('PS C:') ? (
                    <span className="text-sky-300 font-bold">{line}</span>
                  ) : line.includes('Apex RMM') || line.includes('User consent') ? (
                    <span className="text-amber-400">{line}</span>
                  ) : (
                    <span className="text-emerald-300">{line}</span>
                  )}
                </div>
              ))}
              {isExecutingCmd && (
                <div className="text-slate-400 animate-pulse">
                  Executing command via agent pipeline...
                </div>
              )}
            </div>

            {/* Quick Command Chips */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>Quick Diagnostic Runbooks:</span>
                {[
                  'systeminfo',
                  'gpupdate /force',
                  'sfc /scannow',
                  'netstat -ano | findstr :443',
                  'tasklist'
                ].map((c, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleExecuteCommand(c)}
                    className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] cursor-pointer"
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleExecuteCommand(commandInput);
                }}
                className="flex gap-2"
              >
                <div className="flex-1 flex items-center bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono">
                  <span className="text-sky-400 mr-2">PS&gt;</span>
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="Enter diagnostic command or PowerShell cmdlet..."
                    className="w-full bg-transparent text-white focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isExecutingCmd}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>

          </div>
        </div>
      )}

      {/* New Incident Ticket Modal */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Log Enterprise Incident Ticket</h3>
              </div>
              <button
                onClick={() => setShowNewTicketModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTitle.trim() || !onCreateTicket) return;
                onCreateTicket({
                  title: newTitle,
                  requesterName: newRequester || 'Enterprise Employee',
                  requesterDept: newDept,
                  priority: newPriority,
                  category: newCategory,
                  description: newDescription || newTitle,
                  status: 'OPEN',
                  assignedAgent: 'Autonomous AI Triage',
                  slaExpiresAt: newPriority === 'CRITICAL' ? 'Within 30 Mins' : newPriority === 'HIGH' ? 'Within 2 Hours' : 'Within 8 Hours'
                });
                setShowNewTicketModal(false);
                setNewTitle('');
                setNewRequester('');
                setNewDescription('');
              }}
              className="p-5 space-y-3.5 text-xs"
            >
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Incident Summary / Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Core L3 Switch SFP+ Link Flapping in Data Center"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Requester Name</label>
                  <input
                    type="text"
                    value={newRequester}
                    onChange={(e) => setNewRequester(e.target.value)}
                    placeholder="e.g. Anand Rathi"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Department</label>
                  <input
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Priority & SLA</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="CRITICAL">🔴 CRITICAL (30 Min SLA)</option>
                    <option value="HIGH">🟡 HIGH (2 Hour SLA)</option>
                    <option value="MEDIUM">🔵 MEDIUM (8 Hour SLA)</option>
                    <option value="LOW">⚪ LOW (24 Hour SLA)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Network Outage">Network Outage</option>
                    <option value="Hardware Fault">Hardware Fault</option>
                    <option value="Access Request">Access Request</option>
                    <option value="Asset Procurement">Asset Procurement</option>
                    <option value="Software License">Software License</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Diagnostic Details / Logs</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe observed errors, error codes, or impacted users..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer shadow-lg"
                >
                  Log & Dispatch Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll RMM Endpoint Modal */}
      {showEnrollEndpointModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Enroll RMM Agent Endpoint</h3>
              </div>
              <button
                onClick={() => setShowEnrollEndpointModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEnrollEndpointSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Device Hostname *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MUM-FIN-LAP-02 or PROD-DB-NODE-01"
                  value={newEpDeviceName}
                  onChange={(e) => setNewEpDeviceName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Assigned Employee / Custodian</label>
                <input
                  type="text"
                  placeholder="e.g. Priya Nair (VP Finance)"
                  value={newEpUser}
                  onChange={(e) => setNewEpUser(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Operating System & Kernel</label>
                <select
                  value={newEpOs}
                  onChange={(e) => setNewEpOs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:border-emerald-500 focus:outline-none"
                >
                  <option value="Windows 11 Pro 23H2 (x64)">Windows 11 Pro 23H2 (x64)</option>
                  <option value="Windows Server 2025 Standard">Windows Server 2025 Standard</option>
                  <option value="macOS Sonoma 14.4 (Apple Silicon M3)">macOS Sonoma 14.4 (Apple Silicon M3)</option>
                  <option value="Ubuntu 24.04 LTS (Linux 6.8)">Ubuntu 24.04 LTS (Linux 6.8)</option>
                </select>
              </div>

              <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl text-emerald-300 text-[11px] space-y-1">
                <span className="font-bold block">Telemetry Configuration:</span>
                <span>• Daemon binds port 8443 with TLS 1.3 mutual auth</span>
                <span className="block">• Real-time CPU, RAM, NVMe SMART & Battery polling active</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEnrollEndpointModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer shadow"
                >
                  Enroll Endpoint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
