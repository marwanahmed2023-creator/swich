# Swich Android

Native CameraX + MediaPipe camera input and BLE HM-10 notifications, routed through an
Android accessibility service to YouTube, Facebook, and Instagram. The site remains separate.

The original JavaScript engines in `../camera/` are transpiled at build time to ES5 and run
in Rhino's interpreter. They are bundled assets, not remote scripts or a WebView. Camera
inference has its own executor; wire parsing and control dispatch use the main thread.
Each input gets its own engine context. Generation checks discard commands after stop.

## Build

Use JDK 17, Gradle 8.11.1, Node 22, and Android SDK platform/build-tools 35:

```
npm install --prefix android/tools --ignore-scripts
node android/tools/prepare.mjs
gradle -p android testDebugUnitTest lintDebug assembleDebug
```

The prepare step downloads versioned official MediaPipe face and hand models, records their
SHA-256 hashes, and bundles them. The APK needs no network access to run.

GitHub Actions → **Build Android APK** runs these checks and publishes `Swich.apk` as a
prerelease and a workflow artifact. Read [INSTALL.md](INSTALL.md) for setup and limitations.

Use **Open YouTube in Chrome** in the app to launch the mobile Shorts page in Chrome after starting the camera. Keep Swich's foreground notification active and the phone unlocked; Android may limit camera operation in the background.\n\nMain components: `InputService` owns the foreground lifetime; `BleInput` receives HM-10
FFE1 notifications; `NativeCamera` analyzes front-camera images; `ControlService` gates
commands to supported foreground packages, uses accessibility buttons/ranges/swipes and
Android media keys, and adjusts the media volume stream. `EngineCore` runs bundled engines.

Build checks cover the original JS engines and their actual Rhino runtime, including brief
winks, blink rejection, batched wire samples, hold release, and stale wire input. These are
not substitutes for testing the physical phone, camera, HM-10, or third-party app layouts.

## Adjustable wire actions

The original mappings remain the defaults. In the app, open **Change wire actions**.
Each of the eight tap/hold combinations can independently select play/pause, play, pause,
seek back/forward, scroll down/up, volume up/down, open Swich, or do nothing. Assignments
save on the phone. **Restore defaults** restores the original mapping.

A tap assigned to volume changes one step. Holds assigned to volume or scrolling continue
until release; other actions assigned to a hold happen once. Remapping does not change tap
or hold recognition timing. An already-held gesture retains its original assignment until
release, so changing a setting cannot switch its action halfway through.
