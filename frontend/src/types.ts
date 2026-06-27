// Tipe data SaaS (selaras dengan model backend).

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  billing_period: string;
  max_numbers: number;
  max_ai_replies_monthly: number;
  is_active: boolean;
  is_popular: boolean;
  sort_order: number;
}

export interface Tenant {
  id: number;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'expired';
  plan_id: number | null;
  plan?: Plan | null;
  trial_ends_at: string | null;
  created_at: string;
}

export interface TenantRow extends Tenant {
  numbers_used: number;
  ai_replies_used: number;
}

export interface Usage {
  tenant: Tenant;
  period: string;
  numbers_used: number;
  max_numbers: number;
  ai_replies_used: number;
  ai_replies_max: number;
}

export interface AdminStats {
  total_tenants: number;
  active_tenants: number;
  trial_tenants: number;
  revenue_total: number;
  ai_replies_month: number;
  period: string;
}

export interface AIPreset {
  key: string;
  label: string;
  model: string;
  available: boolean; // API key sudah diisi di .env
}

export interface AIModelConfig {
  active: string;
  presets: AIPreset[];
}

export interface Invoice {
  id: number;
  plan_id: number;
  merchant_ref: string;
  tripay_reference: string;
  amount: number;
  status: string;
  payment_method: string;
  checkout_url: string;
  paid_at: string | null;
  created_at: string;
}

export interface PaymentChannel {
  code: string;
  name: string;
  group?: string;
  icon_url?: string;
  total_fee?: { flat: number; percent: string };
}

export interface ChatMsg {
  id: number;
  sender: string;
  message: string;
  reply: string;
  from_human: boolean;
  media_type: string; // "", image, document, audio, video, sticker
  file_name: string;
  mimetype: string;
  wa_msg_id?: string;
  reply_to?: string;
  reply_text?: string;
  revoked?: boolean;
  created_at: string;
}

export interface Contact {
  sender: string;
  last_at: string;
  last_msg?: string;
  needs_human: boolean;
  name?: string;
}

export interface Analytics {
  total_incoming: number;
  ai_replies: number;
  human_replies: number;
  contacts: number;
  open_handoffs: number;
  ai_handled_pct: number;
  trend: { day: string; count: number }[];
}

export interface AIMetrics {
  total_incoming: number;
  ai_replies: number;
  escalated: number;
  escalation_rate: number;
  tool_shipping_success: number;
  tool_shipping_error: number;
  closing_detected: number;
  closing_exported: number;
  ai_errors: number;
  trend: { date: string; total: number; escalated: number }[];
}

export interface NumberCheck {
  input: string;
  number: string;
  registered: boolean;
  warm?: boolean; // pernah chat dengan agent ini
}

export interface CheckResult {
  data: NumberCheck[];
  summary: { sent_today: number; daily_cap: number };
}

export type BroadcastConsentCategory = 'marketing' | 'order_update' | 'reminder' | 'service_info';

export interface BroadcastSafetyForm {
  consent_category: BroadcastConsentCategory;
  consent_confirmed: boolean;
  risk_acknowledged: boolean;
  override_phrase: string;
  override_reason: string;
}

export interface BroadcastGuardFinding {
  code: string;
  severity: 'info' | 'warning' | 'danger' | 'blocked';
  message: string;
  recommendation?: string;
}

export interface BroadcastAssessment {
  level: 'low' | 'medium' | 'high' | 'blocked';
  title: string;
  can_proceed: boolean;
  can_override: boolean;
  requires_acknowledgement: boolean;
  requires_override: boolean;
  total_recipients: number;
  eligible_recipients: number;
  sendable_today: number;
  existing_consent: number;
  consent_to_record: number;
  missing_consent: number;
  opted_out: number;
  engaged_recipients: number;
  no_interaction: number;
  sent_today: number;
  daily_limit: number;
  findings: BroadcastGuardFinding[];
  override_phrase?: string;
}

export interface BroadcastPreflightBody extends BroadcastSafetyForm {
  message: string;
  recipients: { number: string; name: string }[];
  run_at?: string;
}

