import { Box, Link, Grid, Divider, Container, Typography, Button, Card, CardContent, Stack, Avatar, Chip, Accordion, AccordionSummary, AccordionDetails, type ButtonProps } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import heroLogo from '../assets/Logo-chatloop-gradients.png';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { usePublicPlans } from '../hooks';
import { rupiah, type Plan } from '../types';

const BENEFITS = [
  {
    icon: <BoltOutlinedIcon />,
    title: 'Balas instan, siang malam',
    body: 'Setiap chat dijawab dalam hitungan detik, 24 jam nonstop. Calon pembeli tidak kabur ke toko sebelah cuma gara gara lama dibalas.',
  },
  {
    icon: <AutoAwesomeOutlinedIcon />,
    title: 'Hafal produk dan harga',
    body: 'Ajari sekali lewat knowledge base atau tarik langsung dari websitemu. AI menjawab persis sesuai harga, stok, dan aturan tokomu.',
  },
  {
    icon: <SupportAgentOutlinedIcon />,
    title: 'Tahu kapan memanggilmu',
    body: 'Saat pelanggan ragu atau butuh keputusanmu, obrolan otomatis dioper ke kamu. Tidak ada satu pun chat yang terlantar.',
  },
  {
    icon: <TrendingUpOutlinedIcon />,
    title: 'Closing lebih banyak',
    body: 'Respon cepat tanpa jeda bikin lebih banyak chat berubah jadi orderan, tanpa kamu perlu menambah jumlah CS.',
  },
  {
    icon: <DevicesOutlinedIcon />,
    title: 'Banyak nomor, satu layar',
    body: 'Kelola semua nomor CS dari satu dashboard. Broadcast, follow up, dan jadwal pesan jalan dari tempat yang sama.',
  },
  {
    icon: <AccessTimeOutlinedIcon />,
    title: 'Pasang dalam 5 menit',
    body: 'Scan satu QR, isi profil bisnis, selesai. Tanpa koding, tanpa aplikasi tambahan, langsung jalan hari ini juga.',
  },
];

const STEPS = [
  { n: '1', title: 'Hubungkan WhatsApp', body: 'Pindai satu QR, nomormu langsung tersambung.' },
  { n: '2', title: 'Ajari sebentar', body: 'Isi profil bisnis, AI otomatis menyusun FAQ dan gaya bicaranya.' },
  { n: '3', title: 'Biarkan bekerja', body: 'Pelanggan dibalas otomatis siang dan malam, tanpa kamu pegang HP.' },
];

const FAQS = [
  {
    q: 'Apakah perlu kartu kredit untuk mencoba?',
    a: 'Tidak. Trial 7 hari gratis sepenuhnya. Kamu cukup daftar dengan email, langsung bisa pakai.',
  },
  {
    q: 'Bedanya dengan balas otomatis biasa apa?',
    a: 'Balas otomatis biasa pakai template kaku. ChatLoop pakai AI yang paham konteks pertanyaan, hafal produkmu, dan menjawab dengan gaya bahasa yang kamu pilih.',
  },
  {
    q: 'Butuh aplikasi tambahan atau koding?',
    a: 'Tidak sama sekali. Cukup buka lewat browser, scan QR WhatsApp seperti WhatsApp Web, dan langsung jalan.',
  },
  {
    q: 'Bagaimana cara bayar setelah trial?',
    a: 'Pilih paket yang cocok, lakukan pembayaran, lalu akun kamu kami aktifkan sesuai paket. Bisa naik kelas atau berhenti kapan saja.',
  },
];

const TRIAL_BULLETS = [
  '1 nomor WhatsApp',
  '100 balasan AI',
  'Semua fitur kebuka',
  'Tanpa kartu kredit',
];

