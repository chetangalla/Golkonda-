import { Alert, Platform } from 'react-native';

/**
 * React Native's Alert.alert has no real implementation on web — it
 * silently does nothing, so every validation error, confirmation, and
 * success message in this app was invisible in the browser. This wraps
 * the same call signature and falls back to the browser's own dialogs
 * on web, while native platforms keep using the real Alert.
 */
export function showAlert(title, message = '', buttons = [{ text: 'OK' }]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const fullText = message ? `${title}\n\n${message}` : title;
  const actionable = buttons.filter(b => b.style !== 'cancel');

  if (buttons.length <= 1) {
    window.alert(fullText);
    buttons[0]?.onPress?.();
    return;
  }

  if (actionable.length === 1) {
    // The common Cancel + one-action case maps directly onto confirm().
    if (window.confirm(fullText)) {
      actionable[0].onPress?.();
    } else {
      buttons.find(b => b.style === 'cancel')?.onPress?.();
    }
    return;
  }

  // 3+ distinct choices (e.g. Cancel / Merge / Replace All) — confirm
  // intent to proceed, then let a prompt pick which action.
  if (!window.confirm(`${fullText}\n\nClick OK to choose an action, or Cancel to back out.`)) {
    buttons.find(b => b.style === 'cancel')?.onPress?.();
    return;
  }
  const labels = actionable.map((b, i) => `${i + 1}. ${b.text}`).join('\n');
  const pick = parseInt(window.prompt(`Which action?\n${labels}`, '1'), 10) - 1;
  actionable[pick]?.onPress?.();
}
