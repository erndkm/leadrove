import { useColorScheme, type TextStyle } from 'react-native';

const light = { canvas: '#f7f8f7', surface: '#ffffff', ink: '#27332e', muted: '#65716a', line: '#dfe5e0', accent: '#204c46', tint: '#eaf1ed', onAccent: '#ffffff', danger: '#a33332' };
const dark: typeof light = { canvas: '#1a1a1a', surface: '#222222', ink: '#efefef', muted: '#a4afa8', line: '#38423c', accent: '#b5d8cc', tint: '#283d35', onAccent: '#17352f', danger: '#ffb4ab' };
export function useColors() { return useColorScheme() === 'dark' ? dark : light; }
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 };
export const radius = { sm: 8, md: 12, lg: 20, full: 999 };
export const size = { icon: 22, control: 48, content: 680, tabBar: 64 };
export const type = {
  hero: { fontFamily: 'Manrope_700Bold', fontSize: 34, lineHeight: 42, letterSpacing: -1 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 24, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: 'Manrope_600SemiBold', fontSize: 17, lineHeight: 25 },
  body: { fontFamily: 'Manrope_400Regular', fontSize: 15, lineHeight: 23 },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 20 },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 20 },
  navigation: { fontFamily: 'Manrope_600SemiBold', fontSize: 11, lineHeight: 13 },
} satisfies Record<string, TextStyle>;
