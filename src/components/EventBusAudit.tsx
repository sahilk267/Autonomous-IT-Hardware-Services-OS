import React, { useState } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Lock,
  Layers,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { AutonomousEvent } from '../types';

interface EventBusAuditProps {
  events: AutonomousEvent[];
}

export const EventBusAudit: React.FC<EventBusAuditProps> = ({
  events
}) => {
  const [filterAgent, setFilterAgent] = useState<string>('ALL');

  const filteredEvents = events.filter(e => {
    return filterAgent === 'ALL' || e.agent === filterAgent;
  });

  const autoExecutedCount = events.filter(e => !e.humanApprovalRequired).length;
  const exceptionApprovalsCount = events.filter(e => e.humanApprovalRequired).length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-rose-400" />
            Operational Event Bus & Server Audit Trail
          </h1>
          <p className="text-sm text-slate-400">
            Authoritative append-only log of server-recorded business operations, policy evaluations, and owner decisions.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-mono text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{events.length} Authoritative Records Logged</span>
        </div>
      </div>

      {/* Authoritative Event Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-mono">Autonomous Policy Actions</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{autoExecutedCount} Records</div>
          <p className="text-xs text-slate-400 mt-1">
            Standard pricing, quote generation, and lifecycle operations executed within policy bounds.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-mono">Owner Exception Approvals</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{exceptionApprovalsCount} Records</div>
          <p className="text-xs text-slate-400 mt-1">
            Margin floor concessions and high-risk exceptions escalated to the Business Owner.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-mono">Audit Integrity</span>
            <Lock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-400 mt-2">Zero Fabrication</div>
          <p className="text-xs text-slate-400 mt-1">
            Every audit entry is created strictly by the server upon actual transaction completion.
          </p>
        </div>
      </div>

      {/* Main Audit Trail Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Controls */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-400">Server Event Stream</span>
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {['ALL', 'Pricing Agent', 'Procurement Agent', 'SLA Monitor', 'Telegram Orchestrator', 'Sales Agent'].map((ag) => (
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
        <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-300 text-xs">No Audit Events Recorded Yet</p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Authoritative event logs will appear here as genuine business actions (creating products, quotes, jobs, or approvals) are executed.
              </p>
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div key={evt.id} className="p-4 hover:bg-slate-800/30 transition text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {evt.agent}
                    </span>
                    <span className="text-slate-400 font-bold">{evt.eventType}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500">
                    <span>{evt.timestamp}</span>
                    <span className="text-[10px] text-slate-600">ID: {evt.id}</span>
                  </div>
                </div>

                <p className="text-white font-medium text-xs">
                  {evt.summary}
                </p>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-400 font-mono">
                    Action: <strong className="text-slate-300">{evt.autonomousActionTaken}</strong>
                  </span>

                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                    evt.approvalStatus === 'AUTO_APPROVED' || evt.approvalStatus === 'AUTHORIZED'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {evt.approvalStatus || 'LOGGED'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
