import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './services/api';
import type { Plan, TenantRow, Usage, AdminStats, AIModelConfig, MetaTrackingAdminConfig, Invoice, PaymentChannel, Analytics, AIMetrics, Contact, ChatMsg, CheckResult, Broadcast, BroadcastRecipient, BroadcastAssessment, BroadcastPreflightBody, BroadcastSafetyForm, BroadcastConsentSummary, WAGroup, GroupGuardConfig, GroupModerationLog, LabelInfo, ScheduledMessage, AutoReply, Template, SavedContact, SavedContactsResp, FollowUp, Agent, KnowledgeItem, Handoff, CrawlJob, CrawlPage, KnowledgeUsage } from './types';
import type { MetaBrowserContext } from './services/metaPixel';

type ContactList = { number: string; name: string }[];

// ---- Tenant ----

export function useUsage() {
  return useQuery<Usage>({
    queryKey: ['usage'],
    queryFn: async () => (await api.get('/usage')).data,
  });
}

export function usePublicPlans() {
  return useQuery<Plan[]>({
    queryKey: ['public-plans'],
    queryFn: async () => (await api.get('/plans')).data.data,
  });
}

// ---- Billing (Tripay) ----

export function useBillingChannels() {
  return useQuery<PaymentChannel[]>({
    queryKey: ['billing', 'channels'],
    queryFn: async () => (await api.get('/billing/channels')).data.data,
    staleTime: 5 * 60_000,
    retry: false, // kalau Tripay belum dikonfigurasi, jangan retry
  });
}

export function useInvoices() {
  return useQuery<Invoice[]>({
    queryKey: ['billing', 'invoices'],
    queryFn: async () => (await api.get('/billing/invoices')).data.data,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (body: { plan_id: number; method: string } & MetaBrowserContext) =>
      (await api.post('/billing/checkout', body)).data.data as { checkout_url: string },
  });
}

// ---- Admin ----

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data,
  });
}

export function useAdminAIModel() {
  return useQuery<AIModelConfig>({
    queryKey: ['admin', 'ai-model'],
    queryFn: async () => (await api.get('/admin/ai-model')).data,
  });
}

export function useSetAdminAIModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (preset: string) => (await api.put('/admin/ai-model', { preset })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ai-model'] }),
  });
}

export type MetaTrackingAdminInput = {
  enabled: boolean;
  pixel_id: string;
  access_token: string;
  graph_version: string;
  test_event_code: string;
  clear_access_token?: boolean;
};

export function useAdminMetaTracking() {
  return useQuery<MetaTrackingAdminConfig>({
    queryKey: ['admin', 'meta-tracking'],
    queryFn: async () => (await api.get('/admin/meta-tracking')).data,
    refetchInterval: 30_000,
  });
}

export function useSetAdminMetaTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MetaTrackingAdminInput) =>
      (await api.put('/admin/meta-tracking', body)).data as MetaTrackingAdminConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'meta-tracking'] }),
  });
}

export function useTestAdminMetaTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post('/admin/meta-tracking/test')).data as { message: string },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'meta-tracking'] }),
  });
}

// ---- Link grup komunitas (WhatsApp/Telegram) ----
export type CommunityLinks = { whatsapp: string; telegram: string };

// Dipakai user (publik) untuk menampilkan tombol gabung grup.
export function useCommunityLinks() {
  return useQuery<CommunityLinks>({
    queryKey: ['community'],
    queryFn: async () => (await api.get('/community')).data,
  });
}

// Dipakai super-admin untuk membaca & mengatur link grup.
export function useAdminCommunityLinks() {
  return useQuery<CommunityLinks>({
    queryKey: ['admin', 'community'],
    queryFn: async () => (await api.get('/admin/community')).data,
  });
}

export function useSetAdminCommunityLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CommunityLinks) => (await api.put('/admin/community', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'community'] });
      qc.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useAdminTenants() {
  return useQuery<TenantRow[]>({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => (await api.get('/admin/tenants')).data.data,
  });
}

