import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Chip, CircularProgress, TextField,
  Stack, IconButton, Paper, Grid, Select, MenuItem, FormControl, InputLabel, Divider,
  Switch, FormControlLabel, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions,
  Badge, Popover, Avatar, Alert, LinearProgress, ToggleButton, ToggleButtonGroup,
  Accordion, AccordionSummary, AccordionDetails, FormHelperText, Tooltip,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeIcon from '@mui/icons-material/QrCode';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/DashboardOutlined';
import InboxIcon from '@mui/icons-material/InboxOutlined';
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import KnowledgeIcon from '@mui/icons-material/MenuBookOutlined';
import CampaignIcon from '@mui/icons-material/CampaignOutlined';
import CalendarIcon from '@mui/icons-material/EventAvailableOutlined';
import RuleIcon from '@mui/icons-material/RuleOutlined';
import TemplateIcon from '@mui/icons-material/TextSnippetOutlined';
import FollowUpIcon from '@mui/icons-material/ScheduleSendOutlined';
import ShieldIcon from '@mui/icons-material/ShieldOutlined';
import ContactsIcon from '@mui/icons-material/ContactsOutlined';
import CreditCardIcon from '@mui/icons-material/CreditCardOutlined';
import PersonIcon from '@mui/icons-material/Person';
import { QRCodeSVG } from 'qrcode.react';
import logo from '../assets/logo-chatloop-1.png';
import api from '../services/api';
import { swalConfirm, swalPrompt, swalAlert, swalToast } from '../services/swal';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToyOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsightsIcon from '@mui/icons-material/InsightsOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ShippingIcon from '@mui/icons-material/LocalShippingOutlined';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import LanguageIcon from '@mui/icons-material/LanguageOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import InboxPanel from '../components/InboxPanel';
import TestChatPanel from '../components/TestChatPanel';
import BroadcastPanel from '../components/BroadcastPanel';
import CalendarPanel from '../components/CalendarPanel';
import AutoReplyPanel from '../components/AutoReplyPanel';
import TemplatePanel from '../components/TemplatePanel';
import ContactsPanel from '../components/ContactsPanel';
import FollowUpPanel from '../components/FollowUpPanel';
import GroupGuardPanel from '../components/GroupGuardPanel';
import PageHeader from '../components/PageHeader';
import {
  useAgents, useAgentStatuses, useAgentStatus, useAgentKnowledge,
  useCreateAgent, useDeleteAgent, useSaveAgent, useAgentConnect, useAgentDisconnect,
  useAddKnowledge, useDeleteKnowledge, useDeleteAllKnowledge, useGenerateKnowledge,
  useAgentHandoffs, useResumeHandoff, useAgentAIMetrics,
  useUsage,
  useCrawlStatus, useKnowledgeUsage, useStartCrawl, useTrainCrawlPages, useDeleteWebKnowledge,
  useRegeneratePersona, useStopTraining,
} from '../hooks';
import BillingPanel from '../components/BillingPanel';
import type { Agent } from '../types';

type AgentSettingsDraft = {
  name: string;
  system_prompt: string;
  tone: string;
  greeting_enabled: boolean;
  greeting_message: string;
  business_hours_enabled: boolean;
  business_start: string;
  business_end: string;
  away_message: string;
  spreadsheet_url: string;
  spreadsheet_sheet_name: string;
  sheet_sync_enabled: boolean;
};

function settingsFromAgent(agent: Agent): AgentSettingsDraft {
  return {
    name: agent.name || '',
    system_prompt: agent.system_prompt || '',
    tone: agent.tone || 'ramah',
    greeting_enabled: !!agent.greeting_enabled,
    greeting_message: agent.greeting_message || '',
    business_hours_enabled: !!agent.business_hours_enabled,
    business_start: agent.business_start || '08:00',
    business_end: agent.business_end || '21:00',
    away_message: agent.away_message || '',
    spreadsheet_url: agent.spreadsheet_url || '',
    spreadsheet_sheet_name: agent.spreadsheet_sheet_name || 'Leads',
    sheet_sync_enabled: !!agent.sheet_sync_enabled,
  };
}

function settingsKey(settings: AgentSettingsDraft) {
  return JSON.stringify(settings);
}

const TONES = [
  { value: 'ramah', label: '😊 Ramah' },
  { value: 'formal', label: '👔 Formal' },
  { value: 'santai', label: '🏖️ Santai' },
  { value: 'persuasif', label: '💪 Persuasif' },
  { value: 'custom', label: '✏️ Ikuti Persona' },
];

const NAV_GROUPS = [
  { section: '', items: [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon fontSize="small" /> },
  ] },
  { section: 'Percakapan', items: [
    { id: 'inbox', label: 'Inbox', icon: <InboxIcon fontSize="small" /> },
    { id: 'kontak', label: 'Kontak', icon: <ContactsIcon fontSize="small" /> },
    { id: 'handoff', label: 'Butuh CS', icon: <SupportAgentIcon fontSize="small" /> },
  ] },
  { section: 'AI & Otomasi', items: [
    { id: 'auto-reply', label: 'Auto-Reply', icon: <RuleIcon fontSize="small" /> },
    { id: 'template', label: 'Template', icon: <TemplateIcon fontSize="small" /> },
    { id: 'coba-chat', label: 'Coba Chat AI', icon: <ChatIcon fontSize="small" /> },
  ] },
  { section: 'Grup', items: [
    { id: 'grup', label: 'Penjaga Grup', icon: <ShieldIcon fontSize="small" /> },
  ] },
  { section: 'Kampanye', items: [
    { id: 'broadcast', label: 'Broadcast', icon: <CampaignIcon fontSize="small" /> },
    { id: 'kalender', label: 'Jadwal', icon: <CalendarIcon fontSize="small" /> },
    { id: 'follow-up', label: 'Follow-up', icon: <FollowUpIcon fontSize="small" /> },
  ] },
  { section: 'Akun', items: [
    { id: 'settings', label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
    
  ] },
];
const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

