import { createTheme } from '@mui/material/styles';

// Tema bergaya Material Design 3 (Material You) di atas MUI.
// Pendekatan: token warna MD3 (skema hijau brand), bentuk membulat, tombol "pill",
// elevasi lembut + tepi tipis (filled/outlined), tipografi tanpa kapital.
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1F8A50', light: '#5dba7d', dark: '#005d2c', contrastText: '#ffffff' },
    secondary: { main: '#4A6357', light: '#7a9387', dark: '#1d3b30', contrastText: '#ffffff' },
    success: { main: '#1F8A50' },
    warning: { main: '#9a6700' },
    error: { main: '#ba1a1a' },
    background: { default: '#F4FBF6', paper: '#FFFFFF' }, // surface tonal MD3 (hijau-netral lembut)
    text: { primary: '#1A1C19', secondary: '#42493F' },
    divider: '#DCE5DC',
  },
  shape: { borderRadius: 16 }, // MD3 medium rounding
  typography: {
    fontFamily: 'Roboto, Inter, system-ui, "Helvetica Neue", Arial, sans-serif',
    h5: { fontWeight: 700, letterSpacing: 0 },
    h6: { fontWeight: 700, letterSpacing: 0 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0.1 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999, paddingBlock: 8, paddingInline: 20 }, // tombol pill MD3
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: 16, border: '1px solid #DCE5DC' }, // kartu MD3 (filled/outlined lembut)
      },
    },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 700 } } },
  },
});

export default theme;
