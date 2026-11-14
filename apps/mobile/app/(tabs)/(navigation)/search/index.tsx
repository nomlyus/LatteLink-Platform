import { TabScreen } from "../../../../src/navigation/TabScreen";
import { SearchScene } from "../../../../src/search/SearchScene";
import { nativeAppleHeaderCapabilities } from "../../../../src/navigation/nativeAppleHeader";
import { NativeAppleSearchPreview } from "../../../../src/search/NativeAppleSearchPreview";

export default function SearchRoute() {
  if (nativeAppleHeaderCapabilities().available) {
    return <TabScreen><NativeAppleSearchPreview /></TabScreen>;
  }
  return <TabScreen><SearchScene /></TabScreen>;
}
