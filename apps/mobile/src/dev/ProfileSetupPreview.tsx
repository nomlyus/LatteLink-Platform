import BottomSheet from "@gorhom/bottom-sheet";
import { useRef, useState, type ComponentRef } from "react";
import { ProfileSetupView } from "../account/ProfileSetupView";
import { DateSheet } from "../account/ProfileSheets";
import { runAfterKeyboardDismiss } from "../ui/keyboard";

export function ProfileSetupPreview({ onContinue }: { onContinue: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const dateSheet = useRef<ComponentRef<typeof BottomSheet>>(null);
  return <>
    <ProfileSetupView name={name} phone={phone} birthday={birthday} onNameChange={setName} onPhoneChange={setPhone}
      onBirthdayPress={() => runAfterKeyboardDismiss(() => dateSheet.current?.snapToIndex(0))}
      onContinue={onContinue} onSkip={onContinue} />
    <DateSheet sheetRef={dateSheet} value={birthday} onChange={setBirthday} />
  </>;
}
