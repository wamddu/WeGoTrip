const fs = require("node:fs");
const path = require("node:path");
module.exports = ({ config }) => {
  const androidFile =
    process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  const iosFile =
    process.env.GOOGLE_SERVICES_PLIST || "./GoogleService-Info.plist";
  const android = fs.existsSync(path.resolve(__dirname, androidFile));
  const ios = fs.existsSync(path.resolve(__dirname, iosFile));
  const plugins = [...(config.plugins || [])];
  if (android || ios) {
    plugins.push(
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
    );
    if (ios)
      plugins.push([
        "expo-build-properties",
        { ios: { useFrameworks: "dynamic" } },
      ]);
  }
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
