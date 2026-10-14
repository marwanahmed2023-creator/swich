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

Start the camera, then switch manually to YouTube, Facebook, or Instagram. The app no longer includes buttons for launching those sites. Keep Swich's foreground notification active and the phone unlocked; Android may limit camera operation in the background. 

Main components: `InputService` owns the foreground lifetime; `BleInput` receives HM-10
FFE1 notifications; `NativeCamera` analyzes front-camera images and sends only the four eye landmarks needed for wink detection (rather than serializing the full face mesh); preview bitmaps are recycled when replaced to reduce memory pressure. `ControlService` gates
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
until release; other actions assigned to a hold happen once. On YouTube/Chrome, seek shortcuts
try the player’s pause → edge double-tap → resume sequence, which is intended to support Shorts
where the normal timeline is hidden. The two-finger timeline fallback pauses, taps an estimated
position near the bottom of the active app window, then resumes if controls are accessible; it
is an approximation, not a measured Facebook layout, and still needs testing on the target phone.
Remapping does not change tap or hold recognition timing. An already-held gesture retains its
original assignment until release, so changing a setting cannot switch its action halfway through.
