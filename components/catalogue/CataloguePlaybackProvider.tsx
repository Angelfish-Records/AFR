"use client";

import React from "react";
import Hls from "hls.js";

type PreviewResponse =
  | {
      ok: true;
      playbackUrl: string;
      expiresAt: number;
      clipStartSeconds: number;
      clipLengthSeconds: number;
    }
  | {
      ok: false;
      error: string;
    };

type PlaybackMode = "full" | "clip";
type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

type PlaybackSource = {
  recordingId: string;
  playbackUrl: string;
  expiresAt: number;
  clipStartSeconds: number;
  clipLengthSeconds: number;
};

type PlaybackState = {
  activeRecordingId: string | null;
  activeMode: PlaybackMode | null;
  status: PlaybackStatus;
  currentTimeSeconds: number;
  durationSeconds: number | null;
  clipStartSeconds: number | null;
  clipEndSeconds: number | null;
  errorMessage: string | null;
};

type CataloguePlaybackContextValue = {
  state: PlaybackState;
  isRecordingActive: (recordingId: string, mode?: PlaybackMode) => boolean;
  play: (recordingId: string, mode: PlaybackMode) => Promise<void>;
  pause: () => void;
  toggle: (recordingId: string, mode: PlaybackMode) => Promise<void>;
};

const CataloguePlaybackContext =
  React.createContext<CataloguePlaybackContextValue | null>(null);

type ProviderProps = {
  accessToken?: string | null;
  children: React.ReactNode;
};

const INITIAL_STATE: PlaybackState = {
  activeRecordingId: null,
  activeMode: null,
  status: "idle",
  currentTimeSeconds: 0,
  durationSeconds: null,
  clipStartSeconds: null,
  clipEndSeconds: null,
  errorMessage: null,
};

