import ProfilePage from "../../../account/alerts";
import { useAccountSheetHeaderHeight } from "../../../../src/account/AccountSheetNavigation";

export default function AccountProfileRoute() {
  const headerHeight = useAccountSheetHeaderHeight();
  return <ProfilePage presentation="sheet" contentTopInset={headerHeight} />;
}