export function useAdminPlans() {
  return useQuery<Plan[]>({
    queryKey: ['admin', 'plans'],
    queryFn: async () => (await api.get('/admin/plans')).data.data,
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<{ status: string; plan_id: number }> }) =>
      (await api.put(`/admin/tenants/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  });
}

// useActivateTenant = aktivasi/perpanjang langganan manual oleh admin (transfer di luar Tripay).
export function useActivateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, plan_id }: { id: number; plan_id: number }) =>
      (await api.post(`/admin/tenants/${id}/activate`, { plan_id })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Partial<Plan>) =>
      plan.id
        ? (await api.put(`/admin/plans/${plan.id}`, plan)).data
        : (await api.post('/admin/plans', plan)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/plans/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  });
}

// ---- Fitur: analitik, inbox, test chat ----

export function useAgentAnalytics(agentId: number) {
  return useQuery<Analytics>({
    queryKey: ['analytics', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/analytics`)).data,
    enabled: !!agentId,
  });
}

export function useAgentAIMetrics(agentId: number) {
  return useQuery<AIMetrics>({
    queryKey: ['ai-metrics', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/ai-metrics`)).data,
    enabled: !!agentId,
    refetchInterval: 10000,
  });
}

export function useContacts(agentId: number) {
  return useQuery<Contact[]>({
    queryKey: ['contacts', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/contacts`)).data.data,
    enabled: !!agentId,
    refetchInterval: 5000,
  });
}

export function useConversation(agentId: number, sender: string) {
  return useQuery<{ data: ChatMsg[]; needs_human: boolean; media_token: string }>({
    queryKey: ['conversation', agentId, sender],
    queryFn: async () => (await api.get(`/agents/${agentId}/conversation`, { params: { sender } })).data,
    enabled: !!agentId && !!sender,
    refetchInterval: 4000,
  });
}

export function useSendMessage(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { to: string; message: string }) =>
      (await api.post(`/agents/${agentId}/send`, body)).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['conversation', agentId, vars.to] });
      qc.invalidateQueries({ queryKey: ['contacts', agentId] });
    },
  });
}

export function useSendMedia(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ to, file, caption }: { to: string; file: File; caption: string }) => {
      const fd = new FormData();
      fd.append('to', to);
      fd.append('caption', caption);
      fd.append('file', file);
      return (await api.post(`/agents/${agentId}/send-media`, fd)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversation', agentId] }); qc.invalidateQueries({ queryKey: ['contacts', agentId] }); },
  });
}


export function useRevokeMessage(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ msgId, to }: { msgId: string; to: string }) =>
      (await api.delete('/agents/' + agentId + '/messages/' + msgId, { data: { to } })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', agentId] });
    },
  });
}

export function useSendTyping(agentId: number) {
  return useMutation({
    mutationFn: async ({ to, active }: { to: string; active: boolean }) =>
      (await api.post(`/agents/${agentId}/typing`, { to, active })).data,
  });
}

export function useResumeBot(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sender: string) => (await api.delete(`/agents/${agentId}/handoffs/${sender}`)).data,
    onSuccess: (_d, sender) => {
      qc.invalidateQueries({ queryKey: ['conversation', agentId, sender] });
      qc.invalidateQueries({ queryKey: ['contacts', agentId] });
    },
  });
}

// ---- Broadcast ----

export function useCheckNumbers(agentId: number) {
  return useMutation({
    mutationFn: async (numbers: string[]) =>
      (await api.post(`/agents/${agentId}/check-numbers`, { numbers })).data as CheckResult,
  });
}

export function useBroadcastPreflight(agentId: number) {
  return useMutation({
    mutationFn: async (body: BroadcastPreflightBody) =>
      (await api.post(`/agents/${agentId}/broadcast/preflight`, body)).data as BroadcastAssessment,
  });
}

