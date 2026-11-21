import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { searchVnBanks } from '@chiane/shared';
import IconSearch from '../../../assets/figma/icon-search.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeInput,
  ConfirmDialog,
  InfoCard,
  ScreenContainer,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { authApi } from '../../services/authApi';
import { useAuthStore } from '../../store/authStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'BankAccount'>;

export function BankAccountScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [selectedBin, setSelectedBin] = useState(user?.bankBin ?? '');
  const [selectedBankName, setSelectedBankName] = useState(user?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(user?.bankAccountNumber ?? '');
  const [accountHolder, setAccountHolder] = useState(
    user?.bankAccountHolder ?? user?.displayName ?? ''
  );
  const [bankFilter, setBankFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const hasSavedBank = Boolean(user?.bankBin && user?.bankAccountNumber);

  const filteredBanks = useMemo(() => {
    return searchVnBanks(bankFilter);
  }, [bankFilter]);

  const handleSave = async () => {
    if (!selectedBin || !selectedBankName) {
      setErrorText('Vui lòng chọn ngân hàng từ danh sách.');
      return;
    }
    const cleanAcc = accountNumber.trim();
    if (!/^[A-Za-z0-9]{4,24}$/.test(cleanAcc)) {
      setErrorText('Số tài khoản gồm 4–24 ký tự chữ hoặc số, không có khoảng trắng.');
      return;
    }
    const cleanHolder = accountHolder.trim();
    if (!cleanHolder) {
      setErrorText('Vui lòng nhập tên chủ tài khoản.');
      return;
    }

    setSaving(true);
    setErrorText(null);
    try {
      await authApi.updateMe({
        bankBin: selectedBin,
        bankName: selectedBankName,
        bankAccountNumber: cleanAcc,
        bankAccountHolder: cleanHolder.toUpperCase(),
      });
      await refreshProfile();
      navigation.goBack();
    } catch (err) {
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể lưu thông tin ngân hàng.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setErrorText(null);
    try {
      await authApi.updateMe({
        bankBin: null,
        bankName: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
      });
      await refreshProfile();
      setClearOpen(false);
      navigation.goBack();
    } catch (err) {
      setClearOpen(false);
      setErrorText(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể xóa thông tin ngân hàng.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={
        <AppHeader
          title="Ngân hàng của tôi"
          onBack={() => navigation.goBack()}
        />
      }
      footer={
        <View style={styles.footerStack}>
          <ChiaNeButton
            label="Lưu tài khoản ngân hàng"
            variant="primary"
            loading={saving}
            onPress={() => void handleSave()}
          />
          {hasSavedBank ? (
            <ChiaNeButton
              label="Xóa thông tin ngân hàng"
              variant="quiet"
              disabled={saving}
              onPress={() => setClearOpen(true)}
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.content}>
        <InfoCard tone={hasSavedBank ? 'lime' : 'lavender'}>
          <Text style={hasSavedBank ? styles.readyText : styles.guideText}>
            {hasSavedBank
              ? 'Đã sẵn sàng nhận chuyển khoản chuẩn VietQR NAPAS 247 từ các nhóm.'
              : 'Chọn ngân hàng và nhập đúng số tài khoản để bạn bè quét mã VietQR chính xác.'}
          </Text>
        </InfoCard>

        {errorText ? (
          <InfoCard tone="peach">
            <Text style={styles.errorText}>{errorText}</Text>
          </InfoCard>
        ) : null}

        <ChiaNeInput
          label="Số tài khoản"
          value={accountNumber}
          onChangeText={(t) => {
            setAccountNumber(t.replace(/\s+/g, ''));
            if (errorText) setErrorText(null);
          }}
          placeholder="Ví dụ: 0912345678"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={24}
        />

        <ChiaNeInput
          label="Tên chủ tài khoản (khuyến nghị viết hoa không dấu)"
          value={accountHolder}
          onChangeText={(t) => {
            setAccountHolder(t);
            if (errorText) setErrorText(null);
          }}
          placeholder="NGUYEN VAN AN"
          autoCapitalize="characters"
          maxLength={80}
        />

        <Text style={styles.sectionLabel}>Chọn ngân hàng thụ hưởng</Text>
        <View style={styles.searchWrap}>
          <IconSearch width={18} height={18} />
          <TextInput
            value={bankFilter}
            onChangeText={setBankFilter}
            placeholder="Gõ nhanh VCB, TCB, MB, ACB, Vietcombank..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.banksGrid}>
          {filteredBanks.map((bank) => {
            const selected = selectedBin === bank.bin;
            return (
              <Pressable
                key={bank.bin}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedBin(bank.bin);
                  setSelectedBankName(bank.shortName);
                  if (errorText) setErrorText(null);
                }}
                style={[styles.bankChip, selected && styles.bankChipSelected]}
              >
                <Text
                  style={[
                    styles.bankShort,
                    selected && styles.bankShortSelected,
                  ]}
                >
                  {bank.shortName}
                </Text>
                <Text style={styles.bankBin}>
                  {`${bank.aliases[0] ?? ''} · ${bank.bin}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ConfirmDialog
        visible={clearOpen}
        title="Xóa thông tin ngân hàng?"
        description="Khi xóa, bạn bè sẽ thấy QR minh họa và cần nhập tay thông tin khi chuyển khoản cho bạn."
        confirmLabel="Xóa thông tin"
        destructive
        loading={saving}
        onConfirm={() => void handleClear()}
        onCancel={() => setClearOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  readyText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.forest,
  },
  guideText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.purple,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.coral,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    marginTop: 4,
    marginBottom: -6,
  },
  searchWrap: {
    height: 46,
    backgroundColor: colors.white,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink,
  },
  banksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bankChip: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  bankChipSelected: {
    backgroundColor: colors.lime,
    borderColor: colors.forest,
    borderWidth: 1.5,
  },
  bankShort: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  bankShortSelected: {
    color: colors.forest,
  },
  bankBin: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  footerStack: {
    gap: 10,
  },
});
