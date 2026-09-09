import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTravel } from "../../state/travel-provider";
import {
  Button,
  Chip,
  ErrorMessage,
  Field,
  Icon,
  styles as s,
} from "../../ui/components";
import { Frame } from "../../ui/shell";
import { palette as p } from "../../ui/theme";
import { TravelCover } from "../../ui/travel-cover";

export default function AuthScreen() {
  const state = useTravel();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(sample = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!sample && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        throw new Error("올바른 이메일을 입력해 주세요.");
      if (state.mode === "http" && password.length < 8)
        throw new Error("비밀번호는 8자 이상 입력해 주세요.");
      await state.authenticate(
        register && !sample ? name : null,
        sample ? state.sampleEmail! : email.trim(),
        password,
      );
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TravelCover light contentStyle={st.hero}>
            <View style={st.brandRow}>
              <Icon name="plane" color={p.primary} size={27} />
              <Text style={st.brand}>
                WeGo<Text style={{ color: p.mint }}>Trip</Text>
              </Text>
            </View>
            <Text style={st.heroTitle}>
              함께 떠나는 여행,{"\n"}오래 남을 우리 이야기.
            </Text>
            <Text style={st.heroSub}>계획부터 정산까지, 한곳에서 가볍게.</Text>
          </TravelCover>
          <View style={st.panel}>
            <View style={[s.row, { marginBottom: 24 }]}>
              <Chip
                title="로그인"
                active={!register}
                onPress={() => setRegister(false)}
              />
              <Chip
                title="회원가입"
                active={register}
                onPress={() => setRegister(true)}
              />
            </View>
            <Text style={[s.sectionTitle, { marginBottom: 6 }]}>
              {register
                ? "반가워요, 함께 떠나요"
                : "다음 여행이 기다리고 있어요"}
            </Text>
            <Text style={[s.body, { marginBottom: 22 }]}>
              {register
                ? "여행을 함께할 프로필을 만들어 주세요."
                : "다시 만나서 반가워요."}
            </Text>
            {register && (
              <Field
                title="이름"
                value={name}
                onChangeText={setName}
                placeholder="어떻게 불러드릴까요?"
                maxLength={30}
              />
            )}
            <Field
              title="이메일"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              autoComplete="email"
            />
            {state.mode === "http" && (
              <Field
                title="비밀번호"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="8자 이상 입력해 주세요"
              />
            )}
            <ErrorMessage message={error || state.error} />
            <Button
              title={register ? "회원가입" : "로그인"}
              onPress={() => void submit()}
              loading={busy}
              icon="arrow"
            />
            {state.mode === "mock" && (
              <>
                <View style={s.divider} />
                <Button
                  title="샘플 계정으로 시작하기"
                  secondary
                  onPress={() => void submit(true)}
                  disabled={busy}
                />
                <Text style={st.localNote}>
                  현재는 로컬 데이터 모드예요.{"\n"}이메일로 저장된 프로필을
                  선택하며 비밀번호는 사용하지 않아요.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Frame>
  );
}
const st = StyleSheet.create({
  hero: { padding: 27, justifyContent: "flex-start" },
  brandRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 12,
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1,
    color: p.primary,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 40,
    color: "#174675",
    marginTop: 23,
  },
  heroSub: { color: "#3D7192", fontSize: 13, marginTop: 11 },
  panel: {
    backgroundColor: p.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 27,
    paddingBottom: 35,
  },
  localNote: {
    fontSize: 11,
    lineHeight: 18,
    color: p.secondary,
    marginTop: 16,
    textAlign: "center",
  },
});
