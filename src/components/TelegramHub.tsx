import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Bot, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  HelpCircle, 
  Sparkles, 
  CornerDownLeft,
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { TelegramMessage, Quotation } from '../types';

interface TelegramHubProps {
  messages: TelegramMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onApproveQuote: (quoteId: string) => void;
  onRejectQuote: (quoteId: string, reason: string) => void;
  quotations: Quotation[];
  isThinking: boolean;
  isCleanSlate?: boolean;
}

export const TelegramHub: React.FC<TelegramHubProps> = ({
  messages,
  onSendMessage,
  onApproveQuote,
  onRejectQuote,
  quotations,
  isThinking,
  isCleanSlate = false
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isThinking) return;
    const text = inputText;
    setInputText('');
    await onSendMessage(text);
  };

  const quickCommands = [
    { label: '/dashboard', cmd: '/dashboard' },
    { label: '/pending', cmd: '/pending' },
    { label: '/stock', cmd: '/stock' },
    { label: 'Aaj kitna profit hua?', cmd: 'Aaj kitna profit hua?' },
    { label: 'Show dead stock', cmd: 'Kaunsa stock dead ho raha hai?' },
    { label: 'High-value quotes', cmd: '₹10 lakh se upar ke opportunities dikhao' }
  ];

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 mb-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Send className="w-5 h-5 -rotate-12" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Telegram Owner Command & Approval Hub
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  LIVE SECURE BOT
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Connected Bot: <span className="font-mono text-sky-300">@ApexAutonomousBot</span> • Authorized Chat ID: <span className="font-mono text-slate-300">#TLG-OWNER-7891</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">Autonomous Principle:</span>
          <span className="font-semibold text-emerald-400">90% Auto-Executed</span>
          <span className="text-slate-600">|</span>
          <span className="font-semibold text-amber-400">10% Exception Approvals</span>
        </div>
      </div>

      {/* Main Telegram Chat Container */}
      <div className="bg-[#17212b] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[650px]">
        {/* Telegram Chat Header */}
        <div className="bg-[#242f3d] px-4 py-3 border-b border-[#1f2936] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center font-bold text-white shadow">
                APX
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#242f3d]"></span>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Apex Autonomous OS Bot
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-normal">bot</span>
              </h3>
              <p className="text-[11px] text-emerald-400">online • operational governance active</p>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="hidden sm:inline">Encrypted Callback Webhook</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0e1621]/90">
          {messages.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Telegram Governance Bot Active</h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Ready to receive margin breach escalations, autonomous dispatch approvals, or query operational metrics directly via chat.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
                {["What is our cash flow projection?", "Check critical ITSM tickets", "Simulate margin exception"].map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendMessage(suggestion)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/20 cursor-pointer transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
            const isOwner = msg.sender === 'owner';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isOwner ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-md whitespace-pre-line leading-relaxed ${
                    isOwner
                      ? 'bg-[#2b5278] text-white rounded-br-xs'
                      : 'bg-[#182533] text-slate-200 border border-[#2b394a] rounded-bl-xs'
                  }`}
                >
                  {/* Sender title if bot */}
                  {!isOwner && (
                    <div className="flex items-center gap-1.5 text-xs text-sky-400 font-semibold mb-1 pb-1 border-b border-slate-700/50">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Apex Autonomous Bot</span>
                    </div>
                  )}

                  {/* Body text */}
                  <div>{msg.text}</div>

                  {/* Interactive Approval Card inside Telegram message */}
                  {msg.approvalData && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 text-xs">
                      <div className="flex items-center justify-between font-semibold text-amber-300 pb-2 border-b border-slate-800">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          MARGIN EXCEPTION AUTHORIZATION
                        </span>
                        <span className="font-mono text-slate-400">Ref: {msg.approvalData.referenceId}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 my-2 text-slate-300">
                        <div>
                          <span className="text-slate-500 block text-[10px]">TOTAL AMOUNT</span>
                          <span className="font-bold text-white">₹{msg.approvalData.amount.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">GROSS MARGIN</span>
                          <span className="font-bold text-amber-400">{msg.approvalData.margin}% (Floor: 12%)</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 italic mb-3">
                        Reason: {msg.approvalData.details}
                      </p>

                      {/* Status or Action Buttons */}
                      {msg.approvalData.status === 'PENDING' ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={() => onApproveQuote(msg.approvalData!.referenceId)}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg transition-all cursor-pointer text-xs active:scale-95 shadow"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            APPROVE (1-TAP)
                          </button>
                          <button
                            onClick={() => onRejectQuote(msg.approvalData!.referenceId, 'Margin below required threshold')}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 font-semibold py-2 px-3 rounded-lg transition-all cursor-pointer text-xs"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            REJECT
                          </button>
                          <button
                            onClick={() => onSendMessage(`What is the historical win rate for Nexus FinTech if we offer 9.8% margin?`)}
                            className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 py-2 px-2.5 rounded-lg text-xs"
                            title="Ask AI Intelligence recommendation"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            ASK AI
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 py-1.5 px-2.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-semibold">
                          <CheckCircle className="w-4 h-4" />
                          <span>Authorized by Business Owner & Executed</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timestamp & Delivery status */}
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                    <span>{msg.timestamp}</span>
                    {isOwner && <span className="text-sky-400 font-bold">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}

          {isThinking && (
            <div className="flex items-start">
              <div className="bg-[#182533] text-slate-300 border border-[#2b394a] rounded-2xl rounded-bl-xs px-4 py-3 text-xs flex items-center gap-2 shadow">
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                <span>Apex Autonomous Agent is evaluating business rules...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Command Pills */}
        <div className="bg-[#17212b] px-3 py-2 border-t border-[#242f3d] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0">Suggestions:</span>
          {quickCommands.map((q) => (
            <button
              key={q.cmd}
              onClick={() => onSendMessage(q.cmd)}
              className="px-2.5 py-1 rounded-full bg-[#242f3d] hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono whitespace-nowrap transition cursor-pointer border border-slate-700/50"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Telegram Chat Input Form */}
        <form onSubmit={handleSubmit} className="bg-[#242f3d] p-3 border-t border-[#1f2936] flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type Telegram command (/dashboard, /pending) or question in English / Hindi..."
            className="flex-1 bg-[#17212b] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            disabled={isThinking}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isThinking}
            className="w-10 h-10 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white flex items-center justify-center transition cursor-pointer shadow active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Telegram Feature Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs text-slate-400">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-start gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1"></div>
          <div>
            <span className="text-slate-200 font-semibold block">Natural Language Commands</span>
            Ask queries in English or Hindi (e.g., "Aaj kitna profit hua?", "Low stock alert").
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-start gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 mt-1"></div>
          <div>
            <span className="text-slate-200 font-semibold block">1-Tap Decision Engine</span>
            Authorize margin concessions, high-value purchase orders, and credit exceptions.
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-start gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-400 mt-1"></div>
          <div>
            <span className="text-slate-200 font-semibold block">Immutable Audit Log</span>
            Every approval creates a signed audit event with rule evaluation and timestamp.
          </div>
        </div>
      </div>
    </div>
  );
};
