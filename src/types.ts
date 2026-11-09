export type UserRole = 
  | 'BUSINESS_OWNER' 
  | 'SALES_MANAGER' 
  | 'ENTERPRISE_IT_HEAD' 
  | 'FIELD_ENGINEER' 
  | 'PROCUREMENT_LEAD';

export type IntegrationStatus = 
  | 'NOT_CONFIGURED' 
  | 'CONFIGURED' 
  | 'CONNECTED' 
  | 'DISCONNECTED' 
  | 'ERROR';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string;
  createdAt: string;
  disabledAt?: string;
  passwordChangedAt?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  gstin: string;
  state: string;
  currency: string;
  logoText: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  pan?: string;
  isConfigured?: boolean;
}

export interface Lead {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  source: 'Website' | 'WhatsApp' | 'IndiaMART' | 'Referral' | 'Cold Outreach';
  score: 'HOT' | 'WARM' | 'COLD';
  scoreValue: number;
  stage: 'New' | 'Qualified' | 'BOM Created' | 'Quotation Sent' | 'Negotiation' | 'Won' | 'Lost';
  estimatedValue: number;
  requirementSummary: string;
  createdAt: string;
  assignedTo: string;
}

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: 'Laptop' | 'Desktop' | 'Server' | 'Networking' | 'Power' | 'Component' | 'Storage' | 'Peripheral';
  specs: string;
  purchaseCost: number;
  marketPrice: number;
  sellingPrice: number;
  minPrice: number;
  targetMarginPercent: number;
  stockAvailable: number;
  stockReserved: number;
  warehouseLocation: string;
  hsn: string;
  gstPercent: number;
  warrantyYears: number;
  serialTrackingRequired: boolean;
}

export interface BOMItem {
  id: string;
  productId?: string;
  category: string;
  sku: string;
  name: string;
  brand: string;
  specs: string;
  qty: number;
  purchaseCost: number;
  sellingPrice: number;
  warrantyYears: number;
  hsn: string;
  gstPercent: number;
}

export interface ServiceIncluded {
  id: string;
  name: string;
  price: number;
  sla: string;
  sac?: string;
  gstPercent?: number;
}

export interface BOMSolution {
  id: string;
  solutionName: string;
  category: string;
  summary: string;
  compatibilityStatus: 'UNVERIFIED' | 'VERIFIED_COMPATIBLE' | 'CONDITIONAL' | 'INCOMPATIBLE';
  compatibilityNotes: string;
  recommendedMargin: number;
  items: BOMItem[];
  servicesIncluded: ServiceIncluded[];
  autonomousNextSteps: string[];
}

export interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerGstin: string;
  customerState: string;
  solutionName: string;
  items: BOMItem[];
  services: ServiceIncluded[];
  subtotal: number;
  discountAmount: number;
  marginPercent: number;
  gstAmount: number;
  totalAmount: number;
  grandTotal?: number;
  taxStatus?: 'PENDING_CLASSIFICATION' | 'ESTIMATED_UNVERIFIED';
  taxBreakdown?: { lineId: string; taxableAmount: number; taxRatePercent: number; taxAmount: number }[];
  status: 'DRAFT' | 'PENDING_OWNER_APPROVAL' | 'APPROVED' | 'SENT_TO_CUSTOMER' | 'ACCEPTED' | 'REJECTED' | 'PENDING_APPROVAL';
  approvalReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdDate: string;
  validUntil: string;
  paymentTerms: string;
}

export interface TelegramMessage {
  id: string;
  sender: 'bot' | 'owner' | 'system';
  text: string;
  timestamp: string;
  approvalData?: {
    type: 'QUOTE_MARGIN' | 'HIGH_VALUE_PO' | 'CREDIT_LIMIT' | 'REFUND';
    referenceId: string;
    amount: number;
    margin?: number;
    details: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
  };
  suggestedActions?: string[];
  deliveryStatus?: 'LOCAL_ONLY' | 'ACCEPTED_BY_TELEGRAM_API';
  telegramMessageId?: number;
}

export interface SupplierInfo {
  id: string;
  name: string;
  rating: number;
  deliveryScore: number;
  defectRate: number;
  paymentTerms: string;
  authorizedBrands: string[];
  contactPerson: string;
  phone: string;
}

export interface RFQItem {
  id: string;
  productName: string;
  requiredQty: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  supplierQuotes: {
    supplierId: string;
    supplierName: string;
    unitCost: number;
    leadTimeDays: number;
    inStock: boolean;
    recommended?: boolean;
  }[];
  status: 'OPEN' | 'COMPARED' | 'PO_PREPARED' | 'PO_DISPATCHED';
  preparedPO?: {
    poReference: string;
    supplierId: string;
    supplierName: string;
    qty: number;
    unitCost: number;
    amount: number;
    preparedAt: string;
    preparedBy: string;
    deliveryStatus: 'NOT_SENT';
  };
}

