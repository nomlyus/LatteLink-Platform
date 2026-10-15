import { ConfirmationSheet } from "../components/ConfirmationSheet";

type ClearCartSheetProps = {
  open: boolean;
  itemCount: number;
  bottomInset: number;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ClearCartSheet({ itemCount, ...props }: ClearCartSheetProps) {
  return (
    <ConfirmationSheet
      {...props}
      title="Clear Cart?"
      body={`Are you sure you want to clear your cart? This will remove ${itemCount} ${itemCount === 1 ? "item" : "items"}.`}
      confirmLabel="Clear Cart"
      snapPoint="52%"
    />
  );
}
