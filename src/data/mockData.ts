import {
  Lead,
  ProductItem,
  Quotation,
  TelegramMessage,
  SupplierInfo,
  RFQItem,
  ITSMTicket,
  EndpointHealth,
  FieldJob,
  CMDBNode,
  AutonomousEvent,
  TenantInfo,
  Project,
  Proposal,
  ProviderProfile,
  AssetItem,
  SoftwareLicense,
  AMCContract,
  AutomationWorkflow,
  IntegrationConnector,
  RMAClaim,
  KnowledgeArticle,
  CRMOpportunity,
  MarketplaceDispute,
  DistributorVendorProfile
} from '../types';

export const initialTenant: TenantInfo = {
  id: 'tenant-apex-01',
  name: 'Apex Systems & Solutions Pvt Ltd',
  gstin: '27AAACA9823P1Z9',
  state: 'Maharashtra (27)',
  currency: '₹',
  logoText: 'APEX IT'
};

export const initialProducts: ProductItem[] = [
  {
    id: 'prod-1',
    sku: 'DELL-OPT-7010-I5',
    name: 'Dell OptiPlex 7010 Small Form Factor',
    brand: 'Dell',
    category: 'Desktop',
    specs: 'Intel Core i5-13500 (14 Cores), 16GB DDR5 4800MHz, 512GB PCIe Gen4 NVMe, Win 11 Pro',
    purchaseCost: 44200,
    marketPrice: 54000,
    sellingPrice: 51800,
    minPrice: 48500,
    targetMarginPercent: 17.2,
    stockAvailable: 28,
    stockReserved: 12,
    warehouseLocation: 'Mumbai Hub - Bin A-14',
    hsn: '84713010',
    gstPercent: 18,
    warrantyYears: 3,
    serialTrackingRequired: true
  },
  {
    id: 'prod-2',
    sku: 'LEN-T14-GEN4-I7',
    name: 'Lenovo ThinkPad T14 Gen 4 Ultrabook',
    brand: 'Lenovo',
    category: 'Laptop',
    specs: 'Intel Core i7-1365U vPro, 32GB LPDDR5x, 1TB SSD, 14" WUXGA Low Power IPS 400 nits, Win 11 Pro',
    purchaseCost: 82000,
    marketPrice: 98000,
    sellingPrice: 95500,
    minPrice: 89000,
    targetMarginPercent: 16.5,
    stockAvailable: 14,
    stockReserved: 4,
    warehouseLocation: 'Pune Hub - Bin B-03',
    hsn: '84713010',
    gstPercent: 18,
    warrantyYears: 3,
    serialTrackingRequired: true
  },
  {
    id: 'prod-3',
    sku: 'CISCO-CBS350-48P',
    name: 'Cisco CBS350-48P-4G 48-Port PoE+ Gigabit Switch',
    brand: 'Cisco',
    category: 'Networking',
    specs: '48x 10/100/1000 PoE+ Ports (370W Power Budget), 4x 1G SFP Uplinks, Layer 3 Routing, Cloud Managed',
    purchaseCost: 78500,
    marketPrice: 96000,
    sellingPrice: 92000,
    minPrice: 86000,
    targetMarginPercent: 17.2,
    stockAvailable: 3,
    stockReserved: 3,
    warehouseLocation: 'Mumbai Hub - Bin C-01',
    hsn: '85176290',
    gstPercent: 18,
    warrantyYears: 5,
    serialTrackingRequired: true
  },
  {
    id: 'prod-4',
    sku: 'FORTI-FG-60F',
    name: 'Fortinet FortiGate 60F Next-Gen Firewall',
    brand: 'Fortinet',
    category: 'Networking',
    specs: '10x GE RJ45, 1Gbps Threat Protection Throughput, 1.4Gbps SSL Inspection, 1-Yr Unified Threat Bundle',
    purchaseCost: 56000,
    marketPrice: 69000,
    sellingPrice: 65500,
    minPrice: 61000,
    targetMarginPercent: 17.0,
    stockAvailable: 8,
    stockReserved: 2,
    warehouseLocation: 'Mumbai Hub - Bin C-05',
    hsn: '85176290',
    gstPercent: 18,
    warrantyYears: 1,
    serialTrackingRequired: true
  },
  {
    id: 'prod-5',
    sku: 'APC-SRT-6KXLI',
    name: 'APC Smart-UPS On-Line 6kVA 230V Double-Conversion',
    brand: 'APC Schneider',
    category: 'Power',
    specs: '6000VA/6000W Pure Sine Wave, Extended Runtime Rack/Tower, Hardwire 3-wire Input, SmartSlot Card',
    purchaseCost: 168000,
    marketPrice: 205000,
    sellingPrice: 195000,
    minPrice: 182000,
    targetMarginPercent: 16.1,
    stockAvailable: 2,
    stockReserved: 2,
    warehouseLocation: 'Heavy Equipment Bay - Rack 2',
    hsn: '85044090',
    gstPercent: 18,
    warrantyYears: 2,
    serialTrackingRequired: true
  },
  {
    id: 'prod-6',
    sku: 'DELL-P2422H',
    name: 'Dell Professional P2422H 24" Borderless IPS Monitor',
    brand: 'Dell',
    category: 'Peripheral',
    specs: '1920 x 1080 at 60Hz, IPS 99% sRGB, ComfortView Plus, Height/Pivot/Tilt adjustable stand, DP/HDMI/VGA/USB 3.2',
    purchaseCost: 11200,
    marketPrice: 14500,
    sellingPrice: 13500,
    minPrice: 12400,
    targetMarginPercent: 20.5,
    stockAvailable: 45,
    stockReserved: 25,
    warehouseLocation: 'Mumbai Hub - Pallet 09',
    hsn: '85285200',
    gstPercent: 18,
    warrantyYears: 3,
    serialTrackingRequired: false
  },
  {
    id: 'prod-7',
    sku: 'DELL-R760-2U',
    name: 'Dell PowerEdge R760 2U Rack Server',
    brand: 'Dell',
    category: 'Server',
    specs: '2x Intel Xeon Gold 5416S (32 Cores total), 128GB DDR5 ECC RDIMM, 8x 1.92TB NVMe Mixed Use RAID 10, iDRAC9 Enterprise',
    purchaseCost: 615000,
    marketPrice: 760000,
    sellingPrice: 720000,
    minPrice: 680000,
    targetMarginPercent: 17.1,
    stockAvailable: 2,
    stockReserved: 1,
    warehouseLocation: 'Secure Server Vault - Bay 1',
    hsn: '84715000',
    gstPercent: 18,
    warrantyYears: 5,
    serialTrackingRequired: true
  }
];

