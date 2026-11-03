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
  ExternalLink, 
  Sliders, 
  Lock,
  Key,
  Radio
} from 'lucide-react';
import { IntegrationConnector } from '../types';

interface IntegrationsHubProps {
  connectors: IntegrationConnector[];
  onSyncConnector: (id: string) => void;
}

export const IntegrationsHub: React.FC<IntegrationsHubProps> = ({
  connectors,
  onSyncConnector
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<IntegrationConnector | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('https://api.apex-it-os.internal/v1/webhooks/inbound');

  const handleSyncClick = (id: string) => {
    setSyncingId(id);
    setTimeout(() => {
      onSyncConnector(id);
      setSyncingId(null);
    }, 1200);
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Shield': return <ShieldCheck className="w-5 h-5 text-indigo-400" />;
      case 'Laptop': return <Laptop className="w-5 h-5 text-emerald-400" />;
      case 'Mail': return <Mail className="w-5 h-5 text-blue-400" />;
      case 'Cloud': return <Cloud className="w-5 h-5 text-amber-400" />;
      case 'MessageCircle': return <MessageCircle className="w-5 h-5 text-emerald-400" />;
      case 'Send': return <Send className="w-5 h-5 text-cyan-400" />;
      default: return <Network className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Network className="w-6 h-6 text-cyan-400" />
            Ecosystem Integrations & Cloud Connectors
          </h1>
          <p className="text-sm text-slate-400">
            Bidirectional synchronizers with Microsoft Entra ID, Intune MDM, AWS Infrastructure, WhatsApp Gateway, and Telegram.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>All 6 Critical Hubs Synced</span>
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {connectors.map((conn) => {
          const isSyncing = syncingId === conn.id;
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
                    conn.status === 'CONNECTED'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {conn.status}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {conn.description}
                </p>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Records Synced:</span>
                    <strong className="text-slate-200">{conn.recordsSynced}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Last Heartbeat:</span>
                    <span className="text-cyan-400">{conn.lastSyncTime}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
                <button
                  onClick={() => setSelectedConnector(conn)}
                  className="text-slate-400 hover:text-white cursor-pointer font-semibold flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Configure
                </button>

                <button
                  onClick={() => handleSyncClick(conn.id)}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhook Gateway Diagnostics Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-xs">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="font-bold text-white text-sm">Autonomous Webhook Listener & Inbound Stream Gateway</h3>
          </div>
          <span className="text-emerald-400 font-mono text-[11px] font-bold">200 OK • 0 Drop Rate</span>
        </div>

        <div className="space-y-2">
          <span className="text-slate-400 block font-mono">Public Inbound Webhook Endpoint (HMAC Verified):</span>
          <div className="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-300">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate flex-1">{webhookUrl}</span>
            <button
              onClick={() => alert("Copied webhook URL to clipboard.")}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
            >
              Copy
            </button>
          </div>
        </div>

        <p className="text-slate-500 text-[11px]">
          Receives live telemetric health pings from RMM agents, WhatsApp delivery confirmations, and signed Telegram inline keyboard callbacks.
        </p>
      </div>

      {/* Configuration Modal */}
      {selectedConnector && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Configure {selectedConnector.name}
              </h3>
              <button onClick={() => setSelectedConnector(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Tenant / Organization ID</label>
                <input
                  type="text"
                  defaultValue="tenant-prod-apex-mumbai-01"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  readOnly
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">API Secret / Bearer Token</label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-400">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>••••••••••••••••••••••••••••••••••••</span>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Sync Frequency</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                  <option>Real-time Webhook Streaming (Sub-second)</option>
                  <option>Every 5 Minutes</option>
                  <option>Hourly Batch</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedConnector(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  alert("Settings saved and token rotated successfully.");
                  setSelectedConnector(null);
                }}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