export function useBroadcastConsentSummary(agentId: number) {
  return useQuery<BroadcastConsentSummary>({
    queryKey: ['broadcast-consent-summary', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/broadcast/consent-summary`)).data.data,
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useBroadcasts(agentId: number, page: number) {
  return useQuery<{ data: Broadcast[]; total: number; page: number; limit: number }>({
    queryKey: ['broadcasts', agentId, page],
    queryFn: async () => (await api.get(`/agents/${agentId}/broadcasts`, { params: { page } })).data,
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

export function useChatContacts(agentId: number) {
  return useMutation({
    mutationFn: async () => (await api.get(`/agents/${agentId}/chat-contacts`)).data.data as { number: string; name: string }[],
  });
}

export function useWAContacts(agentId: number) {
  return useMutation({
    mutationFn: async () => (await api.get(`/agents/${agentId}/wa-contacts`)).data.data as ContactList,
  });
}

export function useGroups(agentId: number) {
  return useMutation({ mutationFn: async () => (await api.get(`/agents/${agentId}/groups`)).data.data as WAGroup[] });
}

// useManagedGroups = query daftar grup (auto-load) untuk halaman Anti-Spam Grup.
export function useManagedGroups(agentId: number, enabled = true) {
  return useQuery({
    queryKey: ['managed-groups', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/groups`)).data.data as WAGroup[],
    enabled,
    retry: false,
  });
}

export function useGroupConfig(agentId: number, gjid: string, enabled = true) {
  return useQuery({
    queryKey: ['group-config', agentId, gjid],
    queryFn: async () => (await api.get(`/agents/${agentId}/group-config`, { params: { gjid } })).data.data as GroupGuardConfig,
    enabled: enabled && !!gjid,
    retry: false,
  });
}

export function useSaveGroupConfig(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GroupGuardConfig) => (await api.put(`/agents/${agentId}/group-config`, body)).data.data as GroupGuardConfig,
    onSuccess: (_d, b) => {
      qc.invalidateQueries({ queryKey: ['group-config', agentId, b.group_jid] });
      qc.invalidateQueries({ queryKey: ['managed-groups', agentId] });
    },
  });
}

export function useGroupModeration(agentId: number, enabled = true) {
  return useQuery({
    queryKey: ['group-moderation', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/group-moderation`)).data.data as GroupModerationLog[],
    enabled,
    retry: false,
  });
}

export function useConfirmKick(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logid: number) => (await api.post(`/agents/${agentId}/group-moderation/${logid}/confirm-kick`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-moderation', agentId] }),
  });
}

export function useDismissModeration(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logid: number) => (await api.post(`/agents/${agentId}/group-moderation/${logid}/dismiss`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-moderation', agentId] }),
  });
}

export function useGroupMembers(agentId: number) {
  return useMutation({ mutationFn: async (jid: string) => (await api.get(`/agents/${agentId}/group-members`, { params: { jid } })).data.data as ContactList });
}

export function useLabels(agentId: number) {
  return useMutation({ mutationFn: async () => (await api.get(`/agents/${agentId}/labels`)).data.data as LabelInfo[] });
}

export function useLabelContacts(agentId: number) {
  return useMutation({ mutationFn: async (labelId: string) => (await api.get(`/agents/${agentId}/label-contacts`, { params: { label_id: labelId } })).data.data as ContactList });
}

// ---- Auto-reply (kata kunci) ----

export function useAutoReplies(agentId: number) {
  return useQuery<AutoReply[]>({
    queryKey: ['autoreplies', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/auto-replies`)).data.data,
    enabled: !!agentId,
  });
}

export function useSaveAutoReply(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<AutoReply>) =>
      r.id
        ? (await api.put(`/agents/${agentId}/auto-replies/${r.id}`, r)).data
        : (await api.post(`/agents/${agentId}/auto-replies`, r)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoreplies', agentId] }),
  });
}

export function useDeleteAutoReply(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rid: number) => (await api.delete(`/agents/${agentId}/auto-replies/${rid}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoreplies', agentId] }),
  });
}

// ---- Template pesan (quick reply) ----

export function useTemplates(agentId: number) {
  return useQuery<Template[]>({
    queryKey: ['templates', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/templates`)).data.data,
    enabled: !!agentId,
  });
}

