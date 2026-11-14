import { MenuScreen } from "../../../../src/screens/MenuScreen";
import { TabScreen } from "../../../../src/navigation/TabScreen";

export default function MenuRoute() {
  return (
    <TabScreen>
      <MenuScreen />
    </TabScreen>
  );
}
