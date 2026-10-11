Swich Tab Helper

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

The extension runs only on this Swich website. It does not read other
websites, passwords, browsing history, or Bluetooth data. No tabs permission
or access to every website is requested. It receives only your chosen URL.

If Load unpacked or Developer mode is blocked on a managed Chromebook,
your administrator must permit extension installation. Do not change the
Chromebook system Developer Mode or reset your device.

Keep Chrome running and Bluetooth connected. If the controller stops
receiving data, gestures wait for fresh readings and a new hand release.
Locked or sleeping devices cannot respond to gestures.
