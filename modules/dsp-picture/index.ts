/**
 * DSPPicture — the JS face of modules/dsp-picture (iOS only; decision 5).
 *
 * `DSPPictureNativeView` hosts expo-video's persistent AVPlayer in an
 * app-owned AVPlayerLayer and is the only source of `onFirstFrame`, the event
 * that ends the tuning static (docs/native-witness.md). `DSPStaticNativeView`
 * is the snow the render server draws. Both are null where the module is not
 * linked (Expo Go, non-iOS): the surface then renders nothing and the static
 * shows its black seat and plate, and the trace header reads witness=absent.
 */
import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType, Ref } from 'react';
import { Platform, type ViewProps } from 'react-native';
import type { VideoPlayer } from 'expo-video';

/** Every `onTrace` payload: host ms, generation (or the pending one, or -1), item id (or `-`). */
export interface DSPTraceRow { t: number; g: number; i: string; name: string; detail: string }
export interface DSPFirstFrame { g: number; i: string; t: number; via: 'rfdKvo' | 'advanced' | 'external'; poll: number }
export interface DSPItemLost { g: number; i: string; t: number }
export interface DSPItemFailed { g: number; i: string; t: number; domain: string; code: number; message: string }
export interface DSPPipChange { active: boolean; possible: boolean }
export interface DSPStatus { player: boolean; item: string; g: number; fired: boolean; current: 'none' | 'set'; pip: boolean; ext: boolean }
export type DSPStartResult = 'ok' | 'adopted' | 'unbound' | 'stale';

export interface DSPPictureViewProps extends ViewProps {
  /** `player.__expo_shared_object_id__`, as expo-video's own VideoView passes it. */
  player: number | null;
  contentFit: 'contain' | 'cover' | 'fill';
  /** Decision 1: `!tuning`. */
  automaticPictureInPicture: boolean;
  /** Decision 6(d): 8, measured by `N config`. */
  liveOffsetSeconds: number;
  onTrace: (e: { nativeEvent: DSPTraceRow }) => void;
  onFirstFrame: (e: { nativeEvent: DSPFirstFrame }) => void;
  onItemLost: (e: { nativeEvent: DSPItemLost }) => void;
  onItemFailed: (e: { nativeEvent: DSPItemFailed }) => void;
  onPictureInPictureChange: (e: { nativeEvent: DSPPipChange }) => void;
}

/** The view functions expo-modules-core assigns to the component ref (NativeViewManagerAdapter.native.tsx:150-156). */
export interface DSPPictureHandle {
  expect(generation: number, uri: string): Promise<void>;
  startPlayback(generation: number, uri: string): Promise<DSPStartResult>;
  startPictureInPicture(): Promise<boolean>;
  stopPictureInPicture(): Promise<void>;
  status(): Promise<DSPStatus>;
}

export interface DSPStaticViewProps extends ViewProps {
  grainPoints: number;
  onStaticLive: (e: { nativeEvent: { t: number; n: number } }) => void;
  onStaticBoil: (e: { nativeEvent: { t: number; n: number } }) => void;
}

function tryRequire<P>(view: string): ComponentType<P> | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeViewManager<P>('DSPPicture', view);
  } catch {
    // Expo Go, or a build that did not autolink ./modules: the seat in watch.tsx says so.
    return null;
  }
}

export const DSPPictureNativeView = tryRequire<DSPPictureViewProps & { ref?: Ref<DSPPictureHandle> }>('DSPPictureView');
export const DSPStaticNativeView = tryRequire<DSPStaticViewProps>('DSPStaticView');
export const pictureAvailable = DSPPictureNativeView !== null;

/** The same accessor expo-video's own VideoView uses (src/VideoView.tsx:105-109). */
export function playerId(player: VideoPlayer | null): number | null {
  if (!player) return null;
  const id = (player as unknown as { __expo_shared_object_id__?: number }).__expo_shared_object_id__;
  return typeof id === 'number' ? id : null;
}
