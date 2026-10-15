import { ConfirmationSheet } from "../components/ConfirmationSheet";

type RemoveItemSheetProps = {
  open: boolean;
  itemName?: string;
  bottomInset: number;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RemoveItemSheet({ itemName, ...props }: RemoveItemSheetProps) {
  const body = itemName
    ? `Are you sure you want to remove "${itemName}" from your cart?`
    : "Are you sure you want to remove this item from your cart?";
  return <ConfirmationSheet {...props} title="Remove Item?" body={body} confirmLabel="Remove" snapPoint="50%" />;
}
