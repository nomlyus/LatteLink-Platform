import { useState } from "react";
import { DeleteAccountSheet } from "../account/DeleteAccountSheet";
import { ScreenState } from "../ui/ScreenState";

export function DeleteAccountPreview() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <>
    <ScreenState title="Account deletion confirmation" message="This preview only shows the native alert. Confirming closes the alert without deleting anything."
      actionLabel="Show confirmation" onAction={() => setOpen(true)} />
    <DeleteAccountSheet open={open} bottomInset={0} onClose={close} onCancel={close} onConfirm={close} />
  </>;
}
