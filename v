<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Universal URL Command Hub</title>
    <style>
        body, html { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #f4f6f9; width: 100%; height: 100%; overflow: hidden; }
        .dashboard { padding: 30px; text-align: center; box-sizing: border-box; height: 100%; overflow-y: auto; }
        .card { background: white; max-width: 580px; margin: 0 auto 20px auto; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: left; }
        h2, h3 { text-align: center; margin-top: 0; color: #202124; }
        button { background: #1a73e8; color: white; border: none; padding: 12px; border-radius: 6px; font-size: 15px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 15px; }
        button:hover { background: #1557b0; }
        .config-row { display: flex; flex-direction: column; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #f1f3f4; }
        .controls { display: flex; gap: 10px; margin-top: 8px; align-items: center; }
        label { font-weight: bold; color: #5f6368; font-size: 14px; min-width: 180px; display: inline-block; }
        input[type="text"] { padding: 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; flex: 1; box-sizing: border-box; }
        #status { font-weight: bold; text-align: center; padding: 10px; background: #e8eaed; border-radius: 6px; margin-bottom: 15px; }
        .live-data { font-family: monospace; font-size: 12px; color: #70757a; text-align: center; }
    </style>
</head>
<body>

    <div class="dashboard">
        <div class="card">
            <h2>🎛️ Active Voltage Control Hub</h2>
            <button onclick="initBluetooth()">🔌 Connect Station via Bluetooth</button>
            <div id="status">Status: Disconnected</div>
            <div class="live-data" id="liveStream">Voltage Monitor - Untouched</div>
        </div>

        <div class="card">
            <h3>⚙️ Map Your Actions</h3>
            <p style="color:#70757a; font-size:13px; margin-top:-10px;">Tap the pin quickly for the top box. Hold your finger down and let go for the bottom box.</p>
            
            <div class="config-row">
                <div class="controls">
                    <label>👋 Quick Tap:</label>
                    <input type="text" id="urlWave" placeholder="e.g., google.com">
                </div>
            </div>

            <div class="config-row">
                <div class="controls">
                    <label>☝️ Long Hold and Release:</label>
                    <input type="text" id="urlHold" placeholder="e.g., youtube.com">
                </div>
            </div>
        </div>
    </div>

    <script>
        let bleDevice = null, bleCharacteristic = null, readBuffer = "";
        let cooldown = false;

        // VOLTAGE TIME TRACKING STATE
        let touchActive = false;
        let touchStartTimestamp = 0;

        const HM10_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
        const HM10_CHAR_UUID    = "0000ffe1-0000-1000-8000-00805f9b34fb";

        async function initBluetooth() {
            const statusDiv = document.getElementById('status');
            try {
                statusDiv.innerText = "Connecting...";
                bleDevice = await navigator.bluetooth.requestDevice({ filters: [{ services: [HM10_SERVICE_UUID] }] });
                const server = await bleDevice.gatt.connect();
                const service = await server.getPrimaryService(HM10_SERVICE_UUID);
                bleCharacteristic = await service.getCharacteristic(HM10_CHAR_UUID);
                await bleCharacteristic.startNotifications();
                bleCharacteristic.addEventListener('characteristicvaluechanged', processRawStream);
                statusDiv.innerText = "Connected & Voltage Loop Online!";
            } catch (error) { statusDiv.innerText = "Connection Failed."; }
        }

        function processRawStream(event) {
            const decoder = new TextDecoder();
            readBuffer += decoder.decode(event.target.value);
            let lines = readBuffer.split('\n');
            readBuffer = lines.pop();

            for (let line of lines) {
                if (line.includes("A:") && line.includes(",B:")) {
                    let parts = line.split(',');
                    let activeVoltage = parseInt(parts.split(':'));
                    
                    document.getElementById("liveStream").innerText = "Raw Telemetry Pin A0: " + activeVoltage;
                    analyzeVoltageDrop(activeVoltage);
                }
            }
        }

        function analyzeVoltageDrop(voltage) {
            if (cooldown) return;
            let now = Date.now();

            // When untouched, internal pullup keeps the pin around 700 to 1023.
            // The exact millisecond your skin drains the current, it drops significantly lower.
            if (voltage < 550) {
                if (!touchActive) {
                    touchActive = true;
                    touchStartTimestamp = now; // Log when the drain started
                }
            } else {
                // Pin goes back high (you let go), calculate how long it stayed low
                if (touchActive) {
                    let totalHoldTime = now - touchStartTimestamp;
                    
                    if (totalHoldTime >= 800) {
                        // Held your finger on it for longer than 0.8 seconds
                        navigateToCustomUrl("urlHold");
                    } else if (totalHoldTime >= 40) {
                        // Quick click/release
                        navigateToCustomUrl("urlWave");
                    }
                    activateCooldown();
                }
            }
        }

        function navigateToCustomUrl(inputId) {
            let userUrl = document.getElementById(inputId).value.trim();
            if (!userUrl) return;
            if (!userUrl.startsWith("http://") && !userUrl.startsWith("https://")) {
                userUrl = "https://" + userUrl;
            }
            let newTab = window.open(userUrl, "_blank");
            if (newTab) {
                newTab.focus();
            }
        }

        function activateCooldown() {
            cooldown = true;
            touchActive = false;
            touchStartTimestamp = 0;
            setTimeout(() => { cooldown = false; }, 2200); 
        }
    </script>
</body>
</html>
