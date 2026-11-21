import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { colors, fonts, radii, typography } from '../theme/tokens';
import { ChiaNeButton } from './ChiaNeButton';

export interface LuckyWheelMember {
  id: string;
  displayName: string;
  isMe?: boolean;
}

export interface LuckyWheelModalProps {
  visible: boolean;
  members: LuckyWheelMember[];
  onClose: () => void;
  onSelectWinner?: (
    winner: LuckyWheelMember,
    mode: 'TREAT_ALL' | 'PAYER_ONLY'
  ) => void;
}

const SLICE_COLORS = [
  '#D0F477', // lime
  '#EAE5FC', // lavender
  '#FCE8DD', // peach
  '#DCE7D8', // sage tint
  '#FFF3C4', // soft gold
  '#D6F5F0', // mint aqua
  '#FDE2E4', // blush pink
  '#E2ECE9', // eucalyptus tint
] as const;

const CONFETTI_SPECS = [
  { dx: -110, dy: -90, rot: '-42deg', color: '#D0F477' },
  { dx: 105, dy: -85, rot: '38deg', color: '#EAE5FC' },
  { dx: -75, dy: -120, rot: '25deg', color: '#FCE8DD' },
  { dx: 78, dy: -115, rot: '-30deg', color: '#FFD166' },
  { dx: -125, dy: -20, rot: '55deg', color: '#9EE6CF' },
  { dx: 120, dy: -15, rot: '-50deg', color: '#FF8FA3' },
  { dx: -50, dy: 70, rot: '20deg', color: '#D0F477' },
  { dx: 55, dy: 75, rot: '-25deg', color: '#EAE5FC' },
  { dx: 0, dy: -135, rot: '12deg', color: '#FFD166' },
  { dx: -95, dy: 45, rot: '65deg', color: '#9EE6CF' },
] as const;

const WHEEL_SIZE = 272;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = 126;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function createSlicePath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngleDeg);
  const end = polarToCartesian(cx, cy, r, endAngleDeg);
  const largeArcFlag = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

function truncateLabel(name: string): string {
  const clean = name.trim();
  if (clean.length <= 10) return clean;
  return `${clean.slice(0, 9)}…`;
}