export function CataloguePlaybackProvider(props: ProviderProps) {
  const { accessToken = null, children } = props;

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const sourceCacheRef = React.useRef<Map<string, PlaybackSource>>(new Map());

  const [state, setState] = React.useState<PlaybackState>(INITIAL_STATE);

  const teardownHls = React.useCallback(() => {
    if (!hlsRef.current) {
      return;
    }

    try {
      hlsRef.current.destroy();
    } catch {
      // ignore teardown errors
    }

    hlsRef.current = null;
  }, []);

  const attachSource = React.useCallback(
    async (playbackUrl: string): Promise<void> => {
      const audio = audioRef.current;

      if (!audio) {
        throw new Error("Audio element unavailable");
      }

      teardownHls();

      await new Promise<void>((resolve, reject) => {
        const cleanupNativeListeners = () => {
          audio.removeEventListener("canplay", onNativeReady);
          audio.removeEventListener("error", onNativeError);
        };

        const onNativeReady = () => {
          cleanupNativeListeners();
          resolve();
        };

        const onNativeError = () => {
          cleanupNativeListeners();
          reject(new Error("Failed to load playback"));
        };

        if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.addEventListener("canplay", onNativeReady);
          audio.addEventListener("error", onNativeError);
          audio.src = playbackUrl;
          audio.load();
          return;
        }

        if (!Hls.isSupported()) {
          reject(new Error("HLS is not supported in this browser"));
          return;
        }

        const hls = new Hls();
        hlsRef.current = hls;

        const cleanupHlsListeners = () => {
          hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
          hls.off(Hls.Events.ERROR, onHlsError);
        };

        const onManifestParsed = () => {
          cleanupHlsListeners();
          resolve();
        };

        const onHlsError = (_event: string, data: { fatal?: boolean }) => {
          if (!data?.fatal) {
            return;
          }

          cleanupHlsListeners();
          reject(new Error("Failed to load playback"));
        };

        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        hls.on(Hls.Events.ERROR, onHlsError);
        hls.loadSource(playbackUrl);
        hls.attachMedia(audio);
      });
    },
    [teardownHls]
  );

  const fetchSource = React.useCallback(
    async (recordingId: string): Promise<PlaybackSource> => {
      const cached = sourceCacheRef.current.get(recordingId);
      const now = Math.floor(Date.now() / 1000);

      if (cached && cached.expiresAt > now + 20) {
        return cached;
      }

      const params = new URLSearchParams();

      if (accessToken) {
        params.set("t", accessToken);
      }

      const query = params.toString();
      const url = `/api/catalogue/preview/${encodeURIComponent(recordingId)}${
        query ? `?${query}` : ""
      }`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      const payload = (await response.json()) as PreviewResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          response.ok && !payload.ok ? payload.error : "Failed to load playback"
        );
      }

      const source: PlaybackSource = {
        recordingId,
        playbackUrl: payload.playbackUrl,
        expiresAt: payload.expiresAt,
        clipStartSeconds: payload.clipStartSeconds,
        clipLengthSeconds: payload.clipLengthSeconds,
      };

      sourceCacheRef.current.set(recordingId, source);
      return source;
    },
    [accessToken]
  );

  const pause = React.useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    try {
      audio.pause();
    } catch {
      // ignore pause errors
    }

    setState((current) => ({
      ...current,
      status: "paused",
    }));
  }, []);

  const play = React.useCallback(
    async (recordingId: string, mode: PlaybackMode): Promise<void> => {
      const audio = audioRef.current;

      if (!audio) {
        throw new Error("Audio element unavailable");
      }

      setState((current) => ({
        ...current,
        activeRecordingId: recordingId,
        activeMode: mode,
        status: "loading",
        errorMessage: null,
      }));

      try {
        const source = await fetchSource(recordingId);

        if (audio.src !== source.playbackUrl) {
          await attachSource(source.playbackUrl);
        }

        const clipStartSeconds = source.clipStartSeconds;
        const clipEndSeconds =
          source.clipStartSeconds + source.clipLengthSeconds;

        audio.currentTime = mode === "full" ? 0 : clipStartSeconds;
        await audio.play();

        setState((current) => ({
          ...current,
          activeRecordingId: recordingId,
          activeMode: mode,
          status: "playing",
          clipStartSeconds,
          clipEndSeconds,
          errorMessage: null,
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          activeRecordingId: recordingId,
          activeMode: mode,
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "Playback failed",
        }));
      }
    },
    [attachSource, fetchSource]
  );

  const toggle = React.useCallback(
    async (recordingId: string, mode: PlaybackMode): Promise<void> => {
      const isSameTarget =
        state.activeRecordingId === recordingId && state.activeMode === mode;

      if (isSameTarget && state.status === "playing") {
        pause();
        return;
      }

      await play(recordingId, mode);
    },
    [pause, play, state.activeMode, state.activeRecordingId, state.status]
  );

  const isRecordingActive = React.useCallback(
    (recordingId: string, mode?: PlaybackMode): boolean => {
      if (state.activeRecordingId !== recordingId) {
        return false;
      }

      if (!mode) {
        return true;
      }

      return state.activeMode === mode;
    },
    [state.activeMode, state.activeRecordingId]
  );

  React.useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const onTimeUpdate = () => {
      setState((current) => {
        if (
          current.status === "playing" &&
          current.activeMode === "clip" &&
          current.clipEndSeconds !== null &&
          audio.currentTime >= current.clipEndSeconds
        ) {
          audio.pause();

          return {
            ...current,
            currentTimeSeconds: audio.currentTime,
            durationSeconds: Number.isFinite(audio.duration)
              ? audio.duration
              : null,
            status: "paused",
          };
        }

        return {
          ...current,
          currentTimeSeconds: audio.currentTime,
          durationSeconds: Number.isFinite(audio.duration) ? audio.duration : null,
        };
      });
    };

    const onPause = () => {
      setState((current) => ({
        ...current,
        status: current.status === "loading" ? current.status : "paused",
      }));
    };

    const onPlaying = () => {
      setState((current) => ({
        ...current,
        status: "playing",
      }));
    };

    const onEnded = () => {
      setState((current) => ({
        ...current,
        status: "paused",
      }));
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      pause();
      teardownHls();
    };
  }, [pause, teardownHls]);

  const value = React.useMemo<CataloguePlaybackContextValue>(
    () => ({
      state,
      isRecordingActive,
      play,
      pause,
      toggle,
    }),
    [isRecordingActive, pause, play, state, toggle]
  );

  return (
    <CataloguePlaybackContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" style={{ display: "none" }} />
    </CataloguePlaybackContext.Provider>
  );
}

export function useCataloguePlayback(): CataloguePlaybackContextValue {
  const value = React.useContext(CataloguePlaybackContext);

  if (!value) {
    throw new Error("useCataloguePlayback must be used within CataloguePlaybackProvider");
  }

  return value;
}