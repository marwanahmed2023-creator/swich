Swich Tab Helper v1.4.0

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
Scroll down: slanted index finger, short and slow downward stroke.
Scroll up: open hand, large and quick upward sweep (about a quarter of the
camera preview height in under half a second). Palm movement controls up.
Repeat without lowering your hand: return the finger up or open hand down.
The return stroke does not scroll. If your hand leaves the frame, show it
steadily for a moment before scrolling again. Use one hand and good lighting.
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
on your device after the initial model download, not inside the extension.

Keep the controller open, Chrome running, and the computer awake.
Some Chrome versions require the camera window visible beside your media.
The original Bluetooth link controller at /swich/ is still supported.