// planBullets menyusun daftar manfaat tiap paket dari data asli (limit + fitur aktif).
function planBullets(p: Plan): string[] {
  const out = [
    `${p.max_numbers} nomor WhatsApp`,
    p.max_ai_replies_monthly ? `${p.max_ai_replies_monthly.toLocaleString('id-ID')} balasan AI tiap bulan` : 'Balasan AI tanpa batas',
    p.max_broadcast_monthly ? `${p.max_broadcast_monthly.toLocaleString('id-ID')} broadcast tiap bulan` : 'Broadcast tanpa batas',
    'Knowledge base dan latih dari website',
    'Alih ke CS manusia otomatis',
  ];
  if (p.allow_followup) out.push('Follow up otomatis');
  if (p.allow_schedule) out.push('Pesan terjadwal');
  if (p.allow_group_guard) out.push('Anti-Spam Grup');
  if (p.allow_sheets) out.push('Ekspor order ke Google Sheets');
  return out;
}

function CtaButton({ size = 'large', loggedIn, onClick, full }: { size?: ButtonProps['size']; loggedIn: boolean; onClick: () => void; full?: boolean }) {
  return (
    <Button variant="contained" size={size} onClick={onClick} fullWidth={full} sx={{ fontWeight: 800, px: 4, py: 1.4 }}>
      {loggedIn ? 'Buka Dashboard' : 'Coba Gratis 7 Hari'}
    </Button>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { data: plans } = usePublicPlans();
  const loggedIn = !!localStorage.getItem('token');
  const goToCta = () => navigate(loggedIn ? '/app' : '/daftar');

  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      {/* Navbar */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(244,251,246,0.85)', backdropFilter: 'blur(8px)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <img src={heroLogo} alt="ChatLoop" style={{ height: 'clamp(28px, 6vw, 38px)' }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button sx={{ display: { xs: 'none', sm: 'inline-flex' } }} onClick={() => navigate('/login')}>Masuk</Button>
            <Button variant="contained" sx={{ fontWeight: 700 }} onClick={() => navigate(loggedIn ? '/app' : '/daftar')}>
              {loggedIn ? 'Dashboard' : 'Coba Gratis'}
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(160deg, #F4FBF6 0%, #d8f0e1 100%)' }}>
        <Container maxWidth="md" sx={{ textAlign: 'center', py: { xs: 8, md: 12 } }}>
          <Chip label="Asisten WhatsApp bertenaga AI" color="primary" variant="outlined" sx={{ mb: 3, fontWeight: 700 }} />
          <Typography variant="h2" sx={{ fontWeight: 900, fontSize: { xs: 32, md: 52 }, lineHeight: 1.1, mb: 2 }}>
            Balas semua chat WhatsApp otomatis, orderan tetap masuk walau kamu tidur
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 400, color: 'text.secondary', mb: 4, maxWidth: 640, mx: 'auto', fontSize: 18 }}>
            ChatLoop menjawab pelanggan dalam hitungan detik, hafal produk dan harga tokomu, dan menyerahkan ke kamu saat butuh sentuhan manusia. Pasang sekali, jualan jalan terus.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'center', alignItems: 'center' }}>
            <CtaButton loggedIn={loggedIn} onClick={goToCta} />
            <Button variant="outlined" size="large" href="#harga" sx={{ fontWeight: 700, px: 4, py: 1.4 }}>Lihat Paket dan Harga</Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Tanpa kartu kredit. Aktif dalam 5 menit. Berhenti kapan saja.
          </Typography>

          {/* Trust strip */}
          <Grid container spacing={2} sx={{ mt: 5, maxWidth: 720, mx: 'auto' }}>
            {[
              { big: 'Detik', small: 'Waktu balas pertama' },
              { big: '24/7', small: 'Nonstop tanpa libur' },
              { big: 'Hafal', small: 'Produk dan harga tokomu' },
              { big: '7 hari', small: 'Coba gratis dulu' },
            ].map((s) => (
              <Grid size={{ xs: 6, sm: 3 }} key={s.small}>
                <Typography sx={{ fontWeight: 900, fontSize: 24, color: 'primary.dark', lineHeight: 1.1 }}>{s.big}</Typography>
                <Typography variant="caption" color="text.secondary">{s.small}</Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Manfaat */}
      <Box id="fitur" sx={{ bgcolor: '#fff', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
          <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center', mb: 1 }}>
            Satu asisten, kerjanya seperti tim CS
          </Typography>
          <Typography color="text.secondary" sx={{ textAlign: 'center', mb: 5 }}>
            Bukan sekadar balas otomatis. ChatLoop ikut menjaga setiap calon pembeli sampai jadi orderan.
          </Typography>
          <Grid container spacing={3}>
            {BENEFITS.map((f) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={f.title}>
                <Stack spacing={1.5} sx={{ height: '100%' }}>
                  <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.dark', width: 52, height: 52 }}>{f.icon}</Avatar>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{f.title}</Typography>
                  <Typography color="text.secondary" sx={{ lineHeight: 1.55 }}>{f.body}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Cara kerja */}
      <Container id="cara" maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center', mb: 5 }}>
          Siap pakai dalam hitungan menit
        </Typography>
        <Grid container spacing={3}>
          {STEPS.map((s) => (
            <Grid size={{ xs: 12, md: 4 }} key={s.n}>
              <Card sx={{ height: '100%', textAlign: 'center', bgcolor: '#fff' }}>
                <CardContent sx={{ py: 4 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48, mx: 'auto', mb: 2, fontSize: 22, fontWeight: 800 }}>{s.n}</Avatar>
                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{s.title}</Typography>
                  <Typography color="text.secondary">{s.body}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Harga */}
      <Box id="harga" sx={{ bgcolor: '#fff', borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
          <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center', mb: 1 }}>
            Mulai gratis, bayar saat sudah yakin
          </Typography>
          <Typography color="text.secondary" sx={{ textAlign: 'center', mb: 5 }}>
            Coba semua fitur 7 hari tanpa biaya. Kalau cocok, lanjut ke paket berbayar. Bisa naik kelas kapan saja.
          </Typography>
          <Grid container spacing={3} sx={{ justifyContent: 'center', alignItems: 'stretch' }}>
            {/* Kartu Trial */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '2px dashed', borderColor: 'primary.light', bgcolor: '#F4FBF6' }}>
                <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <Chip label="Mulai di sini" color="primary" size="small" variant="outlined" sx={{ mb: 1, alignSelf: 'flex-start' }} />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>Coba Gratis</Typography>
                  <Typography color="text.secondary" sx={{ minHeight: 40, fontSize: 14 }}>Cicipi semua fitur tanpa risiko selama 7 hari.</Typography>
                  <Box sx={{ my: 2 }}>
                    <Typography component="span" variant="h4" sx={{ fontWeight: 900 }}>Gratis</Typography>
                    <Typography component="span" color="text.secondary"> /7 hari</Typography>
                  </Box>
                  <Stack spacing={1} sx={{ mb: 3, flexGrow: 1 }}>
                    {TRIAL_BULLETS.map((b) => <Bullet key={b} text={b} />)}
                  </Stack>
                  <Button fullWidth variant="contained" onClick={() => navigate('/daftar')} sx={{ fontWeight: 800 }}>
                    Coba Gratis 7 Hari
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            {/* Kartu paket berbayar (dari API) */}
            {plans?.map((p) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={p.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', border: p.is_popular ? '2px solid' : '1px solid', borderColor: p.is_popular ? 'primary.main' : 'divider', boxShadow: p.is_popular ? '0 10px 30px rgba(31,138,80,0.15)' : 'none' }}>
                  <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                    {p.is_popular && <Chip label="Paling diminati" color="primary" size="small" sx={{ mb: 1, alignSelf: 'flex-start' }} />}
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>{p.name}</Typography>
                    <Typography color="text.secondary" sx={{ minHeight: 40, fontSize: 14 }}>{p.description}</Typography>
                    <Box sx={{ my: 2 }}>
                      <Typography component="span" variant="h4" sx={{ fontWeight: 900 }}>{rupiah(p.price)}</Typography>
                      <Typography component="span" color="text.secondary"> /{p.billing_period === 'yearly' ? 'tahun' : 'bulan'}</Typography>
                    </Box>
                    <Stack spacing={1} sx={{ mb: 3, flexGrow: 1 }}>
                      {planBullets(p).map((b) => <Bullet key={b} text={b} />)}
                    </Stack>
                    <Button fullWidth variant={p.is_popular ? 'contained' : 'outlined'} onClick={() => navigate('/daftar')} sx={{ fontWeight: 800 }}>
                      Coba Gratis, Lalu Pilih {p.name}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            Semua paket dimulai dari trial gratis 7 hari. Tidak ada biaya tersembunyi.
          </Typography>
        </Container>
      </Box>

      {/* FAQ */}
      <Container maxWidth="md" sx={{ py: { xs: 7, md: 10 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center', mb: 5 }}>
          Pertanyaan yang sering ditanya
        </Typography>
        {FAQS.map((f) => (
          <Accordion key={f.q} disableGutters elevation={0} sx={{ bgcolor: 'transparent', border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1.5, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 700 }}>{f.q}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>{f.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>

      {/* CTA penutup */}
      <Box sx={{ background: 'linear-gradient(160deg, #1F8A50 0%, #005d2c 100%)', color: '#fff' }}>
        <Container maxWidth="md" sx={{ textAlign: 'center', py: { xs: 8, md: 11 } }}>
          <Typography variant="h3" sx={{ fontWeight: 900, fontSize: { xs: 28, md: 42 }, mb: 2 }}>
            Pelanggan berikutnya bisa datang malam ini juga
          </Typography>
          <Typography sx={{ opacity: 0.92, mb: 4, fontSize: 18 }}>
            Coba ChatLoop gratis 7 hari. Tanpa kartu kredit, tanpa ribet. Rasakan sendiri bedanya saat tidak ada lagi chat yang terlewat.
          </Typography>
          <Button variant="contained" size="large" onClick={() => navigate(loggedIn ? '/app' : '/daftar')}
            sx={{ bgcolor: '#fff', color: 'primary.dark', fontWeight: 900, px: 5, py: 1.5, '&:hover': { bgcolor: '#f0f0f0' } }}>
            {loggedIn ? 'Buka Dashboard' : 'Coba Gratis Sekarang'}
          </Button>
        </Container>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ bgcolor: 'grey.900', color: 'grey.300', py: { xs: 4, md: 6 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#fff', mb: 1 }}>ChatLoop</Typography>
              <Typography variant="body2" sx={{ maxWidth: 280 }}>
                Asisten WhatsApp AI yang membalas pelanggan otomatis, hafal produkmu, dan tahu kapan harus memanggilmu.
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Typography sx={{ fontWeight: 700, color: '#fff', mb: 1 }}>Tautan</Typography>
              <Stack spacing={0.5}>
                <Link href="#fitur" color="inherit" underline="hover">Fitur</Link>
                <Link href="#harga" color="inherit" underline="hover">Harga</Link>
                <Link href="#cara" color="inherit" underline="hover">Cara Kerja</Link>
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Typography sx={{ fontWeight: 700, color: '#fff', mb: 1 }}>Kontak</Typography>
              <Typography variant="body2">Email: halo@chatloop.id</Typography>
              <Typography variant="body2">WhatsApp: +62 851-2345-6789</Typography>
            </Grid>
          </Grid>
          <Divider sx={{ my: 3, borderColor: 'grey.700' }} />
          <Typography variant="caption" color="grey.500">
            © {new Date().getFullYear()} ChatLoop. Seluruh hak cipta dilindungi.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <CheckCircleIcon sx={{ color: 'primary.main', fontSize: 20, mt: '1px' }} />
      <Typography variant="body2">{text}</Typography>
    </Stack>
  );
}
