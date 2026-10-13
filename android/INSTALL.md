# Swich for Android — test build

Download **Swich.apk** from this release's Assets. Android 8.0 or newer is required.
Open the download and, if Android asks, allow your browser/file manager to install this app.
This is a signed debug/test APK built from the public source in this repository, not a Play Store release.

1. Open Swich and tap **Android accessibility setup**. Select Swich and enable its service.
   Android may require you to open **Settings → Apps → Swich → ⋮ → Allow restricted settings**
   before enabling accessibility for an APK you installed yourself. Only do this for the Swich
   APK you intentionally downloaded from this repository.
2. For your existing Nano + HM-10 wire, turn on Bluetooth, tap **Connect touch wire**, grant
   the requested permission, and choose your HM-10. Keep the existing `A:445,B:0` style
   serial protocol and A0 ADCTouch sketch. Release the wire briefly to establish the baseline.
   Android 11 or older also needs Location enabled for BLE scanning.
3. For winks/hands, tap **Start camera** and grant camera access while Swich is visible.
   Look normally at the camera for a moment. Use **Set relaxed eyes again** if needed.
   Disable hand tracking before starting if you only need winks and want less processing.
4. Open the YouTube, Facebook, or Instagram **app**, then navigate to the video or feed.
   Left wink: next/down. Right wink: previous/up. Both-eye blinks are filtered.
   The foreground notification keeps controls visible. Keep your phone unlocked.
5. Stop from **STOP ALL CONTROLS** in Swich or **Stop all** in its notification.

## Wire actions

| Input | Action |
| --- | --- |
| 1 tap | Play/pause |
| 2 taps | Seek back |
| 3 taps | Seek forward |
| 4 taps | Return to Swich |
| Hold | Media volume up |
| Tap, then hold | Media volume down |
| 2 taps, then hold | Scroll down |
| 3 taps, then hold | Scroll up |

Keep tap gaps under 0.3 seconds; hold the final touch for 0.7 seconds. Release to stop.

Thumbs-up plays; thumbs-down pauses. Upright index finger sideways seeks; up/down changes
volume. Two fingers sideways select an exposed timeline; bend to commit. Horizontal finger
flicked 45° down scrolls down; fingers together swiped up scroll up.

## What to expect

This build controls the native YouTube, Facebook (including Lite), and Instagram apps.
It is not a file player or a browser extension. Commands are gated to supported foreground
apps; they do not run on the lock screen or other applications. A swipe acts on the current
screen, so navigate to the intended feed before using it. Ad navigation restrictions remain.

Scrolling uses Android gestures. Playback first looks for a visible player button, then sends
an Android media key. Seeking and timeline access depend on what the player exposes; a
seek key does not guarantee exactly 10 seconds and some Reels players ignore it. Close
unrelated background audio if media keys reach the wrong player.

Camera models are bundled and inference runs locally. No INTERNET permission is requested.
Accessibility reads visible control labels; screen contents and camera frames are neither
stored nor uploaded. Bluetooth reads your device's sensor notifications. No account login
or credentials are collected by Swich.

Physical-phone gesture comfort, continuous camera behavior, HM-10 communication, and each
app's current layout still require testing on your phone. If the camera stops in the background,
return to Swich and restart it; your Android version or battery management may limit it.

The build workflow caches its debug signing key. If that cache is lost, Android may require
uninstalling the previous test build before installing a new one. Production distribution needs
a separately managed release signing key; do not use this test signature for a production app.

## Adjustable wire actions

The original mappings remain the defaults. In the app, open **Change wire actions**.
Each of the eight tap/hold combinations can independently select play/pause, play, pause,
seek back/forward, scroll down/up, volume up/down, open Swich, or do nothing. Assignments
save on the phone. **Restore defaults** restores the original mapping.

A tap assigned to volume changes one step. Holds assigned to volume or scrolling continue
until release; other actions assigned to a hold happen once. Remapping does not change tap
or hold recognition timing. An already-held gesture retains its original assignment until
release, so changing a setting cannot switch its action halfway through.
