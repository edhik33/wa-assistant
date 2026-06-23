import { Box, Card, CardContent, Typography, Grid, CircularProgress } from '@mui/material';
import { useAdminStats } from '../../hooks';
import { rupiah } from '../../types';
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
      </Grid>
    </Box>
  );
}
