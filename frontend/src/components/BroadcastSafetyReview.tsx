import {
  Alert, AlertTitle, Box, Checkbox, Chip, FormControl, FormControlLabel,
  InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import type { BroadcastAssessment, BroadcastSafetyForm } from '../types';

export default function BroadcastSafetyReview({
  value,
  assessment,
  stale = false,
  onChange,
}: {
  value: BroadcastSafetyForm;
  assessment?: BroadcastAssessment | null;
  stale?: boolean;
  onChange: (patch: Partial<BroadcastSafetyForm>, affectsAssessment?: boolean) => void;
}) {
  const severity = !assessment || stale
    ? 'info'
    : assessment.level === 'low'
      ? 'success'
      : assessment.level === 'medium'
        ? 'warning'
        : 'error';

  return (
    <Stack spacing={1.25}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.25 }}>Izin penerima</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Ini pernyataan Anda, bukan verifikasi sistem. WhatsApp tidak mengecek izin ini.
        </Typography>
        <Typography variant="caption" color="success.main" sx={{ display: 'block', fontWeight: 600 }}>
          Cara paling aman: kirim ke kontak yang pernah berinteraksi (tombol "Pernah chat").
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <FormControl size="small" fullWidth>
          <InputLabel>Jenis pesan</InputLabel>
          <Select
            value={value.consent_category}
            label="Jenis pesan"
            onChange={e => onChange({ consent_category: e.target.value as BroadcastSafetyForm['consent_category'] }, true)}
          >
            <MenuItem value="marketing">Promo atau penawaran</MenuItem>
            <MenuItem value="order_update">Update pesanan</MenuItem>
            <MenuItem value="reminder">Pengingat</MenuItem>
            <MenuItem value="service_info">Informasi layanan</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>Sumber izin (opsional)</InputLabel>
          <Select
            value={value.consent_source}
            label="Sumber izin (opsional)"
            onChange={e => onChange({ consent_source: e.target.value }, true)}
          >
            <MenuItem value=""><em>Tidak dicatat</em></MenuItem>
            <MenuItem value="form">Form persetujuan</MenuItem>
            <MenuItem value="checkout">Checkout atau pemesanan</MenuItem>
            <MenuItem value="customer_request">Permintaan pelanggan</MenuItem>
            <MenuItem value="event">Event atau pendaftaran offline</MenuItem>
            <MenuItem value="other">Sumber lain yang terdokumentasi</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          type="date"
          size="small"
          label="Tanggal izin (opsional)"
          value={value.consent_granted_at}
          onChange={e => onChange({ consent_granted_at: e.target.value }, true)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: { xs: '100%', sm: 210 }, flexShrink: 0 }}
        />
        <TextField
          size="small"
          fullWidth
          label="Catatan bukti (opsional)"
          placeholder="Contoh: Form promo Juni 2026"
          value={value.consent_note}
          onChange={e => onChange({ consent_note: e.target.value }, true)}
        />
      </Stack>

      <FormControlLabel
        control={(
          <Checkbox
            checked={value.consent_confirmed}
            onChange={e => onChange({ consent_confirmed: e.target.checked }, true)}
          />
        )}
        label={(
          <Typography variant="body2">
            Saya menyatakan penerima sudah memberi izin untuk jenis pesan ini, dan saya bertanggung jawab atas pernyataan ini.
          </Typography>
        )}
      />

      <Alert severity={severity} icon={false}>
        <AlertTitle sx={{ fontWeight: 800 }}>
          {stale ? 'Periksa ulang setelah perubahan' : assessment?.title || 'Belum diperiksa'}
        </AlertTitle>
        {!assessment || stale ? (
          <Typography variant="body2">Jalankan pemeriksaan untuk melihat penerima yang dapat dikirim dan tingkat risikonya.</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mb: assessment.findings.length ? 1 : 0 }}>
              <Chip size="small" label={`${assessment.eligible_recipients} memenuhi syarat`} color="success" variant="outlined" />
              <Chip size="small" label={`${assessment.engaged_recipients} pernah berinteraksi`} variant="outlined" />
              {assessment.consent_to_record > 0 && <Chip size="small" label={`${assessment.consent_to_record} izin akan dicatat`} color="info" variant="outlined" />}
              {assessment.missing_consent > 0 && <Chip size="small" label={`${assessment.missing_consent} tanpa catatan izin`} color="error" variant="outlined" />}
              {assessment.opted_out > 0 && <Chip size="small" label={`${assessment.opted_out} sudah berhenti`} color="error" variant="outlined" />}
            </Stack>
            {assessment.findings.length === 0 ? (
              <Typography variant="body2">Tidak ada peringatan tambahan dari pemeriksaan saat ini.</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                {assessment.findings.map(finding => (
                  <li key={finding.code}>
                    <Typography variant="body2">
                      {finding.message}
                      {finding.recommendation && (
                        <Box component="span" sx={{ display: 'block', opacity: 0.82 }}>
                          Saran: {finding.recommendation}
                        </Box>
                      )}
                    </Typography>
                  </li>
                ))}
              </Box>
            )}
          </>
        )}
      </Alert>

      {assessment && !stale && assessment.level === 'medium' && (
        <FormControlLabel
          control={(
            <Checkbox
              checked={value.risk_acknowledged}
              onChange={e => onChange({ risk_acknowledged: e.target.checked }, false)}
              color="warning"
            />
          )}
          label={<Typography variant="body2">Saya sudah membaca peringatannya dan ingin melanjutkan.</Typography>}
        />
      )}

      {assessment && !stale && assessment.level === 'high' && (
        <Stack spacing={1}>
          <Alert severity="error" icon={false}>
            Risiko tinggi masih dapat diteruskan oleh pengguna. Keputusan dan alasannya akan disimpan pada riwayat broadcast.
          </Alert>
          <TextField
            size="small"
            label={`Ketik: ${assessment.override_phrase || 'SAYA PAHAM RISIKONYA'}`}
            value={value.override_phrase}
            onChange={e => onChange({ override_phrase: e.target.value }, false)}
            fullWidth
          />
          <TextField
            size="small"
            label="Alasan tetap melanjutkan"
            value={value.override_reason}
            onChange={e => onChange({ override_reason: e.target.value }, false)}
            placeholder="Contoh: penerima baru mendaftar pada acara hari ini"
            fullWidth
          />
        </Stack>
      )}

      <Typography variant="caption" color="text.secondary">
        Pemeriksaan ini mengurangi risiko operasional, bukan jaminan nomor bebas pembatasan. Jeda kirim hanya mengatur ritme pengiriman.
      </Typography>
    </Stack>
  );
}
