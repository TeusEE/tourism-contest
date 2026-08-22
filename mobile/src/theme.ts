export const colors = {
  ink: '#172033',
  muted: '#61708A',
  subtle: '#8A96A8',
  paper: '#F6F8FB',
  surface: '#FFFFFF',
  line: '#DDE4EE',
  primary: '#1667D9',
  primaryDark: '#0D4EA8',
  primarySoft: '#E8F1FF',
  success: '#137A52',
  successSoft: '#E6F7EF',
  warning: '#A96800',
  warningSoft: '#FFF4DC',
  danger: '#B42318',
  dangerSoft: '#FDEBE8',
  route: '#1667D9',
  map: '#EAF3EA',
  marker: '#D9485F',
  white: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const congestionLabels = {
  high: '높음',
  medium: '보통',
  low: '낮음',
  'needs-confirmation': '확인 필요',
} as const;

export const congestionColors = {
  high: { foreground: colors.danger, background: colors.dangerSoft },
  medium: { foreground: colors.warning, background: colors.warningSoft },
  low: { foreground: colors.success, background: colors.successSoft },
  'needs-confirmation': { foreground: colors.muted, background: '#EEF1F5' },
} as const;
