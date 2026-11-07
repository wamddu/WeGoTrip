import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlparse
import zipfile

apk = Path(sys.argv[1])
workspace = Path(__file__).resolve().parents[2]
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None, "APK archive is corrupt"
    config = json.loads(archive.read("assets/app.config"))
    bundle = archive.read("assets/index.android.bundle")
    assert config["version"] == "1.0.6", "Wrong app version"
    assert config["android"]["versionCode"] == 6, "Wrong build version"
    assert config["android"]["package"] == "com.jeongheaum.frontend"
    assert config["android"]["softwareKeyboardLayoutMode"] == "resize"
    assert config["extra"]["pushConfigured"]["android"] is True
    environment = {}
    for line in (workspace / "frontend/.env.local").read_text(encoding="utf-8-sig").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() in ("EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_MAPS_API_URL"):
            environment[key.strip()] = value.strip().strip("\"'")
    endpoint_checks = {}
    for key in ("EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_MAPS_API_URL"):
        endpoint = environment[key]
        assert urlparse(endpoint).hostname not in ("localhost", "127.0.0.1", "::1"), "Local API endpoint"
        endpoint_checks[key] = endpoint.encode() in bundle
        assert endpoint_checks[key], f"APK endpoint does not match local configuration: {key}"
    markers = {name: name.encode() in bundle for name in (
        "showChatMessageTime", "sameChatMessageGroup", "ownBubbleRow", "pushIdentifier"
    )}
    abis = sorted({name.split("/")[1] for name in archive.namelist() if name.startswith("lib/") and name.endswith(".so")})
result = {
    "path": str(apk.resolve()),
    "version": config["version"],
    "versionCode": config["android"]["versionCode"],
    "package": config["android"]["package"],
    "keyboardMode": config["android"]["softwareKeyboardLayoutMode"],
    "androidPushConfigured": True,
    "endpointsMatchLocalConfig": endpoint_checks,
    "bundleMarkers": markers,
    "abis": abis,
    "bytes": apk.stat().st_size,
    "sha256": hashlib.file_digest(apk.open("rb"), "sha256").hexdigest(),
}
(workspace / "tmp/eas/apk-1.0.6-verification.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
