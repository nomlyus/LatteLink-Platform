import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import { type OrderHistoryEntry } from "../account/data";
import { uiPalette } from "../ui/system";

const ACTIVE_PROGRESS_STEPS = [
  { status: "PENDING_PAYMENT", label: "Payment" },
  { status: "PAID", label: "Confirmed" },
  { status: "IN_PREP", label: "In prep" },
  { status: "READY", label: "Ready" }
] as const satisfies Array<{ status: OrderHistoryEntry["status"]; label: string }>;

const PROGRESS_ANIMATION_MS = 420;

function clampUnit(value: number) {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

function OrderProgressStep({
  index,
  label,
  progressValue,
  isLast
}: {
  index: number;
  label: string;
  progressValue: SharedValue<number>;
  isLast: boolean;
}) {
  const dotAnimatedStyle = useAnimatedStyle(() => {
    const activation = clampUnit(progressValue.value - (index - 1));
    const completion = clampUnit(progressValue.value - index);

    const backgroundColor =
      activation < 1
        ? interpolateColor(activation, [0, 1], [uiPalette.background, uiPalette.surfaceStrong])
        : interpolateColor(completion, [0, 1], [uiPalette.surfaceStrong, uiPalette.primary]);

    const borderColor = interpolateColor(activation, [0, 1], [uiPalette.borderStrong, uiPalette.primary]);
    const scale = activation < 1 ? 0.88 + activation * 0.12 : 1 + completion * 0.06;

    return {
      backgroundColor,
      borderColor,
      transform: [{ scale }]
    };
  });

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const activation = clampUnit(progressValue.value - (index - 1));

    return {
      color: interpolateColor(activation, [0, 1], [uiPalette.textMuted, uiPalette.text])
    };
  });

  const checkAnimatedStyle = useAnimatedStyle((): ViewStyle => {
    const completion = clampUnit(progressValue.value - index);

    return {
      opacity: completion,
      transform: [{ translateY: (1 - completion) * 3 }, { scale: 0.72 + completion * 0.28 }]
    };
  }, [index]);

  const leftLineAnimatedStyle = useAnimatedStyle(() => {
    const fill = clampUnit(progressValue.value - (index - 1));

    return {
      width: `${fill * 100}%`,
      opacity: fill
    };
  });

  const rightLineAnimatedStyle = useAnimatedStyle(() => {
    const fill = clampUnit(progressValue.value - index);

    return {
      width: `${fill * 100}%`,
      opacity: fill
    };
  });

  return (
    <View style={styles.progressStep}>
      <View style={styles.progressTrack}>
        {index > 0 ? (
          <View style={[styles.progressLine, styles.progressLineLeft]}>
            <Animated.View style={[styles.progressLineFill, leftLineAnimatedStyle]} />
          </View>
        ) : null}
        {!isLast ? (
          <View style={[styles.progressLine, styles.progressLineRight]}>
            <Animated.View style={[styles.progressLineFill, rightLineAnimatedStyle]} />
          </View>
        ) : null}
        <Animated.View style={[styles.progressDot, dotAnimatedStyle]}>
          <Animated.View style={checkAnimatedStyle}>
            <Ionicons name="checkmark" size={11} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.progressLabel, labelAnimatedStyle]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

export function OrderProgress({ status }: { status: OrderHistoryEntry["status"] }) {
  const activeIndex = ACTIVE_PROGRESS_STEPS.findIndex((step) => step.status === status);
  const targetIndex = activeIndex === -1 ? 0 : activeIndex + 1;
  const progressValue = useSharedValue(targetIndex);

  useEffect(() => {
    progressValue.value = withTiming(targetIndex, {
      duration: PROGRESS_ANIMATION_MS,
      easing: Easing.out(Easing.cubic)
    });
  }, [progressValue, targetIndex]);

  return (
    <View style={styles.progressWrap}>
      {ACTIVE_PROGRESS_STEPS.map((step, index) => (
        <OrderProgressStep
          key={step.status}
          index={index}
          label={step.label}
          progressValue={progressValue}
          isLast={index === ACTIVE_PROGRESS_STEPS.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  progressWrap: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border,
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "flex-start"
  },
  progressStep: {
    flex: 1,
    alignItems: "center"
  },
  progressTrack: {
    width: "100%",
    height: 22,
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong,
    backgroundColor: uiPalette.background,
    alignItems: "center",
    justifyContent: "center"
  },
  progressLine: {
    position: "absolute",
    top: 10.5,
    height: 1,
    backgroundColor: uiPalette.borderStrong,
    overflow: "hidden"
  },
  progressLineFill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "100%",
    backgroundColor: uiPalette.primary
  },
  progressLineLeft: {
    left: 0,
    right: "50%",
    marginRight: 19
  },
  progressLineRight: {
    left: "50%",
    right: 0,
    marginLeft: 19
  },
  progressLabel: {
    marginTop: 10,
    maxWidth: 80,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    color: uiPalette.textMuted
  }
});