export const initialLeads: Lead[] = [
  {
    id: 'lead-101',
    companyName: 'Nexus FinTech Labs',
    contactPerson: 'Aditya Mehta (VP Infrastructure)',
    email: 'aditya.m@nexusfintech.in',
    phone: '+91 98201 44520',
    source: 'Website',
    score: 'HOT',
    scoreValue: 94,
    stage: 'Quotation Sent',
    estimatedValue: 2480000,
    requirementSummary: '45 Dev Laptops (Core i7 / 32GB) + 10G Cisco Core Switching + 3-Yr Onsite AMC for BKC office expansion.',
    createdAt: '2026-09-02',
    assignedTo: 'Rahul Sen (Sales Lead)'
  },
  {
    id: 'lead-102',
    companyName: 'OmniHealth Hospitals Group',
    contactPerson: 'Dr. Sneha Pillai (IT Director)',
    email: 'sneha.p@omnihealth.org',
    phone: '+91 97690 12884',
    source: 'Referral',
    score: 'HOT',
    scoreValue: 88,
    stage: 'BOM Created',
    estimatedValue: 1850000,
    requirementSummary: 'PACS Imaging Server with 48TB High-Endurance Storage + 30 Diagnostic grade IPS Displays.',
    createdAt: '2026-09-03',
    assignedTo: 'Anita Deshmukh (Enterprise Solutions)'
  },
  {
    id: 'lead-103',
    companyName: 'Zenith Logistics & Supply',
    contactPerson: 'Karan Grover (Operations Head)',
    email: 'karan@zenithlogistics.com',
    phone: '+91 99304 55190',
    source: 'IndiaMART',
    score: 'WARM',
    scoreValue: 72,
    stage: 'Negotiation',
    estimatedValue: 680000,
    requirementSummary: 'Warehouse barcode scanners, 15 rugged desktops, Wi-Fi 6 AP deployment with thermal testing.',
    createdAt: '2026-08-28',
    assignedTo: 'Rahul Sen (Sales Lead)'
  }
];

export const initialQuotes: Quotation[] = [
  {
    id: 'quote-1048',
    quoteNumber: 'APX-QT-2026-1048',
    customerName: 'Nexus FinTech Labs',
    customerGstin: '27AABCN8192K1Z4',
    customerState: 'Maharashtra (27)',
    solutionName: '45-Seat Enterprise Engineering Compute Stack',
    items: [
      {
        id: 'b-1',
        category: 'Laptop',
        sku: 'LEN-T14-GEN4-I7',
        name: 'Lenovo ThinkPad T14 Gen 4 Ultrabook (i7/32GB)',
        brand: 'Lenovo',
        specs: 'Intel Core i7-1365U, 32GB RAM, 1TB SSD, 3-Yr Premier Onsite',
        qty: 45,
        purchaseCost: 82000,
        sellingPrice: 90000,
        warrantyYears: 3,
        hsn: '84713010',
        gstPercent: 18
      }
    ],
    services: [
      { id: 's-1', name: 'Zero-Touch Autopilot Imaging & Asset Tagging', price: 45000, sla: '24 Hours' },
      { id: 's-2', name: '1-Year Enterprise VIP 4-Hour Response AMC', price: 95000, sla: '4-Hour Onsite' }
    ],
    subtotal: 4190000,
    discountAmount: 110000,
    marginPercent: 9.8,
    gstAmount: 734400,
    totalAmount: 4814400,
    status: 'PENDING_OWNER_APPROVAL',
    approvalReason: 'Customer requested ₹2,000/unit bulk concession; Margin dropped to 9.8% (< 12.0% auto-threshold). Requires Business Owner Telegram Authorization.',
    createdDate: '2026-09-04',
    validUntil: '2026-09-18',
    paymentTerms: '50% Advance with PO, 50% on Delivery'
  },
  {
    id: 'quote-1042',
    quoteNumber: 'APX-QT-2026-1042',
    customerName: 'Zenith Logistics & Supply',
    customerGstin: '27AAACZ3320M1ZO',
    customerState: 'Maharashtra (27)',
    solutionName: 'Warehouse Wi-Fi 6 & Rugged Workstation Bundle',
    items: [
      {
        id: 'b-2',
        category: 'Desktop',
        sku: 'DELL-OPT-7010-I5',
        name: 'Dell OptiPlex 7010 SFF (Core i5/16GB/512GB)',
        brand: 'Dell',
        specs: 'Core i5 13th Gen, 16GB RAM, 512GB SSD',
        qty: 12,
        purchaseCost: 44200,
        sellingPrice: 51800,
        warrantyYears: 3,
        hsn: '84713010',
        gstPercent: 18
      }
    ],
    services: [
      { id: 's-3', name: 'Factory Floor Wi-Fi Heatmap Survey & Installation', price: 28000, sla: '48 Hours' }
    ],
    subtotal: 649600,
    discountAmount: 15000,
    marginPercent: 15.6,
    gstAmount: 114228,
    totalAmount: 748828,
    status: 'SENT_TO_CUSTOMER',
    createdDate: '2026-09-03',
    validUntil: '2026-09-17',
    paymentTerms: '100% on delivery'
  }
];

export const initialTelegramMessages: TelegramMessage[] = [
  {
    id: 'msg-1',
    sender: 'bot',
    text: `🌅 *Autonomous Daily Business Briefing — 04 Sep 2026*\n\n` +
      `• *MTD Sales:* ₹48.60 Lakhs (81% of Target)\n` +
      `• *Gross Margin:* 17.2% average across all deals\n` +
      `• *Stock Warnings:* 1 Critical (Cisco 48P Switch 0 units)\n` +
      `• *Pending Approvals:* 1 Quote margin exception awaiting decision`,
    timestamp: '09:00 AM',
    suggestedActions: ['/dashboard', '/pending', '/stock']
  },
  {
    id: 'msg-2',
    sender: 'bot',
    text: `🚨 *APPROVAL REQUIRED: Quote #APX-QT-2026-1048*\n\n` +
      `• *Customer:* Nexus FinTech Labs (Aditya Mehta)\n` +
      `• *Order Value:* ₹48,14,400 (Incl. GST)\n` +
      `• *Gross Margin:* *9.8%* (₹4,10,000 profit)\n` +
      `• *Rule Triggered:* Margin < 12.0% threshold\n` +
      `• *AI Risk Assessment:* LOW RISK. High-reputation client, 50% advance confirmed, guaranteed repeat AMC. Recommended: *APPROVE*.`,
    timestamp: '11:42 AM',
    approvalData: {
      type: 'QUOTE_MARGIN',
      referenceId: 'quote-1048',
      amount: 4814400,
      margin: 9.8,
      details: 'Concession requested for 45 ThinkPad T14 laptops',
      status: 'PENDING'
    },
    suggestedActions: ['APPROVE QUOTE', 'REJECT QUOTE', 'ASK AI RECOMMENDATION']
  }
];

export const initialSuppliers: SupplierInfo[] = [
  {
    id: 'supp-1',
    name: 'Ingram Micro India Pvt Ltd',
    rating: 4.8,
    deliveryScore: 94,
    defectRate: 0.4,
    paymentTerms: '30 Days Net Credit',
    authorizedBrands: ['Cisco', 'HP', 'Lenovo', 'Fortinet'],
    contactPerson: 'Vikram Joshi (National Distribution)',
    phone: '+91 22 6655 4000'
  },
  {
    id: 'supp-2',
    name: 'Redington India Ltd',
    rating: 4.9,
    deliveryScore: 96,
    defectRate: 0.3,
    paymentTerms: '21 Days Net Credit',
    authorizedBrands: ['Dell', 'APC Schneider', 'Cisco', 'Seagate'],
    contactPerson: 'Priya Nambiar (Enterprise Accounts)',
    phone: '+91 44 4224 3353'
  },
  {
    id: 'supp-3',
    name: 'Savex Technologies',
    rating: 4.6,
    deliveryScore: 90,
    defectRate: 0.8,
    paymentTerms: '15 Days PDC',
    authorizedBrands: ['Lenovo', 'HP', 'Samsung'],
    contactPerson: 'Sandeep Shah',
    phone: '+91 22 2279 8000'
  }
];

