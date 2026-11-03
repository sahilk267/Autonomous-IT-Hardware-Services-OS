import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Layers, 
  Plus, 
  ToggleLeft, 
  ToggleRight, 
  Send, 
  Clock, 
  Sparkles,
  GitBranch,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import { AutomationWorkflow } from '../types';

interface WorkflowAutomationProps {
  workflows: AutomationWorkflow[];
  onToggleWorkflow: (id: string) => void;
  onExecuteWorkflowTest: (workflowId: string) => void;
  onCreateWorkflow: (wf: Partial<AutomationWorkflow>) => void;
  isCleanSlate?: boolean;
}

export const WorkflowAutomation: React.FC<WorkflowAutomationProps> = ({
  workflows,
  onToggleWorkflow,
  onExecuteWorkflowTest,
  onCreateWorkflow,
  isCleanSlate = false
}) => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(
    isCleanSlate ? '' : (workflows[0]?.id || 'wf-1')
  );
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [executionLog, setExecutionLog] = useState<{
    step: string;
    status: 'SUCCESS' | 'WAITING_APPROVAL' | 'EVALUATING';
    detail: string;
  }[] | null>(null);

  // New Workflow Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('ticket.priority == "CRITICAL"');
  const [newCondition, setNewCondition] = useState('ticket.unassignedMinutes > 15');
  const [newAction, setNewAction] = useState('Escalate to Telegram Command Hub');

  useEffect(() => {
    if (isCleanSlate) {
      setSelectedWorkflowId('');
      setExecutionLog(null);
    } else {
      setSelectedWorkflowId(workflows[0]?.id || '');
    }
  }, [isCleanSlate, workflows]);

  const selectedWf = (selectedWorkflowId ? workflows.find(w => w.id === selectedWorkflowId) : null) || (isCleanSlate ? null : workflows[0]) || null;

  const handleTestRun = (wfId: string) => {
    if (!selectedWf) return;
    setIsExecutingTest(true);
    setExecutionLog([
      { step: '1. Event Interception', status: 'EVALUATING', detail: `Evaluating domain event: ${selectedWf.triggerEvent}` }
    ]);

    setTimeout(() => {
      setExecutionLog(prev => [
        ...(prev || []),
        { step: '2. Rule Condition Validation', status: 'SUCCESS', detail: `Condition passed: ${selectedWf.condition}` }
      ]);
    }, 600);

    setTimeout(() => {
      setExecutionLog(prev => [
        ...(prev || []),
        { 
          step: '3. Autonomous Execution & Dispatch', 
          status: selectedWf.humanApprovalRequired ? 'WAITING_APPROVAL' : 'SUCCESS', 
          detail: selectedWf.autonomousAction 
        }
      ]);
      setIsExecutingTest(false);
      onExecuteWorkflowTest(wfId);
    }, 1200);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    onCreateWorkflow({
      name: newName,
      description: `Automated rule triggered on ${newTrigger}`,
      triggerEvent: newTrigger,
      condition: newCondition,
      autonomousAction: newAction,
      humanApprovalRequired: newAction.toLowerCase().includes('approval') || newAction.toLowerCase().includes('telegram'),
      active: true,
      executionCount: 0,
      lastExecuted: 'Just created'
    });

    setShowNewModal(false);
    setNewName('');
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-6 h-6 text-amber-400" />
            Visual Workflow Automation & Orchestration Engine
          </h1>
          <p className="text-sm text-slate-400">
            Durable event-driven rules, SLA breach escalations, margin floor protections, and 90% autonomous operational automation.
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer transition flex items-center gap-2 shadow"
        >
          <Plus className="w-4 h-4" />
          Create Automation Rule
        </button>
      </div>

      {/* Main Grid: Left Rules List, Right Flowchart & Test Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 1 Col: Workflows Registry */}
        <div className="space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block px-1">
            Registered Autonomous Workflows ({workflows.length})
          </span>

          {workflows.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-3">
              <Cpu className="w-8 h-8 text-amber-500/50 mx-auto" />
              <div className="font-bold text-white text-xs">No Rules Registered</div>
              <p className="text-[11px] text-slate-500">
                Click "Create Automation Rule" above to configure an event-driven trigger.
              </p>
            </div>
          ) : (
            workflows.map((wf) => {
              const isSelected = wf.id === selectedWorkflowId;
              return (
                <div
                  key={wf.id}
                  onClick={() => {
                    setSelectedWorkflowId(wf.id);
                    setExecutionLog(null);
                  }}
                  className={`p-4 rounded-2xl border transition cursor-pointer text-left space-y-2.5 ${
                    isSelected
                      ? 'bg-slate-900 border-amber-500 ring-1 ring-amber-500/50 shadow-lg'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">
                      {wf.humanApprovalRequired ? 'Approval Required' : '100% Autonomous'}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWorkflow(wf.id);
                      }}
                      className="cursor-pointer text-slate-400 hover:text-white"
                    >
                      {wf.active ? (
                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-600" />
                      )}
                    </button>
                  </div>

                  <h3 className="font-bold text-sm text-white line-clamp-1">{wf.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{wf.description}</p>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-500">
                    <span>{wf.executionCount} Runs</span>
                    <span>{wf.lastExecuted}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right 2 Cols: Visual Workflow Canvas & Step-by-Step Flowchart */}
        <div className="lg:col-span-2 space-y-6">
          {selectedWf ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              
              {/* Header of Active Workflow */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <span className="text-xs font-mono text-amber-400 font-bold uppercase">Active Rule Canvas</span>
                  <h2 className="text-lg font-bold text-white mt-0.5">{selectedWf.name}</h2>
                  <p className="text-xs text-slate-400">{selectedWf.description}</p>
                </div>

                <button
                  onClick={() => handleTestRun(selectedWf.id)}
                  disabled={isExecutingTest}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-amber-300" />
                  <span>{isExecutingTest ? 'Evaluating Live...' : 'Simulate Trigger'}</span>
                </button>
              </div>

              {/* Visual Flowchart Diagram */}
              <div className="space-y-4">
                <span className="text-xs font-mono uppercase text-slate-400 font-bold block">
                  Visual Step Execution Graph
                </span>

                <div className="space-y-3 font-mono text-xs">
                  
                  {/* Step 1: Trigger */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-700 text-indigo-400 flex items-center justify-center font-bold shrink-0">
                      1
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] uppercase block font-semibold">Event Trigger Input</span>
                      <div className="text-indigo-300 font-bold">{selectedWf.triggerEvent}</div>
                      <p className="text-slate-500 text-[11px]">Listens to internal event bus streaming broker.</p>
                    </div>
                  </div>

                  <div className="flex justify-center text-slate-600">
                    ↓
                  </div>

                  {/* Step 2: Evaluation Condition */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-950 border border-amber-700 text-amber-400 flex items-center justify-center font-bold shrink-0">
                      2
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] uppercase block font-semibold">Deterministic Policy Condition</span>
                      <div className="text-amber-300 font-bold">{selectedWf.condition}</div>
                      <p className="text-slate-500 text-[11px]">Validates against business rules and tenant configuration.</p>
                    </div>
                  </div>

                  <div className="flex justify-center text-slate-600">
                    ↓
                  </div>

                  {/* Step 3: Action Execution */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      3
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] uppercase block font-semibold">Autonomous Target Action</span>
                      <div className="text-emerald-300 font-bold">{selectedWf.autonomousAction}</div>
                      <p className="text-slate-500 text-[11px]">
                        {selectedWf.humanApprovalRequired
                          ? 'Enforces human authorization via signed Telegram webhook before mutating core database.'
                          : 'Executes instantly with zero human latency and records audit log entry.'}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Live Execution Output Terminal */}
              {executionLog && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">
                    Simulation Execution Trace Output:
                  </span>
                  <div className="space-y-2">
                    {executionLog.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        {log.status === 'SUCCESS' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : log.status === 'WAITING_APPROVAL' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5"></div>
                        )}
                        <div>
                          <span className="font-bold text-white">{log.step}:</span>
                          <span className="text-slate-300 ml-1.5">{log.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Cpu className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Automation Rule Active</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Select a registered automation rule from the left panel or create an autonomous policy trigger to visualize event-driven executions.
                </p>
              </div>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer shadow-lg inline-flex items-center gap-2 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create Automation Rule</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal: Create New Workflow */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Create New Autonomous Automation Rule</h3>
              <button onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Rule Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Overdue Invoice Credit Lock"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Trigger Domain Event</label>
                <input
                  type="text"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Evaluation Condition</label>
                <input
                  type="text"
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Autonomous Target Action</label>
                <input
                  type="text"
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold cursor-pointer"
                >
                  Activate Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
