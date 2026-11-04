import React, { useState } from 'react';
import { 
  Network, 
  CheckCircle2, 
  RefreshCw, 
  ShieldCheck, 
  Laptop, 
  Mail, 
  Cloud, 
  MessageCircle, 
  Send, 
  Sliders, 
  Lock,
  Key,
  Radio,
  FileCheck,
  Sparkles,
  Receipt,
  AlertCircle,
  X
} from 'lucide-react';
import { IntegrationConnector, IntegrationStatus } from '../types';

interface IntegrationsHubProps {
  connectors: IntegrationConnector[];
  onSyncConnector?: (id: string) => void;
}

export const IntegrationsHub: React.FC<IntegrationsHubProps> = ({
  connectors,
  onSyncConnector
}) => {
  const [selectedConnector, setSelectedConnector] = useState<IntegrationConnector | null>(null);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sparkles': return <Sparkles className="w-5 h-5 text-indigo-400" />;
      case 'Shield': return <ShieldCheck className="w-5 h-5 text-indigo-400" />;
      case 'Laptop': return <Laptop className="w-5 h-5 text-emerald-400" />;
      case 'Mail': return <Mail className="w-5 h-5 text-blue-400" />;
      case 'Cloud': return <Cloud className="w-5 h-5 text-amber-400" />;
      case 'MessageCircle': return <MessageCircle className="w-5 h-5 text-emerald-400" />;
      case 'Send': return <Send className="w-5 h-5 text-cyan-400" />;
      case 'Receipt': return <Receipt className="w-5 h-5 text-purple-400" />;
      case 'FileCheck': return <FileCheck className="w-5 h-5 text-teal-400" />;
      default: return <Network className="w-5 h-5 text-indigo-400" />;
    }
  };

  const configuredCount = connectors.filter(c => c.status === 'CONFIGURED' || c.status === 'CONNECTED').length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Network className="w-6 h-6 text-cyan-400" />
            Ecosystem Integrations & External Hubs
          </h1>
          <p className="text-sm text-slate-400">
            Real provider connectivity status for Google Gemini AI, Telegram Bot, Microsoft Graph, Payment Gateways, and GST E-Invoicing.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${configuredCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
          <span className="text-slate-300">
            {configuredCount} of {connectors.length} Integrations Configured
          </span>
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {connectors.map((conn) => {
          const isConfigured = conn.status === 'CONFIGURED' || conn.status === 'CONNECTED';
          return (
            <div
              key={conn.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between hover:border-slate-700 transition"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      {getIcon(conn.icon)}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{conn.name}</h3>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">{conn.category}</span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                    isConfigured
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}>
                    {conn.status}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {conn.description}
                </p>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Connection Status:</span>
                    <strong className={isConfigured ? 'text-emerald-400' : 'text-slate-500'}>
                      {isConfigured ? 'Verified Active' : 'Not Configured'}
                    </strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Required Keys:</span>
                    <span className="text-slate-300 text-[10px]">
                      {conn.requiredEnvKeys && conn.requiredEnvKeys.length > 0
                        ? conn.requiredEnvKeys.join(', ')
                        : 'None'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
                <button
                  onClick={() => setSelectedConnector(conn)}
                  className="text-slate-400 hover:text-white cursor-pointer font-semibold flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  View Setup Guide
                </button>

                <span className="text-[11px] font-mono text-slate-500">
                  {isConfigured ? 'Live Environment' : 'Optional Service'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Configuration Details Modal */}
      {selectedConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                  {getIcon(selectedConnector.icon)}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{selectedConnector.name} Integration</h3>
                  <span className="text-xs font-mono text-slate-400">{selectedConnector.category}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedConnector(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                {selectedConnector.description}
              </p>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase block">
                  Environment Configuration Keys (.env):
                </span>
                {selectedConnector.requiredEnvKeys && selectedConnector.requiredEnvKeys.length > 0 ? (
                  <div className="space-y-1">
                    {selectedConnector.requiredEnvKeys.map((key) => (
                      <div key={key} className="flex items-center justify-between font-mono bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
                        <span className="text-amber-400 font-bold">{key}</span>
                        <span className="text-slate-500 text-[10px]">Server-Side Secret</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500">No additional environment keys required.</span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-indigo-300 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  All external credentials remain strictly on your server in <code>.env</code> and are never leaked to client web browsers.
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedConnector(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
