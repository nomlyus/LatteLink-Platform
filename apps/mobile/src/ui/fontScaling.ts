type ComponentWithFontScalingDefaults = {
  defaultProps?: Record<string, unknown>;
};

export function lockComponentFontScaling(component: object) {
  const configurableComponent = component as ComponentWithFontScalingDefaults;

  configurableComponent.defaultProps = {
    ...configurableComponent.defaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1
  };
}
