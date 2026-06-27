import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import GroupsIcon from '@mui/icons-material/GroupsOutlined';
import ShieldIcon from '@mui/icons-material/ShieldOutlined';
import PageHeader from './PageHeader';
import { useManagedGroups } from '../hooks';

export default function GroupGuardPanel({ agentId }: { agentId: number }) {
  const { data: groups, isLoading, isError, error, refetch, isFetching } = useManagedGroups(agentId);

  const adminCount = groups?.filter(g => g.bot_is_admin).length ?? 0;
  const total = groups?.length ?? 0;

  return (
    <Box>
      <PageHeader
        title="Penjaga Grup"
        subtitle="Kelola grup WhatsApp yang diikuti nomor ini. Moderasi (hapus spam, keluarkan anggota) hanya aktif di grup tempat Wai menjadi admin."
        action={(
          <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching}>
            Segarkan
          </Button>
        )}
      />

      <Alert severity="info" icon={<ShieldIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Typography variant="body2">
          Status admin terdeteksi otomatis. Jadikan Wai admin di grup yang ingin dimoderasi, lalu status di sini akan ikut berubah. Aturan anti-spam &amp; aksi menyusul di tahap berikutnya.
        </Typography>
      </Alert>

      {isLoading && (
        <Stack sx={{ py: 6, alignItems: 'center' }}><CircularProgress /></Stack>
      )}

      {isError && (
        <Alert severity="warning">
          Gagal memuat grup. Pastikan WhatsApp tersambung.
          {error instanceof Error && error.message ? ` (${error.message})` : ''}
        </Alert>
      )}

      {!isLoading && !isError && total === 0 && (
        <Alert severity="info">Belum ada grup yang diikuti nomor ini.</Alert>
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
            <Chip size="small" label={`${total} grup`} variant="outlined" />
            <Chip size="small" color="success" label={`${adminCount} sebagai admin`} variant="outlined" />
            {total - adminCount > 0 && (
              <Chip size="small" color="warning" label={`${total - adminCount} bukan admin`} variant="outlined" />
            )}
          </Stack>

          <Stack spacing={1}>
            {groups!.map(g => (
              <Card key={g.jid} variant="outlined">
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <GroupsIcon fontSize="small" color="action" />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name || g.jid}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{g.participants} anggota</Typography>
                    </Box>
                    {g.bot_is_admin ? (
                      <Chip size="small" color="success" label="Wai admin" />
                    ) : (
                      <Chip size="small" color="warning" variant="outlined" label="Wai bukan admin" />
                    )}
                  </Stack>
                  {!g.bot_is_admin && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, pl: 3.5 }}>
                      Jadikan Wai admin di grup ini agar bisa menghapus spam &amp; mengeluarkan anggota.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
