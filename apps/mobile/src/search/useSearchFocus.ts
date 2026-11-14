import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useRef, type ComponentRef } from "react";
import { Keyboard, Platform, type TextInput } from "react-native";
import type { SearchBarCommands } from "react-native-screens";

type SearchTabsNavigation = {
  getState: () => { index: number; routes: { key: string; name: string }[] };
  addListener: (
    event: "tabPress",
    listener: (event: { target?: string; data?: { isPrevented?: boolean } }) => void
  ) => () => void;
};

export function useSearchFocus({ useTextInput = false }: { useTextInput?: boolean } = {}) {
  const nativeSearchRef = useRef<SearchBarCommands | null>(null);
  const webSearchRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const tabs = useNavigation<SearchTabsNavigation>("/(tabs)/(navigation)");
  const focused = useRef(false);
  const onSearchFocus = useCallback(() => { focused.current = true; }, []);
  const onSearchBlur = useCallback(() => { focused.current = false; }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let frame: number | undefined;
      const toggleSearch = () => {
        if (!active) return;
        if (frame !== undefined) {
          cancelAnimationFrame(frame);
          frame = undefined;
          return;
        }
        if (focused.current) {
          focused.current = false;
          if (Platform.OS === "web" || useTextInput) webSearchRef.current?.blur();
          else nativeSearchRef.current?.blur();
          Keyboard.dismiss();
          return;
        }
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (!active) return;
          focused.current = true;
          if (Platform.OS === "web" || useTextInput) webSearchRef.current?.focus();
          else nativeSearchRef.current?.focus();
        });
      };

      // Entry only selects the tab. Focus is an explicit reselect (or input tap).
      const unsubscribe = tabs.addListener("tabPress", (event) => {
        const state = tabs.getState();
        const selected = state.routes[state.index];
        if (selected?.name === "search" && event.target === selected.key && !event.data?.isPrevented) toggleSearch();
      });
      const keyboardSubscription = Keyboard.addListener("keyboardDidHide", onSearchBlur);

      return () => {
        active = false;
        focused.current = false;
        unsubscribe();
        keyboardSubscription.remove();
        if (frame !== undefined) cancelAnimationFrame(frame);
        if (Platform.OS === "web" || useTextInput) webSearchRef.current?.blur();
        else nativeSearchRef.current?.blur();
      };
    }, [tabs, onSearchBlur, useTextInput])
  );

  return { nativeSearchRef, webSearchRef, onSearchFocus, onSearchBlur };
}
