import { ConfirmationSheet } from "../components/ConfirmationSheet";

type DeleteAccountSheetProps = {
  open: boolean;
  bottomInset: number;
  pending?: boolean;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountSheet({ pending = false, ...props }: DeleteAccountSheetProps) {
  return (
    <ConfirmationSheet
      {...props}
      pending={pending}
      title="Delete Account?"
      body="This permanently deletes your profile, sessions, rewards, notifications, and order history tied to this account. This cannot be undone."
      confirmLabel={pending ? "Deleting Account…" : "Delete Account"}
      cancelLabel="Keep Account"
      snapPoint="56%"
      allowPanning
      tone="danger"
    />
  );
}
