import { Redirect, useLocalSearchParams } from "expo-router";
import { tabDestinations } from "../../src/navigation/destinations";

/** Preserve existing group-qualified links without making Account a hidden native tab. */
export default function HomeCompatibilityRoute() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: tabDestinations.home, params }} />;
}
