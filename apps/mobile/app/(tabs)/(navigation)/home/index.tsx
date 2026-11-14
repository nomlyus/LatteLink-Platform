import { HomeScreen } from "../../../../src/screens/HomeScreen";
import { TabScreen } from "../../../../src/navigation/TabScreen";

export default function HomeRoute() {
  return (
    <TabScreen>
      <HomeScreen />
    </TabScreen>
  );
}
