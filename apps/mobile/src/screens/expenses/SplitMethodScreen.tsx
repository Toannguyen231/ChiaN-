import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  calculateEqualSplit,
  calculatePercentageSplit,
  formatVnd,
  parseVndInput,
  validateExactSplit,
  type SplitMethod,
} from '@chiane/shared';
import IconCheckDark from '../../../assets/figma/icon-check-dark.svg';
import IconCheck from '../../../assets/figma/icon-check.svg';
import {
  AppHeader,
  ChiaNeButton,
  ChiaNeChip,
  ScreenContainer,
  StateView,
} from '../../components';
import type { AppStackParamList } from '../../navigation/types';
import { useExpenseDraftStore } from '../../store/expenseDraftStore';
import { useGroupsStore } from '../../store/groupsStore';
import { colors, fonts, radii } from '../../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'SplitMethod'>;

export function SplitMethodScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const cachedGroup = useGroupsStore((s) => s.groupDetailsById[groupId]);
  const fetchGroupDetail = useGroupsStore((s) => s.fetchGroupDetail);

  const draft = useExpenseDraftStore();
  const [group, setGroup] = useState(cachedGroup ?? null);
  const [mode, setMode] = useState<SplitMethod>(draft.splitMethod);
  const [selectedIds, setSelectedIds] = useState<string[]>(draft.participantIds);
  const [exactMap, setExactMap] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = { ...draft.exactAmountsByMember };
    return initial;
  });
  const [pctTextMap, setPctTextMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const [k, bps] of Object.entries(draft.percentageBpsByMember)) {
      map[k] = (bps / 100).toString();
    }
    return map;
  });

  useEffect(() => {
    if (!group) {
      void fetchGroupDetail(groupId).then((detail) => setGroup(detail));
    }
  }, [fetchGroupDetail, group, groupId]);

  const members = group?.members ?? [];
  const totalVnd = draft.amountVnd;

  // Populate initial exact amounts neatly if empty when switching to EXACT
  useEffect(() => {
    if (mode === 'EXACT' && members.length > 0) {
      const hasAny = members.some((m) => (exactMap[m.id] ?? 0) > 0);
      if (!hasAny && totalVnd > 0 && selectedIds.length > 0) {
        const shares = calculateEqualSplit(totalVnd, selectedIds);
        const next: Record<string, number> = {};
        for (const s of shares) {
          next[s.memberId] = s.amountVnd;
        }
        setExactMap(next);
      }
    }
  }, [mode, members, totalVnd, selectedIds, exactMap]);

  const equalShares = useMemo(() => {
    if (totalVnd <= 0 || selectedIds.length === 0) return new Map<string, number>();
    const shares = calculateEqualSplit(totalVnd, selectedIds);
    return new Map(shares.map((s) => [s.memberId, s.amountVnd]));
  }, [selectedIds, totalVnd]);

  const exactValidation = useMemo(() => {
    if (totalVnd <= 0 || members.length === 0) {
      return { valid: false, allocatedVnd: 0, remainingVnd: totalVnd, diffVnd: totalVnd };
    }
    const entries = members.map((m) => ({
      memberId: m.id,
      amountVnd: exactMap[m.id] ?? 0,
    }));
    return validateExactSplit(totalVnd, entries);
  }, [exactMap, members, totalVnd]);

  const percentageComputed = useMemo(() => {
    if (members.length === 0) {
      return { valid: false, totalBps: 0, map: new Map<string, number>() };
    }
    const entries = members.map((m) => {
      const parsed = Number.parseFloat((pctTextMap[m.id] ?? '0').replace(',', '.'));
      const bps = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
      return { memberId: m.id, percentageBps: bps };
    });
    const totalBps = entries.reduce((sum, e) => sum + e.percentageBps, 0);
    if (totalBps !== 10000 || totalVnd <= 0) {
      return { valid: false, totalBps, map: new Map<string, number>() };
    }
    try {
      const shares = calculatePercentageSplit(totalVnd, entries);
      return {
        valid: true,
        totalBps,
        map: new Map(shares.map((s) => [s.memberId, s.amountVnd])),
      };
    } catch {
      return { valid: false, totalBps, map: new Map<string, number>() };
    }
  }, [members, pctTextMap, totalVnd]);

  const toggleEqualMember = (memberId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(memberId)) {
        if (prev.length === 1) return prev; // keep at least 1 participant
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  };

  const canApply =
    totalVnd > 0 &&
    ((mode === 'EQUAL' && selectedIds.length > 0) ||
      (mode === 'EXACT' && exactValidation.valid) ||
      (mode === 'PERCENTAGE' && percentageComputed.valid));

  const handleApply = () => {
    if (!canApply) return;

    if (mode === 'EQUAL') {
      draft.patchDraft({
        splitMethod: 'EQUAL',
        participantIds: selectedIds,
      });
    } else if (mode === 'EXACT') {
      const nonZeroOrAll = members
        .filter((m) => (exactMap[m.id] ?? 0) > 0)
        .map((m) => m.id);
      draft.patchDraft({
        splitMethod: 'EXACT',
        participantIds: nonZeroOrAll.length > 0 ? nonZeroOrAll : members.map((m) => m.id),
        exactAmountsByMember: exactMap,
      });
    } else {
      const bpsRecord: Record<string, number> = {};
      const activePctIds: string[] = [];
      for (const m of members) {
        const parsed = Number.parseFloat((pctTextMap[m.id] ?? '0').replace(',', '.'));
        const bps = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
        bpsRecord[m.id] = bps;
        if (bps > 0) {
          activePctIds.push(m.id);
        }
      }
      draft.patchDraft({
        splitMethod: 'PERCENTAGE',
        participantIds: activePctIds,
        percentageBpsByMember: bpsRecord,
      });
    }

    navigation.goBack();
  };

  const resetExactEqually = () => {
    if (totalVnd <= 0 || members.length === 0) return;
    const shares = calculateEqualSplit(
      totalVnd,
      members.map((m) => m.id)
    );
    const next: Record<string, number> = {};
    for (const s of shares) {
      next[s.memberId] = s.amountVnd;
    }
    setExactMap(next);
  };

  const resetPercentagesEqually = () => {
    if (members.length === 0) return;
    const base = Math.floor(10000 / members.length);
    const rem = 10000 % members.length;
    const next: Record<string, string> = {};
    members.forEach((m, idx) => {
      const bps = base + (idx < rem ? 1 : 0);
      next[m.id] = (bps / 100).toString();
    });
    setPctTextMap(next);
  };

  return (
    <ScreenContainer
      backgroundColor={colors.paper}
      header={<AppHeader title="Chia khoản này" onBack={() => navigation.goBack()} />}
      footer={
        <ChiaNeButton
          label="Áp dụng cách chia"
          variant="primary"
          disabled={!canApply}
          onPress={handleApply}
        />
      }
    >
      {!group ? (
        <StateView kind="loading" title="Đang tải danh sách thành viên..." />
      ) : (
        <View style={styles.content}>
          <Text style={styles.totalAmount}>
            {totalVnd > 0 ? formatVnd(totalVnd) : '0 ₫'}
          </Text>
          <Text style={styles.subtitle}>
            {`${draft.title.trim() || 'Khoản chi mới'} · ${
              mode === 'EXACT'
                ? 'Nhập phần của từng người'
                : `${members.length} thành viên`
            }`}
          </Text>

          <View style={styles.modeTabsRow}>
            <ChiaNeChip
              label="Chia đều"
              active={mode === 'EQUAL'}
              onPress={() => setMode('EQUAL')}
              style={styles.modeChip}
            />
            <ChiaNeChip
              label="Số tiền"
              active={mode === 'EXACT'}
              onPress={() => setMode('EXACT')}
              style={styles.modeChip}
            />
            <ChiaNeChip
              label="Phần trăm"
              active={mode === 'PERCENTAGE'}
              onPress={() => setMode('PERCENTAGE')}
              style={styles.modeChip}
            />
          </View>

          {mode === 'EQUAL' ? (
            <>
              <View style={styles.listCard}>
                {members.map((member, index) => {
                  const checked = selectedIds.includes(member.id);
                  const shareVnd = checked ? (equalShares.get(member.id) ?? 0) : 0;
                  return (
                    <React.Fragment key={member.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        onPress={() => toggleEqualMember(member.id)}
                        style={styles.memberRow}
                      >
                        <View style={styles.leftRow}>
                          <View
                            style={[
                              styles.checkbox,
                              checked ? styles.checkboxOn : styles.checkboxOff,
                            ]}
                          >
                            {checked ? <IconCheck width={16} height={16} /> : null}
                          </View>
                          <Text style={styles.memberName}>
                            {member.displayName}
                            {member.isMe ? ' (bạn)' : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.shareAmount,
                            !checked && styles.shareDisabled,
                          ]}
                        >
                          {formatVnd(shareVnd)}
                        </Text>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>

              {totalVnd > 0 ? (
                <View style={styles.limeStatusCard}>
                  <View style={styles.statusTextCol}>
                    <Text style={styles.limeTitle}>Đã chia đủ</Text>
                    <Text style={styles.limeSub}>
                      {`${formatVnd(totalVnd, { includeSymbol: false })} / ${formatVnd(totalVnd)}`}
                    </Text>
                  </View>
                  <IconCheckDark width={24} height={24} />
                </View>
              ) : null}

              <Text style={styles.helperCaption}>
                {
                  'Chia lẻ đến từng đồng. Tổng các phần\nluôn bằng đúng số tiền của khoản chi.'
                }
              </Text>
            </>
          ) : null}

          {mode === 'EXACT' ? (
            <>
              <View style={styles.listCard}>
                {members.map((member, index) => {
                  const val = exactMap[member.id] ?? 0;
                  const formatted =
                    val > 0 ? formatVnd(val, { includeSymbol: false }) : '';
                  return (
                    <React.Fragment key={member.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <View style={styles.memberRow}>
                        <Text style={styles.memberName}>
                          {member.displayName}
                          {member.isMe ? ' (bạn)' : ''}
                        </Text>
                        <View style={styles.exactInputBox}>
                          <TextInput
                            value={formatted}
                            onChangeText={(raw) => {
                              const parsed = parseVndInput(raw);
                              setExactMap((prev) => ({
                                ...prev,
                                [member.id]: parsed,
                              }));
                            }}
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="number-pad"
                            style={styles.exactInput}
                          />
                          <Text style={styles.exactUnit}>₫</Text>
                        </View>
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>

              <View style={styles.quickActionRow}>
                <Pressable onPress={resetExactEqually} hitSlop={8}>
                  <Text style={styles.quickActionLink}>Chia đều lại</Text>
                </Pressable>
              </View>

              {totalVnd > 0 ? (
                exactValidation.valid ? (
                  <View style={styles.limeStatusCard}>
                    <View style={styles.statusTextCol}>
                      <Text style={styles.limeTitle}>Đã chia đủ</Text>
                      <Text style={styles.limeSub}>
                        {`${formatVnd(exactValidation.allocatedVnd, { includeSymbol: false })} / ${formatVnd(totalVnd)}`}
                      </Text>
                    </View>
                    <IconCheckDark width={24} height={24} />
                  </View>
                ) : (
                  <View style={styles.peachWarningCard}>
                    <Text style={styles.peachTitle}>
                      {exactValidation.diffVnd > 0
                        ? `Còn thiếu ${formatVnd(exactValidation.diffVnd)}`
                        : `Vượt quá ${formatVnd(Math.abs(exactValidation.diffVnd))}`}
                    </Text>
                    <Text style={styles.peachSub}>
                      {`Đã chia ${formatVnd(exactValidation.allocatedVnd, { includeSymbol: false })} / ${formatVnd(totalVnd)}. Điều chỉnh để khớp khoản chi.`}
                    </Text>
                  </View>
                )
              ) : null}

              <Text style={styles.helperCaption}>
                {exactValidation.valid
                  ? 'Tổng các phần đã khớp chính xác với khoản chi.'
                  : 'Không thể lưu khi số tiền chưa khớp.'}
              </Text>
            </>
          ) : null}

          {mode === 'PERCENTAGE' ? (
            <>
              <View style={styles.listCard}>
                {members.map((member, index) => {
                  const pctText = pctTextMap[member.id] ?? '0';
                  const computedShare = percentageComputed.map.get(member.id);
                  return (
                    <React.Fragment key={member.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <View style={styles.memberRow}>
                        <View style={styles.pctNameCol}>
                          <Text style={styles.memberName}>
                            {member.displayName}
                            {member.isMe ? ' (bạn)' : ''}
                          </Text>
                          {computedShare !== undefined ? (
                            <Text style={styles.pctShareHint}>
                              {formatVnd(computedShare)}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.exactInputBox}>
                          <TextInput
                            value={pctText}
                            onChangeText={(raw) =>
                              setPctTextMap((prev) => ({
                                ...prev,
                                [member.id]: raw.replace(/[^0-9.,]/g, ''),
                              }))
                            }
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            keyboardType="decimal-pad"
                            style={styles.exactInput}
                          />
                          <Text style={styles.exactUnit}>%</Text>
                        </View>
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>

              <View style={styles.quickActionRow}>
                <Pressable onPress={resetPercentagesEqually} hitSlop={8}>
                  <Text style={styles.quickActionLink}>Chia đều %</Text>
                </Pressable>
              </View>

              {percentageComputed.valid ? (
                <View style={styles.limeStatusCard}>
                  <View style={styles.statusTextCol}>
                    <Text style={styles.limeTitle}>Tổng đã đạt 100%</Text>
                    <Text style={styles.limeSub}>{formatVnd(totalVnd)}</Text>
                  </View>
                  <IconCheckDark width={24} height={24} />
                </View>
              ) : (
                <View style={styles.peachWarningCard}>
                  <Text style={styles.peachTitle}>
                    {`Hiện tại ${(percentageComputed.totalBps / 100).toFixed(2)}% / 100%`}
                  </Text>
                  <Text style={styles.peachSub}>
                    Điều chỉnh tỷ lệ các thành viên để tổng bằng đúng 100%.
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  totalAmount: {
    fontFamily: fonts.bold,
    fontSize: 34,
    lineHeight: 46,
    color: colors.ink,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: -8,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
  },
  listCard: {
    backgroundColor: colors.white,
    borderRadius: radii.featureCard,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  memberRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.forest,
  },
  checkboxOff: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  memberName: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    flexShrink: 1,
  },
  shareAmount: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  shareDisabled: {
    color: colors.muted,
  },
  exactInputBox: {
    width: 130,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exactInput: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
    paddingVertical: 0,
  },
  exactUnit: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginLeft: 6,
  },
  pctNameCol: {
    flex: 1,
    gap: 2,
  },
  pctShareHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
  },
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: -6,
  },
  quickActionLink: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.forest,
  },
  limeStatusCard: {
    minHeight: 73,
    backgroundColor: colors.lime,
    borderRadius: radii.button,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTextCol: {
    gap: 4,
  },
  limeTitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.ink,
  },
  limeSub: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  peachWarningCard: {
    backgroundColor: colors.peach,
    borderRadius: radii.button,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 6,
  },
  peachTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.coral,
  },
  peachSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.coral,
  },
  helperCaption: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
});
