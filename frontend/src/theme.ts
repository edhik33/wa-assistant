import { createTheme } from '@mui/material/styles';

// Tema Material Design 3 (skema hijau brand) — disetel agar tipografi & spasi konsisten.
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1F8A50', light: '#5dba7d', dark: '#005d2c', contrastText: '#ffffff' },
    secondary: { main: '#4A6357', light: '#7a9387', dark: '#1d3b30', contrastText: '#ffffff' },
    success: { main: '#1F8A50' },
    warning: { main: '#9a6700' },
    error: { main: '#ba1a1a' },
    background: { default: '#F4FBF6', paper: '#FFFFFF' },
    text: { primary: '#1A1C19', secondary: '#5a635c' },
    divider: '#DCE5DC',
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Roboto, Inter, system-ui, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 800, fontSize: '1.6rem', lineHeight: 1.3, letterSpacing: '-0.01em' },
    h5: { fontWeight: 800, fontSize: '1.3rem', lineHeight: 1.3, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.4 },
    subtitle1: { fontWeight: 600, lineHeight: 1.5 },
    subtitle2: { fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.5 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.6 },
    caption: { lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 999, paddingBlock: 8, paddingInline: 18 } },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 16, border: '1px solid #DCE5DC' } },
    },
    // Padding kartu konsisten (termasuk kartu terakhir) supaya rapi.
    MuiCardContent: {
      styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } },
    },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#ECF2EC' },
        head: { fontWeight: 700, color: '#5a635c' },
      },
    },
  },
});

export default theme;