export const initialRFQs: RFQItem[] = [
  {
    id: 'rfq-201',
    productName: 'Cisco CBS350-48P-4G 48-Port PoE+ Switch',
    requiredQty: 5,
    urgency: 'HIGH',
    status: 'COMPARED',
    supplierQuotes: [
      { supplierId: 'supp-2', supplierName: 'Redington India Ltd', unitCost: 77800, leadTimeDays: 2, inStock: true, recommended: true },
      { supplierId: 'supp-1', supplierName: 'Ingram Micro', unitCost: 78500, leadTimeDays: 4, inStock: true, recommended: false },
      { supplierId: 'supp-3', supplierName: 'Savex Tech', unitCost: 79200, leadTimeDays: 7, inStock: false, recommended: false }
    ]
  },
  {
    id: 'rfq-202',
    productName: 'APC Smart-UPS On-Line 6kVA 230V',
    requiredQty: 2,
    urgency: 'MEDIUM',
    status: 'OPEN',
    supplierQuotes: [
      { supplierId: 'supp-2', supplierName: 'Redington India Ltd', unitCost: 167500, leadTimeDays: 3, inStock: true, recommended: true }
    ]
  }
];

export const initialITSMTickets: ITSMTicket[] = [
  {
    id: 't-401',
    ticketNumber: 'INC-8890',
    title: 'Core Branch Switch Dropping Packets (Port 24 Flapping)',
    category: 'Network Outage',
    priority: 'CRITICAL',
    requesterName: 'Aditya Mehta',
    requesterDept: 'Nexus BKC Floor 4',
    assignedAgent: 'Sameer Sheikh (L3 Network Engg)',
    status: 'IN_PROGRESS',
    slaExpiresAt: '2h 15m remaining',
    slaPercentUsed: 62,
    deviceAffected: 'Cisco CBS350-48P-BKC-01',
    rootCause: 'SFP+ 10G transceiver optical degradation (Rx power -19dBm)',
    createdAt: '11:15 AM'
  },
  {
    id: 't-402',
    ticketNumber: 'SR-1142',
    title: 'New Joiner Onboarding Compute Kit Request (Design Lead)',
    category: 'Asset Procurement',
    priority: 'MEDIUM',
    requesterName: 'Meera Rajput',
    requesterDept: 'UI/UX Design Studio',
    assignedAgent: 'Pooja Iyer (IT Admin)',
    status: 'WAITING_ON_PARTS',
    slaExpiresAt: '18h remaining',
    slaPercentUsed: 25,
    deviceAffected: 'MacBook Pro M3 / Dell UltraSharp 27',
    createdAt: 'Yesterday'
  },
  {
    id: 't-403',
    ticketNumber: 'INC-8884',
    title: 'Dell PowerEdge R760 DIMM Slot B4 ECC Memory Error Alert',
    category: 'Hardware Fault',
    priority: 'HIGH',
    requesterName: 'Sanjay Rawat (DBA)',
    requesterDept: 'FinTech Core Cluster',
    assignedAgent: 'Sameer Sheikh (L3 Network Engg)',
    status: 'OPEN',
    slaExpiresAt: '3h 40m remaining',
    slaPercentUsed: 40,
    deviceAffected: 'DELL-R760-DB-NODE-01',
    rootCause: 'Single-bit error rate threshold reached on 32GB DDR5 RDIMM',
    createdAt: '08:30 AM'
  }
];

export const initialEndpoints: EndpointHealth[] = [
  {
    id: 'ep-1',
    deviceName: 'NB-NX-DEV-008 (ThinkPad T14)',
    assignedUser: 'Kavita Joshi (Senior Dev)',
    os: 'Ubuntu 24.04 LTS / Win 11 Dual',
    cpuLoad: 24,
    ramUsagePercent: 68,
    diskFreePercent: 42,
    smartStatus: 'HEALTHY',
    batteryHealthPercent: 91,
    antivirusStatus: 'UP_TO_DATE',
    lastSeen: '12 seconds ago'
  },
  {
    id: 'ep-2',
    deviceName: 'NB-NX-FIN-014 (ThinkPad T14)',
    assignedUser: 'Rohan Deshmukh (Accounts)',
    os: 'Windows 11 Pro 23H2',
    cpuLoad: 89,
    ramUsagePercent: 94,
    diskFreePercent: 8,
    smartStatus: 'WARNING',
    batteryHealthPercent: 38,
    antivirusStatus: 'UP_TO_DATE',
    lastSeen: '1 minute ago'
  },
  {
    id: 'ep-3',
    deviceName: 'SRV-PROD-DB-01 (Dell R760)',
    assignedUser: 'System DBA Root',
    os: 'Red Hat Enterprise Linux 9.3',
    cpuLoad: 42,
    ramUsagePercent: 78,
    diskFreePercent: 65,
    smartStatus: 'HEALTHY',
    batteryHealthPercent: 100,
    antivirusStatus: 'UP_TO_DATE',
    lastSeen: 'Realtime'
  }
];

export const initialFieldJobs: FieldJob[] = [
  {
    id: 'job-901',
    jobCode: 'FSD-MUM-449',
    title: '48-Port Switch Replacement & Cable Dressing',
    customerName: 'Nexus FinTech Labs',
    address: 'Unit 402, Trade Tower, Bandra Kurla Complex (BKC), Mumbai',
    technicianName: 'Farhan Ali (Senior Field Engg)',
    technicianPhone: '+91 98200 77123',
    status: 'EN_ROUTE',
    scheduledTime: 'Today, 02:00 PM',
    partsConsumed: [
      { partName: 'Cisco SFP-10G-SR Optical Module', qty: 2, cost: 8400 }
    ],
    customerSignatureObtained: false
  },
  {
    id: 'job-902',
    jobCode: 'FSD-PUN-221',
    title: 'APC 6kVA Battery Health Audit & Terminals Cleanse',
    customerName: 'Zenith Logistics Hub',
    address: 'Chakan Industrial Phase II, Pune',
    technicianName: 'Suresh Patil',
    technicianPhone: '+91 97650 33490',
    status: 'CHECKED_IN',
    scheduledTime: 'Today, 11:30 AM',
    partsConsumed: [],
    customerSignatureObtained: false
  }
];

export const initialCMDBNodes: CMDBNode[] = [
  { id: 'cmdb-1', name: 'Core Trading API Gateway', type: 'Service', status: 'ONLINE', ipAddress: '10.0.1.10', impactScore: 98 },
  { id: 'cmdb-2', name: 'Prod DB Cluster (Postgres HA)', type: 'Database', status: 'ONLINE', ipAddress: '10.0.1.50', impactScore: 95 },
  { id: 'cmdb-3', name: 'Dell PowerEdge R760 Node 1', type: 'Server', status: 'DEGRADED', ipAddress: '10.0.2.11', impactScore: 88 },
  { id: 'cmdb-4', name: 'Cisco CBS350 Core Switch', type: 'Switch', status: 'ONLINE', ipAddress: '10.0.0.1', impactScore: 92 },
  { id: 'cmdb-5', name: 'FortiGate 60F Perimeter FW', type: 'Firewall', status: 'ONLINE', ipAddress: '192.168.1.1', impactScore: 99 }
];

