export const colors = {
  // Approved Figma Design System tokens (node 2:133)
  forest: '#173E32',
  lime: '#D0F477',
  ink: '#20392F',
  muted: '#66766D',
  paper: '#F7F8F2',
  white: '#FFFFFF',
  line: '#E3E8DE',
  lavender: '#EAE5FC',
  purple: '#6E55A5',
  coral: '#AD4C38',
  peach: '#FCE8DD',

  // Dark-surface text tints observed directly in Figma Screens 01 & 04
  onForestMuted: '#DCE7D8',
  onForestLabel: '#CEDFCB',
} as const;

export const fonts = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semiBold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  extraBold: 'BeVietnamPro_800ExtraBold',
} as const;

export const typography = {
  heroDisplay: {
    fontFamily: fonts.extraBold,
    fontSize: 39,
    lineHeight: Math.round(39 * 1.32),
  },
  heading: {
    fontFamily: fonts.bold,
    fontSize: 32,
    lineHeight: Math.round(32 * 1.4),
  },
  screenHeading: {
    fontFamily: fonts.bold,
    fontSize: 27,
    lineHeight: Math.round(27 * 1.45),
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 19,
    lineHeight: Math.round(19 * 1.45),
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: Math.round(20 * 1.45),
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: Math.round(14 * 1.45),
  },
  bodyLarge: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: Math.round(15 * 1.45),
  },
  button: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: Math.round(15 * 1.45),
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: Math.round(12 * 1.45),
  },
  micro: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: Math.round(11 * 1.45),
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: Math.round(11 * 1.45),
  },
  otpDigit: {
    fontFamily: fonts.semiBold,
    fontSize: 23,
    lineHeight: Math.round(23 * 1.35),
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  screenPaddingX: 24,
} as const;

export const radii = {
  otpBox: 14,
  iconBadge: 14,
  input: 16,
  chip: 18,
  button: 18,
  row: 18,
  card: 20,
  featureCard: 22,
  heroCard: 24,
  pill: 999,
} as const;

export const sizes = {
  buttonHeight: 56,
  inputHeight: 60,
  minTouchTarget: 48,
  maxContentWidth: 460,
} as const;
