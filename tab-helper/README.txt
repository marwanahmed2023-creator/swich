Swich Tab Helper v1.1.0

NEW: Camera-only controls for YouTube.
Setup: https://marwanahmed2023-creator.github.io/swich/camera-setup.html
Controller: https://marwanahmed2023-creator.github.io/swich/camera.html

To update an existing installation, replace the files in your original
swich-tab-helper folder with this download's files. Then open
chrome://extensions and click Reload on Swich Tab Helper. Allow YouTube
access if asked. Refresh both your YouTube and Swich tabs afterward.

Open a YouTube video and press Play once. In the camera controller, select
the video and click Enable camera. Allow Camera access for the Swich site.
Keep the controller tab open while watching the selected video. Use Pause
controls to suspend gestures, or Stop camera to stop camera capture.

Index-finger pinch and quick release: play/pause.
Two raised fingers, swipe left/right: back/forward 10 seconds.
Thumb + middle-finger pinch, move up/down: video volume.
Index-finger pinch, hold and move sideways: timeline; release to commit.
Both hands pinched, spread/bring together: YouTube page zoom.

The first launch loads MediaPipe hand-tracking files from the internet.
The camera page reports if the browser needs its window visible.
These controls change the selected YouTube video and webpage, not the
Chromebook system volume or desktop mouse.

Original Bluetooth link controls are also supported:

One-time setup in Chrome on your Chromebook:
1. Extract the downloaded ZIP into a permanent folder in My files.
2. Open chrome://extensions in Chrome.
3. Turn on Developer mode on that extensions page.
   This is the extensions switch, not Chromebook system Developer Mode.
4. Choose Load unpacked, then select the extracted swich-tab-helper folder
   containing manifest.json. Keep that folder after installation.
5. Refresh https://marwanahmed2023-creator.github.io/swich/
6. Check that it says Automatic tab switching is on, then connect Bluetooth.

Leave the controller tab open while browsing. Each recognized gesture
opens an active tab in your last-used normal Chrome window and brings that
window forward. The Arduino code stays the same. Links remain on your device.

The extension runs on the Swich website and YouTube. For camera controls
it reads YouTube tab titles and player state, and changes playback, volume,
seeking, and page zoom. Camera processing happens in the Swich page; camera
images are not sent through the extension. The extension does not request
access to every website or browsing history.

If Load unpacked or Developer mode is blocked on a managed Chromebook,
your administrator must permit extension installation. Do not change the
Chromebook system Developer Mode or reset your device.

Keep Chrome running and Bluetooth connected. If the controller stops
receiving data, gestures wait for fresh readings and a new hand release.
Locked or sleeping devices cannot respond to gestures.
