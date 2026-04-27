import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Font Loading for Remotion
 * Uses Google Fonts CDN for Inter and JetBrains Mono
 */

const GOOGLE_FONTS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

let fontsLoaded = false;

export const loadFonts = async (): Promise<void> => {
  if (fontsLoaded) return;

  // Inject Google Fonts CSS
  const style = document.createElement("style");
  style.textContent = GOOGLE_FONTS_CSS;
  document.head.appendChild(style);

  // Wait for fonts to be ready
  await document.fonts.ready;

  fontsLoaded = true;
};

/**
 * Hook to ensure fonts are loaded before rendering
 * Use this in your composition's top-level component
 */
export const useFonts = () => {
  const [handle] = React.useState(() => delayRender("Loading fonts..."));

  React.useEffect(() => {
    loadFonts()
      .then(() => continueRender(handle))
      .catch((err) => {
        console.error("Failed to load fonts:", err);
        continueRender(handle);
      });
  }, [handle]);
};

// Need to import React for the hook
import React from "react";