export const initialEvents: AutonomousEvent[] = [
  {
    id: 'evt-101',
    timestamp: '12:04:18',
    eventType: 'MarginValidationException',
    agent: 'Pricing Agent',
    summary: 'Quote #APX-QT-2026-1048 computed at 9.8% margin (Breaches 12% floor rule).',
    autonomousActionTaken: 'Escalated immediately to Telegram Command Center with executive recommendation.',
    humanApprovalRequired: true,
    approvalStatus: 'PENDING_TELEGRAM',
    confidenceScore: 0.96
  },
  {
    id: 'evt-102',
    timestamp: '11:45:02',
    eventType: 'InventoryShortageDetected',
    agent: 'Procurement Agent',
    summary: 'Cisco CBS350-48P available stock reduced to 0 units with 2 backorders.',
    autonomousActionTaken: 'Auto-dispatched RFQ to Redington and Ingram Micro with 48hr delivery SLA condition.',
    humanApprovalRequired: false,
    approvalStatus: 'AUTO_APPROVED',
    confidenceScore: 0.99
  },
  {
    id: 'evt-103',
    timestamp: '10:30:45',
    eventType: 'PredictiveBatteryAlert',
    agent: 'SLA Monitor',
    summary: 'Endpoint NB-NX-FIN-014 battery health dropped below 40% (38%).',
    autonomousActionTaken: 'Auto-created proactive Service Request #SR-1149 for battery swap before user faces downtime.',
    humanApprovalRequired: false,
    approvalStatus: 'AUTO_APPROVED',
    confidenceScore: 0.94
  },
  {
    id: 'evt-104',
    timestamp: '09:12:30',
    eventType: 'GSTInvoiceGeneration',
    agent: 'Telegram Orchestrator',
    summary: 'Sales Order #SO-7749 cleared 100% advance via NEFT.',
    autonomousActionTaken: 'Generated compliant GST Tax Invoice #INV-2026-0812 with HSN breakdown & dispatched WhatsApp notification.',
    humanApprovalRequired: false,
    approvalStatus: 'AUTO_APPROVED',
    confidenceScore: 0.98
  }
];

export const initialProjects: Project[] = [
  {
    id: 'proj-1',
    projectCode: 'PRJ-2026-042',
    title: 'Hybrid Cloud Migration & AWS DirectConnect Setup',
    clientName: 'Tata Consultancy Labs',
    clientLocation: 'Navi Mumbai, MH',
    budget: 850000,
    category: 'Cloud Migration',
    scopeDescription: 'Migrate 18 VMware ESXi VMs to AWS EC2/RDS, configure 1Gbps DirectConnect dedicated circuit, BGP routing, and FortiGate IPsec failover tunnels.',
    deliverables: [
      'AWS Landing Zone Architecture Document',
      'DirectConnect Fiber Cross-Connect & BGP Configuration',
      'Zero-Downtime Database Replication Cutover',
      'Post-migration 30-Day Hypercare & Disaster Recovery Drill'
    ],
    skillsRequired: ['AWS Advanced Networking', 'VMware vSphere 8', 'Fortinet FortiGate', 'BGP Peering'],
    status: 'PROPOSALS_OPEN',
    proposalsCount: 3,
    createdAt: '2026-09-02',
    milestones: [
      { id: 'm-1', title: 'Phase 1: Architecture Sign-off & VPC Setup', amount: 200000, status: 'ESCROW_HELD', dueDate: '2026-09-15' },
      { id: 'm-2', title: 'Phase 2: DirectConnect & BGP Peering', amount: 350000, status: 'IN_PROGRESS', dueDate: '2026-09-28' },
      { id: 'm-3', title: 'Phase 3: Workload Migration & DR Drill', amount: 300000, status: 'PENDING_FUNDING', dueDate: '2026-10-15' }
    ]
  },
  {
    id: 'proj-2',
    projectCode: 'PRJ-2026-039',
    title: '140-Node Cat6A 10G Structured Cabling & Server Rack Dress',
    clientName: 'Fintech Nexus Tower',
    clientLocation: 'Bandra Kurla Complex, Mumbai',
    budget: 420000,
    category: 'Enterprise Cabling',
    scopeDescription: 'Complete structured cabling overhaul across 2 office floors. 140 drops with Schneider Actassi Cat6A LSZH, Fluke DSX-8000 certified reports, and 42U server rack wire dressing.',
    deliverables: [
      'Fluke Calibration & Decibel Return-Loss PDF Certifications',
      'Patch Panel Port Mapping Schedule',
      'Numbered Cable Tagging at Workstations & Rack'
    ],
    skillsRequired: ['Cat6A Termination', 'Fluke DSX-8000', 'Server Rack Architecture', 'OTDR Testing'],
    status: 'IN_PROGRESS',
    proposalsCount: 5,
    createdAt: '2026-08-28',
    milestones: [
      { id: 'm-201', title: 'Conduit & Cable Pulling (Floors 4 & 5)', amount: 150000, status: 'RELEASED', dueDate: '2026-09-01' },
      { id: 'm-202', title: 'Termination & 42U Rack Dressing', amount: 170000, status: 'ESCROW_HELD', dueDate: '2026-09-10' },
      { id: 'm-203', title: 'Fluke Testing & Final Sign-off', amount: 100000, status: 'PENDING_FUNDING', dueDate: '2026-09-18' }
    ]
  },
  {
    id: 'proj-3',
    projectCode: 'PRJ-2026-031',
    title: 'Enterprise Multi-Site Fortinet SD-WAN Deployment',
    clientName: 'OmniHealth Diagnostics Group',
    clientLocation: 'Pune, Maharashtra (12 Diagnostic Centers)',
    budget: 680000,
    category: 'Network Security',
    scopeDescription: 'Deploy 12 FortiGate 40F firewalls across regional branches with centralized FortiManager cloud control, LTE cellular auto-failover, and HIPAA-compliant encryption.',
    deliverables: [
      'Centralized FortiManager Policy Template',
      'Dual-ISP WAN Link Health Monitoring Rules',
      'Zero-Trust Network Access (ZTNA) Agent Rollout'
    ],
    skillsRequired: ['Fortinet NSE 4/7', 'SD-WAN SLA Orchestration', 'IPsec Mesh', 'ZTNA'],
    status: 'PROPOSALS_OPEN',
    proposalsCount: 2,
    createdAt: '2026-09-03',
    milestones: [
      { id: 'm-301', title: 'Hardware Staging & Golden Config Template', amount: 200000, status: 'PENDING_FUNDING', dueDate: '2026-09-20' },
      { id: 'm-302', title: 'Branch On-site Rollout (12 Sites)', amount: 330000, status: 'PENDING_FUNDING', dueDate: '2026-10-05' },
      { id: 'm-303', title: 'HA Failover Testing & Training', amount: 150000, status: 'PENDING_FUNDING', dueDate: '2026-10-15' }
    ]
  }
];

