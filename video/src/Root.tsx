import React from "react";
import { Composition } from "remotion";
import { video } from "./lib/tokens";
import { loadFonts } from "./lib/fonts";
import { launchVideoSchema, type LaunchVideoProps } from "./lib/schemas";
import LaunchVideo from "./compositions/LaunchVideo";

// Default props derived from schema
const defaultProps: LaunchVideoProps = launchVideoSchema.parse({});

/**
 * Remotion Root
 * Registers all video compositions
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main Launch Video - 16:9 - 30 seconds */}
      <Composition
        id="LaunchVideo"
        component={LaunchVideo}
        durationInFrames={video.durationInFrames}
        fps={video.fps}
        width={video.width}
        height={video.height}
        schema={launchVideoSchema}
        defaultProps={defaultProps}
        calculateMetadata={async () => {
          await loadFonts();
          return {};
        }}
      />

      {/* Square format for social - 1:1 - 30 seconds */}
      <Composition
        id="LaunchVideoSquare"
        component={LaunchVideo}
        durationInFrames={video.durationInFrames}
        fps={video.fps}
        width={1080}
        height={1080}
        schema={launchVideoSchema}
        defaultProps={defaultProps}
        calculateMetadata={async () => {
          await loadFonts();
          return {};
        }}
      />

      {/* Vertical for Stories/Reels - 9:16 - 30 seconds */}
      <Composition
        id="LaunchVideoVertical"
        component={LaunchVideo}
        durationInFrames={video.durationInFrames}
        fps={video.fps}
        width={1080}
        height={1920}
        schema={launchVideoSchema}
        defaultProps={defaultProps}
        calculateMetadata={async () => {
          await loadFonts();
          return {};
        }}
      />
    </>
  );
};
