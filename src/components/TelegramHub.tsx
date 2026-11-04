import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Bot, 
  ShieldCheck, 
  CheckCircle, 
  XCircle, 
  AlertTriangle
} from 'lucide-react';
import { TelegramMessage, Quotation } from '../types';

interface TelegramHubProps {
  messages: TelegramMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onApproveQuote: (quoteId: string) => void;
  onRejectQuote: (quoteId: string, reason: string) => void;
  quotations: Quotation[];
  isThinking: boolean;
  isTelegramConfigured?: boolean;
}

export const TelegramHub: React.FC<TelegramHubProps> = ({
  messages,
  onSendMessage,
  onApproveQuote,
  onRejectQuote,
  quotations,
  isThinking,
  isTelegramConfigured = false
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
    { label: '/stock', cmd: '/stock' }
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
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                  isTelegramConfigured 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                }`}>
                  {isTelegramConfigured ? 'LIVE BOT CONNECTED' : 'NOT CONFIGURED'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isTelegramConfigured 
                  ? 'Real-time webhook active. Authorizes quotation exceptions and pushes notifications.'
                  : 'Telegram bot integration is not configured. Add TELEGRAM_BOT_TOKEN to .env for external mobile webhook sync.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">Policy:</span>
          <span className="font-semibold text-emerald-400">Policy Guard Active</span>
          <span className="text-slate-600">|</span>
          <span className="font-semibold text-amber-400">Owner Authorization Required</span>
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
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#242f3d] ${isTelegramConfigured ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Apex Autonomous OS Bot
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-normal">bot</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {isTelegramConfigured ? 'online • live webhook listening' : 'local console interface • external bot unconfigured'}
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Webhook Status: {isTelegramConfigured ? 'Encrypted' : 'Standby'}</span>
            <span className={`w-2 h-2 rounded-full ${isTelegramConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
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
                <h4 className="text-sm font-bold text-white">No Telegram Messages Yet</h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  When margin exceptions occur or when you send executive commands below, message records will appear here in real-time.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
                {["/dashboard", "/pending", "/stock"].map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendMessage(suggestion)}
                    className="px-3 py-1 rounded-lg bg-[#242f3d] hover:bg-[#2b394a] text-sky-300 border border-sky-800/40 text-xs transition cursor-pointer"
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
                  className={`flex flex-col ${isOwner ? 'items-end' : 'items-start'} space-y-1.5`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 shadow-md text-xs leading-relaxed ${
                      isOwner
                        ? 'bg-[#2b5278] text-white rounded-br-none'
                        : 'bg-[#182533] text-slate-200 border border-slate-800/60 rounded-bl-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* Interactive Approval Card if message is an exception alert */}
                    {msg.approvalData && msg.approvalData.status === 'PENDING' && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <div className="flex justify-between items-center text-[11px] font-mono">
                          <span className="text-amber-400 font-bold uppercase">Pending Decision</span>
                          <span className="text-white font-bold">₹{msg.approvalData.amount?.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => onApproveQuote(msg.approvalData!.referenceId)}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Approve Exception
                          </button>
                          <button
                            onClick={() => onRejectQuote(msg.approvalData!.referenceId, 'Margin below threshold')}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={`text-[10px] text-right mt-1.5 ${isOwner ? 'text-sky-200/70' : 'text-slate-500'}`}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isThinking && (
            <div className="flex items-center gap-2 text-xs text-sky-400 p-2 font-mono">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
              Evaluating command against live database...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#17212b] border-t border-[#1f2936]">
          {/* Quick Command Chips */}
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-none">
            {quickCommands.map((qc, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(qc.cmd)}
                className="px-2.5 py-1 rounded-lg bg-[#242f3d] hover:bg-[#2e3b4d] text-slate-300 text-xs font-mono transition cursor-pointer whitespace-nowrap"
              >
                {qc.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type an owner command (e.g. /dashboard, /pending, /stock)..."
              className="flex-1 bg-[#242f3d] border border-slate-700 text-white rounded-xl px-4 py-2.5 text-xs placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={isThinking || !inputText.trim()}
              className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white transition cursor-pointer shadow flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