export interface ITSMTicket {
  id: string;
  ticketNumber: string;
  title: string;
  category: 'Hardware Fault' | 'Network Outage' | 'Access Request' | 'Asset Procurement' | 'Software License';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  requesterName: string;
  requesterDept: string;
  assignedAgent: string;
  assignedUserId?: string; // stable local staff user id; legacy display name is not authorization
  reportedByUserId?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_PARTS' | 'RESOLVED';
  slaExpiresAt: string;
  slaPercentUsed: number;
  deviceAffected?: string;
  rootCause?: string;
  createdAt: string;
}

export interface EndpointHealth {
  id: string;
  deviceName: string;
  assignedUser: string;
  os: string;
  cpuLoad: number;
  ramUsagePercent: number;
  diskFreePercent: number;
  smartStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNAVAILABLE';
  batteryHealthPercent: number;
  antivirusStatus: 'UP_TO_DATE' | 'EXPIRED' | 'UNAVAILABLE';
  status?: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'OFFLINE' | 'UNENROLLED';
  telemetryAvailable?: boolean;
  lastSeen: string;
}

export interface FieldJob {
  id: string;
  jobCode: string;
  title: string;
  customerName: string;
  address: string;
  technicianName: string;
  assignedUserId?: string; // required for field engineer visibility and mutations
  technicianPhone: string;
  status: 'SCHEDULED' | 'EN_ROUTE' | 'CHECKED_IN' | 'DIAGNOSING' | 'PARTS_REPLACED' | 'COMPLETED';
  scheduledTime: string;
  partsConsumed: { partName: string; qty: number; cost: number }[];
  customerSignatureObtained: boolean;
  customerRating?: number;
}

export interface CMDBNode {
  id: string;
  name: string;
  type: 'Service' | 'Server' | 'Switch' | 'Firewall' | 'Database' | 'Storage';
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  ipAddress: string;
  impactScore: number;
}

export interface AutonomousEvent {
  id: string;
  timestamp: string;
  eventType: string;
  agent: 'Sales Agent' | 'Pricing Agent' | 'Procurement Agent' | 'SLA Monitor' | 'Telegram Orchestrator' | string;
  summary: string;
  autonomousActionTaken: string;
  humanApprovalRequired: boolean;
  approvalStatus?: 'AUTO_APPROVED' | 'PENDING_TELEGRAM' | 'AUTHORIZED' | 'REJECTED';
  confidenceScore: number;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  amount: number;
  status: 'PENDING_FUNDING' | 'ESCROW_HELD' | 'IN_PROGRESS' | 'COMPLETED' | 'RELEASED';
  dueDate: string;
}

export interface Project {
  id: string;
  projectCode: string;
  title: string;
  clientName: string;
  clientLocation: string;
  budget: number;
  category: 'Cloud Migration' | 'Enterprise Cabling' | 'Network Security' | 'Hardware Overhaul' | 'Disaster Recovery';
  scopeDescription: string;
  deliverables: string[];
  skillsRequired: string[];
  status: 'PROPOSALS_OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  proposalsCount: number;
  createdAt: string;
  milestones: ProjectMilestone[];
}

export interface Proposal {
  id: string;
  projectId: string;
  providerName: string;
  providerRating: number;
  providerVerified: boolean;
  commercialBid: number;
  timelineDays: number;
  matchScore: number;
  matchExplanation: string;
  technicalApproach: string;
  oemCertifications: string[];
  status: 'SUBMITTED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';
}

export interface ProviderProfile {
  id: string;
  name: string;
  tagline: string;
  city: string;
  rating: number;
  reviewsCount: number;
  jobsCompleted: number;
  slaPerformance: number;
  hourlyRate: number;
  distanceKm: number;
  verified: boolean;
  certifications: string[];
  currentCapacity: 'AVAILABLE' | 'BUSY' | 'OVERLOADED';
  skills: string[];
}

export interface AssetItem {
  id: string;
  assetTag: string;
  serialNumber: string;
  name: string;
  category: 'Laptop' | 'Server' | 'Switch' | 'Firewall' | 'Workstation' | 'UPS';
  brand: string;
  model: string;
  assignedUser: string;
  department: string;
  location: string;
  purchaseDate: string;
  purchaseCost: number;
  warrantyExpiresAt: string;
  status: 'IN_USE' | 'AVAILABLE_IN_STOCK' | 'UNDER_REPAIR' | 'RETIRED';
}

