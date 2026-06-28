import { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, CircularProgress,
  Select, MenuItem, FormControl, InputLabel, Alert, Stack, Chip,
  TextField, Button, Switch, FormControlLabel, Divider,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useAdminStats, useAdminAIModel, useSetAdminAIModel, useAdminCommunityLinks, useSetAdminCommunityLinks, useAdminMetaTracking, useSetAdminMetaTracking, useTestAdminMetaTracking } from '../../hooks';
import type { MetaTrackingAdminConfig } from '../../types';
import { rupiah } from '../../types';
import { swalToast } from '../../services/swal';
import PageHeader from '../../components/PageHeader';

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h4" sx={{ fontWeight: 800, color }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  );
}

function AIModelCard() {
  const { data, isLoading } = useAdminAIModel();
  const setModel = useSetAdminAIModel();

  const change = async (preset: string) => {
    try {
      await setModel.mutateAsync(preset);
      swalToast('Model AI diganti', 'success');
    } catch {
      swalToast('Gagal mengganti model', 'error');
    }
  };

  if (isLoading || !data) return null;
  const activePreset = data.presets.find(p => p.key === data.active);

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Model AI (berlaku untuk semua tenant)</Typography>
          {activePreset && <Chip size="small" label={activePreset.model} variant="outlined" />}
        </Stack>
        <FormControl size="small" fullWidth sx={{ maxWidth: 360 }}>
          <InputLabel>Model aktif</InputLabel>
          <Select label="Model aktif" value={data.active} disabled={setModel.isPending}
            onChange={e => change(e.target.value)}>
            {data.presets.map(p => (
              <MenuItem key={p.key} value={p.key} disabled={!p.available && p.key !== data.active}>
                {p.label}{!p.available ? ' · API key belum diisi' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {activePreset && !activePreset.available && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            API key untuk model ini belum diisi di server, jadi AI otomatis pakai DeepSeek sebagai cadangan. Isi env-nya (mis. <code>OPENROUTER_API_KEY</code>) lalu pilih ulang.
          </Alert>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
          Model selain DeepSeek lewat OpenRouter (satu API key buka banyak model). Ganti berlaku langsung tanpa restart.
        </Typography>
      </CardContent>
    </Card>
  );
}

function CommunityForm({ initial }: { initial: { whatsapp: string; telegram: string } }) {
  const save = useSetAdminCommunityLinks();
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp || '');
  const [telegram, setTelegram] = useState(initial.telegram || '');

  const submit = async () => {
    try {
      await save.mutateAsync({ whatsapp: whatsapp.trim(), telegram: telegram.trim() });
      swalToast('Link komunitas disimpan', 'success');
    } catch {
      swalToast('Gagal menyimpan link', 'error');
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Grup Komunitas</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          Tautan ini muncul sebagai tombol "Gabung Grup" di dashboard semua user. Kosongkan untuk menyembunyikannya.
        </Typography>
        <Stack spacing={1.5} sx={{ maxWidth: 480 }}>
          <TextField size="small" fullWidth label="Link Grup WhatsApp" placeholder="https://chat.whatsapp.com/..."
            value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
          <TextField size="small" fullWidth label="Link Grup/Channel Telegram" placeholder="https://t.me/..."
            value={telegram} onChange={e => setTelegram(e.target.value)} />
          <Box>
            <Button variant="contained" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function CommunityCard() {
  const { data, isLoading } = useAdminCommunityLinks();
  if (isLoading || !data) return null;
  return <CommunityForm key={`${data.whatsapp}-${data.telegram}`} initial={data} />;
}

function requestError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}

function MetaTrackingForm({ initial }: { initial: MetaTrackingAdminConfig }) {
  const save = useSetAdminMetaTracking();
  const test = useTestAdminMetaTracking();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [pixelID, setPixelID] = useState(initial.pixel_id);
  const [accessToken, setAccessToken] = useState('');
  const [graphVersion, setGraphVersion] = useState(initial.graph_version || 'v25.0');
  const [testEventCode, setTestEventCode] = useState(initial.test_event_code);

  const submit = async () => {
    try {
      await save.mutateAsync({
        enabled,
        pixel_id: pixelID.trim(),
        access_token: accessToken.trim(),
        graph_version: graphVersion.trim(),
        test_event_code: testEventCode.trim(),
      });
      setAccessToken('');
      swalToast('Tracking Meta disimpan', 'success');
    } catch (error) {
      swalToast(requestError(error, 'Gagal menyimpan tracking Meta'), 'error');
    }
  };

  const sendTest = async () => {
    try {
      await test.mutateAsync();
      swalToast('Event tes diterima Meta', 'success');
    } catch (error) {
      swalToast(requestError(error, 'Event tes belum berhasil'), 'error');
    }
  };

  const { stats } = initial;
  const tokenReady = initial.token_configured || accessToken.trim() !== '';
  const dirty = enabled !== initial.enabled || pixelID !== initial.pixel_id || accessToken !== '' ||
    graphVersion !== initial.graph_version || testEventCode !== initial.test_event_code;

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1, mb: 0.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Meta Pixel & Conversions API</Typography>
            <Typography variant="caption" color="text.secondary">
              Ukur pendaftaran, checkout, dan pembayaran ChatLoop dari iklan Meta.
            </Typography>
          </Box>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={event => setEnabled(event.target.checked)} />}
            label={enabled ? 'Aktif' : 'Nonaktif'}
            sx={{ m: 0 }}
          />
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={1.5} sx={{ maxWidth: 860 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" label="Pixel ID" placeholder="Contoh: 123456789012345"
              value={pixelID} onChange={event => setPixelID(event.target.value.replace(/\D/g, ''))} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" type="password" label="Access Token CAPI"
              placeholder={initial.token_configured ? 'Sudah tersimpan - isi untuk mengganti' : 'Masukkan token dari Events Manager'}
              value={accessToken} onChange={event => setAccessToken(event.target.value)}
              helperText={initial.token_configured ? 'Token tersimpan terenkripsi dan tidak ditampilkan kembali.' : 'Token hanya disimpan di server.'} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" label="Test Event Code" placeholder="Contoh: TEST12345"
              value={testEventCode} onChange={event => setTestEventCode(event.target.value)}
              helperText="Isi saat pengujian. Kosongkan sebelum menjalankan iklan produksi." />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" label="Versi Graph API" placeholder="v25.0"
              value={graphVersion} onChange={event => setGraphVersion(event.target.value)}
              helperText="Ubah hanya saat Meta menghentikan versi yang dipakai." />
          </Grid>
        </Grid>

        <Alert severity={testEventCode ? 'warning' : 'info'} sx={{ mt: 2, maxWidth: 860 }}>
          {testEventCode
            ? 'Mode tes aktif. Semua event CAPI masuk ke Test Events dan belum menjadi data produksi.'
            : 'Browser dan server memakai ID event yang sama agar event tidak dihitung dua kali. Purchase hanya dikirim setelah pembayaran terverifikasi.'}
        </Alert>

        <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={submit} disabled={save.isPending || !dirty}>
            {save.isPending ? 'Menyimpan...' : 'Simpan perubahan'}
          </Button>
          <Button variant="outlined" startIcon={<ScienceOutlinedIcon />} onClick={sendTest}
            disabled={test.isPending || dirty || !initial.enabled || !initial.test_event_code || !tokenReady}>
            {test.isPending ? 'Mengirim...' : 'Kirim event tes'}
          </Button>
          <Chip size="small" color={tokenReady ? 'success' : 'default'} variant="outlined"
            label={tokenReady ? 'Token siap' : 'Token belum diisi'} />
        </Stack>

        <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${stats.pending} menunggu`} />
          <Chip size="small" color="success" variant="outlined" label={`${stats.sent} terkirim`} />
          <Chip size="small" color={stats.failed > 0 ? 'error' : 'default'} variant="outlined" label={`${stats.failed} gagal`} />
        </Stack>
        {stats.last_event && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Event terakhir: {stats.last_event.event_name} · {stats.last_event.status} · {new Date(stats.last_event.created_at).toLocaleString('id-ID')}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function MetaTrackingCard() {
  const { data, isLoading, isError } = useAdminMetaTracking();
  if (isError) return <Alert severity="warning">Pengaturan Meta Pixel dan CAPI belum bisa dimuat.</Alert>;
  if (isLoading || !data) return null;
  const formKey = `${data.enabled}-${data.pixel_id}-${data.graph_version}-${data.test_event_code}-${data.token_configured}`;
  return <MetaTrackingForm key={formKey} initial={data} />;
}

export default function AdminOverview() {
  const { data, isLoading } = useAdminStats();

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <PageHeader title="Ringkasan Platform" subtitle="Pantauan singkat tenant, langganan, dan pemakaian AI." />
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Total Tenant" value={data?.total_tenants ?? 0} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Aktif (berbayar)" value={data?.active_tenants ?? 0} color="#2e7d32" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Trial" value={data?.trial_tenants ?? 0} color="#ed6c02" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label={`Balasan AI (${data?.period ?? ''})`} value={data?.ai_replies_month ?? 0} /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><StatCard label="Total Pendapatan (lunas)" value={rupiah(data?.revenue_total ?? 0)} color="#1565c0" /></Grid>
        <Grid size={{ xs: 12 }}><AIModelCard /></Grid>
        <Grid size={{ xs: 12 }}><MetaTrackingCard /></Grid>
        <Grid size={{ xs: 12 }}><CommunityCard /></Grid>
      </Grid>
    </Box>
  );
}
