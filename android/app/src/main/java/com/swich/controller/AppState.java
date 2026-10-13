package com.swich.controller;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

final class AppState {
    static volatile String wire = "Wire disconnected", camera = "Camera off", action = "Start either input when you are ready.";
    static volatile boolean wireOn, cameraOn;
    static String engines(Context context) throws Exception {
        try (InputStream in = context.getAssets().open("generated/engines.js"); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[8192]; int count;
            while ((count = in.read(bytes)) != -1) out.write(bytes, 0, count);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