export const initialProposals: Proposal[] = [
  {
    id: 'prop-1',
    projectId: 'proj-1',
    providerName: 'CloudMatrix Solutions Pvt Ltd',
    providerRating: 4.95,
    providerVerified: true,
    commercialBid: 790000,
    timelineDays: 24,
    matchScore: 96,
    matchExplanation: 'AWS Advanced Consulting Partner with 14 in-house certified networking architects, Mumbai local NOC, and 100% SLA track record across 48 migrations.',
    technicalApproach: 'Deploy AWS Transit Gateway hub-and-spoke with redundant 1G DirectConnect connections via Equinix Mumbai. Live database migration utilizing AWS DMS with CDC replication.',
    oemCertifications: ['AWS Advanced Tier', 'Fortinet Certified Expert', 'VMware VCP-DCV'],
    status: 'SHORTLISTED'
  },
  {
    id: 'prop-2',
    projectId: 'proj-1',
    providerName: 'InfraScale Network Tech',
    providerRating: 4.8,
    providerVerified: true,
    commercialBid: 740000,
    timelineDays: 28,
    matchScore: 89,
    matchExplanation: 'Cost-effective bid with deep VMware knowledge, though requires external partner for specialized FortiGate BGP configuration.',
    technicalApproach: 'Phased weekend migration using VMware vMotion over private encrypted circuit. Cold backup sync on S3 before live cutover.',
    oemCertifications: ['VMware Enterprise Partner', 'Cisco CCNP Enterprise'],
    status: 'SUBMITTED'
  },
  {
    id: 'prop-3',
    projectId: 'proj-1',
    providerName: 'Velox Systems Group',
    providerRating: 4.7,
    providerVerified: false,
    commercialBid: 860000,
    timelineDays: 32,
    matchScore: 78,
    matchExplanation: 'Higher commercial quote and longer timeline, but includes 60 days post-cutover managed support.',
    technicalApproach: 'Manual VM export to OVF format and import via AWS VM Import/Export tool. Simple site-to-site VPN primary tunnel.',
    oemCertifications: ['AWS Select Tier'],
    status: 'SUBMITTED'
  }
];

export const initialProviders: ProviderProfile[] = [
  {
    id: 'prov-1',
    name: 'Apex Rapid Response Engineers',
    tagline: 'Tier-3 Enterprise Certified Field Engineers & L3 Network Architects',
    city: 'Mumbai & Thane',
    rating: 4.94,
    reviewsCount: 382,
    jobsCompleted: 1420,
    slaPerformance: 98.4,
    hourlyRate: 1800,
    distanceKm: 3.2,
    verified: true,
    certifications: ['Cisco CCIE Enterprise', 'Fortinet NSE 7', 'Microsoft Solutions Partner', 'Schneider APC'],
    currentCapacity: 'AVAILABLE',
    skills: ['Data Center Cabling', 'Firewall Cluster', 'Server Deployment', 'SAN Storage', 'Disaster Recovery']
  },
  {
    id: 'prov-2',
    name: 'Pune IT InfraCare Labs',
    tagline: 'Specialized Hardware Chip-Level Repair & On-Demand IT Dispatch',
    city: 'Pune & PCMC',
    rating: 4.88,
    reviewsCount: 210,
    jobsCompleted: 890,
    slaPerformance: 96.1,
    hourlyRate: 1400,
    distanceKm: 8.5,
    verified: true,
    certifications: ['Dell Certified Systems Expert', 'HP Authorized Service', 'CompTIA A+ & Network+'],
    currentCapacity: 'AVAILABLE',
    skills: ['Laptop Chip-Level Repair', 'BGA Rework', 'RAID Data Recovery', 'CCTV & Biometrics', 'Desktop Fleet Care']
  },
  {
    id: 'prov-3',
    name: 'CyberShield SecureNet',
    tagline: 'Zero-Trust Network Access, Next-Gen Firewalls & Cloud Security',
    city: 'Navi Mumbai',
    rating: 4.91,
    reviewsCount: 144,
    jobsCompleted: 430,
    slaPerformance: 97.8,
    hourlyRate: 2200,
    distanceKm: 12.0,
    verified: true,
    certifications: ['CISSP', 'Fortinet NSE 8', 'Palo Alto PCNSE', 'AWS Security Specialty'],
    currentCapacity: 'BUSY',
    skills: ['Next-Gen Firewall', 'Penetration Testing', 'SIEM Integration', 'ZTNA', 'Active Directory Hardening']
  }
];

export const initialAssets: AssetItem[] = [
  {
    id: 'ast-101',
    assetTag: 'APX-AST-0081',
    serialNumber: 'DL-OPT-881920-IN',
    name: 'Dell OptiPlex 7010 Micro Workstation',
    category: 'Workstation',
    brand: 'Dell',
    model: 'OptiPlex 7010 (Core i5 13th Gen, 16GB, 512GB)',
    assignedUser: 'Aditya Mehta (VP Engineering)',
    department: 'Engineering',
    location: 'Mumbai HQ - Floor 4',
    purchaseDate: '2025-04-12',
    purchaseCost: 51800,
    warrantyExpiresAt: '2028-04-11',
    status: 'IN_USE'
  },
  {
    id: 'ast-102',
    assetTag: 'APX-AST-0082',
    serialNumber: 'LN-TP-99210-IN',
    name: 'Lenovo ThinkPad T14 Gen 4',
    category: 'Laptop',
    brand: 'Lenovo',
    model: 'ThinkPad T14 (Core i7, 32GB RAM, 1TB SSD)',
    assignedUser: 'Priya Sharma (Finance Director)',
    department: 'Finance',
    location: 'Mumbai HQ - Floor 5',
    purchaseDate: '2025-08-19',
    purchaseCost: 95500,
    warrantyExpiresAt: '2028-08-18',
    status: 'IN_USE'
  },
  {
    id: 'ast-103',
    assetTag: 'APX-AST-0083',
    serialNumber: 'CSC-350-9812-IN',
    name: 'Cisco CBS350-48P Managed PoE Switch',
    category: 'Switch',
    brand: 'Cisco',
    model: 'CBS350 48-Port PoE+ 370W Layer-3',
    assignedUser: 'Unassigned (Core Infra)',
    department: 'IT Infrastructure',
    location: 'Server Room Rack 2 - U24',
    purchaseDate: '2024-02-10',
    purchaseCost: 92000,
    warrantyExpiresAt: '2029-02-09',
    status: 'IN_USE'
  },
  {
    id: 'ast-104',
    assetTag: 'APX-AST-0084',
    serialNumber: 'APC-SRT-6K-4410',
    name: 'APC Smart-UPS On-Line 6kVA',
    category: 'UPS',
    brand: 'APC Schneider',
    model: 'SRT6KXLI 6000VA Double Conversion',
    assignedUser: 'Unassigned (Core Infra)',
    department: 'Facilities & IT',
    location: 'Server Room Rack 1 - Bottom',
    purchaseDate: '2024-05-15',
    purchaseCost: 195000,
    warrantyExpiresAt: '2026-10-15',
    status: 'IN_USE'
  },
  {
    id: 'ast-105',
    assetTag: 'APX-AST-0085',
    serialNumber: 'DL-LAT-5420-OLD',
    name: 'Dell Latitude 5420 Laptop',
    category: 'Laptop',
    brand: 'Dell',
    model: 'Latitude 5420 (Core i5 11th Gen)',
    assignedUser: 'Unassigned',
    department: 'IT Spare Pool',
    location: 'IT Store Locker 3',
    purchaseDate: '2022-01-10',
    purchaseCost: 68000,
    warrantyExpiresAt: '2025-01-09',
    status: 'AVAILABLE_IN_STOCK'
  }
];

