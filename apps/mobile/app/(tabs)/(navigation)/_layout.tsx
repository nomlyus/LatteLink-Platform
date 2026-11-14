import { BottomTabNavigator } from "../../../src/navigation/BottomTabNavigator";

export const unstable_settings = { initialRouteName: "home" };

export default function NavigationLayout() {
  return <BottomTabNavigator />;
}
