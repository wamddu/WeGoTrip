import { useState, type PropsWithChildren } from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { cover } from "./theme";

// Dimensions of assets/travel/coast.png. Keep the full illustration visible.
const coverAspectRatio = 1536 / 1024;

export function TravelCover({
  children,
  style,
  contentStyle,
  light = false,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  light?: boolean;
}>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <View
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        );
      }}
      style={[
        st.container,
        light && st.light,
        { minHeight: size.width / coverAspectRatio },
        style,
      ]}
    >
      {/* Measure the container, not the screen: text may grow and tablets have a width cap. */}
      <Image
        source={cover}
        resizeMode="contain"
        accessible={false}
        style={[st.image, size]}
      />
      <View style={[st.tint, light && st.lightTint]} />
      <View style={[st.content, contentStyle]}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "#164F79" },
  light: { backgroundColor: "#DCEFFC" },
  image: { position: "absolute", top: 0, left: 0 },
  tint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#09355655",
    pointerEvents: "none",
  },
  lightTint: { backgroundColor: "#E3F6FF65" },
  content: { flexGrow: 1, justifyContent: "space-between" },
});
