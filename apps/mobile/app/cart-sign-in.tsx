import { Stack, useRouter } from "expo-router";
import { AccountSheetSurface } from "../src/account/AccountSheetSurface";
import { accountSheetOptions, accountSignInHeaderOptions } from "../src/account/accountSheetOptions";
import { useAuthSession } from "../src/auth/session";
import { AccountScreen } from "../src/screens/AccountScreen";

/** Present on Cart's root stack rather than navigating into the tabs underneath it. */
export default function CartSignInRoute() {
  const router = useRouter();
  const { isAuthenticated } = useAuthSession();
  const returnToCart = () => router.dismissTo("/cart");
  return <AccountSheetSurface>
    <Stack.Screen options={{ ...accountSheetOptions(isAuthenticated), ...accountSignInHeaderOptions }} />
    <AccountScreen presentation="sheet" returnTo="cart" onSignInComplete={returnToCart} onBack={() => {
      if (router.canGoBack()) router.back();
      else router.replace("/cart");
    }} />
  </AccountSheetSurface>;
}
