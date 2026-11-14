import SettingsPage from "../../../account/settings";
import { useAccountSheetHeaderHeight } from "../../../../src/account/AccountSheetNavigation";

export default function AccountSettingsRoute() {
  const headerHeight = useAccountSheetHeaderHeight();
  return <SettingsPage presentation="sheet" contentTopInset={headerHeight} />;
}
