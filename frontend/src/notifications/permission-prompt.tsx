import { Modal, Text, View } from "react-native";
import { Button, Card, styles as s } from "../ui/components";

export function PushPermissionPrompt({
  visible,
  allow,
  dismiss,
}: {
  visible: boolean;
  allow(): void;
  dismiss(): void;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(18,35,58,0.35)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 400 }}>
          <Card>
            <Text accessibilityRole="header" style={s.title}>
              여행 알림을 받아볼까요?
            </Text>
            <Text style={s.body}>
              알림을 허용하면 이 기기를 등록해요. 허용하지 않아도 여행 기능은
              계속 사용할 수 있어요.
            </Text>
            <Button title="알림 허용" onPress={allow} />
            <Button title="나중에" secondary onPress={dismiss} />
          </Card>
        </View>
      </View>
    </Modal>
  );
}
