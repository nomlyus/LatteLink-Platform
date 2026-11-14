import { AccountScreen } from "../../../src/screens/AccountScreen";
import { useRouter } from "expo-router";
import { tabDestinations } from "../../../src/navigation/destinations";
import { AccountHeaderMeasurement } from "../../../src/account/AccountSheetNavigation";

export default function AccountRoute() {
  const router = useRouter();
  function returnToNavigation() {
    if (router.canGoBack()) router.back();
    else router.replace(tabDestinations.home);
  }
  return <><AccountHeaderMeasurement /><AccountScreen onBack={returnToNavigation} presentation="sheet" /></>;
}
