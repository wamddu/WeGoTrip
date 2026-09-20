import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { searchPlaces, type PlaceSearchResult } from "../../data/place-search";
import { Button, ErrorMessage, Field, styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";

export function PlaceSearch({
  onSelect,
}: {
  onSelect: (place: PlaceSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setResults([]);
    setSearched(false);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const found = await searchPlaces(query, controller.signal);
      if (request.current !== controller) return;
      setResults(found);
      setSearched(true);
    } catch (cause) {
      if (request.current !== controller) return;
      setError(
        controller.signal.aborted
          ? "검색 시간이 초과됐어요. 다시 시도해 주세요."
          : cause instanceof Error && cause.message !== "Failed to fetch"
            ? cause.message
            : "검색 서버에 연결하지 못했어요. 연결을 확인해 주세요.",
      );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }

  return (
    <View style={{ gap: 10, marginBottom: 20 }}>
      <Field
        title="장소 검색"
        placeholder="예: 부산 시그니엘 호텔"
        value={query}
        maxLength={150}
        returnKeyType="search"
        onChangeText={(value) => {
          request.current?.abort();
          request.current = null;
          setLoading(false);
          setQuery(value);
          setResults([]);
          setSearched(false);
          setError("");
        }}
        onSubmitEditing={() => {
          if (query.trim() && !loading) void search();
        }}
      />
      <Button
        title={loading ? "검색 중…" : "장소 검색"}
        disabled={!query.trim() || loading}
        onPress={() => void search()}
      />
      <ErrorMessage message={error} />
      {searched && !results.length && (
        <Text style={s.small}>
          검색 결과가 없어요. 지역과 장소명을 함께 입력해 보세요.
        </Text>
      )}
      {results.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`${place.name}, ${place.address} 선택`}
          style={s.card}
          onPress={() => {
            onSelect(place);
            setResults([]);
            setSearched(false);
          }}
        >
          <Text style={s.strong}>{place.name}</Text>
          <Text style={s.small}>{place.address}</Text>
          <Text style={{ color: p.primary, fontSize: 12 }}>
            선택해서 지도에서 확인
          </Text>
        </Pressable>
      ))}
      {results.length > 0 && (
        <Text style={{ color: "#5E5E5E", fontSize: 12 }}>Google Maps</Text>
      )}
    </View>
  );
}