export function useSaveTemplate(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<Template>) =>
      t.id
        ? (await api.put(`/agents/${agentId}/templates/${t.id}`, t)).data
        : (await api.post(`/agents/${agentId}/templates`, t)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', agentId] }),
  });
}

export function useDeleteTemplate(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tid: number) => (await api.delete(`/agents/${agentId}/templates/${tid}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates', agentId] }),
  });
}

// ---- Kontak (CRM ringan) ----

export function useCrmContacts(agentId: number, q: string, tag: string, page: number) {
  return useQuery<SavedContactsResp>({
    queryKey: ['crm-contacts', agentId, q, tag, page],
    queryFn: async () => (await api.get(`/agents/${agentId}/crm/contacts`, { params: { q, tag, page } })).data,
    enabled: !!agentId,
  });
}

export function useSaveCrmContact(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ct: Partial<SavedContact>) =>
      ct.id
        ? (await api.put(`/agents/${agentId}/crm/contacts/${ct.id}`, ct)).data
        : (await api.post(`/agents/${agentId}/crm/contacts`, ct)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-contacts', agentId] }),
  });
}

export function useDeleteCrmContact(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cid: number) => (await api.delete(`/agents/${agentId}/crm/contacts/${cid}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-contacts', agentId] }),
  });
}

// useCrmContactsExport mengambil SEMUA kontak hasil filter (tanpa paginasi),
// dipakai untuk menjadikan satu tag jadi target broadcast.
export function useCrmContactsExport(agentId: number) {
  return useMutation({
    mutationFn: async ({ q, tag }: { q: string; tag: string }) =>
      (await api.get(`/agents/${agentId}/crm/contacts`, { params: { q, tag, all: 1 } })).data.data as SavedContact[],
  });
}

// useImportCrmContacts memasukkan banyak kontak sekaligus (manual/terkoneksi/CSV).
export function useImportCrmContacts(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { contacts: { number: string; name: string }[]; tag?: string }) =>
      (await api.post(`/agents/${agentId}/crm/contacts/import`, body)).data as { imported: number; skipped: number },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-contacts', agentId] }),
  });
}

// useBulkDeleteCrmContacts menghapus kontak terpilih (ids) atau semua sesuai filter (all+q/tag).
export function useBulkDeleteCrmContacts(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ids?: number[]; all?: boolean; q?: string; tag?: string }) =>
      (await api.post(`/agents/${agentId}/crm/contacts/bulk-delete`, body)).data as { deleted: number },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-contacts', agentId] }),
  });
}

// ---- Follow-up (drip) ----

export function useFollowUps(agentId: number) {
  return useQuery<FollowUp[]>({
    queryKey: ['follow-ups', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/follow-ups`)).data.data,
    enabled: !!agentId,
  });
}

export function useSaveFollowUp(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fu: Partial<FollowUp>) =>
      fu.id
        ? (await api.put(`/agents/${agentId}/follow-ups/${fu.id}`, fu)).data
        : (await api.post(`/agents/${agentId}/follow-ups`, fu)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-ups', agentId] }),
  });
}

export function useDeleteFollowUp(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fid: number) => (await api.delete(`/agents/${agentId}/follow-ups/${fid}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-ups', agentId] }),
  });
}

export function useEnrollFollowUp(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fid, recipients }: { fid: number; recipients: { number: string; name: string }[] }) =>
      (await api.post(`/agents/${agentId}/follow-ups/${fid}/enroll`, { recipients })).data as { added: number; skipped: number },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-ups', agentId] }),
  });
}

// ---- Jadwal ----

export function useSchedules(agentId: number) {
  return useQuery<ScheduledMessage[]>({
    queryKey: ['schedules', agentId],
    queryFn: async () => (await api.get(`/agents/${agentId}/schedules`)).data.data,
    enabled: !!agentId,
    refetchInterval: 10000,
  });
}

