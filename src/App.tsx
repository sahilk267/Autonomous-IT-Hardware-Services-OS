import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation, TabKey } from './components/Navigation';
import { TelegramHub } from './components/TelegramHub';
import { BOMBuilder } from './components/BOMBuilder';
import { InventoryProcurement } from './components/InventoryProcurement';
import { ITSMDesk } from './components/ITSMDesk';
import { FieldServiceMarketplace } from './components/FieldServiceMarketplace';
import { FinanceGST } from './components/FinanceGST';
import { EventBusAudit } from './components/EventBusAudit';
import { ProjectMarketplace } from './components/ProjectMarketplace';
import { AssetAMCManager } from './components/AssetAMCManager';
import { WorkflowAutomation } from './components/WorkflowAutomation';
import { IntegrationsHub } from './components/IntegrationsHub';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { ResetModal } from './components/ResetModal';

import {
  UserRole,
  TenantInfo,
  ProductItem,
  Lead,
  Quotation,
  TelegramMessage,
  SupplierInfo,
  RFQItem,
  ITSMTicket,
  EndpointHealth,
  FieldJob,
  CMDBNode,
  AutonomousEvent,
  BOMSolution,
  Project,
  Proposal,
  ProviderProfile,
  AssetItem,
  SoftwareLicense,
  AMCContract,
  AutomationWorkflow,
  IntegrationConnector
} from './types';

import {
  initialTenant,
  initialProducts,
  initialLeads,
  initialQuotes,
  initialTelegramMessages,
  initialSuppliers,
  initialRFQs,
  initialITSMTickets,
  initialEndpoints,
  initialFieldJobs,
  initialCMDBNodes,
  initialEvents,
  initialProjects,
  initialProposals,
  initialProviders,
  initialAssets,
  initialLicenses,
  initialAMCs,
  initialWorkflows,
  initialIntegrations
} from './data/mockData';

interface InvoiceRecord {
  customer: string;
  invoiceNo: string;
  amount: number;
  dueInDays: number;
  status: string;
  createdAt?: string;
  gstin?: string;
}

const initialMockInvoices: InvoiceRecord[] = [
  { customer: 'Nexus FinTech Labs', invoiceNo: 'INV-2026-0812', amount: 2407200, dueInDays: 4, status: 'DUE_SOON', createdAt: '2026-08-25', gstin: '27AABCN8192K1Z4' },
  { customer: 'Zenith Logistics', invoiceNo: 'INV-2026-0799', amount: 748828, dueInDays: -8, status: 'OVERDUE', createdAt: '2026-08-10', gstin: '27AABCT9921M1Z1' },
  { customer: 'OmniHealth Hospitals', invoiceNo: 'INV-2026-0750', amount: 1850000, dueInDays: 14, status: 'ACTIVE', createdAt: '2026-09-01', gstin: '27AABCO4142L1Z9' }
];

