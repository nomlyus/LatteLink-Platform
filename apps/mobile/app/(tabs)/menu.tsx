import { Redirect, useLocalSearchParams } from "expo-router";
import { tabDestinations } from "../../src/navigation/destinations";

export default function MenuCompatibilityRoute() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: tabDestinations.menu, params }} />;
}
