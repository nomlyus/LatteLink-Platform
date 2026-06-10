import { Keyboard } from "react-native";

const KEYBOARD_DISMISS_FALLBACK_MS = 400;

export function runAfterKeyboardDismiss(action: () => void) {
  if (!Keyboard.isVisible()) {
    Keyboard.dismiss();
    action();
    return;
  }

  let completed = false;

  const subscription = Keyboard.addListener("keyboardDidHide", complete);
  const timeout = setTimeout(complete, KEYBOARD_DISMISS_FALLBACK_MS);

  function complete() {
    if (completed) {
      return;
    }

    completed = true;
    subscription.remove();
    clearTimeout(timeout);
    action();
  }

  Keyboard.dismiss();
}