const cleanTelegramMessages: TelegramMessage[] = [
  {
    id: 'msg-clean-init',
    sender: 'bot',
    text: '🤖 *Apex Autonomous IT Operating System Active*\n\nWorkspace initialized in *Clean Slate Mode* (0 mock records).\nAll 12 enterprise modules are ready for your real-world operational data. Type an owner command, create a BOM, dispatch an engineer, or import quotes to begin.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
];

const cleanInitialEvents: AutonomousEvent[] = [
  {
    id: 'evt-clean-init',
    timestamp: new Date().toLocaleTimeString(),
    eventType: 'WorkspaceResetCleanSlate',
    agent: 'Telegram Orchestrator',
    summary: 'Platform workspace reset to Clean Slate (0 mock data). Ready for production operations.',
    autonomousActionTaken: 'Wiped all mock test records across 12 modules and initialized fresh database context.',
    humanApprovalRequired: false,
    approvalStatus: 'AUTO_APPROVED',
    confidenceScore: 1.0
  }
];

export default function App() {
  const [tenant] = useState<TenantInfo>(initialTenant);
  const [currentRole, setCurrentRole] = useState<UserRole>('BUSINESS_OWNER');
  const [activeTab, setActiveTab] = useState<TabKey>('telegram');

  // Reset & Workspace State Mode
  const [isCleanSlate, setIsCleanSlate] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('apex_it_os_mode') === 'clean';
    }
    return false;
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetToast, setResetToast] = useState<string | null>(null);

  // Application State Collections
  const [products, setProducts] = useState<ProductItem[]>(() => isCleanSlate ? [] : initialProducts);
  const [leads, setLeads] = useState<Lead[]>(() => isCleanSlate ? [] : initialLeads);
  const [quotes, setQuotes] = useState<Quotation[]>(() => isCleanSlate ? [] : initialQuotes);
  const [telegramMessages, setTelegramMessages] = useState<TelegramMessage[]>(() => isCleanSlate ? cleanTelegramMessages : initialTelegramMessages);
  const [suppliers] = useState<SupplierInfo[]>(initialSuppliers);
  const [rfqs, setRfqs] = useState<RFQItem[]>(() => isCleanSlate ? [] : initialRFQs);
  const [tickets, setTickets] = useState<ITSMTicket[]>(() => isCleanSlate ? [] : initialITSMTickets);
  const [endpoints, setEndpoints] = useState<EndpointHealth[]>(() => isCleanSlate ? [] : initialEndpoints);
  const [jobs, setJobs] = useState<FieldJob[]>(() => isCleanSlate ? [] : initialFieldJobs);
  const [cmdbNodes] = useState<CMDBNode[]>(initialCMDBNodes);
  const [events, setEvents] = useState<AutonomousEvent[]>(() => isCleanSlate ? cleanInitialEvents : initialEvents);

  // Extended Ecosystem State
  const [projects, setProjects] = useState<Project[]>(() => isCleanSlate ? [] : initialProjects);
  const [proposals, setProposals] = useState<Proposal[]>(() => isCleanSlate ? [] : initialProposals);
  const [providers] = useState<ProviderProfile[]>(initialProviders);
  const [assets, setAssets] = useState<AssetItem[]>(() => isCleanSlate ? [] : initialAssets);
  const [licenses, setLicenses] = useState<SoftwareLicense[]>(() => isCleanSlate ? [] : initialLicenses);
  const [amcs, setAMCs] = useState<AMCContract[]>(() => isCleanSlate ? [] : initialAMCs);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>(() => isCleanSlate ? [] : initialWorkflows);
  const [connectors, setConnectors] = useState<IntegrationConnector[]>(initialIntegrations);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => isCleanSlate ? [] : initialMockInvoices);

  const [isThinking, setIsThinking] = useState(false);

  // Load persistent state from backend on mount
  useEffect(() => {
    fetch('/api/state')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          const s = data.data;
          setIsCleanSlate(s.isCleanSlate);
          if (s.products) setProducts(s.products);
          if (s.leads) setLeads(s.leads);
          if (s.quotes) setQuotes(s.quotes);
          if (s.telegramMessages && s.telegramMessages.length > 0) setTelegramMessages(s.telegramMessages);
          if (s.rfqs) setRfqs(s.rfqs);
          if (s.tickets) setTickets(s.tickets);
          if (s.endpoints) setEndpoints(s.endpoints);
          if (s.jobs) setJobs(s.jobs);
          if (s.assets) setAssets(s.assets);
          if (s.licenses) setLicenses(s.licenses);
          if (s.amcs) setAMCs(s.amcs);
          if (s.projects) setProjects(s.projects);
          if (s.proposals) setProposals(s.proposals);
          if (s.events && s.events.length > 0) setEvents(s.events);
          if (s.invoices) setInvoices(s.invoices);
        }
      })
      .catch(err => console.warn('Could not sync persistent state from server:', err));
  }, []);

  // Reset Handlers
  const handleResetCleanSlate = async () => {
    setIsCleanSlate(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('apex_it_os_mode', 'clean');
    }
    setProducts([]);
    setLeads([]);
    setQuotes([]);
    setTelegramMessages(cleanTelegramMessages);
    setRfqs([]);
    setTickets([]);
    setEndpoints([]);
    setJobs([]);
    setProjects([]);
    setProposals([]);
    setAssets([]);
    setLicenses([]);
    setAMCs([]);
    setWorkflows([]);
    setInvoices([]);
    setEvents(cleanInitialEvents);
    setResetToast('Clean Slate Active: All mock data wiped. You can now operate or test with 0 dummy records!');
    setTimeout(() => setResetToast(null), 4000);

    try {
      await fetch('/api/state/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'clean' })
      });
    } catch (err) {
      console.warn('Server reset failed:', err);
    }
  };

  const handleResetDemoSuite = async () => {
    setIsCleanSlate(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('apex_it_os_mode', 'demo');
    }
    setProducts(initialProducts);
    setLeads(initialLeads);
    setQuotes(initialQuotes);
    setTelegramMessages(initialTelegramMessages);
    setRfqs(initialRFQs);
    setTickets(initialITSMTickets);
    setEndpoints(initialEndpoints);
    setJobs(initialFieldJobs);
    setProjects(initialProjects);
    setProposals(initialProposals);
    setAssets(initialAssets);
    setLicenses(initialLicenses);
    setAMCs(initialAMCs);
    setWorkflows(initialWorkflows);
    setConnectors(initialIntegrations);
    setEvents(initialEvents);
    setInvoices(initialMockInvoices);
    setResetToast('Demo Test Suite Restored: All 12 interconnected modules successfully re-seeded!');
    setTimeout(() => setResetToast(null), 4000);

    try {
      await fetch('/api/state/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'demo' })
      });
    } catch (err) {
      console.warn('Server reset failed:', err);
    }
  };

  // Invoice Handlers
  const handleAddInvoice = (inv: InvoiceRecord) => {
    setInvoices(prev => [inv, ...prev]);
    fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inv)
    }).catch(err => console.warn('Sync invoice failed:', err));
  };

  const handleSettleInvoice = (invoiceNo: string) => {
    setInvoices(prev => prev.filter(i => i.invoiceNo !== invoiceNo));
    fetch(`/api/invoices/${invoiceNo}/settle`, {
      method: 'PATCH'
    }).catch(err => console.warn('Sync settle invoice failed:', err));
  };

  // Workspace Statistics for Modal
  const workspaceStats = {
    quotesCount: quotes.length,
    projectsCount: projects.length,
    ticketsCount: tickets.length,
    jobsCount: jobs.length,
    assetsCount: assets.length,
    productsCount: products.length
  };

  // Computed count of pending approvals
  const pendingApprovalsCount = quotes.filter(q => q.status === 'PENDING_OWNER_APPROVAL').length;

  // Handle Telegram Chat Messages
  const handleSendMessage = async (text: string) => {
    const ownerMsg: TelegramMessage = {
      id: `msg-${Date.now()}`,
      sender: 'owner',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setTelegramMessages(prev => [...prev, ownerMsg]);
    setIsThinking(true);

    try {
      const response = await fetch('/api/ai/telegram-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: text,
          context: {
            todayRevenue: "₹8,45,000",
            monthlyGrossProfit: "₹14.2L (17.4% margin)",
            pendingApprovals: pendingApprovalsCount,
            openQuotesCount: quotes.length
          }
        })
      });

      const data = await response.json();
      const botText = data.text || 'Command received and recorded.';

      // Check if owner typed an approval in text
      if (text.toLowerCase().includes('approve') && quotes.some(q => q.status === 'PENDING_OWNER_APPROVAL')) {
        const pendingQuote = quotes.find(q => q.status === 'PENDING_OWNER_APPROVAL');
        if (pendingQuote) {
          handleApproveQuote(pendingQuote.id);
        }
      }

      const botReply: TelegramMessage = {
        id: `msg-bot-${Date.now()}`,
        sender: 'bot',
        text: botText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: data.actions
      };

      setTelegramMessages(prev => [...prev, botReply]);
    } catch (err) {
      console.error('Error in telegram command handler:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // Handle Approving a Quote via Telegram or App
  const handleApproveQuote = (quoteId: string) => {
    setQuotes(prev => prev.map(q => {
      if (q.id === quoteId || q.quoteNumber.includes(quoteId)) {
        return { ...q, status: 'APPROVED' };
      }
      return q;
    }));

    // Update Telegram message approval status
    setTelegramMessages(prev => prev.map(m => {
      if (m.approvalData && (m.approvalData.referenceId === quoteId || m.approvalData.referenceId.includes(quoteId))) {
        return {
          ...m,
          approvalData: { ...m.approvalData, status: 'APPROVED' }
        };
      }
      return m;
    }));

    // Add confirmation message from bot
    const confirmMsg: TelegramMessage = {
      id: `msg-conf-${Date.now()}`,
      sender: 'bot',
      text: `✅ *EXCEPTION APPROVED & RECORDED*\n\n` +
        `• Quote *#${quoteId}* has been authorized by the Business Owner.\n` +
        `• Inventory for 45 units reserved in Warehouse.\n` +
        `• Proforma invoice dispatched to customer via Email & WhatsApp.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setTelegramMessages(prev => [...prev, confirmMsg]);

    // Log to Event Bus
    const newEvent: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'OwnerExceptionAuthorized',
      agent: 'Telegram Orchestrator',
      summary: `Owner authorized concession on Quote ${quoteId}.`,
      autonomousActionTaken: 'Quotation marked APPROVED and customer dispatch initiated.',
      humanApprovalRequired: true,
      approvalStatus: 'AUTHORIZED',
      confidenceScore: 1.0
    };
    setEvents(prev => [newEvent, ...prev]);
  };

  // Handle Rejecting a Quote
  const handleRejectQuote = (quoteId: string, reason: string) => {
    setQuotes(prev => prev.map(q => {
      if (q.id === quoteId || q.quoteNumber.includes(quoteId)) {
        return { ...q, status: 'REJECTED' };
      }
      return q;
    }));

    const rejectMsg: TelegramMessage = {
      id: `msg-rej-${Date.now()}`,
      sender: 'bot',
      text: `❌ *QUOTATION REJECTED*\n\nQuote *#${quoteId}* rejected. Sales team notified to revise pricing to minimum 12.0% margin floor.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setTelegramMessages(prev => [...prev, rejectMsg]);
  };

  // Handle Quotation Generation from BOM Builder
  const handleGenerateQuote = (solution: BOMSolution, customerName: string, customerGstin: string, discount: number) => {
    const totalCost = solution.items.reduce((acc, i) => acc + (i.purchaseCost * i.qty), 0);
    const grossItems = solution.items.reduce((acc, i) => acc + (i.sellingPrice * i.qty), 0);
    const servicesTotal = solution.servicesIncluded.reduce((acc, s) => acc + s.price, 0);
    const subtotal = grossItems + servicesTotal;
    const netSubtotal = subtotal - discount;
    const profit = netSubtotal - totalCost;
    const marginPercent = ((profit / netSubtotal) * 100);
    const isException = marginPercent < 12.0;

    const newQuote: Quotation = {
      id: `quote-${Date.now()}`,
      quoteNumber: `APX-QT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName,
      customerGstin,
      customerState: 'Maharashtra (27)',
      solutionName: solution.solutionName,
      items: solution.items,
      services: solution.servicesIncluded,
      subtotal,
      discountAmount: discount,
      marginPercent: parseFloat(marginPercent.toFixed(1)),
      gstAmount: Math.round(netSubtotal * 0.18),
      totalAmount: Math.round(netSubtotal * 1.18),
      status: isException ? 'PENDING_OWNER_APPROVAL' : 'SENT_TO_CUSTOMER',
      approvalReason: isException ? `Margin ${marginPercent.toFixed(1)}% < 12.0% threshold.` : undefined,
      createdDate: new Date().toISOString().split('T')[0],
      validUntil: '2026-09-28',
      paymentTerms: '50% Advance with PO, 50% on Delivery'
    };

    setQuotes(prev => [newQuote, ...prev]);

    fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newQuote)
    }).catch(err => console.warn('Sync quote failed:', err));

    if (isException) {
      // Send Telegram Exception Alert to Owner
      const alertMsg: TelegramMessage = {
        id: `msg-alert-${Date.now()}`,
        sender: 'bot',
        text: `🚨 *APPROVAL REQUIRED: Quote #${newQuote.quoteNumber}*\n\n` +
          `• *Customer:* ${newQuote.customerName}\n` +
          `• *Order Value:* ₹${newQuote.totalAmount.toLocaleString('en-IN')} (Incl. GST)\n` +
          `• *Margin:* *${newQuote.marginPercent}%* (Floor: 12.0%)\n` +
          `• *Autonomous Action:* Placed on hold. Awaiting Owner decision.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        approvalData: {
          type: 'QUOTE_MARGIN',
          referenceId: newQuote.id,
          amount: newQuote.totalAmount,
          margin: newQuote.marginPercent,
          details: `Requested discount of ₹${discount.toLocaleString('en-IN')}`,
          status: 'PENDING'
        }
      };
      setTelegramMessages(prev => [...prev, alertMsg]);
      setActiveTab('telegram');
    } else {
      alert(`✅ Quotation ${newQuote.quoteNumber} auto-approved at ${newQuote.marginPercent}% margin and sent to customer.`);
    }

    // Add event
    const newEvent: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: isException ? 'MarginThresholdBreach' : 'QuotationGenerated',
      agent: 'Pricing Agent',
      summary: `Quotation ${newQuote.quoteNumber} generated for ${newQuote.customerName} (${newQuote.marginPercent}% margin).`,
      autonomousActionTaken: isException ? 'Escalated to Telegram Command Hub' : 'Dispatched to customer email & WhatsApp',
      humanApprovalRequired: isException,
      approvalStatus: isException ? 'PENDING_TELEGRAM' : 'AUTO_APPROVED',
      confidenceScore: 0.98
    };
    setEvents(prev => [newEvent, ...prev]);
  };

  // Handle PO Dispatch in RFQ
  const handleDispatchPO = (rfqId: string, supplierId: string) => {
    setRfqs(prev => prev.map(r => r.id === rfqId ? { ...r, status: 'PO_DISPATCHED' } : r));
    const supp = suppliers.find(s => s.id === supplierId);
    
    const newEvent: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'PurchaseOrderDispatched',
      agent: 'Procurement Agent',
      summary: `Dispatched PO for ${rfqId} to ${supp?.name || supplierId}.`,
      autonomousActionTaken: '3-Way Match verification lock created.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.97
    };
    setEvents(prev => [newEvent, ...prev]);
  };

  // Handle Ticket Resolution
  const handleResolveTicket = (ticketId: string) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'RESOLVED' } : t));
    const newEvent: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'TicketResolved',
      agent: 'SLA Monitor',
      summary: `Ticket ${ticketId} signed off and closed.`,
      autonomousActionTaken: 'Customer satisfaction survey dispatched via WhatsApp.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvent, ...prev]);
  };

  // Handle RMM Remote Fix
  const handleRemoteFix = (endpointId: string, actionName: string) => {
    setEndpoints(prev => prev.map(ep => {
      if (ep.id === endpointId) {
        return {
          ...ep,
          cpuLoad: Math.floor(15 + Math.random() * 20),
          ramUsagePercent: Math.floor(45 + Math.random() * 20),
          smartStatus: 'HEALTHY'
        };
      }
      return ep;
    }));

    const newEvent: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'RMMRemoteRemediation',
      agent: 'SLA Monitor',
      summary: `Remediation executed on ${endpointId}: ${actionName}.`,
      autonomousActionTaken: 'Telemetry refreshed to normal levels.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.95
    };
    setEvents(prev => [newEvent, ...prev]);
  };

  // Handle Field Job Updates
  const handleUpdateJobStatus = (jobId: string, nextStatus: FieldJob['status']) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: nextStatus } : j));
  };

  const handleConsumePart = (jobId: string, partName: string, cost: number) => {
    setJobs(prev => prev.map(j => {
      if (j.id === jobId) {
        return {
          ...j,
          partsConsumed: [...j.partsConsumed, { partName, qty: 1, cost }]
        };
      }
      return j;
    }));
  };

  const handleSignOffJob = (jobId: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'COMPLETED', customerSignatureObtained: true } : j));
  };

  // Handle Simulation from Event Bus
  const handleSimulateEvent = (type: 'MARGIN_BREACH' | 'SHORTAGE' | 'BATTERY_ALERT') => {
    if (type === 'MARGIN_BREACH') {
      const simQuote = quotes[0];
      if (simQuote) {
        setQuotes(prev => prev.map(q => q.id === simQuote.id ? { ...q, status: 'PENDING_OWNER_APPROVAL', marginPercent: 9.8 } : q));
        const simMsg: TelegramMessage = {
          id: `sim-${Date.now()}`,
          sender: 'bot',
          text: `🚨 *SIMULATED MARGIN BREACH: Quote #${simQuote.quoteNumber}*\n\nCustomer counter-offered price reduction. Margin fell to *9.8%* (< 12.0% floor rule). Telegram approval required.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          approvalData: {
            type: 'QUOTE_MARGIN',
            referenceId: simQuote.id,
            amount: simQuote.totalAmount,
            margin: 9.8,
            details: 'Bulk discount exception simulation',
            status: 'PENDING'
          }
        };
        setTelegramMessages(prev => [...prev, simMsg]);
        setActiveTab('telegram');
      }
    } else if (type === 'SHORTAGE') {
      setActiveTab('inventory');
      alert("🚨 Shortage Event Simulated: Cisco Switch stock reduced to 0. Auto-dispatched RFQ to Redington & Ingram Micro.");
    }
  };

  // Handler: Release Project Milestone Escrow
  const handleReleaseMilestone = (projectId: string, milestoneId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        milestones: p.milestones.map(m => m.id === milestoneId ? { ...m, status: 'RELEASED' } : m)
      };
    }));

    const project = projects.find(p => p.id === projectId);
    const milestone = project?.milestones.find(m => m.id === milestoneId);

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'MilestonePayoutReleased',
      agent: 'Telegram Orchestrator',
      summary: `Released escrow payout of ₹${milestone?.amount.toLocaleString('en-IN')} for milestone: "${milestone?.title}".`,
      autonomousActionTaken: 'Funds transferred from escrow holding to verified provider bank account with 200 OK webhook payload.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Accept Project Proposal
  const handleAcceptProposal = (projectId: string, proposalId: string) => {
    setProposals(prev => prev.map(p => {
      if (p.projectId !== projectId) return p;
      return { ...p, status: p.id === proposalId ? 'ACCEPTED' : 'REJECTED' };
    }));

    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'IN_PROGRESS' } : p));

    const prop = proposals.find(p => p.id === proposalId);
    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProjectProposalAwarded',
      agent: 'Pricing Agent',
      summary: `Awarded project bid to ${prop?.providerName} (Bid: ₹${prop?.commercialBid.toLocaleString('en-IN')}).`,
      autonomousActionTaken: 'Locked escrow deposit & automatically triggered SLA contract generation.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.96
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Create Project
  const handleCreateProject = (newProj: Partial<Project>) => {
    const fullProj: Project = {
      id: `proj-${Date.now()}`,
      projectCode: newProj.projectCode || `PRJ-2026-${Math.floor(100 + Math.random() * 900)}`,
      title: newProj.title || 'Enterprise Deployment',
      clientName: newProj.clientName || 'Enterprise Client',
      clientLocation: newProj.clientLocation || 'Mumbai, MH',
      budget: newProj.budget || 400000,
      category: newProj.category || 'Cloud Migration',
      scopeDescription: newProj.scopeDescription || '',
      deliverables: newProj.deliverables || ['Implementation', 'Sign-off'],
      skillsRequired: newProj.skillsRequired || ['Enterprise Architecture'],
      status: 'PROPOSALS_OPEN',
      proposalsCount: 0,
      createdAt: new Date().toISOString().split('T')[0],
      milestones: newProj.milestones || []
    };
    setProjects(prev => [fullProj, ...prev]);

    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullProj)
    }).catch(err => console.warn('Sync project failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'NewProjectPublished',
      agent: 'Sales Agent',
      summary: `Published ${fullProj.title} to verified enterprise service providers.`,
      autonomousActionTaken: 'Dispatched automated webhook broadcast to top-matched certified regional providers.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.98
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Diagnostic Booking
  const handleRequestDiagnosticBooking = (diagnosisSummary: string, estimatedCost: number) => {
    const newJob: FieldJob = {
      id: `job-${Date.now()}`,
      jobCode: `JOB-2026-${Math.floor(100 + Math.random() * 900)}`,
      title: `AI Diagnostic Dispatch: ${diagnosisSummary.slice(0, 45)}...`,
      customerName: 'OmniHealth Regional Clinic',
      address: 'Baner Tech Center, Floor 3, Pune',
      technicianName: 'Rajesh K. (L3 Senior)',
      technicianPhone: '+91 98201 55432',
      status: 'SCHEDULED',
      scheduledTime: 'Today • Within 2 Hours',
      partsConsumed: [
        { partName: 'Hardware RAID Cache Battery Unit', qty: 1, cost: estimatedCost }
      ],
      customerSignatureObtained: false
    };
    setJobs(prev => [newJob, ...prev]);
    setActiveTab('field');

    fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newJob)
    }).catch(err => console.warn('Sync job failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'AutonomousDiagnosticDispatch',
      agent: 'SLA Monitor',
      summary: `Auto-scheduled technician dispatch for diagnostic fix: "${diagnosisSummary.slice(0, 50)}...".`,
      autonomousActionTaken: 'Reserved replacement part from warehouse locker & dispatched job ticket to mobile app.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.97
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Create Field Service Job
  const handleCreateJob = (job: Partial<FieldJob>) => {
    const fullJob: FieldJob = {
      id: `job-${Date.now()}`,
      jobCode: `JOB-2026-${Math.floor(100 + Math.random() * 900)}`,
      title: job.title || 'On-Site IT Service Dispatch',
      customerName: job.customerName || 'Enterprise Client',
      address: job.address || 'BKC Tech Center, Mumbai, MH',
      technicianName: job.technicianName || 'Amit Deshmukh (L2 Network Specialist)',
      technicianPhone: job.technicianPhone || '+91 98201 44512',
      status: 'SCHEDULED',
      scheduledTime: job.scheduledTime || 'Today • Within 2 Hours',
      partsConsumed: job.partsConsumed || [],
      customerSignatureObtained: false
    };
    setJobs(prev => [fullJob, ...prev]);

    fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullJob)
    }).catch(err => console.warn('Sync job failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'FieldJobDispatched',
      agent: 'Telegram Orchestrator',
      summary: `Dispatched engineer ${fullJob.technicianName} to ${fullJob.customerName} for ${fullJob.title}.`,
      autonomousActionTaken: 'Sent GPS coordinates to field app and reserved locker parts clearance.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.98
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Create ITSM Ticket
  const handleCreateTicket = (newTicket: Partial<ITSMTicket> & { description?: string; department?: string }) => {
    const fullTicket: ITSMTicket = {
      id: `tkt-${Date.now()}`,
      ticketNumber: `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      title: newTicket.title || 'Enterprise Incident',
      requesterName: newTicket.requesterName || 'Enterprise User',
      requesterDept: newTicket.requesterDept || newTicket.department || 'IT Operations',
      priority: newTicket.priority || 'HIGH',
      status: 'OPEN',
      slaExpiresAt: newTicket.slaExpiresAt || 'Within 2 Hours',
      slaPercentUsed: 12,
      assignedAgent: newTicket.assignedAgent || 'Autonomous AI Triage',
      category: newTicket.category || 'Network Outage',
      rootCause: newTicket.description || 'Under active investigation',
      createdAt: 'Just now'
    };
    setTickets(prev => [fullTicket, ...prev]);

    fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullTicket)
    }).catch(err => console.warn('Sync ticket failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'NewTicketLogged',
      agent: 'SLA Monitor',
      summary: `Logged incident ${fullTicket.ticketNumber} for ${fullTicket.requesterName}: "${fullTicket.title}".`,
      autonomousActionTaken: 'Indexed ticket context in CMDB dependency graph and evaluated SLA escalation timer.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.96
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Reclaim Unused SaaS Licenses
  const handleReclaimLicenses = (licenseId: string) => {
    let savedAmount = 0;
    setLicenses(prev => prev.map(l => {
      if (l.id !== licenseId) return l;
      savedAmount = l.annualWastedSpend;
      return {
        ...l,
        assignedSeats: l.activeLast30Days,
        purchasedSeats: l.activeLast30Days,
        unusedSeats: 0,
        annualWastedSpend: 0
      };
    }));

    const targetLic = licenses.find(l => l.id === licenseId);
    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'SaaSSeatsReclaimed',
      agent: 'Procurement Agent',
      summary: `Autonomous reclamation of ${targetLic?.unusedSeats} ghost seats in ${targetLic?.softwareName}.`,
      autonomousActionTaken: `Revoked idle tokens via Microsoft Graph API and reduced renewal seat count, locking annual OPEX savings of ₹${savedAmount.toLocaleString('en-IN')}.`,
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Update Asset Status
  const handleUpdateAssetStatus = (assetId: string, status: AssetItem['status']) => {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, status } : a));
  };

  // Handler: Execute JML Workflow
  const handleExecuteJML = (type: 'JOINER' | 'LEAVER', employeeName: string) => {
    if (type === 'JOINER') {
      const availLaptop = assets.find(a => a.category === 'Laptop' && a.status === 'AVAILABLE_IN_STOCK');
      if (availLaptop) {
        setAssets(prev => prev.map(a => a.id === availLaptop.id ? { ...a, status: 'IN_USE', assignedUser: employeeName } : a));
      }

      const newEvt: AutonomousEvent = {
        id: `evt-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        eventType: 'JMLJoinerOnboardingExecuted',
        agent: 'Telegram Orchestrator',
        summary: `Autonomous IT onboarding pipeline completed for ${employeeName}.`,
        autonomousActionTaken: `Allocated ${availLaptop?.assetTag || 'spare laptop'}, generated Entra ID credentials, and provisioned M365 E5 license.`,
        humanApprovalRequired: false,
        approvalStatus: 'AUTO_APPROVED',
        confidenceScore: 0.99
      };
      setEvents(prev => [newEvt, ...prev]);
      alert(`✅ Joiner Workflow Complete: Allocated ${availLaptop?.name || 'ThinkPad T14'} to ${employeeName}, provisioned SSO & M365.`);
    } else {
      const assignedAsset = assets.find(a => a.assignedUser.toLowerCase().includes(employeeName.toLowerCase()));
      if (assignedAsset) {
        setAssets(prev => prev.map(a => a.id === assignedAsset.id ? { ...a, status: 'AVAILABLE_IN_STOCK', assignedUser: 'Unassigned (Returned)' } : a));
      }

      const newEvt: AutonomousEvent = {
        id: `evt-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        eventType: 'JMLLeaverOffboardingExecuted',
        agent: 'Telegram Orchestrator',
        summary: `De-provisioned IT access and recovered hardware asset for leaver ${employeeName}.`,
        autonomousActionTaken: 'Revoked Entra ID tokens, reclaimed M365 seat, and triggered courier asset recovery box.',
        humanApprovalRequired: false,
        approvalStatus: 'AUTO_APPROVED',
        confidenceScore: 0.99
      };
      setEvents(prev => [newEvt, ...prev]);
      alert(`🔒 Leaver Workflow Complete: Revoked credentials for ${employeeName}, reclaimed software licenses, and queued laptop return.`);
    }
  };

  // Handler: Toggle Workflow Rule
  const handleToggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, active: !w.active } : w));
  };

  // Handler: Add Endpoint
  const handleAddEndpoint = (newEp: EndpointHealth) => {
    setEndpoints(prev => [newEp, ...prev]);

    fetch('/api/endpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEp)
    }).catch(err => console.warn('Sync endpoint failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'RMMAgentEnrolled',
      agent: 'SLA Monitor',
      summary: `Enrolled device ${newEp.deviceName} (${newEp.os}) under continuous telemetry.`,
      autonomousActionTaken: 'Hardware sensor polling loop initiated (CPU, RAM, NVMe SMART, Battery).',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Add Asset
  const handleAddAsset = (asset: AssetItem) => {
    setAssets(prev => [asset, ...prev]);

    fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asset)
    }).catch(err => console.warn('Sync asset failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'AssetRegisteredInCMDB',
      agent: 'Telegram Orchestrator',
      summary: `Registered new asset ${asset.assetTag} (${asset.name}) in CMDB.`,
      autonomousActionTaken: 'Generated unique asset QR tracking tag and scheduled warranty notification.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Add AMC
  const handleAddAMC = (amc: AMCContract) => {
    setAMCs(prev => [amc, ...prev]);

    fetch('/api/amcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(amc)
    }).catch(err => console.warn('Sync AMC failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'AMCContractRegistered',
      agent: 'Telegram Orchestrator',
      summary: `Registered ${amc.type} AMC contract ${amc.contractNumber} for ${amc.clientName}.`,
      autonomousActionTaken: `Scheduled quarterly PM inspection and initialized ${amc.slaResponseHours}-hour response SLA guard.`,
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Add Proposal
  const handleAddProposal = (prop: Proposal) => {
    setProposals(prev => [prop, ...prev]);

    fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prop)
    }).catch(err => console.warn('Sync proposal failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'RFPProposalReceived',
      agent: 'Procurement Agent',
      summary: `Received commercial RFP proposal from ${prop.providerName} for ₹${prop.commercialBid.toLocaleString('en-IN')}.`,
      autonomousActionTaken: 'Ran automated AI matching matrix evaluation and verified vendor certifications.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.95
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Add Product
  const handleAddProduct = (prod: ProductItem) => {
    setProducts(prev => [prod, ...prev]);

    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prod)
    }).catch(err => console.warn('Sync product failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProductCreatedInCatalog',
      agent: 'Procurement Agent',
      summary: `Created SKU ${prod.sku} (${prod.name}) in master catalog.`,
      autonomousActionTaken: 'Synchronized safety stock thresholds and pricing tier in distributor index.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Create RFQ
  const handleCreateRFQ = (rfq: RFQItem) => {
    setRfqs(prev => [rfq, ...prev]);

    fetch('/api/rfqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rfq)
    }).catch(err => console.warn('Sync RFQ failed:', err));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProcurementRFQInitiated',
      agent: 'Procurement Agent',
      summary: `Initiated procurement RFQ for ${rfq.productName} (Qty: ${rfq.requiredQty}).`,
      autonomousActionTaken: 'Dispatched automated quotation requests across distributor network.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.98
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Execute Workflow Simulation Test
  const handleExecuteWorkflowTest = (workflowId: string) => {
    const wf = workflows.find(w => w.id === workflowId);
    setWorkflows(prev => prev.map(w => w.id === workflowId ? {
      ...w,
      executionCount: w.executionCount + 1,
      lastExecuted: 'Just now (Simulated)'
    } : w));

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'WorkflowRuleExecuted',
      agent: 'Telegram Orchestrator',
      summary: `Rule "${wf?.name}" successfully evaluated and executed.`,
      autonomousActionTaken: wf?.autonomousAction || 'Rule action completed.',
      humanApprovalRequired: wf?.humanApprovalRequired || false,
      approvalStatus: wf?.humanApprovalRequired ? 'PENDING_TELEGRAM' : 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Create Workflow
  const handleCreateWorkflow = (wf: Partial<AutomationWorkflow>) => {
    const newWorkflow: AutomationWorkflow = {
      id: `wf-${Date.now()}`,
      name: wf.name || 'Custom Rule',
      description: wf.description || '',
      triggerEvent: wf.triggerEvent || '',
      condition: wf.condition || '',
      autonomousAction: wf.autonomousAction || '',
      humanApprovalRequired: wf.humanApprovalRequired || false,
      active: true,
      executionCount: 0,
      lastExecuted: 'Never'
    };
    setWorkflows(prev => [newWorkflow, ...prev]);

    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'NewAutomationWorkflowRegistered',
      agent: 'Telegram Orchestrator',
      summary: `Registered new automation rule: "${newWorkflow.name}".`,
      autonomousActionTaken: 'Compiled AST rule condition into active event bus listener pipeline.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Sync Connector
  const handleSyncConnector = (id: string) => {
    setConnectors(prev => prev.map(c => c.id === id ? {
      ...c,
      status: 'CONNECTED',
      lastSyncTime: 'Just now'
    } : c));

    const conn = connectors.find(c => c.id === id);
    const newEvt: AutonomousEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'EcosystemSyncCompleted',
      agent: 'SLA Monitor',
      summary: `Completed bidirectional sync with ${conn?.name}.`,
      autonomousActionTaken: `Reconciled directory records and state hashes without conflict.`,
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.99
    };
    setEvents(prev => [newEvt, ...prev]);
  };

  // Handler: Executive AI Copilot Actions
  const handleTriggerExecutiveAction = (actionType: string) => {
    if (actionType === 'RECLAIM_AND_RFQ' || actionType === 'RECLAIM_SEATS') {
      const m365Lic = licenses.find(l => l.softwareName.includes('Microsoft 365'));
      if (m365Lic) {
        handleReclaimLicenses(m365Lic.id);
      }
      setActiveTab('assets');
    } else if (actionType === 'EXPORT_SLA') {
      const newEvt: AutonomousEvent = {
        id: `evt-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        eventType: 'ExecutiveSLAReportExported',
        agent: 'SLA Monitor',
        summary: 'Generated cryptographically signed Mumbai SLA & MTTR Compliance Audit PDF.',
        autonomousActionTaken: 'Compiled MTTR, FCR, and technician latency analytics into export package.',
        humanApprovalRequired: false,
        approvalStatus: 'AUTO_APPROVED',
        confidenceScore: 0.99
      };
      setEvents(prev => [newEvt, ...prev]);
      alert("✅ Regional SLA Audit Report generated and queued to company archive.");
    } else if (actionType === 'VIEW_RMM') {
      setActiveTab('itsm');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Top Organization Header */}
      <Header
        tenant={tenant}
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        pendingApprovalsCount={pendingApprovalsCount}
        onOpenTelegram={() => setActiveTab('telegram')}
        activeTab={activeTab}
        isCleanSlate={isCleanSlate}
        onOpenResetModal={() => setShowResetModal(true)}
      />

      {/* Main Module Tabs */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      {/* Dynamic Module Content */}
      <main className="flex-1 pb-16">
        {activeTab === 'executive' && (
          <ExecutiveDashboard
            tenant={tenant}
            onNavigateTab={(t) => setActiveTab(t)}
            onTriggerQuickAction={handleTriggerExecutiveAction}
            isCleanSlate={isCleanSlate}
            tickets={tickets}
            assets={assets}
            amcs={amcs}
            quotes={quotes}
            products={products}
          />
        )}

        {activeTab === 'telegram' && (
          <TelegramHub
            messages={telegramMessages}
            onSendMessage={handleSendMessage}
            onApproveQuote={handleApproveQuote}
            onRejectQuote={handleRejectQuote}
            quotations={quotes}
            isThinking={isThinking}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'bom' && (
          <BOMBuilder
            products={products}
            onGenerateQuote={handleGenerateQuote}
            onRequestTelegramApproval={handleGenerateQuote as any}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryProcurement
            products={products}
            suppliers={suppliers}
            rfqs={rfqs}
            onDispatchPO={handleDispatchPO}
            onAddProduct={handleAddProduct}
            onCreateRFQ={handleCreateRFQ}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'itsm' && (
          <ITSMDesk
            tickets={tickets}
            endpoints={endpoints}
            cmdbNodes={cmdbNodes}
            onResolveTicket={handleResolveTicket}
            onRemoteFix={handleRemoteFix}
            onCreateTicket={handleCreateTicket}
            onAddEndpoint={handleAddEndpoint}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'projects' && (
          <ProjectMarketplace
            projects={projects}
            proposals={proposals}
            providers={providers}
            onReleaseMilestone={handleReleaseMilestone}
            onAcceptProposal={handleAcceptProposal}
            onCreateProject={handleCreateProject}
            onRequestDiagnosticBooking={handleRequestDiagnosticBooking}
            onAddProposal={handleAddProposal}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'field' && (
          <FieldServiceMarketplace
            jobs={jobs}
            onUpdateJobStatus={handleUpdateJobStatus}
            onConsumePart={handleConsumePart}
            onSignOffJob={handleSignOffJob}
            onCreateJob={handleCreateJob}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'assets' && (
          <AssetAMCManager
            assets={assets}
            licenses={licenses}
            amcs={amcs}
            onReclaimLicenses={handleReclaimLicenses}
            onUpdateAssetStatus={handleUpdateAssetStatus}
            onExecuteJML={handleExecuteJML}
            onAddAsset={handleAddAsset}
            onAddAMC={handleAddAMC}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'finance' && (
          <FinanceGST
            tenant={tenant}
            quotes={quotes}
            isCleanSlate={isCleanSlate}
            invoices={invoices}
            onAddInvoice={handleAddInvoice}
            onSettleInvoice={handleSettleInvoice}
          />
        )}

        {activeTab === 'automation' && (
          <WorkflowAutomation
            workflows={workflows}
            onToggleWorkflow={handleToggleWorkflow}
            onExecuteWorkflowTest={handleExecuteWorkflowTest}
            onCreateWorkflow={handleCreateWorkflow}
            isCleanSlate={isCleanSlate}
          />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsHub
            connectors={connectors}
            onSyncConnector={handleSyncConnector}
          />
        )}

        {activeTab === 'events' && (
          <EventBusAudit
            events={events}
            onSimulateEvent={handleSimulateEvent}
            isCleanSlate={isCleanSlate}
          />
        )}
      </main>

      {/* System Footer */}
      <footer className="bg-slate-900/90 border-t border-slate-800 text-xs text-slate-500 py-4 px-6 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-400">Apex Autonomous IT OS</span> • Multi-Tenant Enterprise Architecture • GSTIN: {tenant.gstin}
          </div>
          <div className="flex items-center gap-3">
            <span>Server Gemini 3.8 Flash Active</span>
            <span>•</span>
            <span className="text-emerald-400 font-mono">90% Autonomous / 10% Exception Policy</span>
          </div>
        </div>
      </footer>

      {/* Reset & Workspace State Modal */}
      <ResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onResetCleanSlate={handleResetCleanSlate}
        onResetDemoSuite={handleResetDemoSuite}
        isCleanSlate={isCleanSlate}
        stats={workspaceStats}
      />

      {/* Toast Notification Banner */}
      {resetToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 border border-emerald-500/60 text-emerald-300 shadow-2xl flex items-center gap-3 animate-fadeIn text-xs font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{resetToast}</span>
        </div>
      )}

    </div>
  );
}
