import { Tabs } from "expo-router";
import { bottomTabs } from "./bottomTabs";

/** Web-only fallback; native platforms always use NativeTabs. */
export function JavaScriptTabNavigator() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false }}>
      {bottomTabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
