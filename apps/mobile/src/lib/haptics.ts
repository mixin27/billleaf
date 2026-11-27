import * as Haptics from "expo-haptics"

/**
 * Light feedback for touches that change something. Failures are ignored:
 * some devices and simulators have no haptics.
 */
export const haptic = {
  /** Picking a tab, segment or chip. */
  selection: () => void Haptics.selectionAsync().catch(() => {}),
  /** Pressing the timer dock or a floating button. */
  press: () =>
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  /** Something saved. */
  success: () =>
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => {}),
  /** About to do something that can't be undone. */
  warning: () =>
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning
    ).catch(() => {}),
}
