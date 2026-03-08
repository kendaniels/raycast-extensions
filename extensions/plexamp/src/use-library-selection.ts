import { useCallback, useEffect, useState } from "react";

import {
  getMusicSections,
  getPlexSetupStatus,
  resolveSelectedLibrary,
} from "./plex";
import type { LibrarySection } from "./types";

interface LibrarySelectionState {
  isLoading: boolean;
  libraries: LibrarySection[];
  selectedLibrary?: LibrarySection;
  selectedServerName?: string;
  error?: string;
}

export function useLibrarySelection() {
  const [state, setState] = useState<LibrarySelectionState>({
    isLoading: true,
    libraries: [],
  });

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: undefined }));

    try {
      const [libraries, setupStatus] = await Promise.all([
        getMusicSections(),
        getPlexSetupStatus(),
      ]);
      const selectedLibrary = await resolveSelectedLibrary(libraries);
      setState({
        isLoading: false,
        libraries,
        selectedLibrary,
        selectedServerName: setupStatus.selectedServerName,
      });
    } catch (error) {
      setState({
        isLoading: false,
        libraries: [],
        selectedLibrary: undefined,
        selectedServerName: undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    ...state,
    reload,
  };
}
