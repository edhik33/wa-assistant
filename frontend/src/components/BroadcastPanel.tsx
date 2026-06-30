import { useState, useRef, type ReactNode } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, Stack, Alert, Chip,
  Table, TableBody, TableCell, TableHead, TableRow, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditNoteIcon from '@mui/icons-material/EditNoteOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAltOutlined';
import ScheduleIcon from '@mui/icons-material/ScheduleOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import { useCreateBroadcast, useBroadcasts, useBroadcastDetail, useCancelBroadcast, useResumeBroadcast } from '../hooks';
import { swalToast, swalConfirm } from '../services/swal';
import RecipientField from './RecipientField';
import WhatsAppEditor from './WhatsAppEditor';
import TemplatePicker from './TemplatePicker';
import PageHeader from './PageHeader';
import DelayFields from './broadcast/DelayFields';
import BroadcastProgress from './broadcast/BroadcastProgress';
import { defaultBroadcastSafetyForm } from '../services/broadcastSafety';
import type { Broadcast } from '../types';

function normalizePhone(s: string): string {
  const d = (s.match(/\d/g) || []).join('');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  done: 'success', running: 'warning', pending: 'default', failed: 'error', interrupted: 'error',
  resuming: 'warning', wa_restricted: 'warning', cancel_requested: 'warning', cancelled: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  done: 'Selesai', running: 'Berjalan', pending: 'Antre', failed: 'Gagal', interrupted: 'Terhenti',
  resuming: 'Mencoba lanjut', wa_restricted: 'Dijeda WhatsApp', cancel_requested: 'Membatalkan', cancelled: 'Dibatalkan',
};
const RCP_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  sent: 'success', failed: 'error', skipped: 'default', pending: 'warning',
};
const RCP_LABEL: Record<string, string> = {
  sent: 'Terkirim', failed: 'Gagal', skipped: 'Dilewati', pending: 'Menunggu',
};
function SectionTitle({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
      <Box sx={{
        width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 1,
        bgcolor: 'action.hover', color: 'primary.main', flexShrink: 0,
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

function ReviewRow({ label, value, good, warning }: { label: string; value: string; good?: boolean; warning?: boolean }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Chip
        size="small"
        label={value}
        color={warning ? 'warning' : good ? 'success' : 'default'}
        variant={good || warning ? 'filled' : 'outlined'}
      />
    </Stack>
  );
}

export default function BroadcastPanel({ agentId, seed }: { agentId: number; seed?: { value: string; n: number } | null }) {
  const theme = useTheme();
  const mobileDetail = useMediaQuery(theme.breakpoints.down('sm'));
  const [message, setMessage] = useState('');
  // Panel di-mount ulang ketika tab dibuka, jadi seed dari Kontak cukup dijadikan nilai awal.
  const [recipientsText, setRecipientsText] = useState(seed?.value || '');
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  // Istirahat berkala (default pintar): jeda restDuration dtk tiap restEvery pesan. restEvery=0 = mati.
  const [restEvery, setRestEvery] = useState(25);
  const [restDuration, setRestDuration] = useState(90);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [lastStartedId, setLastStartedId] = useState<number | null>(null);

  const historyRef = useRef<HTMLDivElement | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailFilter, setDetailFilter] = useState<'all' | 'sent' | 'failed' | 'skipped' | 'pending'>('all');
  const [detailSearch, setDetailSearch] = useState('');
  const closeDetail = () => { setDetailId(null); setDetailFilter('all'); setDetailSearch(''); };

  const createBroadcast = useCreateBroadcast(agentId);
  const cancelBroadcast = useCancelBroadcast(agentId);
  const resumeBroadcast = useResumeBroadcast(agentId);
  const { data: bpage } = useBroadcasts(agentId, page);
  const { data: detail } = useBroadcastDetail(agentId, detailId);
  const broadcasts = bpage?.data || [];
  const totalPages = Math.max(1, Math.ceil((bpage?.total || 0) / (bpage?.limit || 10)));

  const parsed = recipientsText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[\t,]/);
    const num = parts.find(p => /\d/.test(p)) || parts[0];
    const name = parts.filter(p => p !== num && p.trim()).join(' ').trim();
    return { number: normalizePhone(num), name };
  }).filter(r => r.number);

  const uniqueParsedCount = new Set(parsed.map(p => p.number)).size;
  const duplicateCount = parsed.length - uniqueParsedCount;
  const delayProblem = minDelay < 1 || maxDelay < 1
    ? 'Jeda harus minimal 1 detik'
    : maxDelay < minDelay
      ? 'Jeda maksimal harus lebih besar atau sama dengan jeda minimal'
      : '';

  const doSend = async () => {
    const e: Record<string, string> = {};
    if (!message.trim()) e.message = 'Pesan tidak boleh kosong';
    if (parsed.length === 0) e.recipients = 'Masukkan minimal satu nomor';
    if (delayProblem) e.delay = delayProblem;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const recipients = parsed.map(p => ({ number: p.number, name: p.name }));
    const ok = await swalConfirm(
      `Mulai Blast ke ${uniqueParsedCount} nomor?`,
      'Pesan dikirim langsung ke daftar penerima dengan jeda yang kamu atur. Kontak yang pernah membalas STOP otomatis dilewati.',
    );
    if (!ok) return;
    try {
      const res = await createBroadcast.mutateAsync({ message, recipients, min_delay: minDelay, max_delay: maxDelay, rest_every: restEvery, rest_duration: restDuration, file, safety: defaultBroadcastSafetyForm() });
      const started = res.data;

      // Bersihkan form agar user tahu Blast sudah masuk proses
      setMessage('');
      setRecipientsText('');
      setFile(null);
      setErrors({});

      // Balik ke halaman 1 — Blast terbaru di paling atas
      setPage(1);
      setLastStartedId(started?.id || null);

      // Scroll ke riwayat
      setTimeout(() => {
        historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      swalToast(`Blast dimulai untuk ${recipients.length} penerima.`);
    } catch (error) {
      const detail = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      swalToast(detail || 'Blast belum bisa dimulai. Periksa pesan, penerima, dan koneksi WhatsApp.', 'error');
    }
  };

  const resume = async (broadcast: Broadcast) => {
    const ok = await swalConfirm(
      'Tetap lanjutkan Blast?',
      'WhatsApp kemungkinan besar masih akan menolak pengiriman ini. Melanjutkan tidak menembus pembatasan WhatsApp, jadi pesan bisa tetap gagal terkirim. Sebaiknya istirahatkan nomor dulu beberapa hari, lalu mulai dari kontak yang pernah membalas Anda.',
    );
    if (!ok) return;
    try {
      await resumeBroadcast.mutateAsync(broadcast.id);
      swalToast('Mencoba melanjutkan Blast.');
    } catch (error) {
      const detail = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      swalToast(detail || 'Blast belum bisa dilanjutkan.', 'error');
    }
  };

  const formIssueCount = (message.trim() ? 0 : 1) + (parsed.length ? 0 : 1) + (delayProblem ? 1 : 0);

  const cancel = async (broadcast: Broadcast) => {
    if (!await swalConfirm('Batalkan Blast ini?', 'Pesan yang sudah terkirim tidak bisa ditarik.')) return;
    if (broadcast.id === lastStartedId) setLastStartedId(null);
    cancelBroadcast.mutate(broadcast.id);
  };

  const broadcastActions = (broadcast: Broadcast, fullWidth = false) => {
    const remaining = Math.max(0, broadcast.total - broadcast.sent - broadcast.failed - broadcast.skipped);
    const canCancel = ['pending', 'running', 'resuming', 'interrupted', 'wa_restricted', 'cancel_requested'].includes(broadcast.status);
    if (!canCancel) return null;
    return (
      <Stack direction={{ xs: fullWidth ? 'column' : 'row', sm: 'row' }} spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
        {broadcast.status === 'wa_restricted' && (
          <Button size="small" variant="contained" fullWidth={fullWidth}
            disabled={resumeBroadcast.isPending} onClick={() => resume(broadcast)}>
            Coba lanjutkan ({remaining})
          </Button>
        )}
        {canCancel && (
          <Button size="small" color="error" variant="outlined" fullWidth={fullWidth}
            disabled={cancelBroadcast.isPending} onClick={() => cancel(broadcast)}>
            Batalkan
          </Button>
        )}
      </Stack>
    );
  };

  return (
    <Box>
      <PageHeader title="WhatsApp Blast"
        subtitle="Susun pesan, pilih penerima, lalu pantau pengirimannya secara langsung." />

      <Alert
        severity="info"
        icon={<InfoIcon fontSize="small" />}
        sx={{ mb: 2, alignItems: 'flex-start', '& .MuiAlert-icon': { py: '2px' } }}
      >
        <Typography variant="body2">
          Kirim ke kontak yang relevan. Hindari mengirim ke banyak nomor asing sekaligus agar nomor WhatsApp tetap aman. Kontak yang membalas STOP otomatis dilewati.
        </Typography>
      </Alert>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.55fr) minmax(300px, 0.85fr)' },
        gap: 2,
        alignItems: 'start',
      }}>
        <Card>
          <CardContent>
            <Stack spacing={2.25}>
              <Box>
                <SectionTitle
                  icon={<EditNoteIcon fontSize="small" />}
                  title="Pesan"
                  subtitle={`${message.length}/2000 karakter`}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 0.5, mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">Isi kolom pesan dari pesan yang sudah disimpan.</Typography>
                  <TemplatePicker label="Pakai template pesan" agentId={agentId} onPick={b => { setMessage(m => m ? m + '\n' + b : b); if (errors.message) setErrors(p => ({ ...p, message: '' })); }} />
                </Stack>
                <WhatsAppEditor value={message} onChange={v => { setMessage(v); if (errors.message) setErrors(p => ({ ...p, message: '' })); }}
                  placeholder="Halo {nama}, ada promo spesial untuk kamu hari ini…" error={!!errors.message} helperText={errors.message} />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
                  <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon />}>
                    {file ? 'Ganti lampiran' : 'Lampirkan file'}
                    <input type="file" hidden onChange={e => setFile(e.target.files?.[0] || null)} />
                  </Button>
                  {file && <Chip label={file.name} size="small" onDelete={() => setFile(null)} deleteIcon={<CloseIcon />} />}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Tambahkan gambar, video, PDF, atau dokumen. Untuk video, gunakan ukuran maksimal 16 MB agar pengiriman lebih stabil.
                </Typography>
              </Box>

              <Divider />

              <Box>
                <SectionTitle
                  icon={<PeopleAltIcon fontSize="small" />}
                  title="Penerima"
                  subtitle={`${uniqueParsedCount} nomor unik${duplicateCount > 0 ? `, ${duplicateCount} duplikat terdeteksi` : ''}`}
                />
                <RecipientField agentId={agentId} value={recipientsText} onChange={v => { setRecipientsText(v); if (errors.recipients) setErrors(p => ({ ...p, recipients: '' })); }} error={errors.recipients} />
              </Box>

              <Divider />

              <Box>
                <SectionTitle
                  icon={<ScheduleIcon fontSize="small" />}
                  title="Jeda Kirim"
                  subtitle="Atur ritme pengiriman agar lebih aman."
                />

                <DelayFields
                  minDelay={minDelay} maxDelay={maxDelay} restEvery={restEvery} restDuration={restDuration}
                  setMinDelay={setMinDelay} setMaxDelay={setMaxDelay} setRestEvery={setRestEvery} setRestDuration={setRestDuration}
                  error={errors.delay || delayProblem || undefined}
                  onEditDelay={() => { if (errors.delay) setErrors(p => ({ ...p, delay: '' })); }}
                />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ position: { lg: 'sticky' }, top: 16 }}>
          <CardContent>
            <SectionTitle
              icon={<CheckCircleIcon fontSize="small" />}
              title="Review"
              subtitle="Ringkasan sebelum mengirim."
            />
            <Stack spacing={1.1}>
              <ReviewRow label="Pesan" value={message.trim() ? 'Siap' : 'Kosong'} good={!!message.trim()} warning={!message.trim()} />
              <ReviewRow label="Penerima" value={parsed.length ? `${uniqueParsedCount} nomor` : 'Belum ada'} good={parsed.length > 0} warning={parsed.length === 0} />
              <ReviewRow label="Lampiran" value={file ? 'Ada' : 'Tidak ada'} good={!!file} />
              <ReviewRow label="Jeda antar pesan" value={`${minDelay}-${maxDelay} detik`} good={!delayProblem} warning={!!delayProblem} />
              <ReviewRow label="Jeda istirahat" value={restEvery > 0 ? `berhenti ${restDuration} dtk tiap ${restEvery} pesan` : 'Mati'} good={restEvery > 0} />
              {message.length > 700 && <Alert severity="warning" icon={false}>Pesan cukup panjang. Pertimbangkan dipersingkat agar lebih mudah dibaca.</Alert>}
              {duplicateCount > 0 && <Alert severity="info" icon={false}>{duplicateCount} nomor duplikat terdeteksi. Sistem akan menggabungkan saat daftar diproses.</Alert>}
              {formIssueCount > 0 && (
                <Alert severity="warning" icon={false}>
                  Lengkapi pesan, penerima, dan jeda sebelum mengirim.
                </Alert>
              )}
              <Button fullWidth variant="contained"
                startIcon={createBroadcast.isPending ? <CircularProgress size={16} /> : <SendIcon />}
                onClick={doSend} disabled={createBroadcast.isPending || formIssueCount > 0}>
                {createBroadcast.isPending ? 'Memulai Blast…' : `Mulai Blast (${uniqueParsedCount})`}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Pesan dikirim langsung ke daftar penerima dengan jeda yang kamu atur.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Card ref={historyRef} sx={{ mt: 2 }}>
        <CardContent>
          <SectionTitle
            icon={<HistoryIcon fontSize="small" />}
            title="Riwayat Blast"
            subtitle={broadcasts.length ? 'Progres diperbarui otomatis. Buka item untuk melihat setiap penerima.' : 'Blast yang sudah dimulai akan muncul di sini.'}
          />
          {broadcasts.length === 0 ? (
            <Alert severity="info" icon={false}>Belum ada Blast yang tercatat untuk nomor ini.</Alert>
          ) : (
            <>
              <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 820 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 145 }}>Waktu</TableCell>
                      <TableCell>Pesan</TableCell>
                      <TableCell align="center" sx={{ width: 130 }}>Status</TableCell>
                      <TableCell sx={{ width: 280 }}>Progres</TableCell>
                      <TableCell align="right" sx={{ width: 230 }}>Aksi</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {broadcasts.map(b => (
                      <TableRow key={b.id} hover sx={{ cursor: 'pointer', bgcolor: b.id === lastStartedId && b.status === 'pending' ? 'action.hover' : 'inherit' }} onClick={() => setDetailId(b.id)}>
                        <TableCell>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                            {new Date(b.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(b.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                          {b.id === lastStartedId && b.status === 'pending' && <Chip label="Baru dibuat" size="small" color="primary" sx={{ mt: 0.5 }} />}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 260 }}>
                          <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{b.message}</Typography>
                          <Typography variant="caption" color="text.secondary">{b.total} penerima</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={STATUS_LABEL[b.status] ?? b.status} size="small" color={STATUS_COLOR[b.status] ?? 'default'} />
                        </TableCell>
                        <TableCell><BroadcastProgress broadcast={b} /></TableCell>
                        <TableCell align="right" onClick={e => e.stopPropagation()}>{broadcastActions(b)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>

              <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
                {broadcasts.map(b => (
                  <Box key={b.id} role="button" tabIndex={0} onClick={() => setDetailId(b.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setDetailId(b.id); }}
                    sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, cursor: 'pointer', bgcolor: b.id === lastStartedId && b.status === 'pending' ? 'action.hover' : 'background.paper' }}>
                    <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(b.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.2, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.message}</Typography>
                      </Box>
                      <Chip label={STATUS_LABEL[b.status] ?? b.status} size="small" color={STATUS_COLOR[b.status] ?? 'default'} sx={{ flexShrink: 0 }} />
                    </Stack>
                    {b.id === lastStartedId && b.status === 'pending' && <Chip label="Baru dibuat" size="small" color="primary" sx={{ mb: 0.75 }} />}
                    <BroadcastProgress broadcast={b} />
                    {broadcastActions(b, true) && (
                      <Box onClick={e => e.stopPropagation()} sx={{ mt: 1 }}>{broadcastActions(b, true)}</Box>
                    )}
                  </Box>
                ))}
              </Stack>

            <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', mt: 1, gap: 1 }}>
              <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
              <Typography variant="caption">Hal {page} / {totalPages}</Typography>
              <Button size="small" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
            </Stack>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Blast: status per penerima */}
      <Dialog open={!!detailId} onClose={closeDetail} fullWidth maxWidth="md" fullScreen={mobileDetail}>
        <DialogTitle>Detail Blast</DialogTitle>
        <DialogContent dividers>
          {detail ? (() => {
            const recs = detail.recipients;
            const q = detailSearch.replace(/\D/g, '');
            const shown = recs.filter(r =>
              (detailFilter === 'all' || r.status === detailFilter) && (!q || r.number.includes(q)));
            const FILTERS = [
              { k: 'all' as const, label: `Semua ${recs.length}` },
              { k: 'sent' as const, label: `Terkirim ${detail.broadcast.sent}` },
              { k: 'failed' as const, label: `Gagal ${detail.broadcast.failed}` },
              { k: 'skipped' as const, label: `Dilewati ${detail.broadcast.skipped}` },
              { k: 'pending' as const, label: `Menunggu ${Math.max(0, detail.broadcast.total - detail.broadcast.sent - detail.broadcast.failed - detail.broadcast.skipped)}` },
            ];
            return (
              <>
                <Box sx={{ p: 1.25, mb: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Progres pengiriman</Typography>
                    <Chip label={STATUS_LABEL[detail.broadcast.status] ?? detail.broadcast.status} size="small" color={STATUS_COLOR[detail.broadcast.status] ?? 'default'} />
                  </Stack>
                  <BroadcastProgress broadcast={detail.broadcast} />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 0.8fr) minmax(0, 1.2fr)' }, gap: 1.5, alignItems: 'start' }}>
                  <Box sx={{ minWidth: 0, p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Konten Blast</Typography>
                    <Typography variant="caption" color="text.secondary">Pesan yang dikirim ke penerima.</Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.broadcast.message}</Typography>
                    {detail.broadcast.media_type && (
                      <Chip size="small" icon={<AttachFileIcon />} label={detail.broadcast.file_name || detail.broadcast.media_type} sx={{ mt: 1.25 }} />
                    )}
                    {detail.broadcast.risk_level === 'high' && (
                      <Alert severity="warning" icon={false} sx={{ mt: 1.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Blast ini perlu perhatian</Typography>
                        {detail.broadcast.override_reason && <Typography variant="caption">Alasan pengguna: {detail.broadcast.override_reason}</Typography>}
                      </Alert>
                    )}
                    {detail.broadcast.status === 'wa_restricted' && (() => {
                      const waiting = Math.max(0, detail.broadcast.total - detail.broadcast.sent - detail.broadcast.failed - detail.broadcast.skipped);
                      const at = detail.broadcast.paused_at
                        ? new Date(detail.broadcast.paused_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : null;
                      return (
                        <Alert severity="warning" icon={false} sx={{ mt: 1.25 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>Dijeda oleh WhatsApp</Typography>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            Pengiriman Blast ini dihentikan sementara oleh WhatsApp, bukan oleh ChatLoop. Saat ChatLoop mengirim pesan Anda, WhatsApp menolaknya dan meminta pengiriman dihentikan, lalu ChatLoop langsung menjeda Blast agar nomor Anda tetap aman. Nomor Anda tidak terblokir permanen.
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {at ? `Keputusan ini diberikan langsung oleh WhatsApp pada ${at}. ` : ''}ChatLoop tidak memblokir pesan Anda.
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Kenapa ini terjadi?</Typography>
                          <Box component="ul" sx={{ pl: 2.5, m: 0, mb: 1 }}>
                            <li><Typography variant="caption">Mengirim ke nomor yang belum pernah membalas atau menyimpan kontak Anda.</Typography></li>
                            <li><Typography variant="caption">Nomor WhatsApp Anda masih baru atau jarang dipakai mengobrol dua arah.</Typography></li>
                            <li><Typography variant="caption">Terlalu banyak pesan dikirim dalam waktu berdekatan.</Typography></li>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>Agar nomor bisa melakukan Blast lagi:</Typography>
                          <Box component="ol" sx={{ pl: 2.5, m: 0, mb: 1 }}>
                            <li><Typography variant="caption">Istirahatkan nomor ini dulu, 1 sampai 3 hari.</Typography></li>
                            <li><Typography variant="caption">Hangatkan nomor: pakai untuk mengobrol normal, minta beberapa orang mengirim pesan ke Anda lalu balas.</Typography></li>
                            <li><Typography variant="caption">Saat mulai lagi, kirim dulu hanya ke kontak yang pernah membalas Anda, dalam jumlah kecil.</Typography></li>
                            <li><Typography variant="caption">Naikkan jumlah penerima sedikit demi sedikit setiap hari.</Typography></li>
                          </Box>
                          <Typography variant="caption" color="text.secondary">{waiting} penerima masih menunggu.</Typography>
                        </Alert>
                      );
                    })()}
                  </Box>

                  <Box sx={{ minWidth: 0, p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Daftar Penerima</Typography>
                    <Typography variant="caption" color="text.secondary">Cari atau filter berdasarkan hasil pengiriman.</Typography>
                    <Stack direction="row" spacing={0.75} sx={{ my: 1, flexWrap: 'wrap', gap: 0.75 }}>
                      {FILTERS.map(f => (
                        <Chip key={f.k} size="small" label={f.label} onClick={() => setDetailFilter(f.k)}
                          color={detailFilter === f.k ? 'primary' : 'default'} variant={detailFilter === f.k ? 'filled' : 'outlined'} />
                      ))}
                    </Stack>
                    <TextField size="small" fullWidth placeholder="Cari nomor…" value={detailSearch}
                      onChange={e => setDetailSearch(e.target.value)} sx={{ mb: 1 }} />
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, maxHeight: { sm: 420, md: 'min(48vh, 460px)' }, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Nomor</TableCell>
                            <TableCell>Nama</TableCell>
                            <TableCell align="right">Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {shown.map(r => (
                            <TableRow key={r.id}>
                              <TableCell>+{r.number}</TableCell>
                              <TableCell>{r.name || '-'}</TableCell>
                              <TableCell align="right">
                                <Chip size="small" label={RCP_LABEL[r.status] ?? r.status} color={RCP_COLOR[r.status] ?? 'default'} />
                                {r.error && <Typography variant="caption" color={r.status === 'pending' ? 'warning.main' : 'error'} sx={{ display: 'block' }}>{r.error}</Typography>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                    <Stack spacing={0.75} sx={{ display: { xs: 'flex', sm: 'none' }, maxHeight: '44svh', overflowY: 'auto', pr: 0.25 }}>
                      {shown.map(r => (
                        <Stack key={r.id} direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>+{r.number}</Typography>
                            <Typography variant="caption" color="text.secondary">{r.name || 'Tanpa nama'}</Typography>
                            {r.error && <Typography variant="caption" color={r.status === 'pending' ? 'warning.main' : 'error'} sx={{ display: 'block' }}>{r.error}</Typography>}
                          </Box>
                          <Chip size="small" label={RCP_LABEL[r.status] ?? r.status} color={RCP_COLOR[r.status] ?? 'default'} sx={{ flexShrink: 0 }} />
                        </Stack>
                      ))}
                    </Stack>
                    {shown.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Tidak ada penerima yang cocok.</Typography>}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Menampilkan {shown.length} dari {recs.length} penerima
                    </Typography>
                  </Box>
                </Box>
              </>
            );
          })() : (
            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress /></Box>
          )}
        </DialogContent>
        <DialogActions>
          {detail?.broadcast.status === 'wa_restricted' ? (
            <>
              <Button color="inherit" disabled={resumeBroadcast.isPending} onClick={() => resume(detail.broadcast)}>
                Saya mengerti, tetap lanjutkan
              </Button>
              <Button variant="contained" onClick={closeDetail}>Istirahatkan dulu</Button>
            </>
          ) : (
            <Button onClick={closeDetail}>Tutup</Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
