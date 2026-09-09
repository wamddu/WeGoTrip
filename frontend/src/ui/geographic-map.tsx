import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { mapProvider, tileUrl } from "../data/map-provider";
import {
  clamp,
  fitCamera,
  project,
  screenPoint,
  TILE_SIZE,
  unproject,
  visibleTiles,
  wrap,
  type MapCamera,
} from "../domain/map-projection";
import type { Coordinates } from "../domain/models";
import { palette as p } from "./theme";

export interface MapMarker {
  id: string;
  label: string;
  title: string;
  coordinates: Coordinates;
  color: string;
}
export interface MapLine {
  id: string;
  from: Coordinates;
  to: Coordinates;
  color: string;
}
const HEIGHT = 280;

export function GeographicMap({
  markers,
  lines = [],
  selectedId,
  onSelect,
  onPick,
  initialCenter,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onPick?: (coordinates: Coordinates) => void;
  initialCenter?: Coordinates;
}) {
  const [width, setWidth] = useState(0);
  const [override, setOverride] = useState<MapCamera | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [retry, setRetry] = useState(0);
  const [linkError, setLinkError] = useState(false);
  const fit = fitCamera(
    markers.length
      ? markers.map((m) => m.coordinates)
      : initialCenter
        ? [initialCenter]
        : [],
    width,
    HEIGHT,
  );
  if (!markers.length) fit.zoom = Math.min(fit.zoom, 7);
  const camera = override ?? fit;
  const tiles = width > 0 ? visibleTiles(camera, width, HEIGHT) : [];
  const tileFailed = tiles.some((t) => failed[t.key]);
  const selectedCoordinates = markers.find(
    (marker) => marker.id === selectedId,
  )?.coordinates;
  useEffect(() => {
    if (width > 0 && selectedCoordinates)
      setOverride((current) => ({
        zoom: current?.zoom ?? fit.zoom,
        center: project(selectedCoordinates),
      }));
  }, [
    width,
    selectedId,
    selectedCoordinates?.latitude,
    selectedCoordinates?.longitude,
    fit.zoom,
  ]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
        onPanResponderMove: (_, gesture) =>
          setDrag({ x: gesture.dx, y: gesture.dy }),
        onPanResponderRelease: (_, gesture) => {
          const scale = TILE_SIZE * 2 ** camera.zoom;
          setOverride({
            ...camera,
            center: {
              x: wrap(camera.center.x - gesture.dx / scale),
              y: clamp(camera.center.y - gesture.dy / scale, 0, 1),
            },
          });
          setDrag({ x: 0, y: 0 });
        },
        onPanResponderTerminate: () => setDrag({ x: 0, y: 0 }),
      }),
    [camera.center.x, camera.center.y, camera.zoom],
  );

  function zoom(delta: number) {
    const selected = markers.find((m) => m.id === selectedId);
    setOverride({
      center: selected ? project(selected.coordinates) : camera.center,
      zoom: clamp(camera.zoom + delta, 0, 18),
    });
  }

  return (
    <View style={st.frame}>
      <View style={st.toolbar}>
        <Text style={st.hint}>
          {onPick
            ? "지도를 눌러 위치를 선택해요"
            : "밀어서 이동 · 번호를 눌러 확인"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="동선 전체 보기"
          onPress={() => setOverride(null)}
          style={st.fit}
        >
          <Text style={st.fitLabel}>전체 보기</Text>
        </Pressable>
        <View style={st.zoom}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지도 확대"
            disabled={camera.zoom >= 18}
            onPress={() => zoom(1)}
            style={st.zoomButton}
          >
            <Text style={st.zoomText}>+</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지도 축소"
            disabled={camera.zoom <= 0}
            onPress={() => zoom(-1)}
            style={st.zoomButton}
          >
            <Text style={st.zoomText}>−</Text>
          </Pressable>
        </View>
      </View>
      <View
        onLayout={({ nativeEvent: { layout } }) =>
          setWidth(Math.round(layout.width))
        }
        style={viewportStyle}
        {...pan.panHandlers}
      >
        <Pressable
          accessibilityRole={onPick ? "button" : undefined}
          accessibilityLabel={onPick ? "지도에서 위치 선택" : undefined}
          onPress={
            onPick
              ? ({ nativeEvent }) => {
                  const scale = TILE_SIZE * 2 ** camera.zoom;
                  // Native presses provide locationX/Y; web mouse clicks provide offsetX/Y.
                  const webEvent = nativeEvent as unknown as {
                    offsetX?: number;
                    offsetY?: number;
                  };
                  const x =
                    nativeEvent.locationX ?? webEvent.offsetX ?? width / 2;
                  const y =
                    nativeEvent.locationY ?? webEvent.offsetY ?? HEIGHT / 2;
                  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                  onPick(
                    unproject({
                      x: camera.center.x + (x - width / 2) / scale,
                      y: camera.center.y + (y - HEIGHT / 2) / scale,
                    }),
                  );
                }
              : undefined
          }
          style={StyleSheet.absoluteFill}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [{ translateX: drag.x }, { translateY: drag.y }],
                pointerEvents: "none",
              },
            ]}
          >
            {tiles.map((tile) => (
              <Image
                key={`${tile.key}:${retry}`}
                source={{
                  uri: tileUrl(tile.zoom, tile.x, tile.y),
                  ...(Platform.OS !== "web"
                    ? { headers: { "User-Agent": mapProvider.userAgent } }
                    : {}),
                }}
                cachePolicy="memory-disk"
                contentFit="fill"
                transition={0}
                onError={() =>
                  setFailed((current) => ({ ...current, [tile.key]: true }))
                }
                onLoad={() =>
                  setFailed((current) =>
                    current[tile.key]
                      ? { ...current, [tile.key]: false }
                      : current,
                  )
                }
                style={{
                  position: "absolute",
                  left: tile.left,
                  top: tile.top,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                }}
              />
            ))}
            <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
              {lines.map((line) => {
                const from = screenPoint(line.from, camera, width, HEIGHT),
                  to = screenPoint(line.to, camera, width, HEIGHT);
                return (
                  <Line
                    key={line.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={line.color}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray="8 5"
                  />
                );
              })}
            </Svg>
          </View>
        </Pressable>
        {markers.map((marker) => {
          const point = screenPoint(marker.coordinates, camera, width, HEIGHT);
          const x = point.x + drag.x,
            y = point.y + drag.y;
          if (x < -30 || x > width + 30 || y < -30 || y > HEIGHT + 30)
            return null;
          return (
            <Pressable
              key={marker.id}
              accessibilityRole="button"
              accessibilityLabel={`${marker.label}번 ${marker.title} 위치`}
              accessibilityState={{ selected: marker.id === selectedId }}
              onPress={(event) => {
                event.stopPropagation();
                onSelect?.(marker.id);
              }}
              style={[
                st.marker,
                { left: x - 22, top: y - 22 },
                marker.id === selectedId && { zIndex: 2 },
              ]}
            >
              <View
                style={[
                  st.markerBadge,
                  { backgroundColor: marker.color },
                  marker.id === selectedId && st.selected,
                ]}
              >
                <Text style={st.markerText}>{marker.label}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="지도 저작권 정보"
          onPress={() =>
            void Linking.openURL(mapProvider.attributionUrl).catch(() =>
              setLinkError(true),
            )
          }
          style={st.attribution}
        >
          <Text style={st.attributionText}>{mapProvider.attribution}</Text>
        </Pressable>
      </View>
      {tileFailed && (
        <View style={st.error}>
          <Text style={st.hint}>
            배경 지도를 불러오지 못했어요. 연결을 확인해 주세요.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지도 다시 불러오기"
            onPress={() => {
              setFailed({});
              setRetry((v) => v + 1);
            }}
          >
            <Text style={st.fitLabel}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      {linkError && (
        <Text style={st.error}>저작권 안내 페이지를 열지 못했어요.</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  frame: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: p.border,
    overflow: "hidden",
    backgroundColor: p.white,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    minHeight: 46,
  },
  hint: { flex: 1, fontSize: 11, color: p.secondary, lineHeight: 17 },
  fit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  fitLabel: { fontSize: 11, fontWeight: "700", color: p.primary },
  viewport: { height: HEIGHT, overflow: "hidden", backgroundColor: "#DDECEB" },
  marker: {
    position: "absolute",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  markerBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: p.white,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 5px #193C5055",
  },
  selected: { borderColor: p.ink, borderWidth: 3 },
  markerText: { color: p.white, fontWeight: "800", fontSize: 12 },
  zoom: {
    flexDirection: "row",
    backgroundColor: p.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.border,
  },
  zoomButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomText: { fontSize: 23, color: p.ink },
  attribution: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#FFFFFFE8",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  attributionText: { fontSize: 10, color: "#265769" },
  error: { padding: 12, gap: 8, color: p.red, fontSize: 11 },
});

// Let the map responder handle touch drags instead of scrolling the page on mobile web.
const viewportStyle = {
  ...st.viewport,
  ...(Platform.OS === "web" ? { touchAction: "none" } : {}),
};
