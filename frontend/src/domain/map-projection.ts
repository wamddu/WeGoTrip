import type { Coordinates } from "./models";

export const TILE_SIZE = 256;
export const MAX_LATITUDE = 85.05112878;
export const wrap = (value: number, range = 1) =>
  ((value % range) + range) % range;
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export interface Point {
  x: number;
  y: number;
}
export interface MapCamera {
  center: Point;
  zoom: number;
}

// Normalized Web Mercator coordinates, shared by the image tiles, lines, and markers.
export function project(coordinates: Coordinates): Point {
  const radians =
    (clamp(coordinates.latitude, -MAX_LATITUDE, MAX_LATITUDE) * Math.PI) / 180;
  return {
    x: wrap((coordinates.longitude + 180) / 360),
    y: clamp((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2, 0, 1),
  };
}
export function unproject(point: Point): Coordinates {
  return {
    latitude:
      (Math.atan(Math.sinh(Math.PI * (1 - 2 * clamp(point.y, 0, 1)))) * 180) /
      Math.PI,
    longitude: wrap(point.x) * 360 - 180,
  };
}
export function screenPoint(
  coordinates: Coordinates,
  camera: MapCamera,
  width: number,
  height: number,
): Point {
  const point = project(coordinates);
  const scale = TILE_SIZE * 2 ** camera.zoom;
  return {
    x: width / 2 + (wrap(point.x - camera.center.x + 0.5) - 0.5) * scale,
    y: height / 2 + (point.y - camera.center.y) * scale,
  };
}
export function fitCamera(
  coordinates: Coordinates[],
  width: number,
  height: number,
): MapCamera {
  if (!coordinates.length) return { center: { x: 0.5, y: 0.5 }, zoom: 1 };
  const points = coordinates.map(project);
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  let gap = -1,
    start = xs[0];
  xs.forEach((x, i) => {
    const next = i === xs.length - 1 ? xs[0] + 1 : xs[i + 1];
    if (next - x > gap) {
      gap = next - x;
      start = wrap(next);
    }
  });
  const spanX = 1 - gap;
  const minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const zoom = Math.floor(
    Math.min(
      Math.log2(Math.max(1, width - 96) / (TILE_SIZE * Math.max(spanX, 1e-8))),
      Math.log2(
        Math.max(1, height - 96) / (TILE_SIZE * Math.max(maxY - minY, 1e-8)),
      ),
    ),
  );
  return {
    center: { x: wrap(start + spanX / 2), y: (minY + maxY) / 2 },
    zoom: clamp(zoom, 0, 16),
  };
}
export function visibleTiles(camera: MapCamera, width: number, height: number) {
  const count = 2 ** camera.zoom;
  const left = camera.center.x * TILE_SIZE * count - width / 2;
  const top = camera.center.y * TILE_SIZE * count - height / 2;
  const tiles: {
    key: string;
    x: number;
    y: number;
    zoom: number;
    left: number;
    top: number;
  }[] = [];
  for (
    let x = Math.floor(left / TILE_SIZE);
    x < Math.ceil((left + width) / TILE_SIZE);
    x++
  ) {
    for (
      let y = Math.max(0, Math.floor(top / TILE_SIZE));
      y < Math.min(count, Math.ceil((top + height) / TILE_SIZE));
      y++
    ) {
      tiles.push({
        key: `${camera.zoom}/${x}/${y}`,
        x: wrap(x, count),
        y,
        zoom: camera.zoom,
        left: x * TILE_SIZE - left,
        top: y * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}