export function LuckyWheelModal({
  visible,
  members,
  onClose,
  onSelectWinner,
}: LuckyWheelModalProps) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const currentDegRef = useRef(0);

  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<LuckyWheelMember | null>(null);

  useEffect(() => {
    if (!visible) {
      setSpinning(false);
      setWinner(null);
      confettiAnim.setValue(0);
    }
  }, [confettiAnim, visible]);

  const safeMembers = useMemo(
    () => (members.length > 0 ? members : [{ id: 'none', displayName: 'Bạn' }]),
    [members]
  );

  const sliceAngle = 360 / safeMembers.length;

  const rotateInterpolate = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const handleSpin = () => {
    if (spinning || safeMembers.length === 0) return;

    setSpinning(true);
    setWinner(null);
    confettiAnim.setValue(0);

    const winnerIdx = Math.floor(Math.random() * safeMembers.length);
    const chosen = safeMembers[winnerIdx]!;

    // Keep pointer comfortably inside the chosen slice (never near border lines)
    const maxJitter = safeMembers.length > 1 ? sliceAngle * 0.28 : 0;
    const jitter = (Math.random() * 2 - 1) * maxJitter;

    const sliceMidFromTop = (winnerIdx + 0.5) * sliceAngle + jitter;
    const desiredMod = ((360 - (sliceMidFromTop % 360)) + 360) % 360;

    const startDeg = currentDegRef.current;
    const currentMod = ((startDeg % 360) + 360) % 360;
    const deltaToTarget = (desiredMod - currentMod + 360) % 360;
    const extraTurns = 6 * 360;
    const targetDeg = startDeg + extraTurns + deltaToTarget;

    Animated.timing(spinAnim, {
      toValue: targetDeg,
      duration: 4000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      currentDegRef.current = targetDeg;
      setSpinning(false);
      if (finished) {
        setWinner(chosen);
        if (Platform.OS !== 'web') {
          try {
            Vibration.vibrate([0, 40, 60, 80]);
          } catch {
            // Ignore vibration error on unsupported hardware
          }
        }
        confettiAnim.setValue(0);
        Animated.timing(confettiAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={spinning ? undefined : onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={spinning ? undefined : onClose}
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎡 VÒNG QUAY NHÂN PHẨM</Text>
          </View>
          <Text style={styles.title}>Hôm nay ai bao?</Text>
          <Text style={styles.subtitle}>
            Quay nhanh chọn người khao chầu cafe hoặc tạm ứng cho cả nhóm.
          </Text>

          <View style={styles.wheelStage}>
            {/* Confetti burst layer */}
            {winner ? (
              <View pointerEvents="none" style={styles.confettiLayer}>
                {CONFETTI_SPECS.map((c, idx) => {
                  const tx = confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, c.dx],
                  });
                  const ty = confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, c.dy],
                  });
                  const opacity = confettiAnim.interpolate({
                    inputRange: [0, 0.2, 0.85, 1],
                    outputRange: [0, 1, 1, 0],
                  });
                  return (
                    <Animated.View
                      key={idx}
                      style={[
                        styles.confettiDot,
                        {
                          backgroundColor: c.color,
                          opacity,
                          transform: [
                            { translateX: tx },
                            { translateY: ty },
                            { rotate: c.rot },
                          ],
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ) : null}

            {/* Top stationary pointer */}
            <View style={styles.pointerWrap}>
              <Svg width={28} height={24} viewBox="0 0 28 24">
                <Path
                  d="M14 23 L3 4 Q2 1 6 1 L22 1 Q26 1 25 4 Z"
                  fill={colors.coral}
                  stroke={colors.white}
                  strokeWidth={2}
                />
              </Svg>
            </View>

            <Animated.View
              style={[
                styles.wheelWrap,
                { transform: [{ rotate: rotateInterpolate }] },
              ]}
            >
              <Svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
                <Circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS + 5}
                  fill={colors.forest}
                />
                {safeMembers.length === 1 ? (
                  <G>
                    <Circle
                      cx={CENTER}
                      cy={CENTER}
                      r={RADIUS}
                      fill={SLICE_COLORS[0]}
                    />
                    <SvgText
                      x={CENTER}
                      y={CENTER - 52}
                      fill={colors.ink}
                      fontSize="14"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {truncateLabel(safeMembers[0]!.displayName)}
                    </SvgText>
                  </G>
                ) : (
                  safeMembers.map((member, index) => {
                    const startAngle = -90 + index * sliceAngle;
                    const endAngle = -90 + (index + 1) * sliceAngle;
                    const midAngle = (startAngle + endAngle) / 2;
                    const fill = SLICE_COLORS[index % SLICE_COLORS.length]!;
                    const flipText = midAngle > 90 && midAngle < 270;
                    const textRotation = flipText ? midAngle + 180 : midAngle;
                    const labelPos = polarToCartesian(CENTER, CENTER, RADIUS * 0.62, midAngle);

                    return (
                      <G key={member.id}>
                        <Path
                          d={createSlicePath(CENTER, CENTER, RADIUS, startAngle, endAngle)}
                          fill={fill}
                          stroke={colors.white}
                          strokeWidth={2}
                        />
                        <SvgText
                          x={labelPos.x}
                          y={labelPos.y}
                          fill={colors.ink}
                          fontSize={safeMembers.length > 6 ? '11' : '12'}
                          fontWeight="700"
                          textAnchor="middle"
                          alignmentBaseline="central"
                          transform={`rotate(${textRotation.toFixed(1)}, ${labelPos.x.toFixed(1)}, ${labelPos.y.toFixed(1)})`}
                        >
                          {truncateLabel(member.displayName)}
                        </SvgText>
                      </G>
                    );
                  })
                )}

                <Circle
                  cx={CENTER}
                  cy={CENTER}
                  r={24}
                  fill={colors.forest}
                  stroke={colors.white}
                  strokeWidth={3}
                />
                <SvgText
                  x={CENTER}
                  y={CENTER + 1}
                  fill={colors.lime}
                  fontSize="10"
                  fontWeight="800"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  QUAY
                </SvgText>
              </Svg>
            </Animated.View>
          </View>

          {winner ? (
            <View style={styles.winnerBanner}>
              <Text style={styles.winnerText}>
                {`🎉 ${winner.displayName} hôm nay bao trọn chầu này!`}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsStack}>
            {!winner ? (
              <ChiaNeButton
                label={spinning ? 'Đang quay nhân phẩm...' : '🎡 Quay nhân phẩm!'}
                variant="primary"
                disabled={spinning}
                onPress={handleSpin}
              />
            ) : (
              <>
                {onSelectWinner ? (
                  <>
                    <ChiaNeButton
                      label={`🎉 ${winner.displayName} bao trọn chầu`}
                      variant="primary"
                      onPress={() => onSelectWinner(winner, 'TREAT_ALL')}
                    />
                    <ChiaNeButton
                      label="Chỉ làm Người trả (vẫn chia đều)"
                      variant="secondary"
                      onPress={() => onSelectWinner(winner, 'PAYER_ONLY')}
                    />
                  </>
                ) : null}
                <ChiaNeButton
                  label="Quay lại"
                  variant="quiet"
                  onPress={handleSpin}
                />
              </>
            )}

            <ChiaNeButton
              label="Đóng"
              variant="quiet"
              disabled={spinning}
              onPress={onClose}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 62, 50, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radii.heroCard,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    backgroundColor: colors.lavender,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.purple,
    letterSpacing: 0.4,
  },
  title: {
    ...typography.title,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: 'center',
  },
  wheelStage: {
    position: 'relative',
    width: WHEEL_SIZE,
    height: WHEEL_SIZE + 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginVertical: 4,
  },
  pointerWrap: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  confettiDot: {
    position: 'absolute',
    width: 10,
    height: 16,
    borderRadius: 4,
  },
  winnerBanner: {
    width: '100%',
    backgroundColor: colors.lime,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  winnerText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.forest,
    textAlign: 'center',
  },
  actionsStack: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
});
