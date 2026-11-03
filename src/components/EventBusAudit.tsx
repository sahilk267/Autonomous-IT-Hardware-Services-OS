import React, { useState } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  Send, 
  Cpu, 
  Play, 
  CheckCircle2, 
  Layers, 
  Sparkles, 
  Lock,
  Search,
  Filter
} from 'lucide-react';
import { AutonomousEvent } from '../types';

interface EventBusAuditProps {
  events: AutonomousEvent[];
  onSimulateEvent: (type: 'MARGIN_BREACH' | 'SHORTAGE' | 'BATTERY_ALERT') => void;
  isCleanSlate?: boolean;
}

export const EventBusAudit: React.FC<EventBusAuditProps> = ({
  events,
  onSimulateEvent,
  isCleanSlate = false
}) => {
  const [filterAgent, setFilterAgent] = useState<string>('ALL');

  const filteredEvents = events.filter(e => {
    return filterAgent === 'ALL' || e.agent === filterAgent;
  });

  const autoExecutedCount = isCleanSlate 
    ? events.filter(e => !e.humanApprovalRequired).length 
    : 1842 + events.filter(e => !e.humanApprovalRequired).length;
    
  const telegramExceptionsCount = isCleanSlate 
    ? events.filter(e => e.humanApprovalRequired).length 
    : 184 + events.filter(e => e.humanApprovalRequired).length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-rose-400" />
            Autonomous Event Bus & Immutable Audit Trail
          </h1>
          <p className="text-sm text-slate-400">
            Real-time streaming ledger of all autonomous AI actions, rule evaluations, confidence scores, and Telegram human-in-the-loop escalations.
          </p>
        </div>

        {/* Live Simulation Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Test Simulator:</span>
          <button
            onClick={() => onSimulateEvent('MARGIN_BREACH')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-amber-500/30 cursor-pointer transition flex items-center gap-1.5"
          >
            <Play className="w-3 h-3" />
            Simulate 9.8% Margin Breach
          </button>
          <button
            onClick={() => onSimulateEvent('SHORTAGE')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold border border-rose-500/30 cursor-pointer transition flex items-center gap-1.5"
          >
            <Play className="w-3 h-3" />
            Simulate Switch Shortage
          </button>
        </div>
      </div>

      {/* Autonomous Split Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-mono">Auto-Executed Decisions (90%)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{autoExecutedCount} Operations</div>
          <p className="text-xs text-slate-400 mt-1">
            Standard pricing, lead scoring, quote dispatch, inventory reservations executed without human delay.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-mono">Telegram Exceptions (10%)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{telegramExceptionsCount} Approvals</div>
          <p className="text-xs text-slate-400 mt-1">
            Low margins, high-value purchase orders, and credit exceptions authorized by Business Owner.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-mono">AI Governance & Safety</span>
            <Lock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-400 mt-2">100% Audited</div>
          <p className="text-xs text-slate-400 mt-1">
            Zero hallucinations: AI operates strictly within database truths, supplier APIs, and financial rules.
          </p>
        </div>
      </div>

      {/* Main Audit Trail Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Controls */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-400">Real-Time Event Stream</span>
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {['ALL', 'Pricing Agent', 'Procurement Agent', 'SLA Monitor', 'Telegram Orchestrator'].map((ag) => (
              <button
                key={ag}
                onClick={() => setFilterAgent(ag)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition ${
                  filterAgent === ag
                    ? 'bg-slate-800 text-rose-300 border border-rose-500/40'
                    : 'text-slate-400 hover:text-white bg-slate-950/60'
                }`}
              >
                {ag}
              </button>
            ))}
          </div>
        </div>

        {/* Feed List */}
        <div className="divide-y divide-slate-800">
          {filteredEvents.map((evt) => (
            <div key={evt.id} className="p-4 hover:bg-slate-800/30 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold text-rose-400">{evt.eventType}</span>
                  <span className="text-slate-500 text-xs">•</span>
                  <span className="text-xs font-semibold text-slate-300">{evt.agent}</span>
                  <span className="text-slate-500 text-xs">•</span>
                  <span className="text-[10px] font-mono text-slate-500">{evt.timestamp}</span>
                </div>
                
                <h4 className="font-bold text-sm text-white">{evt.summary}</h4>
                <p className="text-xs text-slate-400">{evt.autonomousActionTaken}</p>
              </div>

              <div className="flex flex-col sm:items-end gap-1 shrink-0">
                {evt.humanApprovalRequired ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono text-[10px] font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Telegram Approval Required
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Auto-Executed (Rule Matched)
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-500">
                  Confidence: {(evt.confidenceScore * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
