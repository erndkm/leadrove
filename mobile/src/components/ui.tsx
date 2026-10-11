import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, type TextProps, type StyleProp, type ViewStyle, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type LucideIcon, ArrowRight, AlertCircle } from 'lucide-react-native';
import { useColors, type, space, radius, size } from '@/src/theme';

export function Copy({ variant = 'body', muted, style, ...props }: TextProps & { variant?: keyof typeof type; muted?: boolean }) {
  const c = useColors();
  return <Text {...props} style={[type[variant], { color: muted ? c.muted : c.ink }, style]} />;
}
export function Button({ title, onPress, variant = 'primary', icon: Icon, loading, disabled, style }: { title: string; onPress: () => void | Promise<void>; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; icon?: LucideIcon; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors(); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const busy = loading || pending; const color = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.danger : c.accent;
  // Allow long contact addresses to wrap on web and native without changing their spoken label.
  const displayTitle = title.replace(/(\S{20})(?=\S)/g, '$1\u200b');
  return <View style={style}><Pressable accessibilityRole="button" accessibilityLabel={title} aria-busy={!!busy} aria-disabled={!!(disabled || busy)} accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }} disabled={disabled || busy} onPress={async () => { setPending(true); setError(null); try { await onPress(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); } finally { setPending(false); } }} style={({ pressed }) => ({ minHeight: size.control, padding: space.md, paddingHorizontal: space.lg, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm, backgroundColor: variant === 'primary' ? c.accent : variant === 'secondary' ? c.tint : 'transparent', opacity: disabled ? 0.45 : pressed ? 0.65 : 1 })}>
    {busy ? <ActivityIndicator color={color} /> : Icon ? <Icon size={size.icon} color={color} /> : null}<Copy variant="heading" accessibilityLabel={title} style={{ color, flexShrink: 1, textAlign: 'center' }}>{displayTitle}</Copy>
  </Pressable>{error && <Copy selectable style={{ color: c.danger }}>{error}</Copy>}</View>;
}
export function IconButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const c = useColors(); return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: size.control, height: size.control, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}><Icon size={size.icon} color={c.ink} /></Pressable>;
}
export function Screen({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  const c = useColors(); const insets = useSafeAreaInsets();
  return <ScrollView {...props} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: c.canvas }} contentContainerStyle={[{ padding: space.xl, paddingBottom: Math.max(insets.bottom, space.xl) + space.xl, gap: space.xl, width: '100%', maxWidth: size.content, alignSelf: 'center' }, contentContainerStyle]}>{children}</ScrollView>;
}
export function Section({ title, trailing, children }: { title: string; trailing?: ReactNode; children?: ReactNode }) {
  return <View style={{ gap: space.md }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}><Copy variant="heading" style={{ flex: 1 }}>{title}</Copy>{trailing}</View>{children}</View>;
}
export function Empty({ icon: Icon, title, message, action, onAction }: { icon: LucideIcon; title: string; message: string; action?: string; onAction?: () => void }) {
  const c = useColors(); return <View style={{ paddingVertical: space.xxl, gap: space.lg, alignItems: 'flex-start' }}><View style={{ backgroundColor: c.tint, padding: space.lg, borderRadius: radius.lg }}><Icon size={28} color={c.accent} /></View><View style={{ gap: space.sm }}><Copy variant="title">{title}</Copy><Copy muted>{message}</Copy></View>{action && onAction && <Button title={action} icon={ArrowRight} onPress={onAction} />}</View>;
}
export function Notice({ message }: { message: string | null }) { const c = useColors(); return message ? <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md }}><AlertCircle size={size.icon} color={c.danger} /><Copy selectable style={{ color: c.danger, flex: 1 }}>{message}</Copy></View> : null; }
export function Choices<T extends string | number>({ values, value, onChange }: { values: readonly { label: string; value: T }[]; value: T; onChange: (value: T) => void }) {
  const c = useColors(); return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{values.map(item => <Pressable key={item.value} accessibilityRole="radio" aria-checked={value === item.value} accessibilityState={{ checked: value === item.value }} onPress={() => onChange(item.value)} style={({ pressed }) => ({ minHeight: size.control, justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: value === item.value ? c.accent : c.surface, borderWidth: 1, borderColor: value === item.value ? c.accent : c.line, opacity: pressed ? 0.6 : 1 })}><Copy variant="label" style={{ color: value === item.value ? c.onAccent : c.ink }}>{item.label}</Copy></Pressable>)}</View>;
}
export function Loading() { const c = useColors(); return <View style={{ padding: space.xxl, gap: space.md, alignItems: 'center' }}><ActivityIndicator color={c.accent} /><Copy muted>Loading your leads…</Copy></View>; }