export default function Dashboard() {
  const [tab, setTab] = useState(() => {
    const saved = localStorage.getItem('wai_tab');
    const valid = !!saved && (NAV_ITEMS.some(n => n.id === saved) || saved === 'knowledge');
    return valid ? saved : 'dashboard';
  });
  // seed = data yang dioper antar-tab (mis. dari Kontak ke Broadcast/Inbox). n = pemicu agar efek jalan ulang.
  const [seed, setSeed] = useState<{ kind: 'broadcast' | 'inbox'; value: string; n: number } | null>(null);
  const [agentId, setAgentId] = useState<number>(() => Number(localStorage.getItem('wai_agent')) || 0);
  const [agentName, setAgentName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('ramah');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showGuardModal, setShowGuardModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [guardMissing, setGuardMissing] = useState<string[]>([]);
  const [settingsBaseline, setSettingsBaseline] = useState<string | null>(null);
  const [greetEnabled, setGreetEnabled] = useState(false);
  const [greetMsg, setGreetMsg] = useState('');
  const [bhEnabled, setBhEnabled] = useState(false);
  const [bhStart, setBhStart] = useState('08:00');
  const [bhEnd, setBhEnd] = useState('21:00');
  const [awayMsg, setAwayMsg] = useState('');
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [newTags, setNewTags] = useState('');
  const [genText, setGenText] = useState('');
  const [genCount, setGenCount] = useState(10);
  const [bizType, setBizType] = useState('produk_fisik');
  const [knowledgePage, setKnowledgePage] = useState(0);
  const [knowledgeSource, setKnowledgeSource] = useState<'web' | 'text' | 'manual'>('web');
  const [knowledgeErrors, setKnowledgeErrors] = useState<Record<string, string>>({});
  const KNOWLEDGE_PER_PAGE = 10;
  const [settingsErrors, setSettingsErrors] = useState<Record<string, string>>({});
  // Google Sheets integration
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetName, setSheetName] = useState('Leads');
  const [sheetSync, setSheetSync] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(false);
  const currentSettings = useMemo<AgentSettingsDraft>(() => ({
    name: agentName,
    system_prompt: prompt,
    tone,
    greeting_enabled: greetEnabled,
    greeting_message: greetMsg,
    business_hours_enabled: bhEnabled,
    business_start: bhStart,
    business_end: bhEnd,
    away_message: awayMsg,
    spreadsheet_url: sheetUrl,
    spreadsheet_sheet_name: sheetName,
    sheet_sync_enabled: sheetSync,
  }), [agentName, prompt, tone, greetEnabled, greetMsg, bhEnabled, bhStart, bhEnd, awayMsg, sheetUrl, sheetName, sheetSync]);
  const hasUnsavedSettings = settingsBaseline !== null && settingsKey(currentSettings) !== settingsBaseline;
  // Setup Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBiz, setWizardBiz] = useState({ biz_name: '', biz_type: 'produk_fisik', products: '', price_range: '', order_flow: '', shipping: '', hours: '08:00-21:00', cs_name: '' });
  const [wizardLoading, setWizardLoading] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}') as { name?: string; username?: string; email?: string; role?: string; phone?: string };
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [profileName, setProfileName] = useState(user.name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [exampleModalOpen, setExampleModalOpen] = useState(false);
  const [exampleMode, setExampleMode] = useState<'prompt' | 'profile'>('prompt');
  const [dashboardMetricView, setDashboardMetricView] = useState<'utama' | 'ai' | 'operasional'>('utama');

  // ---- TanStack Query: data fetching + auto-polling, tanpa useEffect/setInterval manual ----

  const { data: agents = [], refetch: refetchAgents } = useAgents();
  const { data: statusMap = {} } = useAgentStatuses();
  const { data: statusData } = useAgentStatus(agentId);
  const { data: knowledge = [], refetch: refetchKnowledge } = useAgentKnowledge(agentId);
  const { data: handoffs = [] } = useAgentHandoffs(agentId);
  const resumeHandoff = useResumeHandoff(agentId);
  const { data: usage } = useUsage();
  const { data: aiMetrics, isLoading: aiMetricsLoading } = useAgentAIMetrics(agentId);

  const status = statusData?.status || '';
  const qr = statusData?.qr || '';
  const qrTtl = statusData?.qr_ttl || 0;
  const waNumber = statusData?.number || '';
  const waName = statusData?.name || '';

  // ---- Mutations (TanStack Query) ----

  const connectMut = useAgentConnect(agentId);
  const disconnectMut = useAgentDisconnect(agentId);
  const saveAgentMut = useSaveAgent(agentId);
  const createAgentMut = useCreateAgent();
  const deleteAgentMut = useDeleteAgent();
  const addKnowledgeMut = useAddKnowledge(agentId);
  const deleteKnowledgeMut = useDeleteKnowledge(agentId);
  const deleteAllKnowledgeMut = useDeleteAllKnowledge(agentId);
  const generateKnowledgeMut = useGenerateKnowledge(agentId);

  // ---- Latih dari Website (crawl) ----
  const { data: crawlData } = useCrawlStatus(agentId);
  const { data: kbUsage } = useKnowledgeUsage(agentId);
  const startCrawlMut = useStartCrawl(agentId);
  const trainCrawlMut = useTrainCrawlPages(agentId);
  const deleteWebMut = useDeleteWebKnowledge(agentId);
  const regenPersonaMut = useRegeneratePersona(agentId);
  const stopTrainMut = useStopTraining(agentId);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const crawlJob = crawlData?.job ?? null;
  const crawlPages = crawlData?.pages ?? [];
  const isTraining = crawlJob?.status === 'training' || crawlJob?.status === 'stopping';
  const trainedCount = crawlPages.filter(p => p.status === 'trained').length;
  const skippedCount = crawlPages.filter(p => p.status === 'skipped').length;
  const failedTrainCount = crawlPages.filter(p => p.status === 'failed' && p.char_count > 0).length;
  // Pelatihan selesai bila job idle tapi sudah ada halaman yang diproses (dilatih/dilewati/gagal).
  const trainingDone = !isTraining && (trainedCount > 0 || skippedCount > 0);

  // Popup "Pelatihan selesai" saat status job berubah dari proses-latih -> selesai (biar kebaca dulu).
  const prevTrainStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = crawlJob?.status;
    const prev = prevTrainStatus.current;
    prevTrainStatus.current = s;
    if ((prev === 'training' || prev === 'stopping') && (s === 'done' || s === 'failed')) {
      const detail = `${trainedCount} halaman dilatih`
        + (skippedCount ? `, ${skippedCount} dilewati (AI menilai cuma navigasi/tanpa info pelanggan)` : '')
        + (failedTrainCount ? `, ${failedTrainCount} gagal` : '')
        + '. FAQ tersimpan di daftar Knowledge di bawah.';
      swalAlert('Pelatihan selesai', trainedCount > 0 ? 'success' : 'warning', detail);
    }
  }, [crawlJob?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pilih halaman rekomendasi sekali tiap kali crawl baru selesai (biar user tinggal klik "Latih").
  const autoPickedJob = useRef<number | null>(null);
  useEffect(() => {
    if (!crawlJob || crawlJob.status !== 'done') return;
    if (autoPickedJob.current === crawlJob.id) return;
    const recommended = crawlPages.filter(p => p.recommended && p.status === 'crawled').map(p => p.id);
    if (recommended.length > 0) setSelectedPages(recommended);
    autoPickedJob.current = crawlJob.id;
  }, [crawlJob, crawlPages]);

  const startCrawl = async () => {
    const u = crawlUrl.trim();
    if (!u) return;
    try {
      await startCrawlMut.mutateAsync(u);
      setSelectedPages([]);
      swalToast('Crawl dimulai, tunggu hasilnya…', 'success');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal memulai crawl';
      swalToast(msg, 'error');
    }
  };

  const trainSelected = async () => {
    if (!crawlJob || selectedPages.length === 0) return;
    try {
      await trainCrawlMut.mutateAsync({ jobId: crawlJob.id, pageIds: selectedPages });
      setSelectedPages([]);
      swalToast('Pelatihan dimulai. AI sedang merangkum halaman jadi FAQ…', 'success');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal memulai pelatihan';
      swalToast(msg, 'error');
    }
  };

  const stopTraining = async () => {
    if (!crawlJob) return;
    try {
      await stopTrainMut.mutateAsync(crawlJob.id);
      swalToast('Menghentikan pelatihan… halaman yang sudah jadi tetap tersimpan', 'success');
    } catch {
      swalToast('Gagal menghentikan pelatihan', 'error');
    }
  };

  const regeneratePersona = async () => {
    if (!await swalConfirm('Susun ulang persona dari website?', 'Persona saat ini akan diganti berdasarkan konten website terakhir yang sudah dilatih.')) return;
    try {
      await regenPersonaMut.mutateAsync();
      swalToast('Persona berhasil diperbarui dari website', 'success');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal membuat persona';
      swalToast(msg, 'error');
    }
  };

  const runSetupWizard = async () => {
    if (knowledge.length > 0) {
      const confirmed = await swalConfirm(
        'Ganti knowledge dengan hasil Setup Cepat?',
        `${knowledge.length} FAQ yang tersimpan akan dihapus dan diganti dengan hasil baru.`,
      );
      if (!confirmed) return;
    }

    setWizardLoading(true);
    try {
      const res = await api.post(`/agents/${agentId}/setup-wizard`, wizardBiz);
      setPrompt(res.data.system_prompt || '');
      await Promise.all([refetchAgents(), refetchKnowledge()]);
      setWizardOpen(false);
      swalToast(`Setup selesai. ${res.data.knowledge} FAQ dibuat.`, 'success');
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Setup belum berhasil';
      swalToast(msg, 'error');
    } finally {
      setWizardLoading(false);
    }
  };

  // ---- QR modal (sambung WhatsApp) ----
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrSeconds, setQrSeconds] = useState(0); // disinkron dari qr_ttl server (durasi asli whatsmeow)
  const [riskAck, setRiskAck] = useState(true); // disclaimer risiko banned, default tercentang
  const [qrError, setQrError] = useState('');

  // ---- Pilih CS pertama secara otomatis jika belum ada ----

  useEffect(() => {
    if (agents.length && !agents.some(a => a.id === agentId)) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  // ---- Isi field persona saat ganti CS ----

  useEffect(() => {
    if (!agentId) return;
    setKnowledgePage(0);
    const a = agents.find(x => x.id === agentId);
    if (a) {
      const settings = settingsFromAgent(a);
      setAgentName(settings.name); setPrompt(settings.system_prompt); setTone(settings.tone);
      setAiEnabled(a.ai_enabled !== false);
      setGreetEnabled(settings.greeting_enabled); setGreetMsg(settings.greeting_message);
      setBhEnabled(settings.business_hours_enabled); setBhStart(settings.business_start);
      setBhEnd(settings.business_end); setAwayMsg(settings.away_message);
      setSheetUrl(settings.spreadsheet_url); setSheetName(settings.spreadsheet_sheet_name);
      setSheetSync(settings.sheet_sync_enabled);
      setSettingsBaseline(settingsKey(settings));
    }
  }, [agentId, agents]);

  // ---- Simpan tab & CS ke localStorage ----

  useEffect(() => { localStorage.setItem('wai_tab', tab); }, [tab]);
  useEffect(() => { if (agentId) localStorage.setItem('wai_agent', String(agentId)); }, [agentId]);

  // ---- QR: auto-tutup saat tersambung, dan hitung mundur masa berlaku QR ----
  useEffect(() => {
    if (qrModalOpen && status === 'connected') {
      const t = setTimeout(() => setQrModalOpen(false), 1400); // tampilkan sukses sejenak lalu tutup
      return () => clearTimeout(t);
    }
  }, [qrModalOpen, status]);

  useEffect(() => { if (qrTtl > 0) setQrSeconds(qrTtl); }, [qrTtl]); // sinkron dari server tiap polling (durasi asli kode)

  useEffect(() => {
    if (!qrModalOpen || !qr) return;
    const t = setInterval(() => setQrSeconds(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [qrModalOpen, qr]);

  // ---- Handlers ----

  const connect = () => {
    setQrError('');
    setQrModalOpen(true);
    connectMut.mutateAsync().catch((err: any) => setQrError(err?.response?.data?.error || 'Gagal memulai koneksi. Coba lagi.'));
  };

  const disconnectWA = async () => {
    if (!await swalConfirm('Putuskan WhatsApp?', 'Perlu scan QR lagi untuk menyambung kembali.')) return;
    try { await disconnectMut.mutateAsync(); } catch { /* refresh status agar UI tetap sinkron */ }
  };

  const saveProfile = async () => {
    if (!profileName.trim()) return;
    setProfileSaving(true);
    try {
      const res = await api.put('/profile', { name: profileName.trim() });
      const updated = res.data.user;
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...updated }));
      swalToast('Profil disimpan');
      setProfileModalOpen(false);
    } catch {
      swalToast('Gagal menyimpan profil');
    } finally {
      setProfileSaving(false);
    }
  };

  const saveAgent = async () => {
    const e: Record<string, string> = {};
    if (!agentName.trim()) e.agentName = 'Nama CS wajib diisi';
    setSettingsErrors(e);
    if (Object.keys(e).length > 0) return;
    try {
      await saveAgentMut.mutateAsync(currentSettings);
      setSettingsBaseline(settingsKey(currentSettings));
      swalToast('Perubahan pengaturan disimpan');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (err as { message?: string })?.message
        || 'Pengaturan belum bisa disimpan';
      swalToast(message, 'error');
    }
  };

  const toggleAI = async (val: boolean) => {
    if (val) {
      const missing: string[] = [];
      if (!prompt.trim()) missing.push('System Prompt / Persona');
      if (!tone) missing.push('Tone / gaya bahasa');
      if (missing.length > 0) {
        setGuardMissing(missing);
        setShowGuardModal(true);
        return;
      }
    }
    setAiEnabled(val);
    try {
      await saveAgentMut.mutateAsync({ ai_enabled: val });
      swalToast(val ? 'Balasan AI diaktifkan' : 'Balasan AI dimatikan', 'success');
    } catch {
      setAiEnabled(!val);
      swalToast('Gagal mengubah status AI', 'error');
    }
  };

  const createAgent = async () => {
    const name = await swalPrompt('Nama CS baru', 'mis. Toko HP');
    if (!name) return;
    try {
      const r = await createAgentMut.mutateAsync({ name, tone: 'ramah' });
      setAgentId(r.data.id);
      setTab('dashboard');
    } catch (err: any) {
      if (err?.response?.status === 403) {
        swalToast('Kuota CS penuh, upgrade paket kamu dulu ya', 'warning'); return null;
      } else {
        await swalAlert(err?.response?.data?.error || 'Gagal menambah CS.', 'error');
      }
    }
  };

  const deleteAgent = async () => {
    if (agents.length <= 1) { await swalAlert('Minimal harus ada 1 CS.', 'warning'); return; }
    if (!await swalConfirm('Hapus CS ini?', 'Semua knowledge-nya juga akan terhapus.')) return;
    await deleteAgentMut.mutateAsync(agentId);
    setAgentId(0);
  };

  const addKnowledge = async () => {
    const e: Record<string, string> = {};
    if (!newQ.trim()) e.newQ = 'Pertanyaan wajib diisi';
    if (!newA.trim()) e.newA = 'Jawaban wajib diisi';
    setKnowledgeErrors(e);
    if (Object.keys(e).length > 0) return;
    await addKnowledgeMut.mutateAsync({ question: newQ, answer: newA, tags: newTags });
    setNewQ(''); setNewA(''); setNewTags(''); setKnowledgeErrors({});
  };

  const delKnowledge = async (id: number) => {
    if (!await swalConfirm('Hapus Q&A ini?')) return false;
    await deleteKnowledgeMut.mutateAsync(id);
    return true;
  };

  const generateKnowledge = async () => {
    const e: Record<string, string> = {};
    if (!genText.trim()) e.genText = 'Paste teks dulu untuk di-generate';
    setKnowledgeErrors(e);
    if (Object.keys(e).length > 0) return;
    try {
      await generateKnowledgeMut.mutateAsync({ text: genText, count: genCount, biz_type: bizType || undefined });
      setGenText('');
    } catch {
      swalToast('Gagal generate knowledge', 'error');
    }
  };

  const dotColor = (s?: string) => (s === 'connected' ? '#25D366' : s === 'qr' || s === 'connecting' ? '#ffa726' : '#bdbdbd');

  const logout = () => { localStorage.clear(); window.location.href = '/login'; };
  const sc = status === 'connected' ? 'success' : status === 'qr' || status === 'connecting' ? 'warning' : 'error';
  const sl = status === 'connected' ? 'Online' : status === 'connecting' ? 'Menyambung…' : status === 'qr' ? 'Scan QR' : 'Offline';
  const currentAgent = agents.find(a => a.id === agentId);
  const trendMax = Math.max(1, ...(aiMetrics?.trend || []).map(d => d.total));
  const totalIncoming = aiMetrics?.total_incoming ?? 0;
  const aiReplies = aiMetrics?.ai_replies ?? 0;
  const escalated = aiMetrics?.escalated ?? 0;
  const aiErrors = aiMetrics?.ai_errors ?? 0;
  const aiReplyRate = totalIncoming ? Math.round((aiReplies / totalIncoming) * 100) : 0;
  const usageRepliesMax = usage?.ai_replies_max || 0;
  const usageRepliesUsed = usage?.ai_replies_used || 0;
  const usageReplyPct = usageRepliesMax ? Math.min(100, Math.round((usageRepliesUsed / usageRepliesMax) * 100)) : 0;
  // Batas jumlah nomor/CS dari paket — dipakai untuk menonaktifkan tombol Tambah saat penuh.
  const maxNumbers = usage?.max_numbers ?? 0;
  const usedNumbers = usage?.numbers_used ?? agents.length;
  const atNumberLimit = maxNumbers > 0 && usedNumbers >= maxNumbers;
  const setupIssues = [
    (knowledge.length > 0 || prompt.trim() !== '') ? '' : 'Sebelum mengaktifkan Balasan AI, lakukan setup terlebih dahulu di Settings.',
  ].filter(Boolean);
  const dashboardStats = {
    utama: [
      { label: 'Chat masuk', value: totalIncoming, icon: <ChatIcon fontSize="small" />, tone: 'primary.main', hint: '7 hari terakhir' },
      { label: 'Dijawab AI', value: aiReplies, icon: <SmartToyIcon fontSize="small" />, tone: 'success.main', hint: `${aiReplyRate}% dari chat masuk` },
      { label: 'Butuh CS', value: escalated, icon: <SupportAgentIcon fontSize="small" />, tone: 'warning.main', hint: 'Perlu ditangani manual' },
      { label: 'AI error', value: aiErrors, icon: <ErrorIcon fontSize="small" />, tone: 'error.main', hint: 'Harus 0' },
    ],
    ai: [
      { label: 'Escalation rate', value: aiMetrics ? `${aiMetrics.escalation_rate.toFixed(1)}%` : '-', icon: <WarningIcon fontSize="small" />, tone: 'warning.main', hint: 'Makin kecil makin baik' },
      { label: 'Ongkir OK', value: aiMetrics?.tool_shipping_success ?? 0, icon: <ShippingIcon fontSize="small" />, tone: 'info.main', hint: 'Tool berhasil' },
      { label: 'Ongkir error', value: aiMetrics?.tool_shipping_error ?? 0, icon: <ErrorIcon fontSize="small" />, tone: 'error.main', hint: 'Cek integrasi' },
      { label: 'Closing detect', value: aiMetrics?.closing_detected ?? 0, icon: <ReceiptIcon fontSize="small" />, tone: 'primary.main', hint: `${aiMetrics?.closing_exported ?? 0} exported` },
    ],
    operasional: [
      { label: 'Nomor aktif', value: usage ? `${usage.numbers_used}/${usage.max_numbers}` : '-', icon: <QrCodeIcon fontSize="small" />, tone: status === 'connected' ? 'success.main' : 'text.secondary', hint: sl },
      { label: 'Kuota AI', value: usage ? `${usageReplyPct}%` : '-', icon: <InsightsIcon fontSize="small" />, tone: usageReplyPct > 85 ? 'warning.main' : 'success.main', hint: `${usageRepliesUsed}/${usageRepliesMax || '-'} reply` },
      { label: 'Knowledge', value: knowledge.length, icon: <KnowledgeIcon fontSize="small" />, tone: knowledge.length ? 'success.main' : 'warning.main', hint: knowledge.length ? 'Siap dipakai' : 'Perlu diisi' },
      { label: 'Handoff', value: handoffs.length, icon: <SupportAgentIcon fontSize="small" />, tone: handoffs.length ? 'warning.main' : 'success.main', hint: handoffs.length ? 'Ada antrean' : 'Bersih' },
    ],
  }[dashboardMetricView];

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: '100vh', height: { md: '100vh' }, overflow: { md: 'hidden' }, bgcolor: 'background.default' }}>
      <Paper
        component="aside"
        sx={{
          width: { xs: '100%', md: 224 },
          flexShrink: 0,
          borderRadius: 0,
          p: { xs: 1, md: 1.25 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          position: { xs: 'sticky', md: 'static' },
          top: 0,
          zIndex: 10,
          height: { md: '100vh' },
          overflowY: { md: 'auto' },
          borderRight: { md: '1px solid' },
          borderBottom: { xs: '1px solid', md: 0 },
          borderColor: 'divider',
        }}
      >
        <Stack direction={{ xs: 'row', md: 'column' }} spacing={1} sx={{ alignItems: { xs: 'center', md: 'stretch' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexShrink: 0 }}>
            <IconButton onClick={() => setSidebarOpen(!sidebarOpen)} sx={{ display: { xs: 'inline-flex', md: 'none' }, flexShrink: 0 }}><MenuIcon /></IconButton>
            <img src={logo} alt="ChatLoop" style={{ width: 40, height: 40, flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, display: { xs: 'none', sm: 'block' } }}>
              <Typography sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1 }}>ChatLoop</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: { xs: 'none', md: 'block' }, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                onClick={e => setProfileAnchor(e.currentTarget)}
              >
                {user.name || user.username}
              </Typography>
            </Box>
          </Box>

          <FormControl size="small" sx={{ width: { xs: 158, md: '100%' }, flexShrink: 0 }}>
            <InputLabel>Customer Service</InputLabel>
            <Select value={agents.length ? agentId : ''} label="Customer Service"
              onChange={e => setAgentId(Number(e.target.value))}>
              {agents.map(a => (
                <MenuItem key={a.id} value={a.id}>
                  <Box component="span" sx={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', bgcolor: dotColor(statusMap[a.id]), mr: 1 }} />
                  {a.name || `CS ${a.id}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title={atNumberLimit ? `Batas paket tercapai (${usedNumbers}/${maxNumbers} nomor). Upgrade paket untuk menambah CS.` : ''}>
            <Box sx={{ width: { xs: 'auto', md: '100%' }, flexShrink: 0 }}>
              <Button fullWidth variant="outlined" startIcon={<AddIcon />} onClick={createAgent} disabled={createAgentMut.isPending || atNumberLimit}>
                Tambah
              </Button>
            </Box>
          </Tooltip>
          <IconButton aria-label="Logout" onClick={logout} color="error" sx={{ display: { xs: 'inline-flex', md: 'none' }, ml: 'auto' }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Divider sx={{ display: { xs: 'none', md: 'block' } }} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            gap: 0.5,
            overflowX: { xs: 'auto', md: 'visible' },
            pb: { xs: 0.25, md: 0 },
            mx: { xs: -1, md: 0 },
            px: { xs: 1, md: 0 },
            scrollbarWidth: 'thin',
          }}
        >
          {NAV_GROUPS.map((group, gi) => (
            <Fragment key={group.section || 'main'}>
              {group.section && (
                <Typography
                  variant="caption"
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    px: 1.1, mt: gi === 0 ? 0 : 1.5, mb: 0.25,
                    fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'text.disabled', lineHeight: 1.6,
                  }}
                >
                  {group.section}
                </Typography>
              )}
              {group.items.map((item) => (
                <Button
                  key={item.id}
                  variant={tab === item.id ? 'contained' : 'text'}
                  startIcon={item.icon}
                  onClick={() => setTab(item.id)}
                  sx={{
                    justifyContent: { xs: 'center', md: 'flex-start' },
                    minWidth: { xs: 'max-content', md: '100%' },
                    height: 32,
                    px: 1.1,
                    color: tab === item.id ? 'primary.contrastText' : 'text.primary',
                    '& .MuiButton-startIcon': { mr: 0.75 },
                  }}
                >
                  {item.id === 'handoff' && handoffs.length > 0 ? (
                    <Badge badgeContent={handoffs.length} color="error" sx={{ mr: 1 }}>
                      {item.label}
                    </Badge>
                  ) : (
                    item.label
                  )}
                </Button>
              ))}
            </Fragment>
          ))}
        </Box>
        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
        {/* Indikator Langganan */}
        {usage && (
          <Paper
            variant="outlined"
            onClick={() => setBillingOpen(true)}
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center', gap: 1,
              p: 1, mx: 0.5, mb: 0.5,
              cursor: 'pointer',
              borderColor: 'divider',
              bgcolor: 'action.hover',
              '&:hover': { bgcolor: 'action.selected' },
            }}
          >
            <CreditCardIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', lineHeight: 1.3 }}>
                {usage.tenant?.plan?.name || 'Trial'}
              </Typography>
              {usage.tenant?.status === 'trial' && usage.tenant?.trial_ends_at && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
                  s/d {new Date(usage.tenant.trial_ends_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </Typography>
              )}
            </Box>
            <Chip
              label={usage.tenant?.status || 'trial'}
              size="small"
              color={usage.tenant?.status === 'active' ? 'success' : usage.tenant?.status === 'trial' ? 'warning' : 'default'}
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
            />
          </Paper>
        )}
        <Button startIcon={<PersonIcon />} onClick={() => setProfileModalOpen(true)} sx={{ display: { xs: 'none', md: 'inline-flex' }, justifyContent: 'flex-start', color: 'text.secondary' }}>
          Profil
        </Button>
        <Button startIcon={<LogoutIcon />} onClick={logout} color="error" sx={{ display: { xs: 'none', md: 'inline-flex' }, justifyContent: 'flex-start' }}>
          Logout
        </Button>
      </Paper>

      <Box component="main" sx={{ flex: 1, p: { xs: 1.25, md: 2 }, overflowY: 'auto', height: { md: '100vh' }, minHeight: 0, width: '100%', minWidth: 0 }}>
        {tab === 'dashboard' && (
          <Box>
            <PageHeader
              title={<>Dashboard {currentAgent && <Typography component="span" color="text.secondary" sx={{ fontWeight: 400 }}>· {currentAgent.name}</Typography>}</>}
              subtitle=""
              action={<Button size="small" variant="outlined" startIcon={<SettingsIcon />} onClick={() => setTab('settings')}>Atur CS</Button>}
            />

            <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
              <Grid size={12}>
                <Card>
                  <CardContent sx={{ pb: '12px !important' }}>
                    {/* Baris atas: status + aksi */}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', mb: 1.5 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                        <Chip size="small" label={sl} color={sc} sx={{ fontWeight: 700 }} />
                        <Chip size="small" label={aiEnabled ? 'AI aktif' : 'AI mati'} color={aiEnabled ? 'success' : 'default'} variant={aiEnabled ? 'filled' : 'outlined'} />
                        {usage?.tenant?.status && <Chip size="small" label={usage.tenant.status === 'trial' ? 'Trial' : usage.tenant.status} color={usage.tenant.status === 'active' ? 'success' : usage.tenant.status === 'trial' ? 'warning' : 'default'} variant="outlined" />}
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                        <Button variant={status === 'connected' ? 'outlined' : 'contained'} size="small" onClick={connect} disabled={connectMut.isPending}
                          startIcon={connectMut.isPending ? <CircularProgress size={14} /> : <QrCodeIcon />}>
                          {status === 'connected' ? 'Reconnect' : 'Connect WA'}
                        </Button>
                        {status === 'connected' && (
                          <Button variant="outlined" size="small" color="error" onClick={disconnectWA} disabled={disconnectMut.isPending}
                            startIcon={disconnectMut.isPending ? <CircularProgress size={14} /> : <LogoutIcon />}>
                            Putuskan
                          </Button>
                        )}
                      </Stack>
                    </Stack>

                    {/* Stat ringkas — 4 metrik */}
                    <Grid container spacing={1} sx={{ mb: 1.5 }}>
                      {[
                        { label: 'Status', value: sl, icon: <QrCodeIcon fontSize="small" />, color: dotColor(status) },
                        { label: 'Jumlah CS', value: agents.length, icon: <SupportAgentIcon fontSize="small" />, color: 'primary.main' },
                        { label: 'Kuota AI', value: `${usageRepliesUsed}/${usageRepliesMax || '-'}`, icon: <InsightsIcon fontSize="small" />, color: usageReplyPct > 85 ? 'warning.main' : 'success.main' },
                        { label: 'Nomor', value: `${usage?.numbers_used ?? 0}/${usage?.max_numbers ?? '-'}`, icon: <ContactsIcon fontSize="small" />, color: 'primary.main' },
                      ].map(item => (
                        <Grid key={item.label} size={{ xs: 6, sm: 3 }}>
                          <Paper variant="outlined" sx={{ p: 1, textAlign: 'center', borderRadius: 1 }}>
                            <Box sx={{ color: item.color, mb: 0.25 }}>{item.icon}</Box>
                            <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{item.value}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>{item.label}</Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>

                    {/* AI toggle + deskripsi */}
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {aiEnabled ? 'AI aktif membalas pelanggan' : 'AI mati - balasan manual oleh Customer Service'}
                        </Typography>
                        {status === 'connected' && waNumber && (
                          <Typography variant="caption" color="text.secondary">
                            +{waNumber}{waName ? ` · ${waName}` : ''}
                          </Typography>
                        )}
                      </Box>
                      <Switch checked={aiEnabled} onChange={e => toggleAI(e.target.checked)} color="success" disabled={!agentId || saveAgentMut.isPending} />
                    </Stack>

                    {setupIssues.length > 0 && (
                      <Alert severity="warning" icon={false} sx={{ mt: 1.5 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}>
                          <Typography variant="body2">{setupIssues[0]}</Typography>
                          <Button size="small" variant="contained" onClick={() => setTab('settings')} sx={{ flexShrink: 0 }}>Buka Settings</Button>
                        </Stack>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Card sx={{ mb: 1.5 }}>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, mb: 1.25 }}>
                  <Box>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <InsightsIcon fontSize="small" color="primary" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Statistik 7 Hari</Typography>
                      {aiMetricsLoading && <CircularProgress size={14} />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">Pilih tampilan sesuai yang sedang kamu cek.</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {[
                      { key: 'utama' as const, label: 'Utama' },
                      { key: 'ai' as const, label: 'AI' },
                      { key: 'operasional' as const, label: 'Operasional' },
                    ].map(item => (
                      <Chip key={item.key} label={item.label} clickable size="small"
                        color={dashboardMetricView === item.key ? 'primary' : 'default'}
                        variant={dashboardMetricView === item.key ? 'filled' : 'outlined'}
                        onClick={() => setDashboardMetricView(item.key)} />
                    ))}
                  </Stack>
                </Stack>

                <Grid container spacing={1}>
                  {dashboardStats.map(item => (
                    <Grid key={item.label} size={{ xs: 6, md: 3 }}>
                      <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1, height: '100%' }}>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                          <Box sx={{ color: item.tone, display: 'grid', placeItems: 'center' }}>{item.icon}</Box>
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>{item.label}</Typography>
                        </Stack>
                        <Typography sx={{ fontWeight: 900, color: item.tone, fontSize: { xs: 22, sm: 26 }, lineHeight: 1 }}>
                          {item.value}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{item.hint}</Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>

                {!!aiMetrics?.trend?.length && (
                  <Box sx={{ mt: 1.5 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-end', height: 70 }}>
                      {aiMetrics.trend.map(day => (
                        <Box key={day.date} sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ height: 46, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0.45 }}>
                            <Box title={`${day.total} chat masuk`} sx={{ width: 10, height: `${Math.max(6, (day.total / trendMax) * 46)}px`, bgcolor: 'primary.main', borderRadius: '4px 4px 0 0' }} />
                            <Box title={`${day.escalated} butuh CS`} sx={{ width: 8, height: `${Math.max(day.escalated ? 5 : 0, (day.escalated / trendMax) * 46)}px`, bgcolor: 'warning.main', borderRadius: '4px 4px 0 0' }} />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {new Date(day.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }}>
                      <Typography variant="caption" color="text.secondary"><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: 'primary.main', borderRadius: '50%', mr: 0.5 }} />Chat masuk</Typography>
                      <Typography variant="caption" color="text.secondary"><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: 'warning.main', borderRadius: '50%', mr: 0.5 }} />Butuh CS</Typography>
                    </Stack>
                  </Box>
                )}
              </CardContent>
            </Card>

{/* Aksi Cepat: hidden */}
          </Box>
        )}

        {tab === 'knowledge' && (
          <Box>
            <PageHeader
              title={<>Knowledge Base {currentAgent && <Typography component="span" color="text.secondary" sx={{ fontWeight: 400 }}>· {currentAgent.name}</Typography>}</>}
              subtitle="Tambahkan informasi bisnis yang boleh dipakai AI saat menjawab pelanggan. Pilih satu cara untuk memulai; sumber lain bisa ditambahkan kapan saja."
            />

            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.25 }}>Pilih sumber pengetahuan AI</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Informasi dari sumber ini akan dipakai AI untuk menjawab pelanggan. Kamu tidak perlu mengisi semuanya sekaligus.
              </Typography>
              <ToggleButtonGroup
                value={knowledgeSource}
                exclusive
                onChange={(_, value: 'web' | 'text' | 'manual' | null) => value && setKnowledgeSource(value)}
                size="small"
                aria-label="Sumber knowledge"
                sx={{ width: '100%', '& .MuiToggleButton-root': { flex: 1, gap: 0.75 } }}
              >
                <ToggleButton value="web"><LanguageIcon fontSize="small" sx={{ display: { xs: 'none', sm: 'block' } }} /> Website</ToggleButton>
                <ToggleButton value="text"><AutoAwesomeIcon fontSize="small" sx={{ display: { xs: 'none', sm: 'block' } }} /> Tulis Info</ToggleButton>
                <ToggleButton value="manual"><AddIcon fontSize="small" sx={{ display: { xs: 'none', sm: 'block' } }} /> FAQ Manual</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                {knowledgeSource === 'web' && 'Cocok jika informasi produk dan bisnis sudah lengkap di website.'}
                {knowledgeSource === 'text' && 'Cocok jika kamu punya deskripsi bisnis yang ingin diubah AI menjadi beberapa FAQ.'}
                {knowledgeSource === 'manual' && 'Cocok untuk menambahkan satu pertanyaan dan jawaban yang harus presisi.'}
              </Typography>
            </Paper>

            {/* Latih dari Website */}
            {knowledgeSource === 'web' && <Card sx={{ mb: 1.5 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 0.25 }}>🌐 Latih dari Website</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Masukkan alamat website bisnismu. Sistem menelusuri halaman-halamannya (tanpa biaya AI), lalu kamu pilih mana yang dijadikan pengetahuan AI nomor ini. Optimal untuk situs statis/WordPress; situs berbasis JavaScript berat mungkin terbaca sebagian.
                </Typography>

                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <TextField size="small" fullWidth placeholder="https://websitebisnismu.com" value={crawlUrl}
                    onChange={e => setCrawlUrl(e.target.value)}
                    disabled={crawlJob?.status === 'crawling' || crawlJob?.status === 'pending'} />
                  <Button variant="contained" size="small" onClick={startCrawl}
                    disabled={startCrawlMut.isPending || crawlJob?.status === 'crawling' || crawlJob?.status === 'pending'}
                    startIcon={(crawlJob?.status === 'crawling' || crawlJob?.status === 'pending') ? <CircularProgress size={14} /> : undefined}>
                    {(crawlJob?.status === 'crawling' || crawlJob?.status === 'pending') ? 'Menelusuri…' : 'Mulai'}
                  </Button>
                </Stack>

                {kbUsage && (
                  <Box sx={{ mb: 1 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Pemakaian knowledge</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {kbUsage.used_chars.toLocaleString()} / {kbUsage.max_chars.toLocaleString()} karakter · maks {kbUsage.max_pages} halaman/crawl
                      </Typography>
                    </Stack>
                    <LinearProgress variant="determinate"
                      value={Math.min(100, kbUsage.max_chars ? (kbUsage.used_chars / kbUsage.max_chars) * 100 : 0)}
                      sx={{ height: 6, borderRadius: 3, mt: 0.25 }} />
                  </Box>
                )}

                {crawlJob && (
                  <>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap' }}>
                      <Chip size="small"
                        label={crawlJob.status === 'crawling' || crawlJob.status === 'pending' ? 'Menelusuri…'
                          : crawlJob.status === 'training' ? 'Melatih AI…'
                          : crawlJob.status === 'stopping' ? 'Menghentikan…'
                          : crawlJob.status === 'failed' ? 'Gagal' : `Selesai · ${crawlJob.pages_found} halaman`}
                        color={crawlJob.status === 'failed' ? 'error' : crawlJob.status === 'done' ? 'success' : 'default'} />
                      {crawlJob.domain && <Typography variant="caption" color="text.secondary">{crawlJob.domain}</Typography>}
                      {crawlJob.error && <Typography variant="caption" color="error">{crawlJob.error}</Typography>}
                    </Stack>

                    {isTraining && (
                      <Box sx={{ mb: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.25, justifyContent: 'space-between' }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                            <CircularProgress size={14} />
                            <Typography variant="caption" color="text.secondary">
                              {crawlJob.status === 'stopping'
                                ? 'Menghentikan pelatihan…'
                                : `AI sedang merangkum halaman jadi FAQ (${trainedCount}/${crawlPages.length} halaman)…`}
                            </Typography>
                          </Stack>
                          <Button size="small" color="error" variant="outlined" sx={{ flexShrink: 0 }}
                            disabled={stopTrainMut.isPending || crawlJob.status === 'stopping'}
                            onClick={stopTraining}>
                            {crawlJob.status === 'stopping' ? 'Menghentikan…' : 'Stop'}
                          </Button>
                        </Stack>
                        <LinearProgress variant="determinate"
                          value={crawlPages.length ? (trainedCount / crawlPages.length) * 100 : 0}
                          sx={{ height: 6, borderRadius: 3 }} />
                      </Box>
                    )}

                    {trainingDone && (
                      <Alert severity={trainedCount > 0 ? 'success' : 'warning'} sx={{ mb: 1, py: 0.25, '& .MuiAlert-message': { py: 0.5 } }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                          Pelatihan selesai
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.5 }}>
                          ✅ {trainedCount} halaman dilatih
                          {skippedCount > 0 && ` · ⏭️ ${skippedCount} dilewati (tak ada info berguna)`}
                          {failedTrainCount > 0 && ` · ⚠️ ${failedTrainCount} gagal`}
                          {trainedCount > 0 && '. FAQ-nya tersimpan di daftar Knowledge di bawah ⬇️'}
                        </Typography>
                      </Alert>
                    )}

                    {crawlPages.length > 0 && (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Halaman <b>rekomendasi</b> sudah dipilih otomatis. Sesuaikan bila perlu, lalu klik Latih.
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5, flexWrap: 'wrap' }}>
                          <Button size="small" disabled={isTraining} onClick={() => {
                            const trainable = crawlPages.filter(p => p.status === 'crawled' && p.char_count > 0).map(p => p.id);
                            setSelectedPages(selectedPages.length === trainable.length ? [] : trainable);
                          }}>{selectedPages.length > 0 ? 'Batal pilih' : 'Pilih semua'}</Button>
                          <Button size="small" disabled={isTraining} onClick={() => {
                            setSelectedPages(crawlPages.filter(p => p.recommended && p.status === 'crawled').map(p => p.id));
                          }}>Pilih rekomendasi</Button>
                          <Button size="small" variant="contained" disabled={selectedPages.length === 0 || trainCrawlMut.isPending || isTraining}
                            onClick={trainSelected}
                            startIcon={trainCrawlMut.isPending ? <CircularProgress size={14} /> : <AddIcon />}>
                            Latih {selectedPages.length > 0 ? `(${selectedPages.length})` : ''}
                          </Button>
                        </Stack>
                        <Paper variant="outlined" sx={{ maxHeight: 280, overflow: 'auto' }}>
                          {crawlPages.map((p, i) => {
                            const trainable = p.status === 'crawled' && p.char_count > 0;
                            const thin = trainable && !p.recommended;
                            const rowBg =
                              p.status === 'trained' ? 'rgba(46,125,50,0.12)'
                              : p.status === 'training' ? 'rgba(2,136,209,0.12)'
                              : p.status === 'skipped' ? 'rgba(0,0,0,0.05)'
                              : p.status === 'failed' ? 'rgba(211,47,47,0.10)'
                              : 'transparent';
                            return (
                              <Box key={p.id} sx={{ display: 'flex', gap: 0.5, px: 1, py: 0.5, borderBottom: i < crawlPages.length - 1 ? '1px solid' : 0, borderColor: 'divider', alignItems: 'center', opacity: thin ? 0.7 : 1, bgcolor: rowBg }}>
                                <Checkbox size="small" sx={{ p: 0.25 }} disabled={!trainable || isTraining}
                                  checked={selectedPages.includes(p.id)}
                                  onChange={e => setSelectedPages(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))} />
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.3, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || p.url}</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.url}</Typography>
                                </Box>
                                {p.recommended && p.status === 'crawled' && (
                                  <Chip size="small" label="Rekomendasi" color="primary"
                                    sx={{ fontSize: '0.6rem', height: 18, flexShrink: 0 }} />
                                )}
                                {thin && (
                                  <Chip size="small" variant="outlined" label="Konten tipis"
                                    sx={{ fontSize: '0.6rem', height: 18, flexShrink: 0 }} />
                                )}
                                <Chip size="small" variant="outlined"
                                  label={
                                    p.status === 'trained' ? 'Dilatih ✓'
                                    : p.status === 'training' ? 'Melatih…'
                                    : p.status === 'skipped' ? 'Dilewati'
                                    : p.status === 'failed' ? 'Gagal'
                                    : `${p.char_count.toLocaleString()} krkt`}
                                  color={p.status === 'trained' ? 'success' : p.status === 'failed' ? 'error' : 'default'}
                                  sx={{ fontSize: '0.6rem', height: 18, flexShrink: 0 }} />
                              </Box>
                            );
                          })}
                        </Paper>
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 0.5, flexWrap: 'wrap' }}>
                          <Button size="small" color="error" disabled={deleteWebMut.isPending || isTraining} onClick={async () => {
                            if (!await swalConfirm('Hapus semua knowledge dari website?', 'Knowledge hasil crawl web akan dihapus (Q&A manual tetap aman).')) return;
                            try { await deleteWebMut.mutateAsync(); swalToast('Knowledge web dihapus', 'success'); } catch { swalToast('Gagal', 'error'); }
                          }}>Hapus knowledge web</Button>
                        </Stack>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>}

            {knowledgeSource === 'text' && (
              <Card sx={{ mb: 1.5 }}>
                <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Ubah deskripsi menjadi FAQ</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                      Tempel informasi produk atau layanan. AI akan merangkumnya menjadi beberapa pertanyaan dan jawaban.
                    </Typography>

                    <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                      <InputLabel>Jenis Bisnis</InputLabel>
                      <Select value={bizType} label="Jenis Bisnis" onChange={e => setBizType(e.target.value)}>
                        <MenuItem value="">✨ Umum (semua jenis)</MenuItem>
                        <MenuItem value="produk_fisik">📦 Produk Fisik</MenuItem>
                        <MenuItem value="produk_digital">💻 Produk Digital</MenuItem>
                        <MenuItem value="jasa">🔧 Jasa / Layanan</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField multiline rows={4} fullWidth size="small" value={genText}
                      onChange={e => setGenText(e.target.value)}
                      placeholder="Tulis info tentang produk/layanan kamu..."
                      sx={{ mb: 1 }} />

                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <TextField type="number" size="small" label="Jumlah FAQ" value={genCount}
                        onChange={e => setGenCount(Number(e.target.value))} sx={{ width: 90 }} />
                      <Button variant="contained" size="small" onClick={generateKnowledge} disabled={generateKnowledgeMut.isPending}
                        startIcon={generateKnowledgeMut.isPending ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}>
                        Generate
                      </Button>
                    </Stack>
                </CardContent>
              </Card>
            )}

            {knowledgeSource === 'manual' && (
              <Card sx={{ mb: 1.5 }}>
                <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 0.25 }}>Tambah satu FAQ</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                      Gunakan cara ini untuk informasi yang jawabannya harus ditulis secara presisi.
                    </Typography>
                    <Stack spacing={0.75}>
                      <TextField size="small" label="Pertanyaan" value={newQ}
                        onChange={e => { setNewQ(e.target.value); if (knowledgeErrors.newQ) setKnowledgeErrors(p => ({...p, newQ: ''})); }}
                        error={!!knowledgeErrors.newQ} helperText={knowledgeErrors.newQ} />
                      <TextField size="small" label="Jawaban" multiline rows={2} value={newA}
                        onChange={e => { setNewA(e.target.value); if (knowledgeErrors.newA) setKnowledgeErrors(p => ({...p, newA: ''})); }}
                        error={!!knowledgeErrors.newA} helperText={knowledgeErrors.newA} />
                      <TextField size="small" label="Tags (koma)" value={newTags} onChange={e => setNewTags(e.target.value)} />
                      <Button size="small" startIcon={<AddIcon />} variant="contained" onClick={addKnowledge} disabled={addKnowledgeMut.isPending}>Tambah</Button>
                    </Stack>
                </CardContent>
              </Card>
            )}

            {(() => {
              const totalPages = Math.ceil(knowledge.length / KNOWLEDGE_PER_PAGE);
              const safePage = Math.min(knowledgePage, Math.max(0, totalPages - 1));
              const start = safePage * KNOWLEDGE_PER_PAGE;
              const pageItems = knowledge.slice(start, start + KNOWLEDGE_PER_PAGE);
              return (
                <>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>FAQ tersimpan</Typography>
                      <Typography variant="caption" color="text.secondary">Informasi inilah yang dipakai AI saat menjawab pelanggan.</Typography>
                    </Box>
                    {knowledge.length > 0 && (
                      <Button size="small" color="error" variant="outlined" onClick={async () => {
                        if (!await swalConfirm('Hapus semua knowledge?', 'Semua Q&A akan dihapus permanen.')) return;
                        try { await deleteAllKnowledgeMut.mutateAsync(); swalToast('Semua knowledge dihapus', 'success'); } catch { swalToast('Gagal', 'error'); }
                      }} disabled={deleteAllKnowledgeMut.isPending}>
                        {deleteAllKnowledgeMut.isPending ? '…' : 'Hapus Semua'}
                      </Button>
                    )}
                  </Stack>
                  {knowledge.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed', bgcolor: 'action.hover' }}>
                      <KnowledgeIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 0.75 }} />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Belum ada FAQ</Typography>
                      <Typography variant="caption" color="text.secondary">Gunakan pilihan di atas untuk menambahkan knowledge pertama.</Typography>
                    </Paper>
                  ) : (
                    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    {pageItems.map((k, i) => (
                      <Box key={k.id} sx={{ display: 'flex', gap: 0.75, px: 1.5, py: 1, borderBottom: i < pageItems.length - 1 ? '1px solid' : 0, borderColor: 'divider', alignItems: 'flex-start' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', flexShrink: 0, minWidth: 28, lineHeight: 1.5 }}>Q{k.id}:</Typography>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.5, fontWeight: 600 }}>{k.question}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>A: {k.answer}</Typography>
                          {k.tags && <Chip label={k.tags} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18, mt: 0.25 }} />}
                        </Box>
                        <IconButton onClick={async () => { if (await delKnowledge(k.id) && pageItems.length === 1 && safePage > 0) setKnowledgePage(safePage - 1); }} size="small" color="error" sx={{ flexShrink: 0, mt: -0.25 }}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    ))}
                    </Paper>
                  )}
                  {totalPages > 1 && (
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', alignItems: 'center', mt: 1 }}>
                      <Button size="small" variant="outlined" disabled={safePage === 0}
                        onClick={() => setKnowledgePage(p => Math.max(0, p - 1))}>
                        ← Sebelumnya
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        {safePage + 1} / {totalPages}
                      </Typography>
                      <Button size="small" variant="outlined" disabled={safePage >= totalPages - 1}
                        onClick={() => setKnowledgePage(p => Math.min(totalPages - 1, p + 1))}>
                        Berikutnya →
                      </Button>
                    </Stack>
                  )}
                </>
              );
            })()}
          </Box>
        )}

        {tab === 'settings' && (
          <Box>
            <PageHeader
              title={<><SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />Pengaturan {currentAgent && <Typography component="span" color="text.secondary" sx={{ fontWeight: 400 }}>· {currentAgent.name}</Typography>}</>}
              subtitle="Atur identitas, sumber pengetahuan AI, dan persona agar jawaban sesuai dengan bisnismu."
            />

            <Card sx={{ mb: 1.5 }}>
              <CardContent>
                <Box sx={{ mb: 1.5, p: 1.25, borderRadius: 1, border: '1px solid', borderColor: aiEnabled ? 'success.light' : 'divider', bgcolor: aiEnabled ? 'rgba(37,211,102,0.07)' : 'action.hover' }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <SmartToyIcon sx={{ color: aiEnabled ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>Balasan Otomatis AI</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {aiEnabled
                          ? 'AI membalas chat pelanggan secara otomatis.'
                          : 'AI mati — chat masuk Inbox untuk dibalas manual. Sapaan & balasan kata kunci tetap jalan.'}
                      </Typography>
                    </Box>
                    <Switch checked={aiEnabled} onChange={e => toggleAI(e.target.checked)} color="success" disabled={saveAgentMut.isPending} />
                  </Stack>
                </Box>
                <Divider sx={{ mb: 1.5 }} />

                <Box sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                    <Box sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, fontSize: '0.75rem', fontWeight: 800 }}>1</Box>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Identitas dan gaya bicara</Typography>
                      <Typography variant="caption" color="text.secondary">Tentukan nama yang tampil dan cara AI berbicara kepada pelanggan.</Typography>
                    </Box>
                  </Stack>
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField fullWidth size="small" label="Nama CS" value={agentName}
                        onChange={e => { setAgentName(e.target.value); if (settingsErrors.agentName) setSettingsErrors(p => ({...p, agentName: ''})); }}
                        error={!!settingsErrors.agentName} helperText={settingsErrors.agentName} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Gaya bahasa</InputLabel>
                        <Select value={tone} label="Gaya bahasa" onChange={e => setTone(e.target.value)}>
                          {TONES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </Select>
                        <FormHelperText>
                          {tone === 'custom'
                            ? 'AI mengikuti gaya bahasa yang ditulis di Persona.'
                            : 'Pilihan ini berlaku pada semua jawaban dan mengesampingkan gaya berbeda di Persona.'}
                        </FormHelperText>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                <Box sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, fontSize: '0.75rem', fontWeight: 800 }}>2</Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Pengetahuan AI tentang bisnis</Typography>
                        <Chip size="small" variant="outlined" color={knowledge.length ? 'success' : 'warning'} label={`${knowledge.length} FAQ tersimpan`} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Informasi di bagian ini dipakai AI untuk menjawab pelanggan. Pilih satu sumber untuk memulai. Website, deskripsi, dan FAQ manual dapat digabungkan nanti.
                      </Typography>
                    </Box>
                  </Stack>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1, mt: 1 }}>
                    <Button variant="outlined" color="success" onClick={() => setWizardOpen(true)} disabled={!agentId} sx={{ justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', p: 1.25, bgcolor: 'rgba(37,211,102,0.04)' }}>
                      <AutoAwesomeIcon sx={{ mr: 1, mt: 0.1 }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>Setup Cepat</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Buat knowledge awal sekaligus persona dari profil bisnis.</Typography>
                        {knowledge.length > 0 && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.25 }}>Akan mengganti {knowledge.length} FAQ yang tersimpan.</Typography>}
                      </Box>
                    </Button>
                    <Button variant="outlined" onClick={() => { setKnowledgeSource('web'); setTab('knowledge'); }} sx={{ justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', p: 1.25, color: 'text.primary', borderColor: 'divider' }}>
                      <LanguageIcon color="primary" sx={{ mr: 1, mt: 0.1 }} />
                      <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Dari website</Typography><Typography variant="caption" color="text.secondary">Impor halaman yang sudah ada.</Typography></Box>
                    </Button>
                    <Button variant="outlined" onClick={() => { setKnowledgeSource('text'); setTab('knowledge'); }} sx={{ justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', p: 1.25, color: 'text.primary', borderColor: 'divider' }}>
                      <AutoAwesomeIcon color="primary" sx={{ mr: 1, mt: 0.1 }} />
                      <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Dari deskripsi</Typography><Typography variant="caption" color="text.secondary">AI mengubah tulisan menjadi FAQ.</Typography></Box>
                    </Button>
                    <Button variant="outlined" onClick={() => { setKnowledgeSource('manual'); setTab('knowledge'); }} sx={{ justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', p: 1.25, color: 'text.primary', borderColor: 'divider' }}>
                      <AddIcon color="primary" sx={{ mr: 1, mt: 0.1 }} />
                      <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>FAQ manual</Typography><Typography variant="caption" color="text.secondary">Tulis satu jawaban yang presisi.</Typography></Box>
                    </Button>
                  </Box>
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                <Box sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, fontSize: '0.75rem', fontWeight: 800 }}>3</Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Persona AI</Typography>
                        <Chip size="small" variant="outlined" color={prompt.trim() ? 'success' : 'warning'} label={prompt.trim() ? 'Sudah diatur' : 'Belum diatur'} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">Atur peran, batasan, dan alur layanan. Gaya bicara diatur terpisah pada langkah 1.</Typography>
                    </Box>
                  </Stack>
                  <TextField
                    multiline
                    minRows={4}
                    fullWidth
                    size="small"
                    label="Instruksi persona"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Contoh: Kamu adalah CS toko kami. Bantu pelanggan memilih produk dan jangan mengarang informasi di luar knowledge."
                    sx={{ mt: 0.75 }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 0.75, alignItems: { xs: 'stretch', sm: 'center' } }}>
                    <Button size="small" variant="text" onClick={() => { setExampleMode('prompt'); setExampleModalOpen(true); }}>Lihat contoh persona</Button>
                    {trainedCount > 0 && (
                      <Button size="small" variant="outlined" disabled={regenPersonaMut.isPending || isTraining}
                        onClick={regeneratePersona}
                        startIcon={regenPersonaMut.isPending ? <CircularProgress size={14} /> : <LanguageIcon />}>
                        {prompt.trim() ? 'Perbarui dari website' : 'Buat dari website'}
                      </Button>
                    )}
                  </Stack>
                </Box>

                <Accordion disableGutters elevation={0} defaultExpanded={greetEnabled || bhEnabled} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Otomasi percakapan</Typography>
                      <Typography variant="caption" color="text.secondary">Sapaan otomatis dan respons di luar jam kerja.</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Sapaan Otomatis</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                      Pesan pembuka sekali saat kontak baru pertama chat.
                    </Typography>
                    <FormControlLabel control={<Switch checked={greetEnabled} onChange={e => setGreetEnabled(e.target.checked)} />} label="Aktifkan" />
                    <TextField fullWidth multiline rows={2} size="small" label="Pesan sapaan" value={greetMsg}
                      onChange={e => setGreetMsg(e.target.value)} disabled={!greetEnabled} sx={{ mt: 0.75 }}
                      placeholder="Halo kak! Ada yang bisa dibantu? 😊" />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Jam Kerja</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                      Di luar jam kerja bot tidak jawab pakai AI, hanya kirim pesan otomatis sekali.
                    </Typography>
                    <FormControlLabel control={<Switch checked={bhEnabled} onChange={e => setBhEnabled(e.target.checked)} />} label="Batasi jam kerja" />
                    <Stack direction="row" spacing={1} sx={{ my: 0.75 }}>
                      <TextField type="time" label="Mulai" size="small" value={bhStart} onChange={e => setBhStart(e.target.value)}
                        disabled={!bhEnabled} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
                      <TextField type="time" label="Selesai" size="small" value={bhEnd} onChange={e => setBhEnd(e.target.value)}
                        disabled={!bhEnabled} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
                    </Stack>
                    <TextField fullWidth multiline rows={2} size="small" label="Pesan di luar jam kerja" value={awayMsg}
                      onChange={e => setAwayMsg(e.target.value)} disabled={!bhEnabled}
                      placeholder="Mohon maaf, kami sedang di luar jam operasional. Pesan kakak akan kami balas pada jam kerja ya 🙏" />
                  </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>

                <Accordion disableGutters elevation={0} defaultExpanded={sheetSync} sx={{ mt: 1, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Google Sheets</Typography>
                      <Typography variant="caption" color="text.secondary">Kirim data closing dari percakapan AI ke spreadsheet.</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>

                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
                  <Switch checked={sheetSync} onChange={e => setSheetSync(e.target.checked)} />
                  <Typography variant="body2" color={sheetSync ? 'success.main' : 'text.secondary'}>
                    {sheetSync ? 'Aktif' : 'Nonaktif'}
                  </Typography>
                </Stack>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>URL Google Sheet</Typography>
                    <TextField fullWidth size="small" value={sheetUrl}
                      onChange={e => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/xxx/edit" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Nama Tab</Typography>
                    <Stack direction="row" spacing={0.5}>
                      <FormControl fullWidth size="small">
                        <Select value={sheetNames.includes(sheetName) ? sheetName : ''}
                          onChange={e => setSheetName(e.target.value)}
                          displayEmpty
                          renderValue={v => v || sheetName || 'Pilih atau ketik...'}>
                          <MenuItem value=""><em>Ketik manual</em></MenuItem>
                          {sheetNames.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <Button size="small" variant="outlined" onClick={async () => {
                        if (!sheetUrl) { swalToast('Isi URL dulu', 'warning'); return; }
                        setLoadingNames(true);
                        try {
                          const res = await api.get(`/agents/${agentId}/settings/sheet-names`);
                          setSheetNames(res.data.data || []);
                          if (res.data.data?.length === 1) setSheetName(res.data.data[0]);
                        } catch { swalToast('Gagal membaca sheet', 'error'); }
                        setLoadingNames(false);
                      }} disabled={loadingNames}>
                        {loadingNames ? '…' : 'Segarkan'}
                      </Button>
                    </Stack>
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center' }}>
                  <Button size="small" variant="outlined" onClick={async () => {
                    if (!sheetUrl) { swalToast('Isi URL Google Sheet dulu', 'warning'); return; }
                    try {
                      const res = await api.post(`/agents/${agentId}/settings/test-sheet`);
                      swalToast(res.data.message, res.data.status === 'ok' ? 'success' : 'error');
                    } catch { swalToast('Gagal tes koneksi', 'error'); }
                  }}>Test Koneksi</Button>
                  <Typography variant="caption" color="text.secondary">
                    Share spreadsheet ke: chatloop-sheets@whatsmeow.iam.gserviceaccount.com
                  </Typography>
                </Stack>
                  </AccordionDetails>
                </Accordion>

                <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', minHeight: 36 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minHeight: 24 }}>
                      {settingsBaseline !== null && !hasUnsavedSettings && <CheckCircleIcon color="success" fontSize="small" />}
                      <Typography variant="caption" color={hasUnsavedSettings ? 'warning.main' : 'text.secondary'} sx={{ fontWeight: 600 }}>
                        {settingsBaseline === null
                          ? 'Memuat pengaturan...'
                          : hasUnsavedSettings
                            ? 'Ada perubahan yang belum disimpan'
                            : 'Semua perubahan tersimpan'}
                      </Typography>
                    </Stack>
                    <Button
                      variant={hasUnsavedSettings ? 'contained' : 'outlined'}
                      onClick={saveAgent}
                      disabled={settingsBaseline === null || !hasUnsavedSettings || saveAgentMut.isPending}
                      startIcon={saveAgentMut.isPending ? <CircularProgress size={15} color="inherit" /> : undefined}
                      sx={{ minWidth: 170 }}
                    >
                      Simpan perubahan
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ border: '1px solid #f5c2c7' }}>
              <CardContent>
                <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>Zona Berbahaya</Typography>
                <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={deleteAgent} disabled={deleteAgentMut.isPending}>Hapus CS ini</Button>
              </CardContent>
            </Card>
          </Box>
        )}

        {tab === 'handoff' && (
          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>Butuh CS ({handoffs.length})</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Percakapan yang tidak bisa dijawab AI, atau yang kamu ambil alih dari Inbox. Tangani manual di sini sampai selesai.
            </Typography>
            {handoffs.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">✅ Tidak ada antrian. Semua sudah ditangani.</Typography>
              </Paper>
            ) : (
              <Stack spacing={1.5}>
                {handoffs.map((h) => (
                  <Paper key={h.id} variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{h.sender}</Typography>
                      <Typography variant="body2" color="text.secondary">"{h.last_msg}"</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" onClick={() => { setSeed({ kind: 'inbox', value: h.sender, n: Date.now() }); setTab('inbox'); }}>
                        Balas
                      </Button>
                      <Button size="small" color="success" variant="contained" onClick={() => resumeHandoff.mutate(h.sender)}>
                        Selesai
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        )}
        {tab === 'inbox' && <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}><InboxPanel agentId={agentId} aiEnabled={aiEnabled} seed={seed?.kind === 'inbox' ? seed : null} /></Box>}
        {tab === 'coba-chat' && <TestChatPanel agentId={agentId} />}
        {tab === 'grup' && <GroupGuardPanel agentId={agentId} />}
        {tab === 'broadcast' && <BroadcastPanel agentId={agentId} seed={seed?.kind === 'broadcast' ? seed : null} />}
        {tab === 'kalender' && <CalendarPanel agentId={agentId} />}
        {tab === 'auto-reply' && <AutoReplyPanel agentId={agentId} />}
        {tab === 'template' && <TemplatePanel agentId={agentId} />}
        {tab === 'follow-up' && <FollowUpPanel agentId={agentId} />}
        {tab === 'kontak' && (
          <ContactsPanel agentId={agentId}
            onBroadcast={(recipients) => { setSeed({ kind: 'broadcast', value: recipients, n: Date.now() }); setTab('broadcast'); }}
            onOpenChat={(number) => { setSeed({ kind: 'inbox', value: number, n: Date.now() }); setTab('inbox'); }} />
        )}
      </Box>

      {/* Modal sambung WhatsApp via QR */}
      <Dialog open={qrModalOpen} onClose={() => setQrModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', pb: 0.5 }}>
          {status === 'connected' ? 'WhatsApp Tersambung' : 'Sambungkan WhatsApp'}
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          {status === 'connected' ? (
            <Box sx={{ py: 3 }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
              <Typography sx={{ mt: 1, fontWeight: 600 }}>{waName || 'Tersambung'}{waNumber ? ` · +${waNumber}` : ''}</Typography>
              <Typography variant="caption" color="text.secondary">Berhasil tersambung. Menutup otomatis…</Typography>
            </Box>
          ) : status === 'expired' ? (
            <Box sx={{ py: 4, px: 2 }}>
              <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600, mb: 0.5 }}>QR kedaluwarsa</Typography>
              <Typography variant="caption" color="text.secondary">
                Jendela scan sudah habis. Klik "Muat ulang QR" untuk membuat kode baru.
              </Typography>
            </Box>
          ) : qr ? (
            <>
              {riskAck ? (
                <>
                  <Box sx={{ bgcolor: '#fff', p: 1.5, borderRadius: 2, display: 'inline-block', mt: 1, boxShadow: '0 1px 6px rgba(0,0,0,0.1)' }}>
                    <QRCodeSVG value={qr} size={220} level="L" includeMargin />
                  </Box>
                  <Box sx={{ mt: 1.5, px: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>Buka WhatsApp di HP</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Setelan → Perangkat Tertaut → Tautkan Perangkat, lalu arahkan kamera ke QR ini.
                    </Typography>
                  </Box>
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {qrSeconds > 0 ? `QR aktif. Kode diperbarui otomatis (${qrSeconds} detik). Scan kapan saja.` : 'Memuat kode baru…'}
                    </Typography>
                  </Box>
                </>
              ) : (
                <Box sx={{ py: 5, px: 2 }}>
                  <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
                    Centang persetujuan di bawah untuk menampilkan QR.
                  </Typography>
                </Box>
              )}
              <FormControlLabel
                sx={{ mt: 1, alignItems: 'flex-start', mx: 0 }}
                control={<Checkbox checked={riskAck} onChange={e => setRiskAck(e.target.checked)} size="small" color={riskAck ? 'primary' : 'error'} sx={{ py: 0, pl: 0 }} />}
                label={
                  <Typography variant="caption" color={riskAck ? 'text.secondary' : 'error'} sx={{ textAlign: 'left', display: 'block', lineHeight: 1.4 }}>
                    Saya paham WhatsApp saya berisiko diblokir dan ChatLoop tidak bertanggung jawab atas hal itu.
                  </Typography>
                }
              />
            </>
          ) : qrError ? (
            <Box sx={{ py: 4, px: 2 }}>
              <Typography variant="body2" color="error" sx={{ fontWeight: 600, mb: 0.5 }}>Gagal menyiapkan QR</Typography>
              <Typography variant="caption" color="text.secondary">{qrError}</Typography>
            </Box>
          ) : (
            <Box sx={{ py: 4 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Menyiapkan QR…</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
          <Button onClick={() => setQrModalOpen(false)}>{status === 'connected' ? 'Selesai' : 'Tutup'}</Button>
          {status !== 'connected' && (
            <Button onClick={connect} disabled={connectMut.isPending || !riskAck} startIcon={<QrCodeIcon />}>Muat ulang QR</Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={showGuardModal} onClose={() => setShowGuardModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>⚠️ Lengkapi dulu sebelum aktifkan AI</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Agar AI tidak blunder saat membalas pelanggan, pastikan 2 hal ini:
          </Typography>
          <Stack spacing={1.5}>
            {['System Prompt / Persona', 'Tone / gaya bahasa'].map((item) => {
              const isMissing = guardMissing.includes(item);
              return (
                <Paper key={item} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: isMissing ? 'error.light' : 'success.light' }}>
                  <Typography sx={{ fontSize: 18 }}>{isMissing ? '❌' : '✅'}</Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{item}</Typography>
                    <Typography variant="caption" color="text.secondary">{isMissing ? 'Belum diisi' : 'Sudah lengkap'}</Typography>
                  </Box>
                  {isMissing && item.includes('Persona') && (
                    <Button size="small" variant="outlined" onClick={() => { setShowGuardModal(false); setTab('settings'); }}>Isi</Button>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" color="success" startIcon={<AutoAwesomeIcon />} onClick={() => { setShowGuardModal(false); setWizardOpen(true); }}>Setup Cepat</Button>
          <Button onClick={() => setShowGuardModal(false)}>Nanti saja</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Langganan */}
      <Dialog open={billingOpen} onClose={() => setBillingOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CreditCardIcon color="primary" /> Langganan
        </DialogTitle>
        <DialogContent>
          <BillingPanel />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBillingOpen(false)}>Tutup</Button>
        </DialogActions>
      </Dialog>

      <Popover
        open={!!profileAnchor}
        anchorEl={profileAnchor}
        onClose={() => setProfileAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 220 } } }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, fontSize: 16 }}>
              {(user.name || user.username || 'U').charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.name || user.username}</Typography>
              <Typography variant="caption" color="text.secondary">{user.email || '—'}</Typography>
              {user.phone && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>+{user.phone}</Typography>}
            </Box>
          </Stack>
          {user.role && (
            <Chip label={user.role === 'admin' ? 'Super Admin' : user.role === 'owner' ? 'Owner' : user.role}
              size="small" color={user.role === 'admin' ? 'error' : 'primary'} variant="outlined" sx={{ alignSelf: 'flex-start' }} />
          )}
        </Stack>
      </Popover>

      <Dialog open={profileModalOpen} onClose={() => setProfileModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Profil</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nama" size="small" fullWidth value={profileName} onChange={e => setProfileName(e.target.value)} autoFocus />
            <TextField label="Email" size="small" fullWidth value={user.email || ''} disabled helperText="Email tidak bisa diubah" />
            <TextField label="Nomor WhatsApp" size="small" fullWidth value={user.phone ? `+${user.phone}` : '—'} disabled helperText="Nomor tidak bisa diubah" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileModalOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={saveProfile} disabled={profileSaving || !profileName.trim()}>
            {profileSaving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal contoh persona/profil bisnis */}
      <Dialog open={exampleModalOpen} onClose={() => setExampleModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{exampleMode === 'prompt' ? 'Contoh Persona AI' : 'Contoh Profil Bisnis'}</DialogTitle>
        <DialogContent>
          {exampleMode === 'profile' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, mt: 1 }}>Profil Bisnis (Setup Cepat)</Typography>
              <Box component="pre" sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid', borderColor: 'divider', mb: 2 }}>
{`Jenis Bisnis: Produk Fisik
Nama Bisnis: AromaLuxe Parfum
Produk/Layanan: Parfum pria dan wanita, parfum inspired, body mist, eau de parfum, dan paket bundling parfum.
Range Harga: Rp35.000 - Rp180.000 per botol. Paket bundling mulai Rp100.000.
Nama CS: Admin AromaLuxe
Cara Order: Pelanggan bisa order melalui WhatsApp dengan menyebutkan varian parfum, ukuran botol, jumlah pesanan, nama penerima, alamat lengkap, dan metode pembayaran.
Pengiriman: JNE, J&T, SiCepat, Shopee Express, atau kurir instan untuk area tertentu. Estimasi 1-5 hari kerja.
Jam Operasional: 08:00-21:00`}
              </Box>
            </>
          )}

          {exampleMode === 'prompt' && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, mt: 1 }}>Persona AI</Typography>
              <Box component="pre" sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid', borderColor: 'divider', maxHeight: 400, overflowY: 'auto' }}>
{`Kamu adalah Admin AromaLuxe, customer service WhatsApp untuk toko parfum bernama AromaLuxe Parfum.

Tugas utama kamu adalah membantu pelanggan dengan ramah, cepat, jelas, dan persuasif untuk:
1. Menjawab pertanyaan tentang produk parfum.
2. Membantu rekomendasi aroma sesuai kebutuhan pelanggan.
3. Mengecek minat pelanggan terhadap varian, ukuran, dan jumlah pesanan.
4. Mengarahkan pelanggan untuk melakukan order.
5. Meminta data pemesanan secara lengkap.
6. Menjelaskan harga, pengiriman, dan cara pembayaran.
7. Mengarahkan ke admin manusia jika ada pertanyaan di luar informasi yang tersedia.

PROFIL BISNIS:
- Nama bisnis: AromaLuxe Parfum
- Jenis bisnis: Produk fisik
- Produk: Parfum pria dan wanita, parfum inspired, body mist, eau de parfum, dan paket bundling parfum.
- Range harga: Rp35.000 - Rp180.000 per botol. Paket bundling mulai Rp100.000.
- Nama CS: Admin AromaLuxe
- Jam operasional: 08:00-21:00
- Pengiriman: JNE, J&T, SiCepat, Shopee Express, dan kurir instan untuk area tertentu.
- Estimasi pengiriman: 1-5 hari kerja tergantung lokasi.

ATURAN PENTING:
1. Jangan mengarang informasi yang belum tersedia di knowledge.
2. Jika informasi belum tersedia, jawab dengan jujur dan arahkan ke admin.
3. Jangan memberikan klaim berlebihan.
4. Jika pelanggan komplain, tanggapi dengan empati dan minta detail pesanan.
5. Jika pelanggan ingin bicara dengan manusia, arahkan ke admin.
6. Jika pelanggan bertanya di luar produk, jawab singkat dan kembalikan ke topik parfum.

CARA MENJAWAB REKOMENDASI:
Jika pelanggan bingung memilih aroma, tanyakan:
- Untuk pria atau wanita?
- Suka aroma fresh, manis, elegan, soft, maskulin, floral, fruity, atau vanilla?
- Dipakai untuk harian, kerja, kuliah, acara formal, atau hadiah?

ALUR ORDER:
Jika pelanggan ingin membeli, minta data: nama, no. HP, produk/varian, ukuran, jumlah, alamat lengkap, kecamatan/kota, metode pembayaran.

CARA MENJAWAB HARGA:
"Harga parfum AromaLuxe mulai dari Rp35.000 sampai Rp180.000 per botol, tergantung ukuran dan varian. Paket bundling mulai dari Rp100.000 ya Kak."

CARA MENJAWAB PENGIRIMAN:
"Pengiriman bisa menggunakan JNE, J&T, SiCepat, Shopee Express, atau kurir instan. Estimasi 1-5 hari kerja tergantung lokasi Kak."

TUJUAN AKHIR:
Bantu pelanggan sampai jelas, tertarik, dan siap order. Jika pelanggan sudah menunjukkan minat, arahkan dengan lembut ke proses pemesanan. Jangan memaksa.`}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExampleModalOpen(false)}>Tutup</Button>
        </DialogActions>
      </Dialog>

      {/* Setup Wizard */}
      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeIcon color="success" /> Setup Cepat
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Isi profil bisnis di bawah. Sistem akan membuat persona AI dan FAQ awal secara otomatis.
          </Typography>
          {knowledge.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Setup Cepat akan mengganti {knowledge.length} FAQ yang saat ini tersimpan. Persona lama juga akan diperbarui.
            </Alert>
          )}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Nama Bisnis *" value={wizardBiz.biz_name}
                onChange={e => setWizardBiz({...wizardBiz, biz_name: e.target.value})} required />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Jenis Bisnis</InputLabel>
                <Select value={wizardBiz.biz_type} label="Jenis Bisnis"
                  onChange={e => setWizardBiz({...wizardBiz, biz_type: e.target.value})}>
                  <MenuItem value="produk_fisik">Produk Fisik</MenuItem>
                  <MenuItem value="produk_digital">Produk Digital</MenuItem>
                  <MenuItem value="jasa">Jasa/Layanan</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={12}>
              <TextField fullWidth size="small" label="Produk/Layanan" value={wizardBiz.products}
                onChange={e => setWizardBiz({...wizardBiz, products: e.target.value})}
                placeholder="mis: Baju muslim, gamis, hijab..." multiline rows={3} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Range Harga" value={wizardBiz.price_range}
                onChange={e => setWizardBiz({...wizardBiz, price_range: e.target.value})}
                placeholder="Rp 50rb - 300rb" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Nama CS" value={wizardBiz.cs_name}
                onChange={e => setWizardBiz({...wizardBiz, cs_name: e.target.value})}
                placeholder="mis: Admin Maya" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Cara Order" value={wizardBiz.order_flow}
                onChange={e => setWizardBiz({...wizardBiz, order_flow: e.target.value})}
                placeholder="Transfer dulu, kirim 2-3 hari" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Pengiriman" value={wizardBiz.shipping}
                onChange={e => setWizardBiz({...wizardBiz, shipping: e.target.value})}
                placeholder="JNE, J&T, seluruh Indo" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Jam Operasional" value={wizardBiz.hours}
                onChange={e => setWizardBiz({...wizardBiz, hours: e.target.value})}
                placeholder="08:00 - 21:00" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" variant="text" onClick={() => { setExampleMode('profile'); setExampleModalOpen(true); }}>Lihat contoh profil</Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setWizardOpen(false)} disabled={wizardLoading}>Batal</Button>
            <Button variant="contained" color="success" disabled={wizardLoading || !wizardBiz.biz_name}
            onClick={runSetupWizard}
            startIcon={wizardLoading ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}>
            {wizardLoading ? 'Menyiapkan...' : 'Buat Persona & FAQ'}
          </Button>
          </Stack>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
