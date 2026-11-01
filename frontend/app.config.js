const fs = require("node:fs");
const path = require("node:path");
module.exports = ({ config }) => {
  const isCloudBuild = process.env.EAS_BUILD === "true";
  const isPreview = process.env.EAS_BUILD_PROFILE === "preview";
  const apiUrls = [
    process.env.EXPO_PUBLIC_API_URL,
    process.env.EXPO_PUBLIC_MAPS_API_URL,
  ];
  const usesHttp = apiUrls.some((url) => url?.startsWith("http://"));
  if (isCloudBuild && process.env.EXPO_PUBLIC_DATA_SOURCE !== "http")
    throw new Error("EAS builds require EXPO_PUBLIC_DATA_SOURCE=http.");
  if (isCloudBuild && !apiUrls.every((url) => url && /^https?:\/\//.test(url)))
    throw new Error("Configure both API URLs in the EAS build environment.");
  if (isCloudBuild && usesHttp && !isPreview)
    throw new Error("HTTP API URLs are allowed only in preview test builds.");
  const androidFile =
    process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  const iosFile =
    process.env.GOOGLE_SERVICES_PLIST || "./GoogleService-Info.plist";
  const android = fs.existsSync(path.resolve(__dirname, androidFile));
  const ios = fs.existsSync(path.resolve(__dirname, iosFile));
  if (isCloudBuild && process.env.EAS_BUILD_PLATFORM === "android" && !android)
    throw new Error("Provide GOOGLE_SERVICES_JSON for Android push support.");
  const plugins = [...(config.plugins || [])];
  if (android || ios) {
    plugins.push(
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
    );
  }
  if (ios || (isPreview && usesHttp))
    plugins.push([
      "expo-build-properties",
      {
        ...(ios ? { ios: { useFrameworks: "dynamic" } } : {}),
        ...(isPreview && usesHttp
          ? { android: { usesCleartextTraffic: true } }
          : {}),
      },
    ]);
  return {
    ...config,
    android: {
      ...config.android,
      ...(android ? { googleServicesFile: androidFile } : {}),
    },
    ios: {
      ...config.ios,
      ...(ios ? { googleServicesFile: iosFile } : {}),
      ...(process.env.IOS_BUNDLE_IDENTIFIER
        ? { bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER }
        : {}),
    },
    plugins,
    extra: { ...config.extra, pushConfigured: { android, ios } },
  };
};