export const initialLicenses: SoftwareLicense[] = [
  {
    id: 'lic-1',
    softwareName: 'Microsoft 365 E5 Enterprise',
    publisher: 'Microsoft',
    tier: 'Enterprise E5 Full Suite',
    purchasedSeats: 250,
    assignedSeats: 228,
    activeLast30Days: 206,
    unusedSeats: 44,
    costPerSeatPerYear: 38400,
    annualWastedSpend: 1689600,
    renewalDate: '2027-03-31'
  },
  {
    id: 'lic-2',
    softwareName: 'Adobe Creative Cloud All Apps',
    publisher: 'Adobe Systems',
    tier: 'Team Enterprise',
    purchasedSeats: 25,
    assignedSeats: 22,
    activeLast30Days: 14,
    unusedSeats: 11,
    costPerSeatPerYear: 62000,
    annualWastedSpend: 682000,
    renewalDate: '2026-11-15'
  },
  {
    id: 'lic-3',
    softwareName: 'FortiClient ZTNA & Endpoint Security',
    publisher: 'Fortinet',
    tier: 'Enterprise Security Fabric',
    purchasedSeats: 300,
    assignedSeats: 285,
    activeLast30Days: 280,
    unusedSeats: 15,
    costPerSeatPerYear: 4200,
    annualWastedSpend: 63000,
    renewalDate: '2027-01-20'
  }
];

export const initialAMCs: AMCContract[] = [
  {
    id: 'amc-1',
    contractNumber: 'AMC-2026-081',
    clientName: 'Nexus FinTech Corporate Towers',
    type: 'COMPREHENSIVE',
    deviceCount: 145,
    annualValue: 840000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'ACTIVE',
    nextPMDate: '2026-09-18',
    slaResponseHours: 2
  },
  {
    id: 'amc-2',
    contractNumber: 'AMC-2026-049',
    clientName: 'Zenith Global Logistics Hub',
    type: 'NON_COMPREHENSIVE',
    deviceCount: 65,
    annualValue: 280000,
    startDate: '2025-10-15',
    endDate: '2026-10-14',
    status: 'EXPIRING_SOON',
    nextPMDate: '2026-09-25',
    slaResponseHours: 4
  }
];

export const initialWorkflows: AutomationWorkflow[] = [
  {
    id: 'wf-1',
    name: 'SLA Breach Safeguard & Telegram Escalation',
    description: 'When ticket priority is Critical and unassigned for 10 minutes, auto-escalates to on-call L3 engineer and pushes Telegram bot alert.',
    triggerEvent: 'ticket.priority == "CRITICAL"',
    condition: 'ticket.status == "OPEN" && ticket.unassignedMinutes > 10',
    autonomousAction: 'Assign On-Call L3 Engineer + Push Emergency Telegram Callback Button',
    humanApprovalRequired: false,
    active: true,
    executionCount: 148,
    lastExecuted: 'Today at 11:20 AM'
  },
  {
    id: 'wf-2',
    name: 'Autonomous Margin Floor Lock (< 12%)',
    description: 'When customer quotation gross margin falls below 12.0%, freeze customer dispatch and route to Telegram Command Hub for Business Owner approval.',
    triggerEvent: 'quotation.marginPercent < 12.0',
    condition: 'quotation.totalValue > 50000',
    autonomousAction: 'Lock Quote Status to PENDING_OWNER_APPROVAL + Dispatch Interactive Telegram Approval',
    humanApprovalRequired: true,
    active: true,
    executionCount: 38,
    lastExecuted: 'Today at 01:15 PM'
  },
  {
    id: 'wf-3',
    name: 'Predictive SSD & Battery Proactive RMA',
    description: 'When RMM endpoint SMART controller health or battery drops below 40%, automatically draft supplier RFQ and raise proactive service ticket.',
    triggerEvent: 'endpoint.smartStatus == "CRITICAL" || endpoint.batteryHealth < 40',
    condition: 'endpoint.assignedUser != null',
    autonomousAction: 'Draft Warranty RMA / Spare RFQ + Open Proactive ITSM Ticket #SR',
    humanApprovalRequired: false,
    active: true,
    executionCount: 84,
    lastExecuted: 'Yesterday at 04:35 PM'
  },
  {
    id: 'wf-4',
    name: 'Autonomous Stock Shortage 3-Way RFQ',
    description: 'When serialized product warehouse stock reaches safety threshold, autonomously query Redington, Savex, and Ingram Micro APIs for pricing & lead time.',
    triggerEvent: 'inventory.stockAvailable <= product.minSafetyStock',
    condition: 'supplierAPIs.available == true',
    autonomousAction: 'Generate RFQ Matrix + Compare Best Price & SLA + Draft PO',
    humanApprovalRequired: false,
    active: true,
    executionCount: 219,
    lastExecuted: 'Today at 10:05 AM'
  }
];

export const initialIntegrations: IntegrationConnector[] = [
  {
    id: 'conn-1',
    name: 'Microsoft Entra ID (Azure AD)',
    category: 'Identity & SSO',
    icon: 'Shield',
    status: 'CONNECTED',
    recordsSynced: '420 Employees & RBAC Groups',
    lastSyncTime: '3 mins ago',
    description: 'Real-time SCIM user provisioning, SAML 2.0 Single Sign-On, and department-level organizational mapping.'
  },
  {
    id: 'conn-2',
    name: 'Microsoft Intune MDM & RMM',
    category: 'MDM & RMM',
    icon: 'Laptop',
    status: 'CONNECTED',
    recordsSynced: '315 Managed Endpoints',
    lastSyncTime: '5 mins ago',
    description: 'Automated hardware discovery, patch compliance telemetry, BitLocker encryption keys, and remote script execution.'
  },
  {
    id: 'conn-3',
    name: 'Microsoft 365 Graph API',
    category: 'Identity & SSO',
    icon: 'Mail',
    status: 'CONNECTED',
    recordsSynced: '250 Active Subscriptions',
    lastSyncTime: '12 mins ago',
    description: 'Automated license usage tracking, inactive account detection, and SaaS cost optimization.'
  },
  {
    id: 'conn-4',
    name: 'Amazon Web Services (AWS)',
    category: 'Cloud Infrastructure',
    icon: 'Cloud',
    status: 'CONNECTED',
    recordsSynced: '18 EC2 & RDS Instances',
    lastSyncTime: '10 mins ago',
    description: 'DirectConnect circuit health monitoring, automated S3 snapshot verification, and cost anomaly alerts.'
  },
  {
    id: 'conn-5',
    name: 'WhatsApp Business API Gateway',
    category: 'Messaging',
    icon: 'MessageCircle',
    status: 'CONNECTED',
    recordsSynced: '1,420 Outbound Updates MTD',
    lastSyncTime: 'Real-time Webhook',
    description: 'Automated dispatch of GST tax invoices, job milestone updates, OTP verification, and customer satisfaction surveys.'
  },
  {
    id: 'conn-6',
    name: 'Telegram Business Bot Hub',
    category: 'Messaging',
    icon: 'Send',
    status: 'CONNECTED',
    recordsSynced: '184 Owner Approvals Logged',
    lastSyncTime: 'Real-time WebSocket',
    description: 'High-security mobile command interface for Business Owner with HMAC-SHA256 signed callback approvals.'
  }
];

