/**
 * Zero Mock Data & Systems Integrity Verification Suite (Isolated Test Harness)
 * 
 * Asserts architectural invariants without modifying production storage:
 * 1. Test isolation: Uses temporary isolated database paths. Never mutates data/app-store.json.
 * 2. Proper async/await test execution with error trapping.
 * 3. Fresh instance contains 0 business records.
 * 4. Record survival across store reloads.
 * 5. Corrupted database protection (no silent overwrite).
 * 6. Atomic write failures leave memory state intact.
 * 7. Stock consumption validation (rejects insufficient/missing stock).
 * 8. Quotation approval exact ID matching and duplicate rejection.
 * 9. Persistent collections (RMA, KB, CRM, Disputes).
 * 10. Codebase audit: zero mockData files, zero mock imports, zero window.alert.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { PersistentStore, hashPassword, verifyPassword } from '../server/db.ts';
import { FieldJob, ProductItem, Project, InvoiceRecord, Quotation } from '../src/types.ts';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING ISOLATED ZERO-MOCK-DATA & SYSTEMS AUDIT SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}: ${err?.message || err}`);
    }
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), 'apex-test-'));
  const testDbFile = path.join(tempDir, 'test-store.json');

  try {
    const testStore = new PersistentStore(testDbFile);

    // 1. Fresh installation contains 0 business records
    await test('Fresh Database State contains 0 business records', async () => {
      const state = testStore.getState();
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
      assert.strictEqual(state.users.length, 0, 'Initial users must be 0 (clean setup required)');
    });

    // 2. Existing records survive restart
    await test('Existing records survive store restart', async () => {
      const sampleProduct: ProductItem = {
        id: 'prod-persist-1',
        sku: 'PERSIST-SKU-01',
        name: 'Enterprise Managed Switch',
        brand: 'Aruba Networks',
        category: 'Networking',
        specs: '24-port PoE+ Managed L2/L3 Gigabit Switch',
        purchaseCost: 35000,
        marketPrice: 52000,
        sellingPrice: 48000,
        minPrice: 42000,
        targetMarginPercent: 27,
        stockAvailable: 5,
        stockReserved: 0,
        warehouseLocation: 'WH-MUM-A1',
        hsn: '85176290',
        gstPercent: 18,
        warrantyYears: 3,
        serialTrackingRequired: true
      };
      testStore.addProduct(sampleProduct);

      // Re-initialize a new store from the same file
      const reloadedStore = new PersistentStore(testDbFile);
      const reloadedProducts = reloadedStore.getState().products;
      assert.strictEqual(reloadedProducts.length, 1);
      assert.strictEqual(reloadedProducts[0].sku, 'PERSIST-SKU-01');
    });

    // 3. Corrupted database is not overwritten
    await test('Corrupted database is not silently overwritten', async () => {
      const corruptFile = path.join(tempDir, 'corrupt-store.json');
      fs.writeFileSync(corruptFile, '{ invalid json structure !!!', 'utf-8');

      assert.throws(
        () => new PersistentStore(corruptFile),
        /CRITICAL: Database file .* is corrupted/,
        'Must throw error on corrupted json rather than overwriting'
      );
    });

    // 4. Failed write produces no success and leaves memory state intact
    await test('Failed write produces no state update (atomic commit rollback)', async () => {
      const stateBefore = testStore.getState().products.length;
      assert.throws(() => {
        testStore.commit((draft) => {
          draft.products.push({
            id: 'prod-fail-write',
            sku: 'FAIL-WRITE',
            name: 'Will fail write',
            brand: 'Test',
            category: 'Component',
            specs: 'Test Component',
            purchaseCost: 100,
            marketPrice: 250,
            sellingPrice: 200,
            minPrice: 150,
            targetMarginPercent: 50,
            stockAvailable: 1,
            stockReserved: 0,
            warehouseLocation: 'WH-TEST',
            hsn: '847330',
            gstPercent: 18,
            warrantyYears: 1,
            serialTrackingRequired: false
          });
          throw new Error('Simulated atomic commit abort');
        });
      }, /Simulated atomic commit abort/);

      assert.strictEqual(testStore.getState().products.length, stateBefore, 'State must remain unmodified on exception');
    });

    // 5. Test suite cannot touch production storage
    await test('Test suite cannot touch production storage', async () => {
      const prodStorePath = path.join(process.cwd(), 'data', 'app-store.json');
      assert.notStrictEqual(testDbFile, prodStorePath, 'Test file must be distinct from production path');
    });

    // 6. Password hashing and verification
    await test('Password KDF scrypt and constant-time verification', async () => {
      const password = 'SuperSecretSecurePassword!2026';
      const { salt, hash } = hashPassword(password);
      assert.ok(salt && salt.length >= 32, 'Salt must be random hex');
      assert.ok(hash && hash.length >= 64, 'Hash must be scrypt output');

      assert.strictEqual(verifyPassword(password, salt, hash), true, 'Correct password must verify');
      assert.strictEqual(verifyPassword('WrongPassword', salt, hash), false, 'Wrong password must reject');
    });

    // 7. Stock consumption rejects missing products and insufficient stock
    await test('Stock consumption rejects missing products and insufficient stock', async () => {
      const testJob: FieldJob = {
        id: 'job-stock-test',
        jobCode: 'JOB-STK-01',
        title: 'RAM Replacement',
        customerName: 'FinTech Corp',
        address: 'Mumbai',
        technicianName: 'Engineer',
        technicianPhone: '9820000000',
        status: 'CHECKED_IN',
        scheduledTime: new Date().toISOString(),
        partsConsumed: [],
        customerSignatureObtained: false
      };
      testStore.addJob(testJob);

      // 1. Missing product rejected
      assert.throws(
        () => testStore.consumeJobPart(testJob.id, 'NON-EXISTENT-PROD-ID', 1),
        /Product not found/
      );

      // 2. Insufficient stock rejected
      const scarceProduct: ProductItem = {
        id: 'prod-scarce-1',
        sku: 'SCARCE-SSD',
        name: 'NVMe 2TB Enterprise SSD',
        brand: 'Samsung',
        category: 'Storage',
        specs: 'Enterprise PCIe Gen4 NVMe U.2 2TB SSD',
        purchaseCost: 12000,
        marketPrice: 18000,
        sellingPrice: 16000,
        minPrice: 14000,
        targetMarginPercent: 25,
        stockAvailable: 2,
        stockReserved: 1, // Available unreserved is 1
        warehouseLocation: 'WH-MUM-B2',
        hsn: '847170',
        gstPercent: 18,
        warrantyYears: 5,
        serialTrackingRequired: true
      };
      testStore.addProduct(scarceProduct);

      assert.throws(
        () => testStore.consumeJobPart(testJob.id, scarceProduct.id, 5),
        /Insufficient stock/
      );

      // 3. Successful atomic stock consumption
      const updatedJob = testStore.consumeJobPart(testJob.id, scarceProduct.id, 1);
      assert.ok(updatedJob);
      assert.strictEqual(updatedJob.partsConsumed.length, 1);
      assert.strictEqual(updatedJob.partsConsumed[0].cost, 12000, 'Must record authoritative purchase cost');

      const recheckedProduct = testStore.getState().products.find(p => p.id === scarceProduct.id);
      assert.strictEqual(recheckedProduct?.stockAvailable, 1, 'Stock must decrement by 1');
    });

    // 8. Quotation approval exact ID matching and duplicate rejection
    await test('Quotation approval exact ID matching and duplicate rejection', async () => {
      const quote: Quotation = {
        id: 'q-exact-100',
        quoteNumber: 'QT-2026-100',
        customerName: 'FinServe Bank',
        customerGstin: '27AABCU9603R1ZM',
        customerState: 'Maharashtra',
        solutionName: 'Branch IT Setup',
        items: [],
        services: [],
        subtotal: 50000,
        discountAmount: 0,
        gstAmount: 9000,
        totalAmount: 59000,
        grandTotal: 59000,
        marginPercent: 20,
        status: 'PENDING_APPROVAL',
        validUntil: '2026-12-31',
        createdDate: new Date().toISOString(),
        paymentTerms: 'Immediate'
      };
      testStore.addQuote(quote);

      // Exact match succeeds
      const approved = testStore.approveQuote('q-exact-100', 'Executive Owner');
      assert.ok(approved);
      assert.strictEqual(approved?.status, 'APPROVED');

      // Duplicate approval rejected
      assert.throws(
        () => testStore.approveQuote('q-exact-100', 'Executive Owner'),
        /has already been approved/
      );

      // Inexact partial substring match fails
      assert.strictEqual(testStore.approveQuote('q-exact'), null);
    });

    // 9. Persistent collections (RMA, KB, CRM, Disputes)
    await test('RMA, CRM, Knowledge Articles and Disputes persist across store instance', async () => {
      testStore.addRMAClaim({
        id: 'rma-001',
        rmaNumber: 'RMA-2026-001',
        assetTag: 'AST-ROUTER-99',
        assetId: 'ast-1',
        assetName: 'Core Router',
        serialNumber: 'SN-ROUTER-99',
        oemBrand: 'Cisco',
        oemCaseNumber: 'CSCO-88910',
        faultSymptom: 'Port 0/1 flapping',
        warrantyStatus: 'ACTIVE_WARRANTY',
        courierTracking: 'DEL-991283',
        courierPartner: 'BlueDart',
        stage: 'FAULT_LOGGED',
        createdAt: new Date().toISOString()
      });

      testStore.addCRMOpportunity({
        id: 'crm-001',
        clientName: 'Tata Steel',
        contactPerson: 'Rajesh V.',
        title: 'Factory Network Upgrade',
        value: 1200000,
        stage: 'PROPOSAL_SUBMITTED',
        winProbability: 70,
        expectedCloseDate: '2026-12-31',
        assignedEngineer: 'Suresh Patil',
        category: 'Networking'
      });

      testStore.addKnowledgeArticle({
        id: 'kb-001',
        title: 'Palo Alto HA Failover Runbook',
        category: 'Firewall',
        summary: 'Step by step cluster synchronization SOP',
        readTime: '3 min',
        views: 0,
        solvedCount: 0,
        tags: ['Firewall', 'SOP'],
        symptoms: ['HA sync failure'],
        selfServiceSteps: ['Run: show high-availability all']
      });

      testStore.addMarketplaceDispute({
        id: 'dsp-001',
        disputeNumber: 'DSP-2026-001',
        projectId: 'prj-101',
        projectTitle: 'Data Center Cabling',
        customerName: 'FinServe Bank',
        providerName: 'FiberTech Solutions',
        disputedAmount: 25000,
        escrowHeld: 25000,
        reason: 'Delay in patch panel termination',
        customerClaim: 'Completion delayed by 2 weeks',
        providerRebuttal: 'Access to site restricted on weekends',
        aiMediationVerdict: 'Arbitration review active',
        status: 'UNDER_ARBITRATION',
        createdAt: new Date().toISOString()
      });

      // Reload store to verify persistence
      const reloaded = new PersistentStore(testDbFile);
      assert.strictEqual(reloaded.getState().rmaClaims.length, 1);
      assert.strictEqual(reloaded.getState().crmOpportunities.length, 1);
      assert.strictEqual(reloaded.getState().knowledgeArticles.length, 1);
      assert.strictEqual(reloaded.getState().marketplaceDisputes.length, 1);
    });

    // Security regression: committed starter data must never block first-time enrollment.
    await test('Checked-in initial state contains no legacy passwordless administrator', async () => {
      const starter = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'app-store.json'), 'utf-8'));
      assert.deepStrictEqual(starter.users, [], 'No default admin without a password hash may ship');
      assert.strictEqual(starter.products.length, 0);
      assert.strictEqual(starter.invoices.length, 0);
    });

    // Evidence must be present before a ledger invoice may be marked SETTLED.
    await test('Invoice settlement requires payment reference and is idempotent', async () => {
      const invoice: InvoiceRecord = {
        customer: 'Example Customer',
        invoiceNo: 'INV-TEST-REF-001',
        amount: 1190,
        dueInDays: 30,
        status: 'ACTIVE',
        createdAt: '2026-11-06'
      };
      testStore.addInvoice(invoice);
      assert.throws(() => testStore.settleInvoice(invoice.invoiceNo, { paymentReference: '' }), /payment reference/);
      assert.strictEqual(testStore.getState().invoices.find(i => i.invoiceNo === invoice.invoiceNo)?.status, 'ACTIVE');
      const settled = testStore.settleInvoice(invoice.invoiceNo, { paymentReference: 'BANK-REFERENCE-001' });
      assert.strictEqual(settled?.status, 'SETTLED');
      assert.strictEqual(settled?.paymentReference, 'BANK-REFERENCE-001');
      assert.throws(() => testStore.settleInvoice(invoice.invoiceNo, { paymentReference: 'BANK-REFERENCE-002' }), /cannot be settled again/);
    });

    // Name collisions are not reliable warehouse identity; only stable IDs work.
    await test('Part consumption rejects name instead of exact product ID', async () => {
      assert.throws(
        () => testStore.consumeJobPart('job-stock-test', 'NVMe 2TB Enterprise SSD', 1),
        /Product not found/
      );
      assert.throws(
        () => testStore.consumeJobPart('job-stock-test', 'prod-scarce-1', 1.5),
        /positive integer/
      );
    });

    // 10. Codebase audit: zero mockData files
    await test('src/data/mockData.ts is permanently absent from filesystem', async () => {
      const mockFilePath = path.join(process.cwd(), 'src', 'data', 'mockData.ts');
      assert.strictEqual(fs.existsSync(mockFilePath), false, 'mockData.ts must not exist');
    });

    // 11. Codebase audit: zero imports of mockData
    await test('Zero source code files import mockData', async () => {
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

    // Phase 3: guard against invented tax registrations and banking details on printable drafts.
    await test('BOM quotation draft contains no fabricated GST, bank or 18% tax assumptions', async () => {
      const p = path.join(process.cwd(), 'src', 'components', 'BOMBuilder.tsx');
      const content = fs.readFileSync(p, 'utf8');
      assert.strictEqual(content.includes('27AAACA9823P1Z9'), false);
      assert.strictEqual(content.includes('HDFC0000060'), false);
      assert.strictEqual(content.includes('Math.round(netSubtotal * 0.18)'), false);
      assert.strictEqual(content.includes('Math.round(netSubtotal * 1.18)'), false);
      assert.ok(content.includes('NOT A TAX INVOICE'));
    });

    // 12. Codebase audit: zero window.alert calls
    await test('Zero window.alert calls exist in source code', async () => {
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

  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Could not remove temp test directory:', cleanupErr);
    }
  }

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
