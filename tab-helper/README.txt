Swich Tab Helper v1.5.0

Controller: https://marwanahmed2023-creator.github.io/swich/camera.html
Setup: https://marwanahmed2023-creator.github.io/swich/camera-setup.html
Local media: https://marwanahmed2023-creator.github.io/swich/player.html

UPDATE: Extract this ZIP, replace the files in your existing extension
folder, then reload Swich Tab Helper in chrome://extensions. Allow updated
website permissions if asked. Refresh your Swich and media tabs.
NEW INSTALL: Turn on Developer mode in chrome://extensions. Load unpacked:
select the folder containing manifest.json. Keep that folder in My files.
Linux and Chromebook system Developer Mode are not needed.

Leave "Follow the tab I use" selected to control your current Chrome page.
Returning to the controller keeps your last webpage as the target.
Start camera or connect Bluetooth: that input becomes active immediately.
Stop camera / Disconnect wire stop that input. There is no mute gesture.

CAMERA
Wink scrolling: your own left eye down, your own right eye up. Keep the
other eye open; briefly wink for about 0.2-0.5 seconds, then reopen to scroll.
Closing both eyes cancels a wink. Holding an eye shut never repeats.
Keep one face visible. No hand is needed. The mirrored preview does not
change which eye controls which direction. Face processing stays on-device.
Helper v1.5 already supports this: refresh Swich and restart the camera.

HAND SCROLLING (also available)
Scroll down: point your index finger horizontally to either side, then flick
it to about 45 degrees downward in one quick motion. Other fingers bent.
Scroll up: fingers straight and together, then a small upward hand swipe
(roughly 8-12% of the preview height). No large sweep or hold-still required.
Natural shakes are smoothed. A 0.28-second cooldown limits duplicates.
Repeat with your hand in view; no lowered-hand or repositioning check.
Ordinary pages scroll about two-thirds of a screen per flick. YouTube Shorts
uses its next/previous controls even while an ad is visible. If the site
itself disables navigation, wait until that control becomes available.
Keep one hand in view and use good lighting.
Upright index finger up/down: volume. Sideways: skip back/forward 10s.
Two fingers sideways: timeline; bend them in view to set the new position.
Thumbs-up held briefly: play. Thumbs-down held briefly: pause.

WIRE (existing Nano + HM-10, A0 ADCTouch sketch)
Quick taps: 1 play/pause; 2 back 10s; 3 forward 10s; 4 open saved shortcuts.
Keep gaps under 0.3 seconds and each group within 3 seconds.
Brief contacts count without an added minimum press duration. Actions wait
0.3 seconds for another tap; four taps act on release. Two consecutive sensor
readings confirm contact, so the minimum detectable touch depends on sampling.
Hold the final touch for at least 0.7 seconds:
Hold: volume up. Tap then hold: volume down.
Two taps then hold: scroll down. Three taps then hold: scroll up.
Release to stop. If readings stop, release the wire before trying again.

OTHER MEDIA
Open a video/audio track and press Play once in its page.
Supports ordinary web video/audio and many embedded players. Some custom
or protected players cannot be controlled. Seeking needs a seekable timeline.
For local files/folders, use the Swich file player in a separate tab.
Files stay on your device; Chrome must support their format and codec.
Does not control native desktop apps, Chrome protected pages, or system volume.
On feeds, controls select the largest visible video. Keep your video in view.

PERMISSIONS
Website access and scripting allow on-demand scrolling and player control
across websites. Session storage remembers the last target tab. The helper
reads tab titles and media state; it does not request browsing-history access.
Only the Swich controller pages can send commands. Camera processing occurs
on your device after the initial model downloads, not inside the extension.

Keep the controller open, Chrome running, and the computer awake.
Some Chrome versions require the camera window visible beside your media.
The original Bluetooth link controller at /swich/ is still supported.