export const initialRMAClaims: RMAClaim[] = [
  {
    id: 'rma-1',
    rmaNumber: 'RMA-2026-081',
    assetTag: 'AST-104',
    assetName: 'Dell PowerEdge R760 Database Server',
    serialNumber: 'DELL-SRV-99214',
    oemBrand: 'Dell Technologies',
    oemCaseNumber: 'DELL-IN-889124',
    faultSymptom: 'PERC H755 RAID Controller Battery Backup Unit (BBU) charge cycle degradation warning (Event ID: 2124).',
    warrantyStatus: 'ACTIVE_WARRANTY',
    courierTracking: 'BLD-882194091',
    courierPartner: 'BlueDart Apex Priority',
    stage: 'SERVICE_CENTER',
    createdAt: '2026-09-02'
  },
  {
    id: 'rma-2',
    rmaNumber: 'RMA-2026-082',
    assetTag: 'AST-107',
    assetName: 'Fortinet FortiGate 100F Perimeter Firewall',
    serialNumber: 'FG100FTK23901',
    oemBrand: 'Fortinet',
    oemCaseNumber: 'FTNT-9821004',
    faultSymptom: 'Secondary Hot-Swap Redundant PSU-2 failure. Input voltage variance trip alert.',
    warrantyStatus: 'EXTENDED_CARE',
    courierTracking: 'DTDC-441029882',
    courierPartner: 'DTDC Express Prime',
    stage: 'REPLACED_RETURN',
    createdAt: '2026-08-28'
  },
  {
    id: 'rma-3',
    rmaNumber: 'RMA-2026-083',
    assetTag: 'AST-103',
    assetName: 'Cisco Catalyst 9300 48-Port PoE+ Switch',
    serialNumber: 'FCW243109A8',
    oemBrand: 'Cisco Systems',
    oemCaseNumber: 'CSCO-TAC-339182',
    faultSymptom: 'PoE power budget drop on Port 1-8. ASIC controller intermittent reboot.',
    warrantyStatus: 'ACTIVE_WARRANTY',
    courierTracking: 'FX-771290334',
    courierPartner: 'FedEx India Critical',
    stage: 'IN_TRANSIT',
    createdAt: '2026-09-04'
  },
  {
    id: 'rma-4',
    rmaNumber: 'RMA-2026-084',
    assetTag: 'AST-109',
    assetName: 'Lenovo ThinkPad T14 Gen 4 (Engineering)',
    serialNumber: 'PF38K11902',
    oemBrand: 'Lenovo',
    oemCaseNumber: 'LNV-PREM-88231',
    faultSymptom: 'Thunderbolt 4 controller USB-C charging dock handshake failure.',
    warrantyStatus: 'ACTIVE_WARRANTY',
    courierTracking: 'DEL-19283011',
    courierPartner: 'Delhivery Surface Pro',
    stage: 'OEM_APPROVED',
    createdAt: '2026-09-05'
  }
];

export const initialKnowledgeArticles: KnowledgeArticle[] = [
  {
    id: 'kb-1',
    title: 'Fortinet FortiClient SSL-VPN Error 98 / Connection Timeout Troubleshooting SOP',
    category: 'Network & VPN',
    readTime: '4 min',
    views: 842,
    solvedCount: 312,
    tags: ['VPN', 'FortiGate', 'SSL-VPN', 'Remote Access', 'Error 98'],
    summary: 'Step-by-step diagnostic runbook for remote employees encountering FortiClient SSL-VPN connection freezes at 98% during TLS handshake.',
    symptoms: [
      'FortiClient progress bar freezes at 98% and disconnects after 30 seconds',
      'Windows Event Viewer shows WAN Miniport SSTP driver binding conflict',
      'Dual-stack IPv6 routing priority masking IPv4 gateway'
    ],
    selfServiceSteps: [
      'Open Windows PowerShell as Administrator and run: Get-NetAdapterBinding -ComponentID ms_tcpip6 | Disable-NetAdapterBinding -Confirm:$false',
      'Flush local DNS cache and Winsock stack: ipconfig /flushdns ; netsh winsock reset',
      'Open Device Manager -> Network Adapters -> Uninstall "WAN Miniport (IP)" and scan for hardware changes',
      'Restart FortiClient Service (service name: fortishield / forticlient) and re-authenticate via Microsoft Entra 2FA'
    ]
  },
  {
    id: 'kb-2',
    title: 'Windows 11 BitLocker Recovery Key Retrieval from Entra ID Self-Service Portal',
    category: 'Security & Auth',
    readTime: '3 min',
    views: 1240,
    solvedCount: 540,
    tags: ['BitLocker', 'Entra ID', 'Encryption', 'TPM 2.0', 'Self-Service'],
    summary: 'Authorized employee guide to self-retrieve 48-digit BitLocker drive recovery key following firmware / BIOS updates or TPM clearance.',
    symptoms: [
      'Blue screen demanding 48-digit recovery key on device boot',
      'TPM PCR 7 measurement mismatch detected after UEFI update',
      'Docking station change triggering secure boot challenge'
    ],
    selfServiceSteps: [
      'On a mobile device or secondary computer, browse to: https://myaccount.microsoft.com/device-list',
      'Sign in using your corporate email and approve the Microsoft Authenticator prompt',
      'Locate your computer tag in the registered device list and click "View BitLocker Keys"',
      'Enter the 48-digit numerical key displayed on your computer boot screen and press Enter to decrypt'
    ]
  },
  {
    id: 'kb-3',
    title: 'Microsoft 365 Outlook OST Cache Corruption & Search Index Rebuild Guide',
    category: 'SaaS & M365',
    readTime: '4 min',
    views: 960,
    solvedCount: 429,
    tags: ['Outlook', 'OST', 'M365', 'Search Index', 'Email'],
    summary: 'Fix email search freezing, missing recent mailbox items, and disconnected Exchange cache states without IT helpdesk intervention.',
    symptoms: [
      'Outlook status bar shows "Disconnected" or "Need Password" in loop',
      'Search returns zero results for emails received within last 14 days',
      'OST file size exceeded 45GB threshold'
    ],
    selfServiceSteps: [
      'Close Outlook completely. Press Win + R, type: outlook.exe /safe and verify if mail loads cleanly',
      'Navigate to: %localappdata%\\Microsoft\\Outlook\\ and rename your corporate .ost file to .ost.old',
      'Reopen Outlook; Exchange Cloud Sync will automatically rebuild a clean, compact OST cache file',
      'Open Windows Settings -> Indexing Options -> Advanced -> Rebuild Index'
    ]
  },
  {
    id: 'kb-4',
    title: 'Enterprise Network Multi-Function Printer Offline / Standard TCP/IP Port Fix',
    category: 'Hardware & Peripherals',
    readTime: '3 min',
    views: 610,
    solvedCount: 284,
    tags: ['Printer', 'WSD', 'TCP/IP', 'Canon', 'HP LaserJet'],
    summary: 'Resolves recurring "Printer Offline" notifications caused by Windows WSD port dynamic switching across office subnets.',
    symptoms: [
      'Printer status stuck at "Offline" even when printer display shows Ready',
      'Windows assigned a WSD (Web Services for Devices) virtual port instead of fixed IP',
      'Print jobs queue up with "Error - Printing" status'
    ],
    selfServiceSteps: [
      'Open Control Panel -> Devices and Printers -> Right-click printer -> Printer Properties',
      'Click the "Ports" tab -> Uncheck the WSD Port -> Click "Add Port..." -> Standard TCP/IP Port',
      'Enter the static office printer IP (e.g., 192.168.10.220 for Mumbai Hub Floor 4)',
      'Uncheck "SNMP Status Enabled" under Configure Port, apply settings, and print test page'
    ]
  }
];

