import { PlexSetupView } from "./plex-setup-view";

export default function Command() {
  return (
    <PlexSetupView
      navigationTitle="Change Plex Library"
      forceLibrarySelection
    />
  );
}
