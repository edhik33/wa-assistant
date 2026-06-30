import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Stack, Chip, IconButton, Checkbox, Card, CardContent, Alert, Divider, Tooltip, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Pagination,
} from '@mui/material';
import EmptyState from './common/EmptyState';
import PeopleIcon from '@mui/icons-material/PeopleOutlined';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CampaignIcon from '@mui/icons-material/CampaignOutlined';
import LocalOfferIcon from '@mui/icons-material/LocalOfferOutlined';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import { useBroadcastConsentSummary, useCrmContacts, useSaveCrmContact, useDeleteCrmContact, useCrmContactsExport, useBulkDeleteCrmContacts } from '../hooks';
import type { SavedContact } from '../types';
import api from '../services/api';
import PageHeader from './PageHeader';
import ContactImportDialog from './contacts/ContactImportDialog';
import { swalConfirm, swalToast } from '../services/swal';

const EMPTY: Partial<SavedContact> = { number: '', name: '', notes: '', tags: '' };

function GridLikeSummary({ total, selected, tags, syncing }: { total: number; selected: number; tags: number; syncing: boolean }) {
  const items = [
    { label: 'Total kontak', value: total, color: 'text.primary' },
    { label: 'Dipilih', value: selected, color: selected ? 'primary.main' : 'text.secondary' },
    { label: 'Tag aktif', value: tags, color: tags ? 'success.main' : 'text.secondary' },
    { label: 'Status', value: syncing ? 'Sinkron' : 'Siap', color: syncing ? 'warning.main' : 'success.main' },
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mb: 1.5 }}>
      {items.map(item => (
        <Paper key={item.label} variant="outlined" sx={{ p: 1, borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{item.label}</Typography>
          <Typography sx={{ fontWeight: 900, color: item.color, lineHeight: 1.25 }}>{item.value}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

export default function ContactsPanel({ agentId, onBroadcast, onOpenChat }: {
  agentId: number;
  onBroadcast: (recipients: string) => void;
  onOpenChat: (number: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<SavedContact | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<SavedContact>>(EMPTY);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTag, setBulkTag] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useCrmContacts(agentId, q, tag, page);
  const { data: consentSummary } = useBroadcastConsentSummary(agentId);
  const saveCrmContact = useSaveCrmContact(agentId);
  const deleteCrmContact = useDeleteCrmContact(agentId);
  const bulkDelete = useBulkDeleteCrmContacts(agentId);
  const crmExport = useCrmContactsExport(agentId);
  const queryClient = useQueryClient();

  const contacts = data?.data || [];
  const allTags = data?.all_tags || [];
  const totalContacts = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalContacts / (data?.limit ?? 20)));
  const selectedContacts = contacts.filter(c => selected.has(c.id));
  const hasFilter = !!q.trim() || !!tag;

  const openAdd = () => { setForm(EMPTY); setFormErrors({}); setAddOpen(true); };
  const openEdit = (ct: SavedContact) => { setForm(ct); setFormErrors({}); setEdit(ct); setOpen(true); };
  const closeDialog = () => { setAddOpen(false); setOpen(false); setEdit(null); setFormErrors({}); };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.number?.trim()) errs.number = 'Nomor WhatsApp wajib diisi';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      await saveCrmContact.mutateAsync(form);
      swalToast(addOpen ? 'Kontak ditambahkan' : 'Kontak disimpan');
      closeDialog();
    } catch {
      swalToast('Kontak belum bisa disimpan', 'error');
    }
  };

  const remove = async (ct: SavedContact) => {
    if (!await swalConfirm(`Hapus kontak ${ct.name || ct.number}?`, 'Kontak yang dihapus tidak muncul lagi di daftar CRM.')) return;
    try {
      await deleteCrmContact.mutateAsync(ct.id);
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(ct.id);
        return next;
      });
      swalToast('Kontak dihapus');
    } catch {
      swalToast('Kontak belum bisa dihapus', 'error');
    }
  };

  const pickTag = (t: string) => { setTag(prev => prev === t ? '' : t); setPage(0); setSelected(new Set()); };

  const handleBroadcast = async () => {
    try {
      const list = selectedContacts.length > 0 ? selectedContacts : await crmExport.mutateAsync({ q, tag });
      const lines = list.map(c => `${c.number},${c.name || ''}`);
      onBroadcast(lines.join('\n'));
      swalToast(`${list.length} kontak dikirim ke Blast`);
    } catch {
      swalToast('Kontak belum bisa dikirim ke Blast', 'error');
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === contacts.length && contacts.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map(c => c.id)));
    }
  };

  const handleBulkTag = async () => {
    if (!bulkTag.trim() || selected.size === 0) return;
    setBulkApplying(true);
    try {
      await api.post(`/agents/${agentId}/crm/contacts/bulk-tag`, {
        ids: Array.from(selected),
        tag: bulkTag.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts', agentId] });
      setSelected(new Set());
      setBulkTag('');
      swalToast('Tag ditambahkan');
    } catch {
      swalToast('Tag belum bisa ditambahkan', 'error');
    } finally {
      setBulkApplying(false);
    }
  };

  const handleBulkDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!await swalConfirm(`Hapus ${selected.size} kontak terpilih?`, 'Kontak yang dihapus tidak muncul lagi di daftar CRM.')) return;
    try {
      const res = await bulkDelete.mutateAsync({ ids: Array.from(selected) });
      setSelected(new Set());
      swalToast(`${res.deleted} kontak dihapus`);
    } catch {
      swalToast('Kontak belum bisa dihapus', 'error');
    }
  };

  const handleDeleteAll = async () => {
    const scope = hasFilter ? 'semua kontak yang cocok filter ini' : 'SEMUA kontak';
    if (!await swalConfirm(`Hapus ${scope}?`, 'Tindakan ini tidak bisa dibatalkan. Kontak akan hilang dari daftar CRM.')) return;
    try {
      const res = await bulkDelete.mutateAsync({ all: true, q, tag });
      setSelected(new Set());
      setPage(0);
      swalToast(`${res.deleted} kontak dihapus`);
    } catch {
      swalToast('Kontak belum bisa dihapus', 'error');
    }
  };

  const contactInitial = (ct: SavedContact) => {
    const base = (ct.name || ct.number || '?').trim();
    return base.slice(0, 1).toUpperCase();
  };

  return (
    <Box>
      <PageHeader
        title="Kontak"
        subtitle="Kelola kontak pelanggan untuk Chat dan Blast. Kontak dari percakapan tersimpan otomatis; kontak lainnya dapat diimpor."
        action={
          <Stack direction="row" spacing={0.75} sx={{ width: '100%' }}>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)} sx={{ flex: { xs: 1, sm: 'initial' } }}>Impor</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ flex: { xs: 1, sm: 'initial' } }}>Tambah Kontak</Button>
          </Stack>
        }
      />

      <GridLikeSummary total={totalContacts} selected={selected.size} tags={allTags.length} syncing={false} />

      {consentSummary && (
        <Paper variant="outlined" sx={{ px: 1.25, py: 1, mb: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 750 }}>Kesiapan Blast</Typography>
              <Typography variant="caption" color="text.secondary">Ringkasan aktivitas yang tercatat di ChatLoop, bukan status resmi dari WhatsApp.</Typography>
            </Box>
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
              <Chip size="small" color="success" variant="outlined" label={`${consentSummary.marketing_consent} izin promo`} />
              <Chip size="small" variant="outlined" label={`${consentSummary.interacted} pernah chat`} />
              <Chip size="small" color={consentSummary.opted_out ? 'warning' : 'default'} variant="outlined" label={`${consentSummary.opted_out} STOP`} />
            </Stack>
          </Stack>
        </Paper>
      )}

      <Card sx={{ mb: 1.5 }}>
        <CardContent sx={{ pb: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'center' }, mb: allTags.length ? 1 : 0 }}>
            <TextField
              fullWidth size="small" placeholder="Cari nama atau nomor..."
              value={q} onChange={e => { setQ(e.target.value); setPage(0); setSelected(new Set()); }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                  endAdornment: q ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => { setQ(''); setPage(0); setSelected(new Set()); }}><CloseIcon fontSize="small" /></IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <Button variant="outlined" startIcon={<CampaignIcon />} onClick={handleBroadcast}
              disabled={(selectedContacts.length === 0 && totalContacts === 0) || crmExport.isPending}
              sx={{ minWidth: { md: 190 } }}>
              Kirim ke Blast
            </Button>
          </Stack>

          {allTags.length > 0 && (
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.25, fontWeight: 700 }}>Tag:</Typography>
              <Chip label="Semua" size="small" color={!tag ? 'primary' : 'default'} variant={!tag ? 'filled' : 'outlined'}
                onClick={() => pickTag('')} sx={{ cursor: 'pointer' }} />
              {allTags.map(t => (
                <Chip key={t} label={t} size="small" color={tag === t ? 'primary' : 'default'}
                  variant={tag === t ? 'filled' : 'outlined'} onClick={() => pickTag(t)}
                  sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }} />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Paper variant="outlined" sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Memuat kontak...</Typography>
        </Paper>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<PeopleIcon sx={{ fontSize: 48 }} />}
          title={hasFilter ? 'Tidak ada kontak' : 'Belum ada kontak'}
          description={hasFilter
            ? 'Coba ubah filter atau kata kunci.'
            : 'Kontak masuk otomatis saat pelanggan chat. Atau impor manual, dari nomor terkoneksi, maupun file CSV.'}
          actionLabel={hasFilter ? undefined : 'Impor Kontak'}
          onAction={hasFilter ? undefined : () => setImportOpen(true)}
        />
      ) : (
        <>
          {selected.size > 0 && (
            <Paper variant="outlined" sx={{ p: 1, mb: 1, borderColor: 'primary.light', bgcolor: 'rgba(31,138,80,0.06)' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
                <Chip label={`${selected.size} kontak dipilih`} size="small" color="primary" onDelete={() => setSelected(new Set())} />
                <Box sx={{ flex: 1 }} />
                <Button variant="outlined" size="small" startIcon={<CampaignIcon />} onClick={handleBroadcast}>
                  Blast terpilih
                </Button>
                <Button variant="contained" size="small" startIcon={<LocalOfferIcon />} onClick={() => setTagModalOpen(true)}>
                  Tambah Tag
                </Button>
                <Button variant="outlined" size="small" color="error" startIcon={<DeleteIcon />}
                  onClick={handleBulkDeleteSelected} disabled={bulkDelete.isPending}>
                  Hapus terpilih
                </Button>
              </Stack>
            </Paper>
          )}

          <Paper variant="outlined" sx={{ mb: 1, display: { xs: 'none', md: 'block' } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40, p: 0.5 }}>
                      <Checkbox
                        size="small"
                        checked={contacts.length > 0 && selected.size === contacts.length}
                        indeterminate={selected.size > 0 && selected.size < contacts.length}
                        onChange={toggleSelectAll}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Kontak</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Tag</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Terakhir Chat</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 132 }}>Aksi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contacts.map(ct => (
                    <TableRow key={ct.id} hover selected={selected.has(ct.id)}>
                      <TableCell sx={{ p: 0.5 }}>
                        <Checkbox size="small" checked={selected.has(ct.id)} onChange={() => toggleSelect(ct.id)} />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                          <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: 'primary.main' }}>{contactInitial(ct)}</Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.name || `+${ct.number}`}</Typography>
                            <Typography variant="caption" color="text.secondary">+{ct.number}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {ct.tags ? (
                          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                            {ct.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3).map((t, i) => (
                              <Chip key={i} label={t} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.disabled">Belum ada tag</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {ct.last_at ? lastChatLabel(ct.last_at) : 'Belum ada riwayat'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.25}>
                          <Tooltip title="Buka chat"><IconButton size="small" onClick={() => onOpenChat(ct.number)}><ChatIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Edit kontak"><IconButton size="small" onClick={() => openEdit(ct)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Hapus kontak"><IconButton size="small" color="error" onClick={() => remove(ct)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' }, mb: 1 }}>
            {contacts.map(ct => (
              <Card key={ct.id} variant="outlined" sx={{ borderColor: selected.has(ct.id) ? 'primary.main' : 'divider' }}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Checkbox size="small" checked={selected.has(ct.id)} onChange={() => toggleSelect(ct.id)} sx={{ p: 0.25 }} />
                    <Avatar sx={{ width: 34, height: 34, fontSize: 14, bgcolor: 'primary.main', flexShrink: 0 }}>{contactInitial(ct)}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.name || `+${ct.number}`}</Typography>
                      <Typography variant="caption" color="text.secondary">+{ct.number}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        {ct.last_at ? lastChatLabel(ct.last_at) : 'Belum ada riwayat chat'}
                      </Typography>
                      {ct.tags && (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                          {ct.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 4).map((t, i) => (
                            <Chip key={i} label={t} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                          ))}
                        </Stack>
                      )}
                      {ct.notes && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                          {ct.notes}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                  <Divider sx={{ my: 1 }} />
                  <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
                    <Button size="small" startIcon={<ChatIcon />} onClick={() => onOpenChat(ct.number)}>Chat</Button>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(ct)}>Edit</Button>
                    <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => remove(ct)}>Hapus</Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', mb: 1, gap: 1 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                Menampilkan {contacts.length} dari {totalContacts} kontak
              </Typography>
              <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={handleDeleteAll} disabled={bulkDelete.isPending}>
                {hasFilter ? 'Hapus hasil filter' : 'Hapus semua'}
              </Button>
            </Stack>
            <Pagination
              count={totalPages}
              page={page + 1}
              onChange={(_e, p) => { setPage(p - 1); setSelected(new Set()); }}
              size="small"
              siblingCount={0}
              boundaryCount={1}
            />
          </Stack>
        </>
      )}

      <Dialog open={tagModalOpen} onClose={() => { setTagModalOpen(false); setBulkTag(''); }} maxWidth="xs" fullWidth>
        <DialogTitle>Tambah Tag</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" icon={false}>
              Tag akan ditambahkan ke {selected.size} kontak yang sedang dipilih.
            </Alert>
            <TextField
              label="Tag"
              size="small"
              value={bulkTag}
              onChange={e => setBulkTag(e.target.value)}
              placeholder="vip, pelanggan tetap"
              autoFocus
            />
            {allTags.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Tag yang sudah ada:
                </Typography>
                <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                  {allTags.map(t => (
                    <Chip key={t} label={t} size="small" variant="outlined" onClick={() => setBulkTag(t)}
                      sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }} />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setTagModalOpen(false); setBulkTag(''); }}>Batal</Button>
          <Button variant="contained" onClick={async () => { await handleBulkTag(); setTagModalOpen(false); }} disabled={!bulkTag.trim() || bulkApplying}>
            {bulkApplying ? '...' : 'Terapkan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addOpen || open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{addOpen ? 'Tambah Kontak' : 'Edit Kontak'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Alert severity="info" icon={false}>
              Kontak dari chat WhatsApp akan masuk otomatis. Form ini dipakai untuk menambah atau merapikan kontak manual.
            </Alert>
            <TextField label="Nama kontak" size="small" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})}
              placeholder="Budi, Sinta, Toko Maju" />
            <TextField label="Nomor WhatsApp" size="small" value={form.number || ''}
              onChange={e => { setForm({...form, number: e.target.value}); if (formErrors.number) setFormErrors(p => ({ ...p, number: '' })); }}
              disabled={!!edit} error={!!formErrors.number}
              helperText={formErrors.number || (edit ? 'Nomor tidak bisa diubah setelah kontak dibuat.' : 'Boleh pakai format 08xx atau 62xx.')} />
            <TextField label="Tag" size="small" value={form.tags || ''} onChange={e => setForm({...form, tags: e.target.value})}
              placeholder="vip, pelanggan tetap" helperText="Pisahkan beberapa tag dengan koma." />
            <TextField label="Catatan" size="small" multiline rows={2} value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})}
              placeholder="Contoh: suka produk A, follow up bulan depan." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Batal</Button>
          <Button variant="contained" onClick={save} disabled={saveCrmContact.isPending}>Simpan</Button>
        </DialogActions>
      </Dialog>

      <ContactImportDialog agentId={agentId} open={importOpen} onClose={() => setImportOpen(false)} />
    </Box>
  );
}

function lastChatLabel(d: string | undefined | null): string {
  if (!d) return '';
  const now = Date.now();
  const then = new Date(d).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(d).toLocaleDateString('id-ID');
}
