import { LaunchType, launchCommand } from "@raycast/api";

import { PlexSetupView } from "./plex-setup-view";

export default function Command() {
  return (
    <PlexSetupView
      navigationTitle="Change Plex Library"
      forceLibrarySelection
      onConfigured={() =>
        launchCommand({
          name: "browse-media",
          type: LaunchType.UserInitiated,
        })
      }
    />
  );
}
