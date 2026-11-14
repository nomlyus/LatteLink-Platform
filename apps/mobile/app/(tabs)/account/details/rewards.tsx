import RewardsPage from "../../../account/rewards";
import { useAccountSheetHeaderHeight } from "../../../../src/account/AccountSheetNavigation";

export default function AccountRewardsRoute() {
  const headerHeight = useAccountSheetHeaderHeight();
  return <RewardsPage presentation="sheet" contentTopInset={headerHeight} />;
}
