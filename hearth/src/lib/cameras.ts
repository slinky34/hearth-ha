import { useEffect, useState } from 'react';
import { useHa } from './ha';

/**
 * A camera is either a Home Assistant entity (`camera.front_door`) or a camera straight from
 * Frigate (`frigate:front_door`). Frigate cameras stream from Frigate itself, which is smoother.
 */
export const isFrigate = (ref: string) => ref.startsWith('frigate:');
const frigateName = (ref: string) => ref.slice('frigate:'.length);

/** A still image; add a changing `t` to refresh it. */
export function snapUrl(ref: string, h = 480) {
  return isFrigate(ref) ? `api/frigate/latest/${frigateName(ref)}?h=${h}` : `api/ha/camera/${ref}`;
}

/** Live MJPEG video. */
export function liveUrl(ref: string, h = 720, fps = 10) {
  return isFrigate(ref) ? `api/frigate/live/${frigateName(ref)}?h=${h}&fps=${fps}` : `api/ha/camera_stream/${ref}`;
}

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

let frigateCache: Promise<string[]> | null = null;
/** Camera names Frigate knows about (empty if Frigate isn't connected). */
export function useFrigateCameras() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    frigateCache ??= fetch('api/frigate/cameras')
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => (Array.isArray(l) ? l : []))
      .catch(() => []);
    let alive = true;
    frigateCache.then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** Every camera Hearth can show: HA camera entities plus Frigate's own cameras. */
export function useAllCameras() {
  const { entities } = useHa();
  const frigate = useFrigateCameras();
  return [
    ...frigate.map((n) => ({ entity_id: `frigate:${n}`, name: `${pretty(n)} · Frigate` })),
    ...entities.filter((e) => e.entity_id.startsWith('camera.')).map((e) => ({ entity_id: e.entity_id, name: e.name })),
  ];
}

/** A friendly name for a camera reference. */
export function useCameraName() {
  const { entities } = useHa();
  return (ref: string) => (isFrigate(ref) ? pretty(frigateName(ref)) : entities.find((e) => e.entity_id === ref)?.name ?? ref);
}

/** The cameras chosen in Settings, or every Frigate camera if none are chosen yet. */
export function useChosenCameras(chosen: string[]) {
  const frigate = useFrigateCameras();
  return chosen.length ? chosen : frigate.map((n) => `frigate:${n}`);
}
