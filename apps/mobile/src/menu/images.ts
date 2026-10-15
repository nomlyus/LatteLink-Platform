export type MenuImageVariant = "list" | "hero";

function replaceLastExtension(pathname: string, nextExtension: string) {
  return pathname.replace(/\.[^/.]+$/, `.${nextExtension}`);
}

export function resolveMenuImageUrl(imageUrl: string | undefined, variant: MenuImageVariant) {
  if (!imageUrl) {
    return undefined;
  }

  try {
    const url = new URL(imageUrl);
    if (!url.pathname.includes("/menu-items/") || !url.pathname.includes("/original/")) {
      return imageUrl;
    }

    url.pathname = replaceLastExtension(
      url.pathname.replace("/original/", variant === "list" ? "/mobile-list/" : "/mobile-hero/"),
      "jpg"
    );
    return url.toString();
  } catch {
    return imageUrl;
  }
}
