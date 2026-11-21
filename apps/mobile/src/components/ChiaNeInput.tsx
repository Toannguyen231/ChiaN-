import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radii, sizes, typography } from '../theme/tokens';

export interface ChiaNeInputProps extends TextInputProps {
  label?: string;
  prefixText?: string;
  errorText?: string | null;
  containerStyle?: ViewStyle;
}

export function ChiaNeInput({
  label,
  prefixText,
  errorText,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: ChiaNeInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.fieldWrapper,
          focused && styles.fieldFocused,
          Boolean(errorText) && styles.fieldError,
        ]}
      >
        {prefixText ? (
          <View style={styles.prefixGroup}>
            <Text style={styles.prefixText}>{prefixText}</Text>
            <View style={styles.prefixDivider} />
          </View>
        ) : null}
        <TextInput
          {...inputProps}
          placeholderTextColor={colors.muted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
      </View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.micro,
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  fieldWrapper: {
    height: sizes.inputHeight,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
  },
  fieldFocused: {
    borderColor: colors.forest,
    borderWidth: 1.5,
  },
  fieldError: {
    borderColor: colors.coral,
    borderWidth: 1.5,
  },
  prefixGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  prefixText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  prefixDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.muted,
    opacity: 0.45,
    marginLeft: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  errorText: {
    ...typography.caption,
    color: colors.coral,
    marginTop: 6,
  },
});
