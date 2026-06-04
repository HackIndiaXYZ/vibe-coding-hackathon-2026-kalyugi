import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Connection test state
let mockModeEnabled = false;
let checkDone = false;

if (!supabaseUrl || !supabaseAnonKey) {
  mockModeEnabled = true;
  checkDone = true;
  console.log('⚠️ Supabase credentials missing. Enabling local offline mock mode.');
}

// Generate a random UUID safely in both Node.js and browser environments
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Global in-memory mock database state
const MOCK_USER_ID = '33333333-3333-3333-3333-333333333333';

const mockDb = {
  profiles: [
    {
      id: MOCK_USER_ID,
      full_name: 'Test Agent',
      agency_name: 'Alpha Growth Agency',
      email: 'test@agency.com',
      logo_url: null,
      brand_primary_color: '#0EA5E9',
      brand_accent_color: '#06FFA5',
      brand_font: 'DM Sans',
      ai_tone: 'professional',
      created_at: new Date().toISOString(),
    },
  ] as any[],
  clients: [
    {
      id: 'c1111111-1111-1111-1111-111111111111',
      user_id: MOCK_USER_ID,
      name: 'Acme Growth Corp',
      industry: 'SaaS / Tech',
      logo_url: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'c2222222-2222-2222-2222-222222222222',
      user_id: MOCK_USER_ID,
      name: 'Lotus Wellness Spa',
      industry: 'E-commerce / Retail',
      logo_url: null,
      created_at: new Date().toISOString(),
    },
  ] as any[],
  integrations: [
    {
      id: 'i1111111-1111-1111-1111-111111111111',
      user_id: MOCK_USER_ID,
      client_id: 'c1111111-1111-1111-1111-111111111111',
      platform: 'google_ads',
      access_token_encrypted: 'mock_google_access_token',
      refresh_token_encrypted: 'mock_google_refresh_token',
      token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      scope: 'scope_info | customer_id:123456',
      is_active: true,
      connected_at: new Date().toISOString(),
    },
    {
      id: 'i2222222-2222-2222-2222-222222222222',
      user_id: MOCK_USER_ID,
      client_id: 'c1111111-1111-1111-1111-111111111111',
      platform: 'search_console',
      access_token_encrypted: 'mock_google_access_token',
      refresh_token_encrypted: 'mock_google_refresh_token',
      token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      scope: 'scope_info | site_url:https://acme.com',
      is_active: true,
      connected_at: new Date().toISOString(),
    },
  ] as any[],
  reports: [
    {
      id: 'r1111111-1111-1111-1111-111111111111',
      user_id: MOCK_USER_ID,
      client_id: 'c1111111-1111-1111-1111-111111111111',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      status: 'ready',
      pdf_url: '/mock-report.pdf',
      pdf_key: 'mock-report-key',
      ai_summary: 'Overall performance for Acme Growth Corp in May 2026 has been outstanding. We observed a significant increase in search impressions and Google Ads conversions, driving efficient customer acquisition.',
      metrics_snapshot: {
        google_ads: { clicks: 1200, impressions: 24000, cost: 450, conversions: 85 },
        search_console: { clicks: 3500, impressions: 98000, ctr: 3.57, position: 12.4 },
      },
      created_at: new Date().toISOString(),
      generated_at: new Date().toISOString(),
    },
  ] as any[],
  report_sections: [
    {
      id: 's1111111-1111-1111-1111-111111111111',
      report_id: 'r1111111-1111-1111-1111-111111111111',
      platform: 'google_ads',
      metrics: { clicks: 1200, impressions: 24000, cost: 450, conversions: 85 },
      ai_commentary: 'Google Ads campaigns performed optimally, achieving 85 conversions at a cost per conversion of $5.29. Search impressions grew 15% month-over-month.',
      is_visible: true,
      order_index: 0,
    },
    {
      id: 's2222222-2222-2222-2222-222222222222',
      report_id: 'r1111111-1111-1111-1111-111111111111',
      platform: 'search_console',
      metrics: { clicks: 3500, impressions: 98000, ctr: 3.57, position: 12.4 },
      ai_commentary: 'Organic search performance remains stable with search impressions reaching 98,000. Average position improved slightly to 12.4.',
      is_visible: true,
      order_index: 1,
    },
  ] as any[],
};

