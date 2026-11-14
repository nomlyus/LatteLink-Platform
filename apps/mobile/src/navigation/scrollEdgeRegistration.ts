type EdgeStyle = "automatic" | "soft";
type RegistrationDependencies = {
  setStyle: (style: EdgeStyle) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
};

/** Screens only applies changed edge props; native screen creation can precede scroll-view layout. */
export function createScrollEdgeRegistration({ setStyle, requestFrame, cancelFrame }: RegistrationDependencies) {
  let active = false;
  let frame: number | undefined;
  let generation = 0;
  let scrollView: object | number | undefined;
  let registered = false;

  function cancelPending() {
    generation += 1;
    if (frame !== undefined) cancelFrame(frame);
    frame = undefined;
  }

  function register() {
    if (!active || scrollView === undefined || registered || frame !== undefined) return;
    const requestGeneration = generation;
    // A changed prop after layout re-runs the native scroll-view lookup.
    setStyle("automatic");
    frame = requestFrame(() => {
      if (!active || requestGeneration !== generation) return;
      frame = undefined;
      setStyle("soft");
      registered = true;
    });
  }

  return {
    activate() { active = true; register(); },
    deactivate() { active = false; cancelPending(); },
    onLayout(target: object | number) {
      // Retained tabs keep their native scroll view and effect. Refocus or resize
      // must not briefly replace the visible soft edge with the system default.
      if (target === scrollView) return;
      cancelPending();
      scrollView = target;
      registered = false;
      register();
    }
  };
}
