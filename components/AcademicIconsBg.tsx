import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';

// ─────────────────────────────────────────────────────────
// SVG icon path content (24×24 viewBox, stroke-based)
// ─────────────────────────────────────────────────────────
const PATHS: Record<string, string> = {
  gc: `<path d="M12 3L2 8l10 5 10-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 8v6l10 5 10-5V8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="22" y1="8" x2="22" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="22" cy="14.5" r="0.9" fill="currentColor"/>`,
  bk: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  gl: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.5"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  pc: `<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="15" y1="5" x2="19" y2="9" stroke="currentColor" stroke-width="1.5"/>`,
  at: `<circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(120 12 12)"/>`,
  aw: `<circle cx="12" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  dp: `<rect x="2" y="3" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="7" y1="11" x2="13" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
  co: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>`,
};

// [icon, cx, cy, size, rotation, opacity, color]  — 1600×900 canvas
type P = [string, number, number, number, number, number, string];
const G = '#D4AF37'; // gold
const W = '#ffffff'; // white

const PLACEMENTS: P[] = [
  // Row 1 (y=75) ──────────────────────────────────────────
  ['gc',   88,  75, 56, -12, 0.060, G], ['bk',  266,  75, 52,   8, 0.045, W],
  ['gl',  444,  75, 64,  -5, 0.055, G], ['at',  622,  75, 60,  18, 0.050, W],
  ['aw',  800,  75, 50, -15, 0.040, G], ['dp',  978,  75, 56,  10, 0.045, W],
  ['pc', 1155,  75, 44, -22, 0.050, G], ['co', 1333,  75, 62,   6, 0.055, W],
  ['gc', 1511,  75, 52,  -8, 0.040, G],
  // Row 2 (y=225) — half-offset ───────────────────────────
  ['at',  155, 225, 62,  10, 0.050, G], ['pc',  350, 225, 48, -18, 0.045, W],
  ['bk',  535, 225, 60,  15, 0.055, G], ['co',  715, 225, 52,  -6, 0.040, W],
  ['gc',  905, 225, 58,  20, 0.050, G], ['gl', 1090, 225, 54, -12, 0.045, W],
  ['aw', 1268, 225, 64,   5, 0.055, G], ['dp', 1455, 225, 48, -16, 0.040, W],
  // Row 3 (y=375) ──────────────────────────────────────────
  ['dp',   88, 375, 58,  12, 0.045, W], ['co',  266, 375, 52, -20, 0.050, G],
  ['at',  444, 375, 48,   8, 0.055, W], ['aw',  622, 375, 62, -10, 0.040, G],
  ['pc',  800, 375, 56,  16, 0.050, W], ['gc',  978, 375, 44,  -5, 0.045, G],
  ['bk', 1155, 375, 60,  22, 0.055, W], ['gl', 1333, 375, 50, -14, 0.040, G],
  ['at', 1511, 375, 54,   6, 0.050, W],
  // Row 4 (y=525) — half-offset ───────────────────────────
  ['pc',  155, 525, 52, -15, 0.050, G], ['aw',  350, 525, 60,   8, 0.045, W],
  ['gl',  522, 525, 48, -10, 0.055, G], ['bk',  700, 525, 56,  18, 0.040, W],
  ['dp',  880, 525, 62,  -8, 0.050, G], ['co', 1062, 525, 46,  12, 0.045, W],
  ['gc', 1248, 525, 58, -22, 0.055, G], ['at', 1432, 525, 50,   5, 0.040, W],
  // Row 5 (y=675) ──────────────────────────────────────────
  ['gl',   88, 675, 54,  10, 0.045, W], ['gc',  266, 675, 48, -16, 0.055, G],
  ['aw',  444, 675, 60,   6, 0.040, W], ['pc',  622, 675, 44, -12, 0.050, G],
  ['bk',  800, 675, 56,  20, 0.045, W], ['at',  978, 675, 52,  -8, 0.055, G],
  ['dp', 1155, 675, 48,  14, 0.040, W], ['co', 1333, 675, 62, -20, 0.050, G],
  ['gl', 1511, 675, 46,   4, 0.045, W],
  // Row 6 (y=825) — half-offset ───────────────────────────
  ['co',  155, 825, 56,  -8, 0.050, G], ['at',  348, 825, 44,  16, 0.045, W],
  ['dp',  530, 825, 62, -14, 0.055, G], ['gl',  720, 825, 50,   6, 0.040, W],
  ['pc',  900, 825, 58, -20, 0.050, G], ['aw', 1082, 825, 46,  10, 0.045, W],
  ['bk', 1262, 825, 60,  -6, 0.055, G], ['gc', 1452, 825, 52,  18, 0.040, W],
];

// ─────────────────────────────────────────────────────────
// Build SVG string with <symbol> + <use> for compactness
// ─────────────────────────────────────────────────────────
function buildSVG(): string {
  const symbols = Object.entries(PATHS)
    .map(([id, content]) => `<symbol id="${id}" viewBox="0 0 24 24">${content}</symbol>`)
    .join('');

  const uses = PLACEMENTS.map(([id, cx, cy, sz, rot, op, col]) => {
    const x = (cx - sz / 2).toFixed(1);
    const y = (cy - sz / 2).toFixed(1);
    return `<use href="#${id}" x="${x}" y="${y}" width="${sz}" height="${sz}" transform="rotate(${rot} ${cx} ${cy})" opacity="${op}" color="${col}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="1600" height="900"><defs>${symbols}</defs>${uses}</svg>`;
}

const SVG_URI = `data:image/svg+xml,${encodeURIComponent(buildSVG())}`;

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
export function AcademicIconsBg() {
  const breathe = useRef(new Animated.Value(0)).current;
  const nd = Platform.OS !== 'web';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nd,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nd,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.06] });
  const ty    = breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, { pointerEvents: 'none' } as any]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ scale }, { translateY: ty }], overflow: 'hidden' },
        ]}
      >
        <Image
          source={{ uri: SVG_URI }}
          style={styles.img}
          resizeMode="cover"
          {...(Platform.OS === 'web' ? { 'aria-hidden': true } as any : {})}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  img: { width: '100%', height: '115%', top: '-7%' } as any,
});

export default AcademicIconsBg;
