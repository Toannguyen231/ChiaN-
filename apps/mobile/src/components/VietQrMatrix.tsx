import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'qrcode';
import Svg, { Rect } from 'react-native-svg';
import IconBank from '../../assets/figma/icon-bank.svg';
import { colors, radii } from '../theme/tokens';

export interface VietQrMatrixProps {
  payload: string | null;
  size?: number;
}

export function VietQrMatrix({ payload, size = 204 }: VietQrMatrixProps) {
  const cells = useMemo(() => {
    if (!payload) {
      return null;
    }
    try {
      const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const filled: Array<{ x: number; y: number }> = [];
      for (let r = 0; r < count; r += 1) {
        for (let c = 0; c < count; c += 1) {
          if (qr.modules.get(r, c)) {
            filled.push({ x: c, y: r });
          }
        }
      }
      return { count, filled };
    } catch {
      return null;
    }
  }, [payload]);

  if (!cells) {
    return (
      <View style={[styles.placeholder, { width: size, height: size }]}>
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={styles.centerBadge}>
          <IconBank width={32} height={32} />
        </View>
      </View>
    );
  }

  const quiet = 2;
  const viewSize = cells.count + quiet * 2;

  return (
    <View style={[styles.qrWrap, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${viewSize} ${viewSize}`}
      >
        <Rect
          x={0}
          y={0}
          width={viewSize}
          height={viewSize}
          fill={colors.white}
        />
        {cells.filled.map((pt) => (
          <Rect
            key={`${pt.x}-${pt.y}`}
            x={pt.x + quiet}
            y={pt.y + quiet}
            width={1.03}
            height={1.03}
            fill={colors.ink}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    backgroundColor: colors.white,
    borderRadius: radii.iconBadge,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    backgroundColor: colors.paper,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 4,
    borderColor: colors.muted,
    opacity: 0.4,
  },
  topLeft: {
    top: 18,
    left: 18,
  },
  topRight: {
    top: 18,
    right: 18,
  },
  bottomLeft: {
    bottom: 18,
    left: 18,
  },
});
