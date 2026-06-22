import { Card, CardContent, Typography, Box, LinearProgress, Chip, Stack } from '@mui/material';
import { useUsage } from '../hooks';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success', trial: 'warning', suspended: 'error', expired: 'default',
};

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = !max || max <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  const danger = !unlimited && pct >= 90;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, color: danger ? 'error.main' : 'text.primary' }}>
          {used}{unlimited ? '' : ` / ${max}`}
        </Typography>
      </Stack>
      {!unlimited && (
        <LinearProgress variant="determinate" value={pct} color={danger ? 'error' : 'primary'} sx={{ height: 6, borderRadius: 3, mt: 0.5 }} />
      )}
    </Box>
  );
}

export default function UsageCard() {
  const { data } = useUsage();
  if (!data) return null;
  const planName = data.tenant?.plan?.name || 'Trial';

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Paket: {planName}</Typography>
          <Chip label={data.tenant?.status} size="small" color={STATUS_COLOR[data.tenant?.status] ?? 'default'} />
        </Stack>
        <Meter label="Nomor WhatsApp" used={data.numbers_used} max={data.max_numbers} />
        <Meter label={`Balasan AI (${data.period})`} used={data.ai_replies_used} max={data.ai_replies_max} />
      </CardContent>
    </Card>
  );
}
