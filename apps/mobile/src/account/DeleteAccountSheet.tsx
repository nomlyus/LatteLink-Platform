import { useEffect, useRef } from "react";
import { Alert } from "react-native";

type DeleteAccountSheetProps = {
  open: boolean; bottomInset: number; pending?: boolean;
  onClose: () => void; onCancel: () => void; onConfirm: () => void;
};

/** UIKit/Android own destructive confirmation; no nested custom sheet or duplicate submission. */
export function DeleteAccountSheet({ open, pending = false, onClose, onCancel, onConfirm }: DeleteAccountSheetProps) {
  const presented = useRef(false);
  const confirmationIssued = useRef(false);
  const mounted = useRef(true);
  const callbacks = useRef({ onClose, onCancel, onConfirm, pending });
  callbacks.current = { onClose, onCancel, onConfirm, pending };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!open) { presented.current = false; confirmationIssued.current = false; return; }
    if (presented.current || pending) return;
    presented.current = true;
    Alert.alert("Delete your account?", "You’ll lose access to your profile and rewards. This can’t be undone.", [
      { text: "Keep account", style: "cancel", onPress: () => { if (mounted.current) callbacks.current.onCancel(); } },
      { text: "Delete account", style: "destructive", onPress: () => {
        if (mounted.current && !callbacks.current.pending && !confirmationIssued.current) {
          confirmationIssued.current = true;
          callbacks.current.onConfirm();
        }
      } }
    ], { cancelable: true, onDismiss: () => { if (mounted.current) callbacks.current.onClose(); } });
  }, [open, pending]);
  return null;
}
