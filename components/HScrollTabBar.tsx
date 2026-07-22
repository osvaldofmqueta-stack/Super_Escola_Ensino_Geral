import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ScrollViewProps,
  Animated,
  Platform,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "hscroll-tabbar-styles";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      .hscroll-tabbar {
        touch-action: pan-x !important;
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior-x: contain;
      }
      .hscroll-tabbar > div {
        touch-action: pan-x !important;
      }
    `;
    document.head.appendChild(s);
  }
}

interface HScrollTabBarProps
  extends Omit<
    ScrollViewProps,
    "horizontal" | "showsHorizontalScrollIndicator"
  > {
  style?: StyleProp<ViewStyle>;
  bgColor?: string;
  /** Number of leading children to pin outside the scroll (always visible). Default 0. */
  stickyCount?: number;
}

const SCROLL_STEP = 180;

export function HScrollTabBar({
  style,
  contentContainerStyle,
  children,
  bgColor = Colors.background,
  stickyCount = 0,
  ...rest
}: HScrollTabBarProps) {
  const [showRight, setShowRight] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const containerW = useRef(0);
  const contentW = useRef(0);
  const scrollXRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const recalc = useCallback((x: number) => {
    scrollXRef.current = x;
    const hasOverflow = contentW.current > containerW.current + 2;
    const atEnd = x + containerW.current >= contentW.current - 4;
    const atStart = x <= 2;
    setShowRight(hasOverflow && !atEnd);
    setShowLeft(hasOverflow && !atStart);
  }, []);

  const scrollRight = useCallback(() => {
    const next = Math.min(
      scrollXRef.current + SCROLL_STEP,
      contentW.current - containerW.current,
    );
    scrollRef.current?.scrollTo({ x: next, animated: true });
  }, []);

  const scrollLeft = useCallback(() => {
    const next = Math.max(scrollXRef.current - SCROLL_STEP, 0);
    scrollRef.current?.scrollTo({ x: next, animated: true });
  }, []);

  useEffect(() => {
    if (showRight) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(arrowAnim, {
            toValue: 4,
            duration: 480,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(arrowAnim, {
            toValue: 0,
            duration: 480,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      arrowAnim.setValue(0);
    }
    return () => {
      loopRef.current?.stop();
    };
  }, [showRight]);

  const childrenArray = React.Children.toArray(children);
  const pinnedChildren =
    stickyCount > 0 ? childrenArray.slice(0, stickyCount) : [];
  const scrollChildren =
    stickyCount > 0 ? childrenArray.slice(stickyCount) : childrenArray;

  return (
    <View style={[styles.wrapper, style]}>
      {/* Pinned (sticky) tabs — always visible */}
      {pinnedChildren.length > 0 && (
        <View style={styles.pinnedWrap}>
          {pinnedChildren}
          <View style={styles.pinnedDivider} />
        </View>
      )}

      {/* Scrollable tabs */}
      <View style={styles.scrollWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
          onLayout={(e) => {
            containerW.current = e.nativeEvent.layout.width;
            recalc(scrollXRef.current);
          }}
          onContentSizeChange={(w) => {
            contentW.current = w;
            recalc(scrollXRef.current);
          }}
          onScroll={(e) => recalc(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          {...(Platform.OS === "web"
            ? ({ className: "hscroll-tabbar" } as any)
            : {})}
          {...rest}
        >
          {scrollChildren}
        </ScrollView>

        {showLeft && (
          <>
            <LinearGradient
              colors={[bgColor, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.leftFade, { pointerEvents: "none" } as any]}
            />
            <TouchableOpacity
              onPress={scrollLeft}
              activeOpacity={0.7}
              style={styles.leftBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View style={styles.arrowPill}>
                <Ionicons name="chevron-back" size={13} color={Colors.text} />
              </View>
            </TouchableOpacity>
          </>
        )}

        {showRight && (
          <>
            <LinearGradient
              colors={["transparent", bgColor]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.rightFade, { pointerEvents: "none" } as any]}
            />
            <TouchableOpacity
              onPress={scrollRight}
              activeOpacity={0.7}
              style={styles.rightBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Animated.View
                style={[
                  styles.arrowPill,
                  { transform: [{ translateX: arrowAnim }] },
                ]}
              >
                <Ionicons
                  name="chevron-forward"
                  size={13}
                  color={Colors.text}
                />
              </Animated.View>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    flexDirection: "row",
  },
  pinnedWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  pinnedDivider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginRight: 2,
  },
  scrollWrap: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  rightFade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 52,
    zIndex: 10,
  },
  leftFade: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 36,
    zIndex: 10,
  },
  rightBtn: {
    position: "absolute",
    right: 2,
    top: 0,
    bottom: 0,
    zIndex: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  leftBtn: {
    position: "absolute",
    left: 2,
    top: 0,
    bottom: 0,
    zIndex: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
