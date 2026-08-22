import { Text as DefaultText, View as DefaultView } from 'react-native';

import { colors } from '@/src/theme';

type ThemeProps = { lightColor?: string; darkColor?: string };
export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function Text({ style, lightColor, darkColor, ...props }: TextProps) {
  return (
    <DefaultText style={[{ color: lightColor ?? darkColor ?? colors.ink }, style]} {...props} />
  );
}

export function View({ style, lightColor, darkColor, ...props }: ViewProps) {
  return (
    <DefaultView
      style={[{ backgroundColor: lightColor ?? darkColor ?? colors.paper }, style]}
      {...props}
    />
  );
}
