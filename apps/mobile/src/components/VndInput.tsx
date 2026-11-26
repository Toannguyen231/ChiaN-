import React, { useState } from 'react';
import { Alert, TextInput, type TextInputProps } from 'react-native';
import { formatVnd, parseVndInput } from '@chiane/shared';
import { ChiaNeInput } from './ChiaNeInput';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  amount: number;
  onAmountChange: (amount: number) => void;
  label?: string;
  errorText?: string | null;
}

export function VndInput({ amount, onAmountChange, label, errorText, ...props }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const formatted = amount > 0 ? formatVnd(amount, { includeSymbol: false }) : '';
  const Field = label ? ChiaNeInput : TextInput;
  return (
    <Field
      {...props}
      {...(label ? { label, errorText } : {})}
      autoCapitalize="none"
      autoCorrect={false}
      value={editing ?? formatted}
      onFocus={() => setEditing(amount > 0 ? String(amount) : '')}
      onChangeText={(raw) => {
        // Keep the native composing text intact until the keyboard finishes editing.
        setEditing(raw);
        try {
          onAmountChange(parseVndInput(raw));
        } catch {
          onAmountChange(0);
        }
      }}
      onEndEditing={({ nativeEvent }) => {
        setEditing(null);
        try {
          onAmountChange(parseVndInput(nativeEvent.text));
        } catch (error) {
          onAmountChange(0);
          Alert.alert('Số tiền chưa hợp lệ', error instanceof Error ? error.message : 'Vui lòng nhập lại.');
        }
      }}
    />
  );
}
