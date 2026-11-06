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
import { AuthModal } from './components/AuthModal';

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
  IntegrationConnector,
  InvoiceRecord,
  RMAClaim,
  KnowledgeArticle,
  CRMOpportunity,
  MarketplaceDispute
} from './types';

const defaultTenant: TenantInfo = {
  id: 'tenant-1',
  name: 'Apex IT Systems & Solutions',
  gstin: '',
  state: 'Maharashtra (27)',
  currency: '₹',
  logoText: 'APEX',
  isConfigured: false
};

export default function App() {
  const [tenant, setTenant] = useState<TenantInfo>(defaultTenant);
  const [currentRole, setCurrentRole] = useState<UserRole>('BUSINESS_OWNER');
  const [activeTab, setActiveTab] = useState<TabKey>('executive');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Application State Collections (ZERO MOCK DATA - ALL EMPTY BY DEFAULT)
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [telegramMessages, setTelegramMessages] = useState<TelegramMessage[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
  const [rfqs, setRfqs] = useState<RFQItem[]>([]);
  const [tickets, setTickets] = useState<ITSMTicket[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointHealth[]>([]);
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [cmdbNodes, setCmdbNodes] = useState<CMDBNode[]>([]);
  const [events, setEvents] = useState<AutonomousEvent[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [licenses, setLicenses] = useState<SoftwareLicense[]>([]);
  const [amcs, setAMCs] = useState<AMCContract[]>([]);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [rmaClaims, setRMAClaims] = useState<RMAClaim[]>([]);
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [crmOpportunities, setCRMOpportunities] = useState<CRMOpportunity[]>([]);
  const [marketplaceDisputes, setMarketplaceDisputes] = useState<MarketplaceDispute[]>([]);

  const [isThinking, setIsThinking] = useState(false);
  const [isTelegramConfigured, setIsTelegramConfigured] = useState(false);

  // Authentication State (Authoritative Server Session)
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: UserRole; name?: string } | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSetupRequired, setIsSetupRequired] = useState(false);

  // Helper for user notifications
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load persistent state from backend
  const loadState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.status === 401) {
        setIsAuthModalOpen(true);
        return;
      }
      const data = await res.json();
      if (data.success && data.data) {
        const s = data.data;
        if (s.tenant) setTenant(s.tenant);
        if (s.products) setProducts(s.products);
        if (s.leads) setLeads(s.leads);
        if (s.quotes) setQuotes(s.quotes);
        if (s.telegramMessages) setTelegramMessages(s.telegramMessages);
        if (s.suppliers) setSuppliers(s.suppliers);
        if (s.rfqs) setRfqs(s.rfqs);
        if (s.tickets) setTickets(s.tickets);
        if (s.endpoints) setEndpoints(s.endpoints);
        if (s.jobs) setJobs(s.jobs);
        if (s.assets) setAssets(s.assets);
        if (s.licenses) setLicenses(s.licenses);
        if (s.amcs) setAMCs(s.amcs);
        if (s.projects) setProjects(s.projects);
        if (s.proposals) setProposals(s.proposals);
        if (s.providers) setProviders(s.providers);
        if (s.events) setEvents(s.events);
        if (s.invoices) setInvoices(s.invoices);
        if (s.workflows) setWorkflows(s.workflows);
        if (s.connectors) setConnectors(s.connectors);
        setRMAClaims(s.rmaClaims || []);
        setKnowledgeArticles(s.knowledgeArticles || []);
        setCRMOpportunities(s.crmOpportunities || []);
        setMarketplaceDisputes(s.marketplaceDisputes || []);
        fetch('/api/integrations/status')
          .then(r => r.ok ? r.json() : null)
          .then(status => setIsTelegramConfigured(Boolean(status?.telegram)))
          .catch(() => setIsTelegramConfigured(false));
      }
    } catch (err) {
      console.warn('Could not sync persistent state from server:', err);
    }
  };

  // Startup: verify auth session and integration status
  useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(status => {
        if (status.setupRequired || status.needsSetup) {
          setIsSetupRequired(true);
          setIsAuthModalOpen(true);
        } else if (status.authenticated && status.user) {
          fetch('/api/auth/me')
            .then(res => res.json())
            .then(meData => {
              if (meData.success && meData.user) {
                setCurrentUser(meData.user);
                setCurrentRole(meData.user.role);
                loadState();
              } else {
                setIsAuthModalOpen(true);
              }
            })
            .catch(() => setIsAuthModalOpen(true));
        } else {
          setIsAuthModalOpen(true);
        }
      })
      .catch(() => setIsAuthModalOpen(true));

  }, []);

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    if (user.role) setCurrentRole(user.role);
    setIsAuthModalOpen(false);
    showToast(`Authenticated as ${user.username} (${user.role}).`);
    loadState();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
    // Remove cached confidential operational data from the previous session.
    setQuotes([]); setLeads([]); setInvoices([]); setSuppliers([]);
    setRfqs([]); setTickets([]); setEndpoints([]); setJobs([]);
    setAssets([]); setLicenses([]); setAMCs([]); setProjects([]);
    setProposals([]); setProviders([]); setEvents([]); setProducts([]);
    setTelegramMessages([]); setWorkflows([]); setConnectors([]);
    setIsTelegramConfigured(false);
    setRMAClaims([]); setKnowledgeArticles([]);
    setCRMOpportunities([]); setMarketplaceDisputes([]);
    setIsAuthModalOpen(true);
    showToast('Logged out of Apex OS.');
  };

  // Update Tenant Profile
  const handleUpdateTenant = async (updates: Partial<TenantInfo>) => {
    try {
      const res = await fetch('/api/tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTenant(data.data);
        showToast('Organization settings updated successfully.');
      }
    } catch (err) {
      console.error('Failed to update tenant:', err);
    }
  };

  // Reset Clean Slate Handler (strictly 0 records)
  const handleResetCleanSlate = async () => {
    try {
      const res = await fetch('/api/state/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        const s = data.data;
        setProducts(s.products || []);
        setLeads(s.leads || []);
        setQuotes(s.quotes || []);
        setTelegramMessages(s.telegramMessages || []);
        setSuppliers(s.suppliers || []);
        setRfqs(s.rfqs || []);
        setTickets(s.tickets || []);
        setEndpoints(s.endpoints || []);
        setJobs(s.jobs || []);
        setProjects(s.projects || []);
        setProposals(s.proposals || []);
        setAssets(s.assets || []);
        setLicenses(s.licenses || []);
        setAMCs(s.amcs || []);
        setWorkflows(s.workflows || []);
        setInvoices(s.invoices || []);
        setEvents(s.events || []);
        setRMAClaims(s.rmaClaims || []);
        setKnowledgeArticles(s.knowledgeArticles || []);
        setCRMOpportunities(s.crmOpportunities || []);
        setMarketplaceDisputes(s.marketplaceDisputes || []);
        showToast('Clean Slate Active: All business records initialized to 0.');
      }
    } catch (err) {
      console.error('Server reset failed:', err);
    }
  };

  // Internal receivable draft creation; a tax invoice is not issued here.
  const handleAddInvoice = async (inv: InvoiceRecord): Promise<boolean> => {
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inv)
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        showToast(data.error || 'Receivables ledger could not save this draft.');
        return false;
      }
      setInvoices(prev => [data.data, ...prev]);
      showToast(`Receivable draft ${data.data.invoiceNo} recorded. No GST IRN was issued.`);
      return true;
    } catch (err) {
      console.error('Sync receivable draft failed:', err);
      showToast('Network error; receivables record has not been confirmed.');
      return false;
    }
  };

  const handleSettleInvoice = async (invoiceNo: string, paymentReference: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentReference })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        showToast(data.error || 'Settlement failed. Check payment reference and permissions.');
        return false;
      }
      setInvoices(prev => prev.map(i => i.invoiceNo === invoiceNo ? data.data : i));
      showToast(`Invoice ${invoiceNo} settled in the ledger with recorded evidence.`);
      return true;
    } catch (err) {
      console.error('Sync settle invoice failed:', err);
      showToast('Network error. Invoice was not confirmed settled.');
      return false;
    }
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
  const pendingApprovalsCount = quotes.filter(q => q.status === 'PENDING_OWNER_APPROVAL' || q.status === 'PENDING_APPROVAL').length;

  // Handle Telegram Chat Messages
  const handleSendMessage = async (text: string) => {
    const ownerMsg: TelegramMessage = {
      id: `msg-${Date.now()}`,
      sender: 'owner',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      deliveryStatus: 'LOCAL_ONLY'
    };

    setTelegramMessages(prev => [...prev, ownerMsg]);
    setIsThinking(true);

    try {
      const response = await fetch('/api/ai/telegram-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text })
      });

      const data = await response.json();
      if (!response.ok || !data.success || typeof data.text !== 'string') {
        showToast(data.error || 'Local AI command failed; no external Telegram message was sent.');
        return;
      }
      const botText = data.text;

      const botReply: TelegramMessage = {
        id: `msg-bot-${Date.now()}`,
        sender: 'bot',
        text: botText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: data.actions,
        deliveryStatus: 'LOCAL_ONLY'
      };

      setTelegramMessages(prev => [...prev, botReply]);
    } catch (err) {
      console.error('Error in telegram command handler:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // Separate from the in-app AI console: only the provider-confirmed API path
  // can claim a Telegram message was accepted externally.
  const handleSendExternalTelegram = async (text: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.providerAccepted || !data.data) {
        showToast(data.error || 'Telegram delivery not confirmed.');
        return false;
      }
      setTelegramMessages(prev => [...prev, data.data]);
      showToast('Telegram API accepted the message. Human read receipt is not available.');
      return true;
    } catch (error) {
      console.error('Telegram outbound request failed:', error);
      showToast('Telegram delivery not confirmed. Check connection before retrying.');
      return false;
    }
  };

  // Handle Approving a Quote via Telegram or App
  const handleApproveQuote = async (quoteId: string) => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/approve`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setQuotes(prev => prev.map(q => q.id === quoteId || q.quoteNumber === quoteId ? data.data : q));
        
        // Update Telegram message approval status
        setTelegramMessages(prev => prev.map(m => {
          if (m.approvalData && (m.approvalData.referenceId === quoteId)) {
            return {
              ...m,
              approvalData: { ...m.approvalData, status: 'APPROVED' }
            };
          }
          return m;
        }));

        showToast(`Quotation #${data.data.quoteNumber} approved.`);
      }
    } catch (err) {
      console.error('Approve quote failed:', err);
    }
  };

  // Handle Rejecting a Quote
  const handleRejectQuote = async (quoteId: string, reason: string) => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setQuotes(prev => prev.map(q => q.id === quoteId || q.quoteNumber === quoteId ? data.data : q));
        showToast(`Quotation #${data.data.quoteNumber} rejected.`);
      }
    } catch (err) {
      console.error('Reject quote failed:', err);
    }
  };

  // Handle Quotation Generation from BOM Builder
  const handleGenerateQuote = async (solution: BOMSolution, customerName: string, customerGstin: string, discount: number) => {
    if (!customerName?.trim()) {
      showToast('Real customer name is required before creating a quotation draft.');
      return;
    }
    if (solution.items.length + solution.servicesIncluded.length === 0) {
      showToast('Quote must contain an actual hardware or service line.');
      return;
    }
    const totalCost = solution.items.reduce((acc, i) => acc + (i.purchaseCost * i.qty), 0);
    const grossItems = solution.items.reduce((acc, i) => acc + (i.sellingPrice * i.qty), 0);
    const servicesTotal = solution.servicesIncluded.reduce((acc, s) => acc + s.price, 0);
    const subtotal = grossItems + servicesTotal;
    const netSubtotal = Math.max(0, subtotal - discount);
    const profit = netSubtotal - totalCost;
    const marginPercent = netSubtotal > 0 ? ((profit / netSubtotal) * 100) : 0;
    const isException = marginPercent < 12.0;

    const newQuote: Quotation = {
      id: `quote-${Date.now()}`,
      quoteNumber: `QT-${Date.now().toString().slice(-6)}`,
      customerName: customerName.trim(),
      customerGstin: customerGstin || '',
      customerState: tenant.state,
      solutionName: solution.solutionName,
      items: solution.items,
      services: solution.servicesIncluded,
      subtotal,
      discountAmount: discount,
      marginPercent: parseFloat(marginPercent.toFixed(1)),
      gstAmount: 0,
      totalAmount: netSubtotal,
      taxStatus: 'PENDING_CLASSIFICATION',
      status: isException ? 'PENDING_OWNER_APPROVAL' : 'DRAFT',
      approvalReason: isException ? `Margin ${marginPercent.toFixed(1)}% is below 12.0% floor policy.` : undefined,
      createdDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      paymentTerms: '50% Advance with PO, 50% on Delivery'
    };

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuote)
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setQuotes(prev => [data.data, ...prev]);

        if (isException) {
          const alertMsg: TelegramMessage = {
            id: `msg-alert-${Date.now()}`,
            sender: 'bot',
            text: `🚨 *APPROVAL REQUIRED: Quote #${data.data.quoteNumber}*\n\n` +
              `• *Customer:* ${data.data.customerName}\n` +
              `• *Draft Amount (GST classification pending if applicable):* ₹${data.data.totalAmount.toLocaleString('en-IN')}\n` +
              `• *Margin:* *${data.data.marginPercent}%* (Floor: 12.0%)\n` +
              `• *Autonomous Action:* Placed on hold. Awaiting Owner decision.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            approvalData: {
              type: 'QUOTE_MARGIN',
              referenceId: data.data.id,
              amount: data.data.totalAmount,
              margin: data.data.marginPercent,
              details: `Discount of ₹${discount.toLocaleString('en-IN')}`,
              status: 'PENDING'
            }
          };
          setTelegramMessages(prev => [...prev, alertMsg]);
          showToast(`Quote #${data.data.quoteNumber} added to the in-app approval queue. Telegram delivery not verified.`);
          setActiveTab('telegram');
        } else {
          showToast(`Quote #${data.data.quoteNumber} saved as draft; GST status: ${data.data.taxStatus}. Not sent.`);
        }
      } else {
        showToast(data.error || 'Quotation draft could not be saved.');
      }
    } catch (err) {
      console.error('Sync quote failed:', err);
    }
  };

  // Prepare internal PO from RFQ; no external supplier notification
  const handleDispatchPO = async (rfqId: string, supplierId: string) => {
    try {
      const res = await fetch(`/api/rfqs/${rfqId}/dispatch-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId })
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setRfqs(prev => prev.map(r => r.id === rfqId ? data.data : r));
        showToast(`PO draft ${data.data.preparedPO?.poReference} saved internally. Supplier has NOT been contacted.`);
      } else {
        showToast(data.error || 'PO preparation failed; no supplier contacted.');
      }
    } catch (err) {
      console.error('Dispatch PO failed:', err);
    }
  };

  // Handle Ticket Resolution
  const handleResolveTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESOLVED' })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTickets(prev => prev.map(t => t.id === ticketId ? data.data : t));
        showToast(`Ticket #${data.data.ticketNumber} marked RESOLVED.`);
      }
    } catch (err) {
      console.error('Resolve ticket failed:', err);
    }
  };

  // Handle Remote Fix on Endpoint
  const handleRemoteFix = (endpointId: string, actionName: string) => {
    showToast(`Remote monitoring agent is not configured for ${endpointId}. Real actions require an enrolled agent.`);
  };

  // Handle Field Job Updates
  const handleUpdateJobStatus = async (jobId: string, nextStatus: FieldJob['status']) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setJobs(prev => prev.map(j => j.id === jobId ? data.data : j));
        showToast(`Job ${data.data.jobCode} status updated to ${nextStatus}.`);
      }
    } catch (err) {
      console.error('Update job status failed:', err);
    }
  };

  const handleConsumePart = async (jobId: string, productId: string, quantity: number) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/consume-part`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        showToast(data.error || 'Warehouse part consumption failed.');
        return;
      }
      setJobs(prev => prev.map(j => j.id === jobId ? data.data : j));
      const catalogRes = await fetch('/api/products');
      const catalogData = await catalogRes.json();
      if (catalogRes.ok && catalogData.success) setProducts(catalogData.data);
      showToast(`Part consumed on job ${data.data.jobCode}. Warehouse stock updated.`);
    } catch (err) {
      console.error('Consume part failed:', err);
      showToast('Part consumption not confirmed. Please retry.');
    }
  };

  const handleSignOffJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', customerSignatureObtained: true })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setJobs(prev => prev.map(j => j.id === jobId ? data.data : j));
        showToast(`Job ${data.data.jobCode} completed and signed off.`);
      }
    } catch (err) {
      console.error('Sign off job failed:', err);
    }
  };

  // Handler: Release Project Milestone Escrow
  const handleReleaseMilestone = async (projectId: string, milestoneId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        showToast(data.error || 'Milestone update failed.');
        return;
      }
      setProjects(prev => prev.map(p => p.id === projectId ? data.data : p));
      showToast('Milestone marked completed in the project ledger. No escrow payout occurred.');
    } catch (err) {
      console.error('Update milestone failed:', err);
      showToast('Milestone completion could not be confirmed.');
    }
  };

  // Handler: Accept Project Proposal
  const handleAcceptProposal = async (projectId: string, proposalId: string) => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/accept`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        setProposals(prev => prev.map(p => {
          if (p.projectId !== projectId) return p;
          return { ...p, status: p.id === proposalId ? 'ACCEPTED' : 'REJECTED' };
        }));
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'IN_PROGRESS' } : p));
        showToast('Proposal accepted. Project moved to IN_PROGRESS.');
      }
    } catch (err) {
      console.error('Accept proposal failed:', err);
    }
  };

  // Handler: Create Project
  const handleCreateProject = async (newProj: Partial<Project>) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProj)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setProjects(prev => [data.data, ...prev]);
        showToast(`Project "${data.data.title}" published.`);
      }
    } catch (err) {
      console.error('Create project failed:', err);
    }
  };

  // Handler: Diagnostic Booking
  const handleRequestDiagnosticBooking = async (diagnosisSummary: string, estimatedCost: number) => {
    // AI hypotheses do not authorize technician dispatch or inventory consumption.
    setActiveTab('field');
    showToast('Enter real customer, site, technician and appointment details in Field Service. No booking created.');
  };

  // Handler: Create Field Service Job
  const handleCreateJob = async (job: Partial<FieldJob>) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setJobs(prev => [data.data, ...prev]);
        showToast(`Job ${data.data.jobCode} created.`);
      }
    } catch (err) {
      console.error('Create job failed:', err);
    }
  };

  // Handler: Create ITSM Ticket
  const handleCreateTicket = async (newTicket: Partial<ITSMTicket> & { description?: string; department?: string }) => {
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTicket)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTickets(prev => [data.data, ...prev]);
        showToast(`Ticket #${data.data.ticketNumber} logged.`);
      }
    } catch (err) {
      console.error('Create ticket failed:', err);
    }
  };

  // Handler: Reclaim Unused SaaS Licenses
  const handleReclaimLicenses = async (licenseId: string) => {
    try {
      const res = await fetch(`/api/licenses/${licenseId}/reclaim`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setLicenses(prev => prev.map(l => l.id === licenseId ? data.data : l));
        showToast(`Seats reclaimed for ${data.data.softwareName} in database.`);
      }
    } catch (err) {
      console.error('Reclaim license failed:', err);
    }
  };

  // Handler: Execute JML (Joiner/Mover/Leaver) Lifecycle
  const handleExecuteJML = (type: 'JOINER' | 'LEAVER', employeeName: string) => {
    if (!employeeName.trim()) {
      showToast('Please specify the employee name to trigger JML lifecycle.');
      return;
    }
    if (type === 'JOINER') {
      showToast(`JML request for ${employeeName} is a preview. Microsoft/Entra provisioning has NOT occurred.`);
    } else {
      showToast(`JML request for ${employeeName} is a preview. Microsoft/Entra access has NOT been revoked.`);
    }
  };
  const handleUpdateAssetStatus = async (assetId: string, status: AssetItem['status']) => {
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAssets(prev => prev.map(a => a.id === assetId ? data.data : a));
        showToast(`Asset status updated to ${status}.`);
      }
    } catch (err) {
      console.error('Update asset failed:', err);
    }
  };

  // Handler: Add Endpoint
  const handleAddEndpoint = async (newEp: EndpointHealth) => {
    try {
      const res = await fetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEp)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEndpoints(prev => [data.data, ...prev]);
        showToast(`Endpoint ${data.data.deviceName} enrolled.`);
      }
    } catch (err) {
      console.error('Add endpoint failed:', err);
    }
  };

  // Handler: Add Asset
  const handleAddAsset = async (asset: AssetItem) => {
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asset)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAssets(prev => [data.data, ...prev]);
        showToast(`Asset ${data.data.assetTag} registered.`);
      }
    } catch (err) {
      console.error('Add asset failed:', err);
    }
  };

  // Handler: Add AMC
  const handleAddAMC = async (amc: AMCContract) => {
    try {
      const res = await fetch('/api/amcs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(amc)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAMCs(prev => [data.data, ...prev]);
        showToast(`AMC Contract ${data.data.contractNumber} registered.`);
      }
    } catch (err) {
      console.error('Add AMC failed:', err);
    }
  };

  // Phase 2: CRUD operations return a confirmed backend record before changing UI.
  const saveBusinessRecord = async <T,>(
    url: string, method: 'POST' | 'PATCH', payload: object
  ): Promise<T | null> => {
    try {
      const response = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const parsed = await response.json();
      if (!response.ok || !parsed.success || !parsed.data) {
        showToast(parsed.error || 'Could not persist this operation.');
        return null;
      }
      return parsed.data as T;
    } catch (error) {
      console.error('Persistent business operation failed:', error);
      showToast('Network error: record has not been saved.');
      return null;
    }
  };

  const handleCreateRMA = async (claim: Pick<RMAClaim, 'assetTag' | 'faultSymptom'>): Promise<RMAClaim | null> => {
    const saved = await saveBusinessRecord<RMAClaim>('/api/rma', 'POST', claim);
    if (saved) setRMAClaims(prev => [saved, ...prev]);
    return saved;
  };
  const handleUpdateRMA = async (id: string, changes: Partial<RMAClaim>): Promise<RMAClaim | null> => {
    const saved = await saveBusinessRecord<RMAClaim>(`/api/rma/${encodeURIComponent(id)}`, 'PATCH', changes);
    if (saved) setRMAClaims(prev => prev.map(item => item.id === id ? saved : item));
    return saved;
  };

  const handleCreateKnowledge = async (article: Partial<KnowledgeArticle>): Promise<KnowledgeArticle | null> => {
    const saved = await saveBusinessRecord<KnowledgeArticle>('/api/knowledge', 'POST', article);
    if (saved) setKnowledgeArticles(prev => [saved, ...prev]);
    return saved;
  };
  const handleKnowledgeSolved = async (id: string): Promise<KnowledgeArticle | null> => {
    const saved = await saveBusinessRecord<KnowledgeArticle>(`/api/knowledge/${encodeURIComponent(id)}/solve`, 'POST', {});
    if (saved) setKnowledgeArticles(prev => prev.map(a => a.id === id ? saved : a));
    return saved;
  };

  const handleCreateCRM = async (opportunity: Partial<CRMOpportunity>): Promise<CRMOpportunity | null> => {
    const saved = await saveBusinessRecord<CRMOpportunity>('/api/crm', 'POST', opportunity);
    if (saved) setCRMOpportunities(prev => [saved, ...prev]);
    return saved;
  };
  const handleAdvanceCRM = async (id: string, stage: CRMOpportunity['stage']): Promise<CRMOpportunity | null> => {
    const saved = await saveBusinessRecord<CRMOpportunity>(`/api/crm/${encodeURIComponent(id)}`, 'PATCH', { stage });
    if (saved) setCRMOpportunities(prev => prev.map(o => o.id === id ? saved : o));
    return saved;
  };

  const handleCreateDispute = async (claim: { projectId: string; reason: string; customerClaim: string; disputedAmount: number }): Promise<MarketplaceDispute | null> => {
    const saved = await saveBusinessRecord<MarketplaceDispute>('/api/disputes', 'POST', claim);
    if (saved) setMarketplaceDisputes(prev => [saved, ...prev]);
    return saved;
  };
  const handleDisputeDecision = async (id: string, resolutionDecision: NonNullable<MarketplaceDispute['resolutionDecision']>): Promise<MarketplaceDispute | null> => {
    const saved = await saveBusinessRecord<MarketplaceDispute>(`/api/disputes/${encodeURIComponent(id)}`, 'PATCH', { resolutionDecision });
    if (saved) setMarketplaceDisputes(prev => prev.map(d => d.id === id ? saved : d));
    return saved;
  };

  // Handler: Add Proposal
  const handleAddProposal = async (prop: Proposal) => {
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prop)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setProposals(prev => [data.data, ...prev]);
        showToast(`Proposal from ${data.data.providerName} received.`);
      }
    } catch (err) {
      console.error('Add proposal failed:', err);
    }
  };

  // Handler: Add Product
  const handleAddProduct = async (prod: ProductItem) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prod)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setProducts(prev => [data.data, ...prev]);
        showToast(`Product ${data.data.name} added to catalog.`);
      }
    } catch (err) {
      console.error('Add product failed:', err);
    }
  };

  // Handler: Create RFQ
  const handleCreateRFQ = async (rfq: RFQItem) => {
    try {
      const res = await fetch('/api/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rfq)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setRfqs(prev => [data.data, ...prev]);
        showToast(`RFQ for ${data.data.productName} created.`);
      }
    } catch (err) {
      console.error('Create RFQ failed:', err);
    }
  };

  // Handler: Toggle Workflow Rule
  const handleToggleWorkflow = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}/toggle`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setWorkflows(prev => prev.map(w => w.id === id ? data.data : w));
        showToast(`Workflow rule ${data.data.active ? 'activated' : 'paused'}.`);
      }
    } catch (err) {
      console.error('Toggle workflow failed:', err);
    }
  };

  // Handler: Execute Workflow
  const handleExecuteWorkflowTest = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setWorkflows(prev => prev.map(w => w.id === workflowId ? data.data : w));
        showToast(`Rule "${data.data.name}" evaluated.`);
      }
    } catch (err) {
      console.error('Execute workflow failed:', err);
    }
  };

  // Handler: Create Workflow
  const handleCreateWorkflow = async (wf: Partial<AutomationWorkflow>) => {
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wf)
      });
      const data = await res.json();
      if (data.success && data.data) {
        setWorkflows(prev => [data.data, ...prev]);
        showToast(`Workflow "${data.data.name}" created.`);
      }
    } catch (err) {
      console.error('Create workflow failed:', err);
    }
  };

  // Executive AI Copilot Quick Actions
  const handleTriggerExecutiveAction = (actionType: string) => {
    if (actionType === 'CREATE_PROJECT') {
      setActiveTab('projects');
    } else if (actionType === 'RECLAIM_AND_RFQ') {
      setActiveTab('assets');
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
        onOpenResetModal={() => setShowSettingsModal(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        eventsCount={events.length}
        autoExecutedCount={events.filter(e => e.approvalStatus === 'AUTO_APPROVED').length}
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
            tickets={tickets}
            assets={assets}
            amcs={amcs}
            quotes={quotes}
            products={products}
            invoices={invoices}
            suppliers={suppliers}
            rfqs={rfqs}
          />
        )}

        {activeTab === 'telegram' && (
          <TelegramHub
            messages={telegramMessages}
            onSendMessage={handleSendMessage}
            onSendTelegramMessage={handleSendExternalTelegram}
            onApproveQuote={handleApproveQuote}
            onRejectQuote={handleRejectQuote}
            quotations={quotes}
            isThinking={isThinking}
            isTelegramConfigured={isTelegramConfigured}
          />
        )}

        {activeTab === 'bom' && (
          <BOMBuilder
            products={products}
            tenant={tenant}
            onGenerateQuote={handleGenerateQuote}
            onRequestTelegramApproval={handleGenerateQuote as any}
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
            knowledgeArticles={knowledgeArticles}
            onCreateKnowledgeArticle={handleCreateKnowledge}
            onMarkKnowledgeSolved={handleKnowledgeSolved}
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
            crmOpportunities={crmOpportunities}
            marketplaceDisputes={marketplaceDisputes}
            onCreateCRM={handleCreateCRM}
            onAdvanceCRM={handleAdvanceCRM}
            onCreateDispute={handleCreateDispute}
            onRecordDisputeDecision={handleDisputeDecision}
          />
        )}

        {activeTab === 'field' && (
          <FieldServiceMarketplace
            jobs={jobs}
            onUpdateJobStatus={handleUpdateJobStatus}
            onConsumePart={handleConsumePart}
            products={products}
            onSignOffJob={handleSignOffJob}
            onCreateJob={handleCreateJob}
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
            rmaClaims={rmaClaims}
            onCreateRMA={handleCreateRMA}
            onUpdateRMA={handleUpdateRMA}
          />
        )}

        {activeTab === 'finance' && (
          <FinanceGST
            tenant={tenant}
            quotes={quotes}
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
          />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsHub
            connectors={connectors}
          />
        )}

        {activeTab === 'events' && (
          <EventBusAudit
            events={events}
          />
        )}
      </main>

      {/* System Footer */}
      <footer className="bg-slate-900/90 border-t border-slate-800 text-xs text-slate-500 py-4 px-6 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-400">Apex Autonomous IT OS</span> • Single-tenant prototype (multi-tenant isolation pending) • GSTIN: {tenant.gstin || 'Not Configured'}
          </div>
          <div className="flex items-center gap-3">
            <span>Verified Server Persistence Active</span>
            <span>•</span>
            <span className="text-emerald-400 font-mono">Authentic Real-Data Engine</span>
          </div>
        </div>
      </footer>

      {/* Organization Setup Modal */}
      <ResetModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        tenant={tenant}
        onUpdateTenant={handleUpdateTenant}
        onResetCleanSlate={handleResetCleanSlate}
        stats={workspaceStats}
      />

      {/* Authoritative Security & Login Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        isSetupRequired={isSetupRequired}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 border border-emerald-500/60 text-emerald-300 shadow-2xl flex items-center gap-3 animate-fadeIn text-xs font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
