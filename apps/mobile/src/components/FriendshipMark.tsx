import React from 'react';
import { StyleSheet, View } from 'react-native';
import FriendshipCreamGlint from '../../assets/figma/friendship-cream-glint.svg';
import FriendshipLoops from '../../assets/figma/friendship-loops.svg';
import FriendshipMintTile from '../../assets/figma/friendship-mint-tile.svg';

export interface FriendshipMarkProps {
  size?: number;
}

/**
 * Brand mark from Figma node 2:593 ("ChiaNè / Friendship mark").
 * Preserves exact normalized sub-layer dimensions matching the downloaded SVG viewBoxes:
 * mint-tile (115.5×115.5), friendship-loops (78.0484×78.0484), cream-glint (8.51522×7.80902) inside 132×132.
 */
export function FriendshipMark({ size = 132 }: FriendshipMarkProps) {
  const tileInset = size * 0.0625;
  const tileSize = size * 0.875;
  const loopsSize = size * (78.0484 / 132);
  const loopsInset = (size - loopsSize) / 2;
  const glintLeft = size * 0.255;
  const glintTop = size * 0.2426;
  const glintWidth = size * (8.51522 / 132);
  const glintHeight = size * (7.80902 / 132);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: tileInset,
          top: tileInset,
          width: tileSize,
          height: tileSize,
        }}
      >
        <FriendshipMintTile width={tileSize} height={tileSize} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: loopsInset,
          top: loopsInset,
          width: loopsSize,
          height: loopsSize,
        }}
      >
        <FriendshipLoops width={loopsSize} height={loopsSize} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: glintLeft,
          top: glintTop,
          width: glintWidth,
          height: glintHeight,
        }}
      >
        <FriendshipCreamGlint width={glintWidth} height={glintHeight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
});
