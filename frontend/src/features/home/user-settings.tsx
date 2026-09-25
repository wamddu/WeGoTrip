import { useEffect, useRef, useState } from "react";
import { Platform, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useTravel } from "../../state/travel-provider";
import {
  ApiError,
  type Consent,
  type UserProfile,
  type UserSettings as Settings,
} from "../../data/user-api";
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  Section,
  styles as s,
} from "../../ui/components";
import { Confirm } from "../../ui/shell";

export function UserSettings() {
  const state = useTravel();
  const api = state.userApi!;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [reauth, setReauth] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function leave() {
    await state.signOut().catch(() => undefined);
    router.replace("/login");
  }
  async function run(action: () => Promise<void>) {
    if (lock.current || state.busy) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 401 &&
        e.code !== "INVALID_CREDENTIALS"
      )
        await leave();
      else setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function load() {
    const [user, prefs, history] = await Promise.all([
      api.me(),
      api.settings(),
      api.consents(),
    ]);
    setProfile(user);
    setName(user.name);
    setSettings(prefs);
    setConsents(history);
  }
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <View style={{ gap: 12 }}>
      <ErrorMessage message={error} />
      {notice ? <Text style={s.body}>{notice}</Text> : null}
      {!profile ? (
        <Button
          title="내 정보 다시 불러오기"
          onPress={() => void run(load)}
          loading={busy}
        />
      ) : (
        <>
          <Section title="회원 정보" />
          <Card>
            <View style={{ gap: 12 }}>
              <Field
                title="이름"
                value={name}
                onChangeText={setName}
                maxLength={50}
              />
              <Button
                title="이름 저장"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    setProfile(await api.updateProfile({ name }));
                    await state.refresh();
                    setNotice("이름을 저장했어요.");
                  })
                }
              />
            </View>
          </Card>
          <Section title="정산 계좌" />
          <Card>
            <View style={{ gap: 12 }}>
              <Text style={s.small}>등록된 계좌번호</Text>
              <Text selectable style={s.strong}>
                {profile.bankAccountNumber ?? "등록된 계좌가 없어요."}
              </Text>
              <Field
                title="새 계좌번호"
                value={bank}
                onChangeText={setBank}
                keyboardType="number-pad"
                placeholder="숫자 8~30자리"
                maxLength={30}
              />
              <Button
                title="계좌 저장"
                disabled={busy || !bank}
                onPress={() =>
                  void run(async () => {
                    setProfile(
                      await api.updateProfile({ bankAccountNumber: bank }),
                    );
                    setBank("");
                    setNotice("계좌를 저장했어요.");
                  })
                }
              />
              <Button
                title="계좌 삭제"
                secondary
                disabled={busy || !profile.bankAccountNumber}
                onPress={() =>
                  void run(async () => {
                    setProfile(
                      await api.updateProfile({ bankAccountNumber: null }),
                    );
                    setBank("");
                    setNotice("계좌를 삭제했어요.");
                  })
                }
              />
            </View>
          </Card>
          <Section title="알림·위치 설정" />
          {settings && (
            <Card>
              <Text style={s.strong}>이 기기의 알림</Text>
              <Text style={s.small}>
                {
                  {
                    checking: "알림 권한을 확인하고 있어요.",
                    unavailable: "이 환경에서는 기기 알림을 사용할 수 없어요.",
                    offer: "알림을 허용하면 현재 기기를 등록해요.",
                    idle: "아직 알림을 허용하지 않았어요.",
                    denied:
                      Platform.OS === "web"
                        ? "브라우저 주소창의 사이트 설정에서 알림을 허용해 주세요."
                        : "기기 설정에서 알림 권한을 허용해 주세요.",
                    registering: "현재 기기를 등록하고 있어요.",
                    registered: "현재 기기가 알림 수신 기기로 등록되어 있어요.",
                    error:
                      "기기를 등록하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
                  }[state.push.status]
                }
              </Text>
              {(state.push.status === "idle" ||
                state.push.status === "offer") && (
                <Button
                  title="알림 허용"
                  secondary
                  onPress={() => {
                    void state.push.request();
                  }}
                />
              )}
              {state.push.status === "denied" && Platform.OS !== "web" && (
                <Button
                  title="기기 설정 열기"
                  secondary
                  onPress={() => {
                    void state.push.openSettings();
                  }}
                />
              )}
              {state.push.status === "error" && state.push.failure && (
                <Text selectable style={s.small}>
                  실패 단계: {({permission:"알림 권한",token:"FCM 토큰 발급",server:"서버 기기 등록",storage:"기기 정보 저장"})[state.push.failure.stage]}
                  {" · "}{state.push.failure.code}{state.push.failure.status ? ` (HTTP ${state.push.failure.status})` : ""}
                </Text>
              )}
              {state.push.status === "error" && (
                <Button
                  title="기기 등록 다시 시도"
                  secondary
                  onPress={() => {
                    void state.push.retry();
                  }}
                />
              )}
              <View style={s.row}>
                <Text style={s.flex}>푸시 알림</Text>
                <Switch
                  accessibilityLabel="푸시 알림"
                  disabled={busy}
                  value={settings.pushNotificationEnabled}
                  onValueChange={(value) =>
                    void run(async () => {
                      setSettings(
                        await api.updateSettings({
                          pushNotificationEnabled: value,
                        }),
                      );
                    })
                  }
                />
              </View>
              <View style={s.row}>
                <Text style={s.flex}>위치 공유</Text>
                <Switch
                  accessibilityLabel="위치 공유"
                  disabled={busy}
                  value={settings.locationSharingEnabled}
                  onValueChange={(value) =>
                    void run(async () => {
                      setSettings(
                        await api.updateSettings({
                          locationSharingEnabled: value,
                        }),
                      );
                    })
                  }
                />
              </View>
              <Text style={s.small}>
                푸시 알림 설정은 계정 전체에 적용됩니다. 기기 권한과 별도로 켜고
                끌 수 있어요. 위치 공유 설정은 실제 위치 전송을 시작하지 않아요.
              </Text>
            </Card>
          )}
          <Section title="약관 동의 내역" />
          <Card>
            <View style={{ gap: 12 }}>
              {consents.length ? (
                consents.map((item) => (
                  <Text key={item.id} style={s.body}>
                    {(
                      {
                        TERMS_OF_SERVICE: "서비스 이용약관",
                        PRIVACY_POLICY: "개인정보 처리",
                        MARKETING: "마케팅 수신",
                      } as Record<string, string>
                    )[item.consentType] ?? item.consentType}{" "}
                    · {item.version} ·{" "}
                    {new Date(item.agreedAt).toLocaleDateString("ko-KR")}
                  </Text>
                ))
              ) : (
                <Text style={s.body}>동의 내역이 없어요.</Text>
              )}
            </View>
          </Card>
          <Section title="비밀번호 변경" />
          <Card>
            <View style={{ gap: 12 }}>
              <Field
                title="현재 비밀번호"
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoComplete="current-password"
              />
              <Field
                title="새 비밀번호"
                value={next}
                onChangeText={setNext}
                secureTextEntry
                autoComplete="new-password"
                placeholder="영문·숫자 포함 10~64자"
              />
              <Text style={s.small}>
                변경 후 모든 기기에서 다시 로그인해야 합니다.
              </Text>
              <Button
                title="비밀번호 변경 후 로그아웃"
                disabled={busy || !current || !next}
                onPress={() =>
                  void run(async () => {
                    await api.changePassword(current, next);
                    setCurrent("");
                    setNext("");
                    await leave();
                  })
                }
              />
            </View>
          </Card>
          <Section title="회원 탈퇴" />
          <Card>
            <View style={{ gap: 12 }}>
              <Text style={s.small}>
                탈퇴를 진행하려면 현재 비밀번호로 본인을 확인해 주세요.
              </Text>
              <Field
                title="본인 확인 비밀번호"
                value={reauth}
                onChangeText={setReauth}
                secureTextEntry
                autoComplete="current-password"
              />
              <Button
                title="회원 탈퇴"
                danger
                disabled={busy || !reauth}
                onPress={() => setConfirm(true)}
              />
            </View>
          </Card>
          <Confirm
            visible={confirm}
            title="회원 탈퇴할까요?"
            description="계정 사용이 중지되고 이메일과 이름이 익명화됩니다. 등록 기기와 계좌는 삭제되며 약관 기록과 여행 데이터는 남습니다."
            busy={busy}
            onCancel={() => setConfirm(false)}
            onConfirm={() =>
              void run(async () => {
                await api.withdraw(reauth);
                setReauth("");
                setConfirm(false);
                await leave();
              })
            }
          />
        </>
      )}
    </View>
  );
}