export interface Broadcast {
  id: number;
  message: string;
  status: string; // pending, running, done, failed, interrupted
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  media_type: string;
  file_name: string;
  consent_category?: BroadcastConsentCategory;
  consent_source?: string;
  risk_level?: BroadcastAssessment['level'];
  risk_acknowledged?: boolean;
  override_reason?: string;
  created_at: string;
}

export interface BroadcastRecipient {
  id: number;
  number: string;
  name: string;
  status: string; // pending, sent, failed, skipped
  error: string;
  sent_at: string | null;
}

export interface AutoReply {
  id: number;
  keywords: string;
  match_type: string; // contains, exact, prefix
  reply: string;
  enabled: boolean;
  sort_order: number;
}

export interface Template {
  id: number;
  title: string;
  body: string;
  sort_order: number;
}

export interface SavedContact {
  id: number;
  number: string;
  name: string;
  notes: string;
  tags: string; // dipisah koma
  last_at: string | null;
}

export interface SavedContactsResp {
  data: SavedContact[];
  total: number;
  page: number;
  limit: number;
  all_tags: string[];
}

export interface FollowUpStep {
  id?: number;
  step_order?: number;
  delay_hours: number;
  message: string;
}

export interface FollowUp {
  id: number;
  name: string;
  enabled: boolean;
  stop_on_reply: boolean;
  steps: FollowUpStep[];
  counts: { active: number; completed: number; stopped: number };
}

export interface WAGroup {
  jid: string;
  name: string;
  participants: number;
  bot_is_admin: boolean;
  guard_enabled?: boolean;
}

export interface GroupGuardConfig {
  id?: number;
  group_jid: string;
  group_name: string;
  enabled: boolean;
  delete_spam: boolean;
  flag_for_kick: boolean;
  auto_kick: boolean;
  block_links: boolean;
  block_phones: boolean;
  block_words: string;
  flood_count: number;
  flood_window_sec: number;
  allow_numbers: string;
}

export interface GroupModerationLog {
  id: number;
  group_jid: string;
  group_name: string;
  sender: string;
  sender_name: string;
  action: string;
  reason: string;
  excerpt: string;
  status: string;
  created_at: string;
}

export interface LabelInfo {
  label_id: string;
  name: string;
  color: number;
  count: number;
}

export interface ScheduledMessage {
  id: number;
  run_at: string;
  message: string;
  recipient_count: number;
  media_type: string;
  file_name: string;
  status: string; // scheduled, running, done, failed, cancelled, interrupted
  consent_category?: BroadcastConsentCategory;
  consent_source?: string;
  risk_level?: BroadcastAssessment['level'];
  risk_acknowledged?: boolean;
  override_reason?: string;
  broadcast_id?: number | null;
}

export function normalizePhone(s: string): string {
  const d = (s.match(/\d/g) || []).join('');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  is_super_admin: boolean;
  tenant_id: number | null;
}

export function currentUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export interface Agent {
  id: number;
  name?: string;
  system_prompt?: string;
  tone?: string;
  ai_enabled?: boolean;
  greeting_enabled?: boolean;
  greeting_message?: string;
  business_hours_enabled?: boolean;
  business_start?: string;
  business_end?: string;
  away_message?: string;
  spreadsheet_url?: string;
  spreadsheet_sheet_name?: string;
  sheet_sync_enabled?: boolean;
  origin_city_id?: number;
  origin_city_name?: string;
  default_weight_gram?: number;
  enabled_couriers?: string;
}

export interface KnowledgeItem {
  id: number;
  question: string;
  answer: string;
  tags?: string;
  source?: string;
  source_url?: string;
}

export interface CrawlJob {
  id: number;
  root_url: string;
  domain: string;
  status: 'pending' | 'crawling' | 'training' | 'stopping' | 'done' | 'failed';
  pages_found: number;
  error?: string;
}

export interface CrawlPage {
  id: number;
  url: string;
  title: string;
  status: 'found' | 'crawled' | 'training' | 'trained' | 'skipped' | 'failed';
  char_count: number;
  recommended: boolean;
  error?: string;
}

export interface KnowledgeUsage {
  used_chars: number;
  max_chars: number;
  max_pages: number;
  total_knowledge: number;
}

export interface Handoff {
  id: number;
  sender: string;
  last_msg: string;
}

export function rupiah(n: number): string {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}