export interface SoftwareLicense {
  id: string;
  softwareName: string;
  publisher: string;
  tier: string;
  purchasedSeats: number;
  assignedSeats: number;
  activeLast30Days: number;
  unusedSeats: number;
  costPerSeatPerYear: number;
  annualWastedSpend: number;
  renewalDate: string;
}

export interface AMCContract {
  id: string;
  contractNumber: string;
  clientName: string;
  type: 'COMPREHENSIVE' | 'NON_COMPREHENSIVE' | 'PER_DEVICE_ONCALL';
  deviceCount: number;
  annualValue: number;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'RENEWED';
  nextPMDate: string;
  slaResponseHours: number;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  condition: string;
  autonomousAction: string;
  humanApprovalRequired: boolean;
  active: boolean;
  executionCount: number;
  lastExecuted: string;
}

export interface IntegrationConnector {
  id: string;
  name: string;
  category: 'Identity & SSO' | 'MDM & RMM' | 'Cloud Infrastructure' | 'Messaging' | 'Finance & ERP' | 'AI & LLM';
  icon: string;
  status: IntegrationStatus;
  recordsSynced: string;
  lastSyncTime: string;
  description: string;
  requiredEnvKeys?: string[];
}

export interface InvoiceRecord {
  id?: string;
  tenantId?: string;
  customer: string;
  invoiceNo: string;
  amount: number;
  dueInDays: number;
  status: 'ACTIVE' | 'DUE_SOON' | 'OVERDUE' | 'SETTLED' | 'CANCELLED';
  createdAt: string;
  gstin?: string;
  settledAt?: string;
  paymentReference?: string;
}

export type OperatingMode = 
  | 'MODEL_A_MARKETPLACE' 
  | 'MODEL_B_MANAGED_IT' 
  | 'MODEL_C_ENTERPRISE_OS' 
  | 'HYBRID';

export interface RMAClaim {
  id: string;
  rmaNumber: string;
  assetTag: string;
  assetId?: string;
  assetName: string;
  serialNumber: string;
  oemBrand: string;
  oemCaseNumber: string;
  faultSymptom: string;
  warrantyStatus: 'ACTIVE_WARRANTY' | 'OUT_OF_WARRANTY' | 'EXTENDED_CARE' | 'UNVERIFIED';
  courierTracking: string;
  courierPartner: string;
  stage: 'FAULT_LOGGED' | 'OEM_APPROVED' | 'IN_TRANSIT' | 'SERVICE_CENTER' | 'REPLACED_RETURN' | 'TESTED_CLOSED';
  createdAt: string;
  resolvedAt?: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: 'Network & VPN' | 'Windows & OS' | 'Security & Auth' | 'Hardware & Peripherals' | 'SaaS & M365' | 'Firewall' | string;
  readTime: string;
  views: number;
  solvedCount: number;
  tags: string[];
  summary: string;
  symptoms: string[];
  selfServiceSteps: string[];
}

export interface CRMOpportunity {
  id: string;
  title: string;
  clientName: string;
  contactPerson: string;
  value: number;
  stage: 'LEAD' | 'QUALIFIED' | 'TECHNICAL_SCOPING' | 'PROPOSAL_SENT' | 'PROPOSAL_SUBMITTED' | 'NEGOTIATION' | 'WON' | string;
  winProbability: number;
  expectedCloseDate: string;
  assignedEngineer: string;
  category: string;
}

export interface MarketplaceDispute {
  id: string;
  disputeNumber: string;
  projectId: string;
  projectTitle: string;
  customerName: string;
  providerName: string;
  disputedAmount: number;
  escrowHeld: number;
  reason: string;
  customerClaim: string;
  providerRebuttal: string;
  aiMediationVerdict: string;
  status: 'UNDER_REVIEW' | 'AWAITING_EVIDENCE' | 'RESOLVED_REFUND' | 'RESOLVED_RELEASED' | 'RESOLVED_REWORK' | 'UNDER_ARBITRATION' | string;
  resolutionDecision?: 'RELEASE_RECOMMENDED' | 'REFUND_RECOMMENDED' | 'REWORK_RECOMMENDED';
  decisionRecordedAt?: string;
  createdAt: string;
}

export interface DistributorVendorProfile {
  id: string;
  name: string;
  gstin: string;
  pan: string;
  headquarters: string;
  oemAuthorizations: string[];
  creditLimit: number;
  availableCredit: number;
  creditDays: number;
  deliveryPerformanceRate: number;
  averageRmaHours: number;
  priceIndex: number;
  activeContracts: number;
  tier: 'TIER_1_NATIONAL' | 'TIER_2_REGIONAL' | 'AUTHORIZED_PARTNER';
}