export const initialCRMOpportunities: CRMOpportunity[] = [
  {
    id: 'crm-1',
    title: 'Fintech Corp 100x Dell Latitude Workstation Refresh & Autopilot MDM',
    clientName: 'BharatFin Digital Capital Pvt Ltd',
    contactPerson: 'Sandeep Khurana (VP Tech)',
    value: 6850000,
    stage: 'TECHNICAL_SCOPING',
    winProbability: 75,
    expectedCloseDate: '2026-09-25',
    assignedEngineer: 'Rahul Mehta (Presales Lead)',
    category: 'Client Hardware'
  },
  {
    id: 'crm-2',
    title: 'Retail Chain 24-Branch Fortinet SD-WAN & Dual WAN Failover Mesh',
    clientName: 'OmniRetail Hypermarkets India',
    contactPerson: 'Meera Nambiar (Head IT Infra)',
    value: 4500000,
    stage: 'PROPOSAL_SENT',
    winProbability: 65,
    expectedCloseDate: '2026-10-10',
    assignedEngineer: 'Vikram Joshi (Network Architect)',
    category: 'Perimeter Security'
  },
  {
    id: 'crm-3',
    title: 'Multi-Specialty Hospital PACS Storage Expansion & 10G SAN Backbone',
    clientName: 'Apex HealthCare & Research Institute',
    contactPerson: 'Dr. Alok Verma (COO)',
    value: 8200000,
    stage: 'NEGOTIATION',
    winProbability: 85,
    expectedCloseDate: '2026-09-18',
    assignedEngineer: 'Rahul Mehta (Presales Lead)',
    category: 'Data Center Storage'
  },
  {
    id: 'crm-4',
    title: 'BPO Cloud PBX & Microsoft Teams Phone Enterprise Voice Migration',
    clientName: 'GlobalConnect BPO Solutions',
    contactPerson: 'Zoya Merchant (Ops Director)',
    value: 2600000,
    stage: 'QUALIFIED',
    winProbability: 50,
    expectedCloseDate: '2026-10-30',
    assignedEngineer: 'Deepak Rao (Cloud Eng)',
    category: 'Cloud Collaboration'
  },
  {
    id: 'crm-5',
    title: 'Logistics Park Cat6A 96-Node Certified Structured Cabling',
    clientName: 'Navi Mumbai Freight Logistics Hub',
    contactPerson: 'Capt. R. K. Nair (Facility GM)',
    value: 3400000,
    stage: 'WON',
    winProbability: 100,
    expectedCloseDate: '2026-09-02',
    assignedEngineer: 'Praveen Yadav (Field Lead)',
    category: 'Structured Cabling'
  }
];

export const initialMarketplaceDisputes: MarketplaceDispute[] = [
  {
    id: 'dsp-1',
    disputeNumber: 'DSP-2026-01',
    projectId: 'proj-4',
    projectTitle: 'Cat6A 48-Node Structured Cabling & Fluke Certification',
    customerName: 'Kalyan Logistics Hub',
    providerName: 'NetPro Enterprise Services',
    disputedAmount: 24000,
    escrowHeld: 42000,
    reason: 'Deliverable Verification Discrepancy (Fluke Report NEXT Test)',
    customerClaim: 'Customer engineering team observed 2 out of 48 drops failed near-end crosstalk test on initial handover run.',
    providerRebuttal: 'Technician re-terminated keystones with certified CommScope Cat6A jacks on Sept 3 and full pass report was re-uploaded to document vault.',
    aiMediationVerdict: 'Cryptographic hash of Fluke DSX-5000 report matches 48/48 PASS channels. Recommend escrow release upon customer 1-click re-inspection sign-off.',
    status: 'UNDER_REVIEW',
    createdAt: '2026-09-03'
  },
  {
    id: 'dsp-2',
    disputeNumber: 'DSP-2026-02',
    projectId: 'proj-2',
    projectTitle: 'Fortinet SD-WAN Dual ISP Failover Deployment',
    customerName: 'Zenith Logistics Hub',
    providerName: 'SecureNet Solutions',
    disputedAmount: 18000,
    escrowHeld: 38000,
    reason: 'Secondary ISP failover BGP convergence latency exceeded 30s threshold',
    customerClaim: 'Failover time was 34 seconds during simulated WAN fiber cut drill instead of 10s SLA target.',
    providerRebuttal: 'Jio fiber link ARP cache was holding stale entries; configured BFD (Bidirectional Forwarding Detection) timers to 500ms intervals.',
    aiMediationVerdict: 'BFD profile verified active in telemetry logs with 1.2s switchover. Recommend 10% goodwill milestone release adjustment or second drill verification.',
    status: 'AWAITING_EVIDENCE',
    createdAt: '2026-09-04'
  }
];

export const initialDistributorVendors: DistributorVendorProfile[] = [
  {
    id: 'dist-1',
    name: 'Savex Technologies Pvt Ltd',
    gstin: '27AAACS1928Q1Z4',
    pan: 'AAACS1928Q',
    headquarters: 'Bandra-Kurla Complex, Mumbai',
    oemAuthorizations: ['Dell Titanium Distributor', 'Fortinet Premier National Partner', 'HP Enterprise Core', 'Samsung Display'],
    creditLimit: 6000000,
    availableCredit: 4250000,
    creditDays: 30,
    deliveryPerformanceRate: 98.4,
    averageRmaHours: 48,
    priceIndex: 96.4,
    activeContracts: 8,
    tier: 'TIER_1_NATIONAL'
  },
  {
    id: 'dist-2',
    name: 'Redington India Limited',
    gstin: '27AABCR9912M1Z2',
    pan: 'AABCR9912M',
    headquarters: 'Lower Parel, Mumbai / Chennai',
    oemAuthorizations: ['Cisco Gold National Distributor', 'Microsoft OEM Master', 'APC by Schneider Electric', 'Aruba Networks'],
    creditLimit: 7500000,
    availableCredit: 5120000,
    creditDays: 45,
    deliveryPerformanceRate: 96.8,
    averageRmaHours: 48,
    priceIndex: 94.8,
    activeContracts: 12,
    tier: 'TIER_1_NATIONAL'
  },
  {
    id: 'dist-3',
    name: 'Ingram Micro India Pvt Ltd',
    gstin: '27AAACI4401L1Z8',
    pan: 'AAACI4401L',
    headquarters: 'Andheri East, Mumbai',
    oemAuthorizations: ['Lenovo Enterprise Distributor', 'Schneider Electric Data Center', 'Adobe Commercial', 'VMware / Broadcom'],
    creditLimit: 5000000,
    availableCredit: 3800000,
    creditDays: 30,
    deliveryPerformanceRate: 95.2,
    averageRmaHours: 72,
    priceIndex: 92.1,
    activeContracts: 6,
    tier: 'TIER_1_NATIONAL'
  },
  {
    id: 'dist-4',
    name: 'Rashi Peripherals Ltd',
    gstin: '27AAACR1129P1Z5',
    pan: 'AAACR1129P',
    headquarters: 'Navi Mumbai, Maharashtra',
    oemAuthorizations: ['ASUS Commercial', 'Logitech Unified Comm', 'Seagate Enterprise HDD', 'Crucial / Micron'],
    creditLimit: 3500000,
    availableCredit: 2900000,
    creditDays: 30,
    deliveryPerformanceRate: 97.1,
    averageRmaHours: 48,
    priceIndex: 95.5,
    activeContracts: 4,
    tier: 'TIER_1_NATIONAL'
  }
];

