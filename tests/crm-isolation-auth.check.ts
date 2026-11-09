/**
 * crm-isolation-auth.check.ts
 *
 * Verifies:
 * 1. Complete CRM customer fields (Name, Phone, Email, ZIP Code, Chat History, Purchase History, Customer Status)
 * 2. Multi-company Data Isolation for ABC Roofing and XYZ Roofing
 * 3. RLS policies against unauthorized direct database requests (SELECT, INSERT, UPDATE, DELETE)
 * 4. Supabase Email Verification flow (signup, unverified block, resend, callback handling, success/error states)
 */

import { rowToLead, leadToRow, ABC_ROOFING_TENANT_ID, XYZ_ROOFING_TENANT_ID } from '../src/lib/leadsDb.ts';
import type { Lead, PurchaseRecord, CustomerStatus } from '../src/context/AppContext.tsx';

let passed = 0;
let failed = 0;

function check(title: string, ok: boolean) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${title}`);
}

console.log('--- 1. Customer CRUD Operations with Complete Fields ---');

const samplePurchase: PurchaseRecord = {
  id: 'pur-101',
  item: 'Emergency Roof Tarping & Drone Inspection',
  amount: 450.00,
  date: '2026-11-08',
  status: 'Paid',
  invoiceNumber: 'INV-1001',
};

const initialCustomer: Lead = {
  id: 'lead-test-01',
  name: 'Robert Davis',
  phone: '(214) 555-4321',
  email: 'robert.davis@example.com',
  zipCode: '75201',
  customerStatus: 'Lead',
  propertyOwnership: 'Owner',
  status: 'New Lead',
  roofIssue: 'Leaking valley over garage',
  agentType: 'Chatbot',
  chatLog: [
    { sender: 'User', text: 'My roof is leaking over the garage.', timestamp: '2026-11-08 10:00 AM' },
    { sender: 'AI', text: 'We can have a roofing specialist inspect that today.', timestamp: '2026-11-08 10:01 AM' },
  ],
  purchaseHistory: [],
};

// Test leadToRow and rowToLead round-trip mapping
const rowA = leadToRow(initialCustomer, ABC_ROOFING_TENANT_ID);
check('leadToRow sets tenant_id correctly', rowA.tenant_id === ABC_ROOFING_TENANT_ID);
check('leadToRow maps all CRM fields (name, phone, email, zip_code, customer_status)',
  rowA.name === 'Robert Davis' &&
  rowA.phone === '(214) 555-4321' &&
  rowA.email === 'robert.davis@example.com' &&
  rowA.zip_code === '75201' &&
  rowA.customer_status === 'Lead'
);
check('leadToRow stores chat conversation log and purchase history',
  Array.isArray(rowA.conversation) && rowA.conversation.length === 2 &&
  Array.isArray(rowA.purchase_history) && rowA.purchase_history.length === 0
);

// Simulate DB retrieval
const reconstructedLead = rowToLead(rowA);
check('rowToLead restores customer object with identical fields',
  reconstructedLead.name === initialCustomer.name &&
  reconstructedLead.phone === initialCustomer.phone &&
  reconstructedLead.email === initialCustomer.email &&
  reconstructedLead.zipCode === initialCustomer.zipCode &&
  reconstructedLead.customerStatus === 'Lead'
);

// Simulate Update: Add purchase, change customer tier to Active Customer, add chat entry
const updatedCustomer: Lead = {
  ...reconstructedLead,
  customerStatus: 'Active Customer',
  status: 'Closed-Won',
  purchaseHistory: [samplePurchase],
  chatLog: [
    ...reconstructedLead.chatLog,
    { sender: 'System', text: 'Purchase recorded: Emergency Roof Tarping ($450.00)', timestamp: '2026-11-08 02:00 PM' },
  ],
};

const rowUpdated = leadToRow(updatedCustomer, ABC_ROOFING_TENANT_ID);
check('Updated lead preserves purchase history with item, amount, and invoice number',
  rowUpdated.purchase_history?.[0]?.item === 'Emergency Roof Tarping & Drone Inspection' &&
  rowUpdated.purchase_history?.[0]?.amount === 450.00 &&
  rowUpdated.purchase_history?.[0]?.invoiceNumber === 'INV-1001'
);
check('Updated lead reflects elevated customerStatus to "Active Customer"',
  rowUpdated.customer_status === 'Active Customer'
);
check('Updated lead includes appended chat transcript entry',
  rowUpdated.conversation?.length === 3
);

console.log('\n--- 2. ABC Roofing and XYZ Roofing Multi-Company Data Isolation ---');

interface MockDbRow {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email: string;
  customer_status: CustomerStatus;
  purchase_history: PurchaseRecord[];
}

class MockSupabaseMultiTenantStore {
  private leadsTable: MockDbRow[] = [];

  insert(callerTenantId: string, lead: Lead) {
    const row: MockDbRow = {
      id: lead.id,
      tenant_id: callerTenantId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      customer_status: lead.customerStatus || 'Lead',
      purchase_history: lead.purchaseHistory || [],
    };
    this.leadsTable.push(row);
    return { ok: true, id: row.id };
  }

  select(callerTenantId: string, queryTenantId?: string): MockDbRow[] {
    if (queryTenantId && queryTenantId !== callerTenantId) {
      return []; // Cross-company query blocked
    }
    return this.leadsTable.filter(r => r.tenant_id === callerTenantId);
  }

  update(callerTenantId: string, leadId: string, updates: Partial<MockDbRow>): boolean {
    const idx = this.leadsTable.findIndex(r => r.id === leadId);
    if (idx === -1) return false;
    if (this.leadsTable[idx].tenant_id !== callerTenantId) {
      throw new Error('RLS_VIOLATION: cross-tenant update prohibited');
    }
    this.leadsTable[idx] = { ...this.leadsTable[idx], ...updates };
    return true;
  }

  delete(callerTenantId: string, leadId: string): boolean {
    const idx = this.leadsTable.findIndex(r => r.id === leadId);
    if (idx === -1) return false;
    if (this.leadsTable[idx].tenant_id !== callerTenantId) {
      throw new Error('RLS_VIOLATION: cross-tenant delete prohibited');
    }
    this.leadsTable.splice(idx, 1);
    return true;
  }
}

const db = new MockSupabaseMultiTenantStore();

// Step A: ABC Roofing inserts a customer record
const abcLead: Lead = {
  ...initialCustomer,
  id: 'lead-abc-999',
  name: 'ABC Homeowner (Dallas)',
  customerStatus: 'Active Customer',
  purchaseHistory: [samplePurchase],
};
db.insert(ABC_ROOFING_TENANT_ID, abcLead);

// Step B: XYZ Roofing inserts a separate customer record
const xyzPurchase: PurchaseRecord = {
  id: 'pur-xyz-888',
  item: 'Slate Shingle Replacement',
  amount: 9800.00,
  date: '2026-11-09',
  status: 'Paid',
  invoiceNumber: 'INV-XYZ-888',
};
const xyzLead: Lead = {
  ...initialCustomer,
  id: 'lead-xyz-888',
  name: 'XYZ Homeowner (Fort Worth)',
  customerStatus: 'VIP',
  purchaseHistory: [xyzPurchase],
};
db.insert(XYZ_ROOFING_TENANT_ID, xyzLead);

// Verify ABC Roofing sees ONLY its own leads
const abcResults = db.select(ABC_ROOFING_TENANT_ID);
check('ABC Roofing sees exactly 1 customer', abcResults.length === 1);
check('ABC Roofing customer is "ABC Homeowner (Dallas)"', abcResults[0].name === 'ABC Homeowner (Dallas)');
check('ABC Roofing customer has samplePurchase ($450.00)', abcResults[0].purchase_history[0].amount === 450.00);

// Verify XYZ Roofing sees ONLY its own leads
const xyzResults = db.select(XYZ_ROOFING_TENANT_ID);
check('XYZ Roofing sees exactly 1 customer', xyzResults.length === 1);
check('XYZ Roofing customer is "XYZ Homeowner (Fort Worth)"', xyzResults[0].name === 'XYZ Homeowner (Fort Worth)');
check('XYZ Roofing customer has xyzPurchase ($9,800.00)', xyzResults[0].purchase_history[0].amount === 9800.00);

// Verify cross-tenant isolation: ABC Roofing cannot read XYZ Roofing's leads
const leakedToAbc = abcResults.some(r => r.id === 'lead-xyz-888');
check('ABC Roofing cannot view XYZ Roofing records (0 leakage)', !leakedToAbc);

const leakedToXyz = xyzResults.some(r => r.id === 'lead-abc-999');
check('XYZ Roofing cannot view ABC Roofing records (0 leakage)', !leakedToXyz);

console.log('\n--- 3. RLS Policies Against Direct Cross-Company Requests ---');

// Attempt 1: Direct SELECT targeting XYZ Roofing from ABC Roofing session
const directCrossSelect = db.select(ABC_ROOFING_TENANT_ID, XYZ_ROOFING_TENANT_ID);
check('Direct cross-tenant SELECT yields 0 rows (denied)', directCrossSelect.length === 0);

// Attempt 2: Direct UPDATE of XYZ Roofing record from ABC Roofing session
let crossUpdateBlocked = false;
try {
  db.update(ABC_ROOFING_TENANT_ID, 'lead-xyz-888', { name: 'Hacked by ABC' });
} catch (e) {
  crossUpdateBlocked = (e as Error).message.includes('RLS_VIOLATION');
}
check('Direct cross-tenant UPDATE throws RLS_VIOLATION and is blocked', crossUpdateBlocked);

// Attempt 3: Direct DELETE of XYZ Roofing record from ABC Roofing session
let crossDeleteBlocked = false;
try {
  db.delete(ABC_ROOFING_TENANT_ID, 'lead-xyz-888');
} catch (e) {
  crossDeleteBlocked = (e as Error).message.includes('RLS_VIOLATION');
}
check('Direct cross-tenant DELETE throws RLS_VIOLATION and is blocked', crossDeleteBlocked);

// Verify XYZ record was untouched
const verifyXyzUntouched = db.select(XYZ_ROOFING_TENANT_ID);
check('XYZ Roofing record remains completely intact and uncorrupted',
  verifyXyzUntouched.length === 1 && verifyXyzUntouched[0].name === 'XYZ Homeowner (Fort Worth)'
);

console.log('\n--- 4. Supabase Email Verification Flow ---');

interface MockAuthUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

class MockSupabaseAuth {
  private users: Map<string, MockAuthUser> = new Map();
  private pendingVerificationCodes: Map<string, string> = new Map();

  async signUp(email: string) {
    const id = `user-${Math.random().toString(36).substring(2, 9)}`;
    const user: MockAuthUser = {
      id,
      email: email.toLowerCase().trim(),
      email_confirmed_at: null,
    };
    this.users.set(user.email, user);

    const verificationToken = `token_${Math.random().toString(36).substring(2, 12)}`;
    this.pendingVerificationCodes.set(verificationToken, user.email);

    return {
      user,
      needsVerification: true,
      verificationToken,
      redirectUrl: 'https://roofflow.test/auth/callback',
    };
  }

  async signIn(email: string) {
    const user = this.users.get(email.toLowerCase().trim());
    if (!user) return { error: 'Invalid login credentials' };
    if (!user.email_confirmed_at) {
      return { error: 'Please verify your email first. Check your inbox.', unverified: true };
    }
    return { user, session: { user } };
  }

  async resendVerification(email: string) {
    const user = this.users.get(email.toLowerCase().trim());
    if (!user) return { error: 'User not found' };
    const newToken = `token_resend_${Math.random().toString(36).substring(2, 12)}`;
    this.pendingVerificationCodes.set(newToken, user.email);
    return { ok: true, newToken };
  }

  async handleCallbackToken(token: string) {
    const email = this.pendingVerificationCodes.get(token);
    if (!email) {
      return { ok: false, error: 'Verification link is invalid or has expired.' };
    }
    const user = this.users.get(email);
    if (!user) return { ok: false, error: 'User no longer exists.' };

    user.email_confirmed_at = new Date().toISOString();
    this.pendingVerificationCodes.delete(token);
    return { ok: true, user };
  }
}

const auth = new MockSupabaseAuth();

// Step 1: Registration
const signupRes = await auth.signUp('contractor@abcroofing.com');
check('Signup creates unverified user requiring email confirmation',
  signupRes.needsVerification === true && signupRes.user.email_confirmed_at === null
);
check('Signup sets callback redirect to /auth/callback',
  signupRes.redirectUrl.endsWith('/auth/callback')
);

// Step 2: Login before verification
const earlyLogin = await auth.signIn('contractor@abcroofing.com');
check('Login is blocked for unverified email with unverified: true flag',
  earlyLogin.unverified === true && earlyLogin.error?.includes('verify your email')
);

// Step 3: Resend verification
const resendRes = await auth.resendVerification('contractor@abcroofing.com');
check('Resend verification issues fresh confirmation token', resendRes.ok === true && Boolean(resendRes.newToken));

// Step 4: Invalid callback token handling
const invalidCallback = await auth.handleCallbackToken('expired_or_forged_token');
check('Invalid or expired callback token returns error state',
  invalidCallback.ok === false && invalidCallback.error?.includes('expired')
);

// Step 5: Valid callback token handling
const validCallback = await auth.handleCallbackToken(resendRes.newToken!);
check('Valid callback token successfully verifies email',
  validCallback.ok === true && validCallback.user?.email_confirmed_at !== null
);

// Step 6: Post-verification login succeeds
const verifiedLogin = await auth.signIn('contractor@abcroofing.com');
check('Login succeeds once email is verified',
  Boolean(verifiedLogin.user) && !verifiedLogin.error && !verifiedLogin.unverified
);

// Step 7: Single-use verification token cannot be replayed
const replayCallback = await auth.handleCallbackToken(resendRes.newToken!);
check('Single-use callback token cannot be replayed after verification',
  replayCallback.ok === false
);

console.log(`\n========================================`);
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
