import { View } from "react-native";
import { TabScreen } from "../../../../src/navigation/TabScreen";
import { uiPalette } from "../../../../src/ui/systemColors";

export default function RewardsRoute() {
  return <TabScreen><View style={{ flex: 1, backgroundColor: uiPalette.background }} /></TabScreen>;
}
