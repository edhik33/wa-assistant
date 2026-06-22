import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Select, MenuItem, CircularProgress,
} from '@mui/material';
import { useAdminTenants, useAdminPlans, useUpdateTenant } from '../../hooks';
import type { TenantRow } from '../../types';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success', trial: 'warning', suspended: 'error', expired: 'default',
};

export default function AdminTenants() {
  const { data: tenants, isLoading } = useAdminTenants();
  const { data: plans } = useAdminPlans();
  const updateTenant = useUpdateTenant();

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 3 }}>Tenant ({tenants?.length ?? 0})</Typography>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}
