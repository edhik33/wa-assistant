import { useState, type ReactNode } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Stack, IconButton, Chip, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Divider, Alert,
  LinearProgress, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import EventAvailableIcon from '@mui/icons-material/EventAvailableOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTimeOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAltOutlined';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import { useSchedules, useCreateSchedule, useCancelSchedule, useBroadcastDetail, useResumeBroadcast } from '../hooks';
import RecipientField from './RecipientField';
import WhatsAppEditor from './WhatsAppEditor';
import TemplatePicker from './TemplatePicker';
import PageHeader from './PageHeader';
import DelayFields from './broadcast/DelayFields';
import { swalConfirm, swalToast } from '../services/swal';
import type { ScheduledMessage } from '../types';

const DOW = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  scheduled: 'warning', running: 'warning', resuming: 'warning', wa_restricted: 'warning', done: 'success', failed: 'error', cancelled: 'default', interrupted: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Terjadwal', running: 'Sedang kirim', resuming: 'Mencoba lanjut', wa_restricted: 'Dijeda WhatsApp', done: 'Selesai', failed: 'Gagal', interrupted: 'Tertunda', cancelled: 'Dibatalkan',
};
const RCP_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  sent: 'success', failed: 'error', skipped: 'default', pending: 'warning',
};
const RCP_LABEL: Record<string, string> = {
  sent: 'Terkirim', failed: 'Gagal', skipped: 'Dilewati', pending: 'Menunggu',
};
const RISK_LABEL: Record<string, string> = {
  low: 'Risiko lebih rendah', medium: 'Sudah ditinjau', high: 'Override risiko',
};
const pad = (n: number) => String(n).padStart(2, '0');

function SectionHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
      <Box sx={{
        width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 1,
        bgcolor: 'action.hover', color: 'primary.main', flexShrink: 0,
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{subtitle}</Typography>}
      </Box>
    </Stack>
  );
}

function statusTone(status: string) {
  if (status === 'done') return 'success.main';
  if (status === 'failed' || status === 'interrupted') return 'error.main';
  if (status === 'wa_restricted') return 'warning.main';
  if (status === 'cancelled') return 'text.disabled';
  return 'warning.main';
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}

function dateKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shortDate(key: string | null) {
  if (!key) return '';
  return new Date(`${key}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function scheduledTime(s: ScheduledMessage) {
  return new Date(s.run_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarPanel({ agentId }: { agentId: number }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selDate, setSelDate] = useState<string>(dateKeyFromDate(today));
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: schedules } = useSchedules(agentId);
  const createSchedule = useCreateSchedule(agentId);
  const cancelSchedule = useCancelSchedule(agentId);
  const { data: detail } = useBroadcastDetail(agentId, detailId);
  const resumeBroadcast = useResumeBroadcast(agentId);

  const resume = async () => {
    if (!detail?.broadcast) return;
    try {
      await resumeBroadcast.mutateAsync(detail.broadcast.id);
      swalToast('Mencoba melanjutkan broadcast.');
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      swalToast(message || 'Broadcast belum bisa dilanjutkan.', 'error');
    }
  };

  const [time, setTime] = useState('09:00');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [minDelay, setMinDelay] = useState(10);
  const [maxDelay, setMaxDelay] = useState(30);
  const [restEvery, setRestEvery] = useState(25);
  const [restDuration, setRestDuration] = useState(90);
  const [err, setErr] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const byDate: Record<string, ScheduledMessage[]> = {};
  (schedules || []).forEach(s => {
    const key = dateKeyFromDate(new Date(s.run_at));
    (byDate[key] ||= []).push(s);
  });
  Object.values(byDate).forEach(list => {
    list.sort((a, b) => new Date(a.run_at).getTime() - new Date(b.run_at).getTime());
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dateKey = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
  const isToday = (day: number) => dateKey(day) === dateKeyFromDate(today);
  const daySchedules = byDate[selDate] || [];
  const activeCount = daySchedules.filter(s => s.status === 'scheduled' || s.status === 'running' || s.status === 'resuming').length;
  const monthSchedules = (schedules || []).filter(s => {
    const d = new Date(s.run_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const monthActive = monthSchedules.filter(s => s.status === 'scheduled' || s.status === 'running' || s.status === 'resuming').length;
  const monthDone = monthSchedules.filter(s => s.status === 'done').length;
  const monthIssues = monthSchedules.filter(s => s.status === 'failed' || s.status === 'interrupted' || s.status === 'wa_restricted').length;
  const formRecipients = recipients.split('\n').map(l => l.trim()).filter(Boolean);
  const formRecipientCount = formRecipients.length;
  const delayProblem = minDelay < 1 || maxDelay < 1
    ? 'Jeda harus minimal 1 detik'
    : maxDelay < minDelay
      ? 'Jeda maksimal harus lebih besar atau sama dengan jeda minimal'
      : '';

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  };

  const resetForm = () => {
    setTime('09:00');
    setMessage('');
    setRecipients('');
    setFile(null);
    setErr('');
    setErrors({});
    setMinDelay(10);
    setMaxDelay(30);
  };

  const openCreate = (key = selDate) => {
    setSelDate(key);
    resetForm();
    setFormOpen(true);
  };

  const cancel = async (s: ScheduledMessage) => {
    const ok = await swalConfirm('Batalkan jadwal ini?', `${scheduledTime(s)} - ${s.recipient_count} nomor`);
    if (!ok) return;
    try {
      await cancelSchedule.mutateAsync(s.id);
      swalToast('Jadwal dibatalkan');
    } catch {
      swalToast('Jadwal belum bisa dibatalkan', 'error');
    }
  };

  const save = async () => {
    setErr('');
    const e: Record<string, string> = {};
    if (!message.trim()) e.message = 'Pesan wajib diisi';
    const recList = formRecipients.map(line => {
      const [num, ...rest] = line.split(',');
      return { number: num, name: rest.join(',').trim() };
    });
    if (recList.length === 0) e.recipients = 'Penerima wajib diisi';
    if (delayProblem) e.delay = delayProblem;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const runAt = new Date(`${selDate}T${time}:00`);
    if (runAt.getTime() < Date.now()) {
      setErr('Waktu jadwal sudah lewat');
      return;
    }

    const fd = new FormData();
    fd.append('message', message);
    fd.append('recipients', JSON.stringify(recList));
    fd.append('run_at', runAt.toISOString());
    fd.append('min_delay', String(minDelay));
    fd.append('max_delay', String(maxDelay));
    fd.append('rest_every', String(restEvery));
    fd.append('rest_duration', String(restDuration));
    if (file) fd.append('file', file);
    try {
      const result = await createSchedule.mutateAsync(fd);
      setFormOpen(false);
      resetForm();
      const accepted = result.data?.recipient_count ?? recList.length;
      swalToast(`Jadwal tersimpan untuk ${accepted} penerima.`);
    } catch (e) {
      setErr(errorMessage(e, 'Gagal menjadwalkan'));
    }
  };

  const closeDetail = () => setDetailId(null);

  return (
    <Box>
      <PageHeader title="Jadwal"
        subtitle="Atur broadcast yang akan dikirim nanti, pantau statusnya, dan buka hasil pengiriman dari satu tempat." />

      <Alert severity="info" icon={<InfoIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Typography variant="body2">
          Pilih tanggal, lalu buat jadwal. Jika jadwal sudah berjalan, tombol hasil akan membuka detail broadcast per penerima.
        </Typography>
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) 380px' }, gap: 1.5, alignItems: 'start' }}>
        <Card>
          <CardContent>
            <SectionHeader
              icon={<EventAvailableIcon fontSize="small" />}
              title="Pilih Tanggal"
              subtitle="Klik tanggal untuk melihat daftar jadwal di sisi kanan."
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, mb: 1.25 }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <IconButton onClick={prevMonth} aria-label="Bulan sebelumnya"><ChevronLeftIcon /></IconButton>
                <Typography sx={{ fontWeight: 800, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</Typography>
                <IconButton onClick={nextMonth} aria-label="Bulan berikutnya"><ChevronRightIcon /></IconButton>
              </Stack>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                <Chip size="small" label={`${monthSchedules.length} jadwal bulan ini`} />
                <Chip size="small" label={`${monthActive} aktif`} color={monthActive ? 'warning' : 'default'} />
                <Chip size="small" label={`${monthDone} selesai`} color={monthDone ? 'success' : 'default'} variant="outlined" />
                {monthIssues > 0 && <Chip size="small" label={`${monthIssues} perlu dicek`} color="error" />}
                <Button size="small" variant="outlined" onClick={() => {
                  const now = new Date();
                  setYear(now.getFullYear());
                  setMonth(now.getMonth());
                  setSelDate(dateKeyFromDate(now));
                }}>
                  Hari ini
                </Button>
              </Stack>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0.5, mb: 0.5 }}>
              {DOW.map(d => <Typography key={d} variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary' }}>{d}</Typography>)}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0.5 }}>
              {cells.map((day, i) => day === null ? <Box key={i} /> : (() => {
                const key = dateKey(day);
                const items = byDate[key] || [];
                const selected = key === selDate;
                const failed = items.some(s => s.status === 'failed' || s.status === 'interrupted' || s.status === 'wa_restricted');
                const done = items.some(s => s.status === 'done');
                return (
                  <Box key={i} onClick={() => setSelDate(key)}
                    sx={{
                      cursor: 'pointer', border: '1px solid', borderColor: selected ? 'primary.main' : 'divider', borderRadius: 1,
                      minHeight: { xs: 58, sm: 72 }, p: 0.75, bgcolor: selected ? 'rgba(31,138,80,0.10)' : isToday(day) ? 'success.light' : 'background.paper',
                      boxShadow: selected ? 'inset 0 0 0 1px #1F8A50' : 'none',
                      '&:hover': { bgcolor: '#f1f8f4' },
                    }}>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>{day}</Typography>
                      {items.length > 0 && <Chip size="small" label={items.length} color={failed ? 'error' : done ? 'success' : 'warning'} sx={{ height: 18, minWidth: 22, fontSize: 11 }} />}
                    </Stack>
                    {items.length > 0 && (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.65, lineHeight: 1.2 }}>
                          {scheduledTime(items[0])}{items.length > 1 ? ` +${items.length - 1}` : ''}
                        </Typography>
                        <Box sx={{ mt: 0.6, display: 'flex', gap: 0.35, flexWrap: 'wrap' }}>
                          {items.slice(0, 4).map(s => (
                            <Box key={s.id} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: statusTone(s.status) }} />
                          ))}
                        </Box>
                      </>
                    )}
                  </Box>
                );
              })())}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ position: { lg: 'sticky' }, top: { lg: 12 } }}>
          <CardContent>
            <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <SectionHeader
                icon={<AccessTimeIcon fontSize="small" />}
                title="Agenda Tanggal Ini"
                subtitle={shortDate(selDate)}
              />
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreate()} sx={{ flexShrink: 0 }}>
                Buat Jadwal
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ mb: 1.25, flexWrap: 'wrap', gap: 0.75 }}>
              <Chip size="small" label={`${daySchedules.length} total`} />
              <Chip size="small" label={`${activeCount} aktif`} color={activeCount ? 'warning' : 'default'} />
              <Chip size="small" label={`${daySchedules.filter(s => s.status === 'done').length} selesai`} color={daySchedules.some(s => s.status === 'done') ? 'success' : 'default'} variant="outlined" />
              {daySchedules.some(s => s.status === 'failed' || s.status === 'interrupted' || s.status === 'wa_restricted') && (
                <Chip size="small" label="Ada yang perlu dicek" color="error" />
              )}
            </Stack>
            <Divider sx={{ mb: 1 }} />

            {daySchedules.length === 0 ? (
              <Box sx={{ py: 4, px: 1, textAlign: 'center', color: 'text.secondary' }}>
                <EventAvailableIcon sx={{ fontSize: 34, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Belum ada jadwal.</Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                  Buat jadwal broadcast untuk tanggal ini agar terkirim otomatis nanti.
                </Typography>
                <Button sx={{ mt: 1.25 }} variant="outlined" startIcon={<AddIcon />} onClick={() => openCreate()}>Buat Jadwal</Button>
              </Box>
            ) : (
              <Stack spacing={1} sx={{ maxHeight: { xs: 420, lg: 'calc(100vh - 250px)' }, overflowY: 'auto', pr: 0.25 }}>
                {daySchedules.map(s => (
                  <Box key={s.id} sx={{ p: 1.1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                    <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.35, flexWrap: 'wrap', gap: 0.5 }}>
                          <Chip size="small" icon={<AccessTimeIcon />} label={scheduledTime(s)} variant="outlined" />
                          <Chip size="small" icon={<PeopleAltIcon />} label={`${s.recipient_count} nomor`} variant="outlined" />
                          {s.media_type && <Chip size="small" icon={<AttachFileIcon />} label={s.file_name || 'Lampiran'} variant="outlined" />}
                          {s.risk_level && <Chip size="small" label={RISK_LABEL[s.risk_level] ?? s.risk_level} color={s.risk_level === 'high' ? 'error' : s.risk_level === 'medium' ? 'warning' : 'success'} variant="outlined" />}
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.message}
                        </Typography>
                      </Box>
                      <Chip size="small" label={STATUS_LABEL[s.status] ?? s.status} color={STATUS_COLOR[s.status] ?? 'default'} />
                    </Stack>
                    <Stack direction="row" spacing={0.75} sx={{ mt: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {s.broadcast_id && (
                        <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => setDetailId(s.broadcast_id || null)}>
                          Lihat Hasil
                        </Button>
                      )}
                      {s.status === 'scheduled' && (
                        <Button size="small" color="error" variant="text" startIcon={<DeleteIcon />} onClick={() => cancel(s)}>
                          Batalkan
                        </Button>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Box>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Buat Jadwal Broadcast</DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
          <Alert severity="info" icon={false} sx={{ mb: 1.5 }}>
            <Typography variant="body2">
              Jadwal untuk <b>{shortDate(selDate)}</b>. Pesan dikirim otomatis ke daftar penerima pada waktu yang dipilih. Kontak yang membalas STOP otomatis dilewati.
            </Typography>
          </Alert>

          <Box sx={{ mb: 1.75 }}>
            <SectionHeader icon={<AccessTimeIcon fontSize="small" />} title="Waktu Kirim" subtitle="Pilih jam mulai pengiriman." />
            <TextField type="time" label="Jam mulai" size="small" value={time} onChange={e => setTime(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: { xs: '100%', sm: 180 } }} />
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Box sx={{ mb: 1.5 }}>
            <SectionHeader
              icon={<EventAvailableIcon fontSize="small" />}
              title="Pesan"
              subtitle={`${message.length}/2000 karakter`}
            />
            <Box sx={{ mb: 0.75 }}>
              <TemplatePicker agentId={agentId} onPick={b => { setMessage(m => m ? m + '\n' + b : b); if (errors.message) setErrors(p => ({ ...p, message: '' })); }} />
            </Box>
            <WhatsAppEditor value={message} onChange={v => { setMessage(v); if (errors.message) setErrors(p => ({...p, message: ''})); }}
              placeholder="Halo {nama}, ..." rows={3} error={!!errors.message} helperText={errors.message} />
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
            <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon />}>
              {file ? 'Ganti lampiran' : 'Tambah lampiran'}
              <input type="file" hidden onChange={e => setFile(e.target.files?.[0] || null)} />
            </Button>
            {file && <Chip label={file.name} size="small" onDelete={() => setFile(null)} deleteIcon={<CloseIcon />} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1.5 }}>
            Bisa gambar atau video (maks video 16MB). File lebih besar kirim sebagai dokumen.
          </Typography>

          <Divider sx={{ my: 1.5 }} />

          <SectionHeader
            icon={<PeopleAltIcon fontSize="small" />}
            title="Penerima"
            subtitle={`${formRecipientCount} baris penerima siap diproses.`}
          />
          <RecipientField agentId={agentId} value={recipients} onChange={v => { setRecipients(v); if (errors.recipients) setErrors(p => ({...p, recipients: ''})); }} error={errors.recipients} />

          <Divider sx={{ my: 1.5 }} />

          <SectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="Jeda Kirim"
            subtitle="Mengatur ritme kirim, bukan jaminan nomor bebas pembatasan."
          />
          <DelayFields
            minDelay={minDelay} maxDelay={maxDelay} restEvery={restEvery} restDuration={restDuration}
            setMinDelay={setMinDelay} setMaxDelay={setMaxDelay} setRestEvery={setRestEvery} setRestDuration={setRestDuration}
            error={errors.delay || delayProblem || undefined}
            onEditDelay={() => { if (errors.delay) setErrors(p => ({ ...p, delay: '' })); }}
          />

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Batal</Button>
          <Button variant="contained" onClick={save} disabled={createSchedule.isPending}
            startIcon={createSchedule.isPending ? <CircularProgress size={16} /> : null}>
            {createSchedule.isPending ? 'Menyimpan...' : 'Simpan jadwal'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!detailId} onClose={closeDetail} fullWidth maxWidth="sm">
        <DialogTitle>Hasil Broadcast Terjadwal</DialogTitle>
        <DialogContent dividers>
          {detail ? (() => {
            const b = detail.broadcast;
            const done = b.sent + b.failed + b.skipped;
            const pct = b.total ? Math.round((done / b.total) * 100) : 0;
            return (
              <>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                  <Chip label={STATUS_LABEL[b.status] ?? b.status} color={STATUS_COLOR[b.status] ?? 'default'} />
                  <Typography variant="caption" color="text.secondary">
                    {b.sent} terkirim · {b.failed} gagal · {b.skipped} dilewati / {b.total}
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 7, borderRadius: 5, mb: 1.5 }} />
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>{b.message}</Typography>
                {b.status === 'wa_restricted' && (
                  <Alert severity="warning" icon={false} sx={{ mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>Pengiriman dijeda oleh WhatsApp</Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      {Math.max(0, b.total - b.sent - b.failed - b.skipped)} penerima masih menunggu.
                    </Typography>
                    {b.pause_code ? <Typography variant="caption" color="text.secondary">Detail teknis: kode {b.pause_code}</Typography> : null}
                  </Alert>
                )}
                <Box sx={{ maxHeight: 360, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Nomor</TableCell>
                        <TableCell>Nama</TableCell>
                        <TableCell align="right">Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.recipients.map(r => (
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
              </>
            );
          })() : (
            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress /></Box>
          )}
        </DialogContent>
        <DialogActions>
          {detail?.broadcast.status === 'wa_restricted' && (
            <Button variant="contained" disabled={resumeBroadcast.isPending} onClick={resume}>
              Coba lanjutkan ({Math.max(0, detail.broadcast.total - detail.broadcast.sent - detail.broadcast.failed - detail.broadcast.skipped)})
            </Button>
          )}
          <Button onClick={closeDetail}>Tutup</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
