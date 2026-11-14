/** Keep every presentation of Account on the same native sheet geometry. */
export function accountSheetOptions(isAuthenticated: boolean) {
  return {
    presentation: "formSheet" as const,
    sheetAllowedDetents: isAuthenticated ? [0.65, 0.95] : [0.65],
    sheetInitialDetentIndex: 0,
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: isAuthenticated,
    gestureEnabled: true,
    contentStyle: { backgroundColor: "transparent" }
  };
}

export const accountSignInHeaderOptions = {
  headerShown: true,
  title: "",
  headerTransparent: true,
  headerShadowVisible: false,
  headerBackVisible: false,
  headerStyle: { backgroundColor: "transparent" },
  scrollEdgeEffects: { top: "hidden" as const }
};