export function useCreateSchedule(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fd: FormData) => (await api.post(`/agents/${agentId}/schedule`, fd)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules', agentId] });
      qc.invalidateQueries({ queryKey: ['broadcast-consent-summary', agentId] });
    },
  });
}

export function useCancelSchedule(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sid: number) => (await api.delete(`/agents/${agentId}/schedule/${sid}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', agentId] }),
  });
}

export function useBroadcastDetail(agentId: number, bid: number | null) {
  return useQuery<{ broadcast: Broadcast; recipients: BroadcastRecipient[] }>({
    queryKey: ['broadcast', agentId, bid],
    queryFn: async () => (await api.get(`/agents/${agentId}/broadcasts/${bid}`)).data.data,
    enabled: !!agentId && !!bid,
    refetchInterval: 4000,
  });
}

export function useCreateBroadcast(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { message: string; recipients: { number: string; name: string }[]; min_delay: number; max_delay: number; rest_every: number; rest_duration: number; file: File | null; safety: BroadcastSafetyForm }) => {
      const fd = new FormData();
      fd.append('message', body.message);
      fd.append('recipients', JSON.stringify(body.recipients));
      fd.append('min_delay', String(body.min_delay));
      fd.append('max_delay', String(body.max_delay));
      fd.append('rest_every', String(body.rest_every));
      fd.append('rest_duration', String(body.rest_duration));
      Object.entries(body.safety).forEach(([key, value]) => fd.append(key, String(value)));
      if (body.file) fd.append('file', body.file);
      return (await api.post(`/agents/${agentId}/broadcast`, fd)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['broadcasts', agentId] });
      qc.invalidateQueries({ queryKey: ['broadcast-consent-summary', agentId] });
    },
  });
}

export function useCancelBroadcast(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bid: number) =>
      (await api.post(`/agents/${agentId}/broadcasts/${bid}/cancel`)).data,
    onSuccess: (_data, bid) => {
      qc.invalidateQueries({ queryKey: ['broadcasts', agentId] });
      qc.invalidateQueries({ queryKey: ['broadcast', agentId, bid] });
    },
  });
}

export function useResumeBroadcast(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bid: number) =>
      (await api.post(`/agents/${agentId}/broadcasts/${bid}/resume`)).data,
    onSuccess: (_data, bid) => {
      qc.invalidateQueries({ queryKey: ['broadcasts', agentId] });
      qc.invalidateQueries({ queryKey: ['broadcast', agentId, bid] });
      qc.invalidateQueries({ queryKey: ['schedules', agentId] });
    },
  });
}

// ---- Agent list & detail (Dashboard) ----

export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => (await api.get('/agents')).data.data,
    staleTime: 30_000,
  });
}

export function useAgentStatuses() {
  return useQuery<Record<string, string>>({
    queryKey: ['agent-statuses'],
    queryFn: async () => (await api.get('/agents-status')).data.data,
    refetchInterval: 4000,
  });
}

export function useAgentStatus(agentId: number) {
  return useQuery<{ status: string; qr: string; qr_ttl: number; number: string; name: string }>({
    queryKey: ['agent', agentId, 'status'],
    queryFn: async () => (await api.get(`/agents/${agentId}/wa/status`)).data,
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

export function useAgentHistory(agentId: number) {
  return useQuery<unknown[]>({
    queryKey: ['agent', agentId, 'history'],
    queryFn: async () => (await api.get(`/agents/${agentId}/chat-history`)).data.data,
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

export function useAgentKnowledge(agentId: number) {
  return useQuery<KnowledgeItem[]>({
    queryKey: ['agent', agentId, 'knowledge'],
    queryFn: async () => (await api.get(`/agents/${agentId}/knowledge`)).data.data,
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

export function useAgentHandoffs(agentId: number) {
  return useQuery<Handoff[]>({
    queryKey: ['agent', agentId, 'handoffs'],
    queryFn: async () => (await api.get(`/agents/${agentId}/handoffs`)).data.data,
    enabled: !!agentId,
    refetchInterval: 4000,
  });
}

// ---- Mutasi agent (Dashboard) ----

export function useSaveAgent(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.put(`/agents/${agentId}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; tone: string }) =>
      (await api.post('/agents', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/agents/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useAgentConnect(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/agents/${agentId}/wa/connect`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'status'] }),
  });
}

export function useAgentDisconnect(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/agents/${agentId}/wa/logout`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'status'] }),
  });
}

