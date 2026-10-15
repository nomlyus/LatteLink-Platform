import { useEffect, useState } from "react";
import { resolveMenuImageUrl, type MenuImageVariant } from "./images";

/** Try the CDN variant, then the original asset, then the caller's fallback. */
export function useMenuImage(imageUrl: string | undefined, variant: MenuImageVariant, onFailure?: () => void) {
  const optimizedImageUrl = resolveMenuImageUrl(imageUrl, variant);
  const [activeImageUrl, setActiveImageUrl] = useState(optimizedImageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setActiveImageUrl(optimizedImageUrl);
    setImageFailed(false);
  }, [optimizedImageUrl]);

  function onImageError() {
    if (imageUrl && activeImageUrl !== imageUrl) {
      setActiveImageUrl(imageUrl);
      return;
    }
    setImageFailed(true);
    onFailure?.();
  }

  return { activeImageUrl, imageFailed, onImageError };
}
