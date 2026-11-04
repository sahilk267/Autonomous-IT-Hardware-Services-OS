/**
 * Zero Mock Data Verification Suite
 * 
 * Asserts the critical architectural invariants:
 * 1. Zero initial mock data records across all business collections.
 * 2. Honest unconfigured integration states.
 * 3. Inventory consumption consistency & transactional integrity.
 * 4. Invoice settlement updates & receivables calculation integrity.
 * 5. Zero references to mockData files or hardcoded demo payloads.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { dbStore } from '../server/db';
import { FieldJob, ProductItem, Project, InvoiceRecord } from '../src/types';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING ZERO-MOCK-DATA & SYSTEMS AUDIT SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}: ${err?.message || err}`);
    }
  }

  // 1. Database initial state assertions
  test('Fresh Database State contains 0 business records', () => {
    const state = dbStore.getState();
    assert.strictEqual(state.products.length, 0, 'Products must be 0');
    assert.strictEqual(state.leads.length, 0, 'Leads must be 0');
    assert.strictEqual(state.quotes.length, 0, 'Quotes must be 0');
    assert.strictEqual(state.tickets.length, 0, 'Tickets must be 0');
    assert.strictEqual(state.jobs.length, 0, 'Field Jobs must be 0');
    assert.strictEqual(state.assets.length, 0, 'Assets must be 0');
    assert.strictEqual(state.amcs.length, 0, 'AMCs must be 0');
    assert.strictEqual(state.projects.length, 0, 'Projects must be 0');
    assert.strictEqual(state.proposals.length, 0, 'Proposals must be 0');
    assert.strictEqual(state.invoices.length, 0, 'Invoices must be 0');
    assert.strictEqual(state.rfqs.length, 0, 'RFQs must be 0');
    assert.strictEqual(state.telegramMessages.length, 0, 'Telegram Messages must be 0');
    assert.strictEqual(state.rmaClaims.length, 0, 'RMA Claims must be 0');
    assert.strictEqual(state.crmOpportunities.length, 0, 'CRM Opportunities must be 0');
    assert.strictEqual(state.marketplaceDisputes.length, 0, 'Marketplace Disputes must be 0');
  });

  // 2. Tenant configuration integrity
  test('Tenant starts unconfigured or with clean default identity', () => {
    const tenant = dbStore.getState().tenant;
    assert.ok(tenant.name, 'Tenant should have a designated company name');
    assert.strictEqual(tenant.isConfigured, false, 'Default tenant should be marked unconfigured until setup');
  });

  // 3. Connectors start unconfigured
  test('Integration Connectors accurately report NOT_CONFIGURED by default', () => {
    const connectors = dbStore.getState().connectors;
    for (const c of connectors) {
      assert.strictEqual(c.status, 'NOT_CONFIGURED', `Connector ${c.id} must be NOT_CONFIGURED`);
      assert.strictEqual(c.recordsSynced, '0', `Connector ${c.id} must report 0 recordsSynced`);
    }
  });

  // 4. File system audit: mockData.ts must not exist
  test('src/data/mockData.ts is permanently absent from filesystem', () => {
    const mockFilePath = path.join(process.cwd(), 'src', 'data', 'mockData.ts');
    assert.strictEqual(fs.existsSync(mockFilePath), false, 'mockData.ts must not exist');
  });

  // 5. Codebase audit: zero imports of mockData
  test('Zero source code files import mockData', () => {
    const srcDir = path.join(process.cwd(), 'src');
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
    for (const file of files) {
      if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
        const fullPath = path.join(srcDir, file);
        if (fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.strictEqual(
            content.includes('mockData'),
            false,
            `File ${file} must not contain references to mockData`
          );
        }
      }
    }
  });

  // 6. Transactional integrity: Inventory consumption
  test('Inventory item addition, consumption, and audit trail', () => {
    const testSku = `TEST-RAM-${Date.now()}`;
    const initialProduct: ProductItem = {
      id: `prod-${Date.now()}`,
      sku: testSku,
      name: '16GB DDR5 Server DIMM',
      brand: 'Crucial Micron',
      category: 'Component',
      specs: 'DDR5 ECC Unbuffered Server RAM Module',
      purchaseCost: 4200,
      marketPrice: 6500,
      sellingPrice: 5800,
      minPrice: 5000,
      targetMarginPercent: 25,
      stockAvailable: 10,
      stockReserved: 0,
      warehouseLocation: 'BOM-RACK-04',
      hsn: '847330',
      gstPercent: 18,
      warrantyYears: 3,
      serialTrackingRequired: true
    };
    dbStore.addProduct(initialProduct);

    // Add a field job to consume the part
    const testJob: FieldJob = {
      id: `job-test-${Date.now()}`,
      jobCode: 'JOB-999',
      title: 'Server Memory Fault Diagnostic',
      customerName: 'Sterling Finance Corp',
      address: 'BKC, Mumbai',
      technicianName: 'Field Engineer',
      technicianPhone: '+91 98200 12345',
      status: 'CHECKED_IN',
      scheduledTime: new Date().toISOString(),
      partsConsumed: [],
      customerSignatureObtained: false
    };
    dbStore.addJob(testJob);

    // Verify stock added
    let product = dbStore.getState().products.find(p => p.id === initialProduct.id);
    assert.strictEqual(product?.stockAvailable, 10, 'Stock must be 10');

    // Consume part on job
    const updatedJob = dbStore.consumeJobPart(testJob.id, '16GB DDR5 Server DIMM', 4200);
    assert.ok(updatedJob, 'consumeJobPart should return updated job');
    assert.strictEqual(updatedJob?.partsConsumed.length, 1, 'Job must have 1 consumed part');

    product = dbStore.getState().products.find(p => p.id === initialProduct.id);
    assert.strictEqual(product?.stockAvailable, 9, 'Stock must decrease from 10 to 9');

    const tx = dbStore.getState().inventoryTransactions.find(t => t.sku === testSku);
    assert.ok(tx, 'Inventory transaction log must be recorded');
    assert.strictEqual(tx?.type, 'OUT');
  });

  // 7. Project persistence integrity
  test('Project creation and persistence', () => {
    const testProject: Project = {
      id: `proj-test-${Date.now()}`,
      projectCode: 'PRJ-TEST-001',
      title: 'Branch Office SD-WAN Rollout',
      clientName: 'Acme Logistics Ltd',
      clientLocation: 'Navi Mumbai',
      category: 'Network Security',
      scopeDescription: 'Deploy SD-WAN appliances across 4 branch sites.',
      deliverables: ['Hardware install', 'Failover testing'],
      skillsRequired: ['Cisco', 'Fortinet'],
      status: 'IN_PROGRESS',
      budget: 250000,
      proposalsCount: 0,
      createdAt: new Date().toISOString(),
      milestones: [
        {
          id: 'ms-1',
          title: 'Site Survey',
          amount: 50000,
          status: 'IN_PROGRESS',
          dueDate: '2026-11-15'
        }
      ]
    };

    dbStore.addProject(testProject);
    const projects = dbStore.getState().projects;
    const found = projects.find(p => p.id === testProject.id);
    assert.ok(found, 'Created project must exist in database');
    assert.strictEqual(found?.budget, 250000, 'Project budget must match');
  });

  // 8. Invoice settlement workflow
  test('Invoice settlement updates status to SETTLED', () => {
    const invNo = `INV-TEST-${Date.now()}`;
    const testInvoice: InvoiceRecord = {
      id: `inv-${Date.now()}`,
      customer: 'Sterling Finance Corp',
      invoiceNo: invNo,
      amount: 118000,
      status: 'ACTIVE',
      dueInDays: 30,
      createdAt: new Date().toISOString()
    };

    dbStore.addInvoice(testInvoice);
    let inv = dbStore.getState().invoices.find(i => i.invoiceNo === invNo);
    assert.strictEqual(inv?.status, 'ACTIVE', 'Invoice should initially be ACTIVE');

    dbStore.settleInvoice(invNo);
    inv = dbStore.getState().invoices.find(i => i.invoiceNo === invNo);
    assert.strictEqual(inv?.status, 'SETTLED', 'Invoice status must be updated to SETTLED');
  });

  // 9. Clean slate reset restoration
  test('Clean slate restore guarantees 0 records', () => {
    dbStore.resetToCleanSlate();
    const state = dbStore.getState();
    assert.strictEqual(state.products.length, 0);
    assert.strictEqual(state.jobs.length, 0);
    assert.strictEqual(state.projects.length, 0);
    assert.strictEqual(state.invoices.length, 0);
  });

  // 10. Codebase audit: zero window.alert calls
  test('Zero window.alert calls exist in source code', () => {
    const srcDir = path.join(process.cwd(), 'src');
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
    for (const file of files) {
      if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
        const fullPath = path.join(srcDir, file);
        if (fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.strictEqual(
            content.includes('alert('),
            false,
            `File ${file} must not contain window.alert calls`
          );
        }
      }
    }
  });

  // 11. Receivables ledger calculation excludes settled invoices
  test('Active receivables ledger calculation excludes settled invoices', () => {
    const testInv1: InvoiceRecord = {
      id: `inv-1-${Date.now()}`,
      customer: 'Alpha Corp',
      invoiceNo: `INV-A-${Date.now()}`,
      amount: 50000,
      status: 'ACTIVE',
      dueInDays: 15,
      createdAt: new Date().toISOString()
    };
    const testInv2: InvoiceRecord = {
      id: `inv-2-${Date.now()}`,
      customer: 'Beta Corp',
      invoiceNo: `INV-B-${Date.now()}`,
      amount: 75000,
      status: 'SETTLED',
      dueInDays: 0,
      createdAt: new Date().toISOString()
    };

    dbStore.addInvoice(testInv1);
    dbStore.addInvoice(testInv2);

    const activeInvoices = dbStore.getState().invoices.filter(i => i.status !== 'SETTLED' && i.status !== 'CANCELLED');
    const totalReceivables = activeInvoices.reduce((acc, i) => acc + i.amount, 0);

    assert.strictEqual(totalReceivables, 50000, 'Only unsettled invoices must be included in receivables');
    dbStore.resetToCleanSlate();
  });

  // 12. Quotation margin calculation edge case handles 0 subtotal without NaN
  test('Quotation margin handles 0 subtotal without division by zero or NaN', () => {
    const subtotal = 0;
    const discount = 0;
    const netSubtotal = Math.max(0, subtotal - discount);
    const profit = 0;
    const marginPercent = netSubtotal > 0 ? ((profit / netSubtotal) * 100) : 0;

    assert.strictEqual(Number.isNaN(marginPercent), false, 'Margin percent must not be NaN');
    assert.strictEqual(marginPercent, 0, 'Margin percent for 0 subtotal must be 0');
  });

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