// Mock Query Builder mimicking chainable Postgrest queries
class MockSupabaseQueryBuilder {
  private table: string;
  private filters: Array<(row: any) => boolean> = [];
  private limitCount?: number;
  private selectFields: string = '*';
  private sortField?: string;
  private sortAscending?: boolean;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private opValues: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select(fields: string = '*') {
    this.selectFields = fields;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.sortField = field;
    this.sortAscending = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  insert(values: any) {
    this.op = 'insert';
    this.opValues = values;
    return this;
  }

  update(values: any) {
    this.op = 'update';
    this.opValues = values;
    return this;
  }

  upsert(values: any) {
    this.op = 'upsert';
    this.opValues = values;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  async single() {
    const { data, error } = await this.execute();
    if (error) return { data: null, error };
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    }
    return { data: Array.isArray(data) ? data[0] : data, error: null };
  }

  async execute() {
    const list = mockDb[this.table as keyof typeof mockDb] || [];

    if (this.op === 'insert') {
      const rows = Array.isArray(this.opValues) ? this.opValues : [this.opValues];
      const createdRows = rows.map((row) => {
        const newRow = {
          id: row.id || generateUUID(),
          created_at: new Date().toISOString(),
          ...row,
        };
        list.push(newRow);
        return newRow;
      });
      return { data: Array.isArray(this.opValues) ? createdRows : createdRows[0], error: null };
    }

    if (this.op === 'upsert') {
      const rows = Array.isArray(this.opValues) ? this.opValues : [this.opValues];
      const resultRows = rows.map((row) => {
        let existingIndex = -1;
        if (row.id) {
          existingIndex = list.findIndex((r) => r.id === row.id);
        } else if (row.client_id && row.platform) {
          existingIndex = list.findIndex(
            (r) => r.client_id === row.client_id && r.platform === row.platform
          );
        }

        if (existingIndex !== -1) {
          list[existingIndex] = { ...list[existingIndex], ...row };
          return list[existingIndex];
        } else {
          const newRow = {
            id: row.id || generateUUID(),
            created_at: new Date().toISOString(),
            ...row,
          };
          list.push(newRow);
          return newRow;
        }
      });
      return { data: Array.isArray(this.opValues) ? resultRows : resultRows[0], error: null };
    }

    // Filter matching rows
    let matchedRows = [...list];
    for (const filter of this.filters) {
      matchedRows = matchedRows.filter(filter);
    }

    if (this.op === 'update') {
      const matchedIds = new Set(matchedRows.map((r) => r.id));
      for (const row of list) {
        if (matchedIds.has(row.id)) {
          Object.assign(row, this.opValues);
        }
      }
      return { data: matchedRows.map((r) => ({ ...r, ...this.opValues })), error: null };
    }

    if (this.op === 'delete') {
      const matchedIds = new Set(matchedRows.map((r) => r.id));
      if (this.table === 'clients') {
        mockDb.clients = mockDb.clients.filter((r) => !matchedIds.has(r.id));
      } else if (this.table === 'reports') {
        mockDb.reports = mockDb.reports.filter((r) => !matchedIds.has(r.id));
      } else if (this.table === 'report_sections') {
        mockDb.report_sections = mockDb.report_sections.filter((r) => !matchedIds.has(r.id));
      } else if (this.table === 'integrations') {
        mockDb.integrations = mockDb.integrations.filter((r) => !matchedIds.has(r.id));
      }
      return { data: matchedRows, error: null };
    }

    // SELECT operations:
    // Sort
    if (this.sortField) {
      const field = this.sortField;
      const asc = this.sortAscending;
      matchedRows.sort((a, b) => {
        if (a[field] < b[field]) return asc ? -1 : 1;
        if (a[field] > b[field]) return asc ? 1 : -1;
        return 0;
      });
    }

    // Limit
    if (this.limitCount !== undefined) {
      matchedRows = matchedRows.slice(0, this.limitCount);
    }

    // Process field selections and joins
    const processed = matchedRows.map((row) => {
      const copy = { ...row };
      if (this.selectFields.includes('clients (*)')) {
        const client = mockDb.clients.find((c) => c.id === row.client_id);
        copy.clients = client ? { ...client } : null;
      } else if (this.selectFields.includes('clients (name)')) {
        const client = mockDb.clients.find((c) => c.id === row.client_id);
        copy.clients = client ? { name: client.name } : null;
      }
      return copy;
    });

    return { data: processed, error: null };
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// Mock Supabase Auth engine
class MockSupabaseAuth {
  async signInWithPassword({ email, password }: any) {
    const profile = mockDb.profiles.find((p) => p.email === email);
    if (!profile) {
      return { data: null, error: { message: 'Invalid login credentials' } };
    }
    // Allow any password in development fallback, or standard 'password123'
    return {
      data: {
        user: { id: profile.id, email: profile.email },
        session: { access_token: `mock_jwt_token_for_${profile.id}` },
      },
      error: null,
    };
  }

  async signInWithOAuth({ provider, options }: any) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return {
      data: {
        provider,
        url: `${appUrl}/auth/callback?code=mock_oauth_code`,
      },
      error: null,
    };
  }

  async getUser(tokenStr?: string) {
    const profile = mockDb.profiles[0];
    return {
      data: {
        user: { id: profile.id, email: profile.email },
      },
      error: null,
    };
  }

  async adminListUsers() {
    return {
      data: {
        users: mockDb.profiles.map((p) => ({ id: p.id, email: p.email })),
      },
      error: null,
    };
  }

  async adminCreateUser({ email, password }: any) {
    const id = generateUUID();
    const newUser = { id, email };
    mockDb.profiles.push({
      id,
      full_name: 'Test Agent',
      agency_name: 'Alpha Growth Agency',
      email,
      logo_url: null,
      brand_primary_color: '#0EA5E9',
      brand_accent_color: '#06FFA5',
      brand_font: 'DM Sans',
      ai_tone: 'professional',
      created_at: new Date().toISOString(),
    });
    return { data: { user: newUser }, error: null };
  }

  get admin() {
    return {
      listUsers: async () => this.adminListUsers(),
      createUser: async (params: any) => this.adminCreateUser(params),
    };
  }
}

// Complete Mock Client
class MockSupabaseClient {
  auth = new MockSupabaseAuth();

  from(table: string) {
    return new MockSupabaseQueryBuilder(table);
  }
}

// Connection test state is declared at the top of the file

export async function detectOfflineMode() {
  if (checkDone) return mockModeEnabled;
  
  if (process.env.MOCK_SUPABASE === 'true' || process.env.NEXT_PUBLIC_MOCK_SUPABASE === 'true') {
    mockModeEnabled = true;
    checkDone = true;
    return true;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      mockModeEnabled = true;
    }
  } catch (err) {
    // DNS resolution or connection failure
    mockModeEnabled = true;
  }
  
  checkDone = true;
  if (mockModeEnabled) {
    console.log('⚠️ Supabase connection unreachable. Enabling local offline mock mode.');
  }
  return mockModeEnabled;
}

// Fire connection check on load
detectOfflineMode();

/**
 * Creates a Supabase client scoped to a user's JWT token.
 * Passes the JWT token to the global headers so that Row Level Security (RLS) policies
 * are automatically enforced by Supabase.
 */
export function getSupabaseClient(token?: string) {
  if (mockModeEnabled) {
    return new MockSupabaseClient() as any;
  }

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

/**
 * Creates an administrative Supabase client using the Service Role Key.
 * Bypass RLS policies. Use only for internal systems/admin updates.
 */
export function getSupabaseServiceClient() {
  if (mockModeEnabled) {
    return new MockSupabaseClient() as any;
  }

  if (!supabaseServiceKey) {
    throw new Error('Supabase Service Role Key must be configured in environment variables.');
  }
  return createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