export function useAddKnowledge(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { question: string; answer: string; tags: string }) =>
      (await api.post(`/agents/${agentId}/knowledge`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge'] }),
  });
}

export function useDeleteKnowledge(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/agents/${agentId}/knowledge/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge'] }),
  });
}

export function useDeleteAllKnowledge(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.delete(`/agents/${agentId}/knowledge-all`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge'] }),
  });
}

export function useGenerateKnowledge(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { text: string; count: number; biz_type?: string }) =>
      (await api.post(`/agents/${agentId}/knowledge/generate`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge'] }),
  });
}

// ---- Latih dari Website (crawl) ----

export function useCrawlStatus(agentId: number) {
  return useQuery<{ job: CrawlJob | null; pages: CrawlPage[] }>({
    queryKey: ['agent', agentId, 'crawl'],
    queryFn: async () => (await api.get(`/agents/${agentId}/crawl`)).data,
    enabled: !!agentId,
    // Polling cepat selagi crawl/pelatihan berjalan (termasuk saat dihentikan), berhenti saat idle/selesai.
    refetchInterval: (q) => {
      const s = q.state.data?.job?.status;
      return s === 'pending' || s === 'crawling' || s === 'training' || s === 'stopping' ? 2500 : false;
    },
  });
}

export function useKnowledgeUsage(agentId: number) {
  return useQuery<KnowledgeUsage>({
    queryKey: ['agent', agentId, 'knowledge-usage'],
    queryFn: async () => (await api.get(`/agents/${agentId}/knowledge-usage`)).data,
    enabled: !!agentId,
  });
}

export function useStartCrawl(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => (await api.post(`/agents/${agentId}/crawl`, { url })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'crawl'] }),
  });
}

export function useTrainCrawlPages(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { jobId: number; pageIds: number[] }) =>
      (await api.post(`/agents/${agentId}/crawl/${vars.jobId}/train`, { page_ids: vars.pageIds })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', agentId, 'crawl'] });
      qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge'] });
      qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge-usage'] });
    },
  });
}

export function useStopTraining(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: number) =>
      (await api.post(`/agents/${agentId}/crawl/${jobId}/train/stop`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', agentId, 'crawl'] }),
  });
}

export function useDeleteWebKnowledge(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.delete(`/agents/${agentId}/knowledge-web`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge'] });
      qc.invalidateQueries({ queryKey: ['agent', agentId, 'knowledge-usage'] });
    },
  });
}

export function useRegeneratePersona(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post(`/agents/${agentId}/persona/regenerate`)).data as { system_prompt: string },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useResumeHandoff(agentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sender: string) => (await api.delete(`/agents/${agentId}/handoffs/${sender}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', agentId, 'handoffs'] });
      qc.invalidateQueries({ queryKey: ['conversation', agentId] });
      qc.invalidateQueries({ queryKey: ['contacts', agentId] });
    },
  });
}

export interface ClosingPreview {
  detected: boolean;
  complete: boolean;
  confidence: number;
  missing: string[];
  data: Record<string, unknown>;
  sheet_configured: boolean;
}

export function useTestChat(agentId: number) {
  return useMutation({
    mutationFn: async (vars: { message: string; history: { role: 'user' | 'bot'; text: string }[] }) =>
      (await api.post(`/agents/${agentId}/test-chat`, vars)).data as {
        reply: string; escalate: boolean; model?: string; closing?: ClosingPreview;
      },
  });
}
