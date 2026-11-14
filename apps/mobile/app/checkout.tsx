import { Redirect } from "expo-router";

/** Keep old checkout links compatible; Cart now owns payment presentation. */
export default function CheckoutRoute() {
  return <Redirect href="/cart" />;
}
