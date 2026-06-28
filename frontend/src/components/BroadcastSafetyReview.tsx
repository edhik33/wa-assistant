import {
  Accordion, AccordionDetails, AccordionSummary, Alert, AlertTitle, Box, Checkbox,
  Chip, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack,
  TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { BroadcastAssessment, BroadcastSafetyForm } from '../types';

function localDateValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

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
  const needsConsentStatement = !assessment || stale || assessment.missing_consent > 0;

  return (
    <Stack spacing={1.25}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.25 }}>Izin penerima</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Catatan ini hanya disimpan di ChatLoop dan tidak dikirim atau diverifikasi oleh WhatsApp.
        </Typography>
        <Typography variant="caption" color="success.main" sx={{ display: 'block', fontWeight: 600 }}>
          Cara paling aman: kirim ke kontak yang pernah berinteraksi (tombol "Pernah chat").
        </Typography>
      </Box>

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
      <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
        Promo paling berisiko bikin nomor dibatasi, jadi diperiksa lebih ketat daripada pesan transaksional.
      </Typography>

      {needsConsentStatement ? (
        <FormControlLabel
          control={(
            <Checkbox
              checked={value.consent_confirmed}
              onChange={e => onChange({ consent_confirmed: e.target.checked }, true)}
            />
          )}
          label={(
            <Typography variant="body2">
              Saya memastikan penerima dalam daftar ini memang memberi izin untuk menerima jenis pesan tersebut.
            </Typography>
          )}
        />
      ) : (
        <Alert severity="success" icon={false} sx={{ py: 0.25 }}>
          <Typography variant="body2">
            {assessment?.consent_to_record
              ? `${assessment.consent_to_record} catatan izin akan disimpan saat kampanye dimulai.`
              : `Catatan izin untuk ${assessment?.existing_consent || 0} penerima sudah tersedia. Tidak perlu konfirmasi ulang.`}
          </Typography>
        </Alert>
      )}

      {value.consent_confirmed && (
        <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75 } }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>Detail izin</Typography>
              <Typography variant="caption" color="text.secondary">Opsional, untuk catatan internal.</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Stack spacing={1}>
              <FormControl size="small" fullWidth>
                <InputLabel>Sumber izin</InputLabel>
                <Select
                  value={value.consent_source}
                  label="Sumber izin"
                  onChange={e => onChange({ consent_source: e.target.value as BroadcastSafetyForm['consent_source'] }, true)}
                >
                  <MenuItem value=""><em>Tidak dicatat</em></MenuItem>
                  <MenuItem value="form">Formulir</MenuItem>
                  <MenuItem value="checkout">Checkout atau transaksi</MenuItem>
                  <MenuItem value="customer_request">Permintaan pelanggan</MenuItem>
                  <MenuItem value="event">Acara atau pendaftaran</MenuItem>
                  <MenuItem value="other">Sumber lain</MenuItem>
                </Select>
              </FormControl>
              <TextField
                type="date"
                size="small"
                fullWidth
                label="Tanggal izin"
                value={value.consent_granted_at}
                onChange={e => onChange({ consent_granted_at: e.target.value }, true)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: localDateValue() } }}
              />
              <TextField
                size="small"
                fullWidth
                label="Catatan"
                value={value.consent_note}
                onChange={e => onChange({ consent_note: e.target.value }, true)}
                placeholder="Contoh: mendaftar promo saat acara 12 Juni"
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

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
