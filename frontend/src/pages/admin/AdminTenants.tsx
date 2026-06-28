import { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Select, MenuItem, CircularProgress, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack, Alert,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined';
import { useAdminTenants, useAdminPlans, useUpdateTenant, useActivateTenant } from '../../hooks';
import type { TenantRow } from '../../types';
import { rupiah } from '../../types';
import PageHeader from '../../components/PageHeader';
import { swalToast } from '../../services/swal';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success', trial: 'warning', suspended: 'error', expired: 'default',
};

export default function AdminTenants() {
  const { data: tenants, isLoading } = useAdminTenants();
  const { data: plans } = useAdminPlans();
  const updateTenant = useUpdateTenant();
  const activateTenant = useActivateTenant();

  const [actTenant, setActTenant] = useState<TenantRow | null>(null);
  const [actPlanId, setActPlanId] = useState<number | ''>('');

  const openActivate = (t: TenantRow) => {
    setActTenant(t);
    setActPlanId(t.plan_id ?? (plans?.[0]?.id ?? ''));
  };
  const doActivate = async () => {
    if (!actTenant || !actPlanId) return;
    try {
      await activateTenant.mutateAsync({ id: actTenant.id, plan_id: Number(actPlanId) });
      swalToast('Langganan diaktifkan');
      setActTenant(null);
    } catch {
      swalToast('Gagal mengaktifkan langganan', 'error');
    }
  };
  const actPlan = plans?.find(p => p.id === Number(actPlanId));

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <PageHeader title={`Tenant (${tenants?.length ?? 0})`} subtitle="Kelola status & plan tiap pelanggan." />
      <Card>
        <CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Bisnis</TableCell>
                <TableCell align="center">Nomor</TableCell>
                <TableCell align="center">Balasan AI (bln ini)</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Aksi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tenants?.map((t: TenantRow) => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.name}</Typography>
                    <Typography variant="caption" color="text.secondary">#{t.id}</Typography>
                  </TableCell>
                  <TableCell align="center">{t.numbers_used}</TableCell>
                  <TableCell align="center">{t.ai_replies_used}</TableCell>
                  <TableCell>
                    <Select size="small" value={t.plan_id ?? ''} displayEmpty sx={{ minWidth: 130 }}
                      onChange={e => updateTenant.mutate({ id: t.id, body: { plan_id: Number(e.target.value) } })}>
                      <MenuItem value=""><em>— Tanpa plan —</em></MenuItem>
                      {plans?.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select size="small" value={t.status} sx={{ minWidth: 130 }}
                      onChange={e => updateTenant.mutate({ id: t.id, body: { status: e.target.value } })}
                      renderValue={(v) => <Chip label={v} size="small" color={STATUS_COLOR[v] ?? 'default'} />}>
                      <MenuItem value="trial">trial</MenuItem>
                      <MenuItem value="active">active</MenuItem>
                      <MenuItem value="suspended">suspended</MenuItem>
                      <MenuItem value="expired">expired</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" startIcon={<CheckCircleIcon />}
                      onClick={() => openActivate(t)}>
                      Aktifkan manual
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!actTenant} onClose={() => setActTenant(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Aktifkan manual</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" icon={false}>
              Untuk pembayaran transfer manual (di luar Tripay). Langganan <b>{actTenant?.name}</b> akan
              aktif sesuai periode paket, tercatat sebagai pemasukan, dan otomatis kedaluwarsa saat habis.
            </Alert>
            <Select size="small" value={actPlanId} displayEmpty
              onChange={e => setActPlanId(Number(e.target.value))}>
              <MenuItem value="" disabled><em>— pilih paket —</em></MenuItem>
              {plans?.map(p => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} — {rupiah(p.price)}/{p.billing_period === 'yearly' ? 'thn' : 'bln'}
                </MenuItem>
              ))}
            </Select>
            {actPlan && (
              <Typography variant="caption" color="text.secondary">
                Masa aktif: {actPlan.billing_period === 'yearly' ? '1 tahun' : '1 bulan'}
                {' '}(diperpanjang dari sisa masa aktif bila masih berjalan).
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActTenant(null)}>Batal</Button>
          <Button variant="contained" onClick={doActivate} disabled={!actPlanId || activateTenant.isPending}>
            {activateTenant.isPending ? 'Memproses...' : 'Aktifkan'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
