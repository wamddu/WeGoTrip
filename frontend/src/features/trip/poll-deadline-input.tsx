import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  localDeadlineFields,
  type PollDeadlineInput,
} from "../../data/poll-deadline";
import { styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";

export function PollDeadlineField({
  value,
  onChange,
  disabled,
}: {
  value: PollDeadlineInput;
  onChange(value: PollDeadlineInput): void;
  disabled: boolean;
}) {
  function preset(minutes: number) {
    onChange({
      enabled: true,
      ...localDeadlineFields(new Date(Date.now() + minutes * 60000)),
    });
  }
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="투표 자동 마감"
        accessibilityState={{ checked: value.enabled, disabled }}
        aria-checked={value.enabled}
        disabled={disabled}
        onPress={() => {
          if (!value.enabled && !value.date) preset(30);
          else onChange({ ...value, enabled: !value.enabled });
        }}
        style={[st.toggle, disabled && { opacity: 0.5 }]}
      >
        <Text style={[s.small, value.enabled && { color: p.primary }]}>
          자동 마감
        </Text>
        <View
          style={[st.track, value.enabled && { backgroundColor: p.primary }]}
        >
          <View
            style={[
              st.thumb,
              value.enabled && { transform: [{ translateX: 14 }] },
            ]}
          />
        </View>
      </Pressable>
      {value.enabled && (
        <View style={st.fields}>
          <Text style={s.strong}>언제 마감할까요?</Text>
          <View style={st.presets}>
            {[
              [10, "10분"],
              [30, "30분"],
              [60, "1시간"],
              [1440, "24시간"],
            ].map(([minutes, label]) => (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityLabel={`${label} 뒤 투표 마감`}
                disabled={disabled}
                onPress={() => preset(Number(minutes))}
                style={({ pressed }) => [
                  st.preset,
                  (pressed || disabled) && { opacity: 0.5 },
                ]}
              >
                <Text style={st.presetText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={st.dateTime}>
            <View style={{ flex: 1.5, gap: 5 }}>
              <Text style={s.small}>마감 날짜</Text>
              <TextInput
                accessibilityLabel="투표 마감 날짜"
                value={value.date}
                onChangeText={(date) => onChange({ ...value, date })}
                editable={!disabled}
                placeholder="YYYY-MM-DD"
                maxLength={10}
                style={st.input}
                autoCorrect={false}
              />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={s.small}>마감 시간</Text>
              <TextInput
                accessibilityLabel="투표 마감 시간"
                value={value.time}
                onChangeText={(time) => onChange({ ...value, time })}
                editable={!disabled}
                placeholder="HH:mm"
                maxLength={5}
                style={st.input}
                autoCorrect={false}
              />
            </View>
          </View>
          <Text style={s.small}>
            기기 시간대 기준 · 지정한 시각에 자동으로 마감돼요.
          </Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  toggle: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    gap: 8,
    paddingHorizontal: 4,
  },
  track: {
    width: 34,
    height: 20,
    borderRadius: 10,
    padding: 3,
    backgroundColor: p.secondary,
  },
  thumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: p.white },
  fields: {
    padding: 14,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 14,
    backgroundColor: p.white,
    gap: 10,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: p.blueSoft,
  },
  presetText: { fontSize: 13, fontWeight: "600", color: p.primary },
  dateTime: { flexDirection: "row", gap: 10 },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: p.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: p.ink,
    backgroundColor: p.bg,
    fontSize: 14,
  },
});
