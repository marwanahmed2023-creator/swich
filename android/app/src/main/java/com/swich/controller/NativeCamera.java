package com.swich.controller;

import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.os.Handler;
import android.os.SystemClock;
import android.util.Size;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.lifecycle.LifecycleOwner;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.components.containers.Category;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker;
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeCamera {
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final Handler main;
    private final Consumer<String> hint;
    private final Consumer<Exception> failure;
    private final boolean handsEnabled;
    private volatile boolean closed;
    private ProcessCameraProvider provider;
    private ImageAnalysis analysis;
    private FaceLandmarker face;
    private HandLandmarker hands;
    private EngineCore engine;
    private long lastFrame=-1000,lastHand=-1000,lastPreview;
    private boolean handPresent,winkPending;
    NativeCamera(InputService service,Handler main,boolean handsEnabled,Consumer<String> command,Consumer<String> hint,Consumer<Exception> failure){
        this.main=main;this.hint=hint;this.failure=failure;this.handsEnabled=handsEnabled;
        executor.execute(()->{
            try{
                engine=new EngineCore(AppState.engines(service),command,hint);
                face=FaceLandmarker.createFromOptions(service,FaceLandmarker.FaceLandmarkerOptions.builder()
                    .setBaseOptions(BaseOptions.builder().setModelAssetPath("generated/face_landmarker.task").build())
                    .setRunningMode(RunningMode.VIDEO).setNumFaces(1).setOutputFaceBlendshapes(true)
                    .setMinFaceDetectionConfidence(.65f).setMinFacePresenceConfidence(.65f).setMinTrackingConfidence(.65f).build());
                if(handsEnabled)hands=HandLandmarker.createFromOptions(service,HandLandmarker.HandLandmarkerOptions.builder()
                    .setBaseOptions(BaseOptions.builder().setModelAssetPath("generated/hand_landmarker.task").build())
                    .setRunningMode(RunningMode.VIDEO).setNumHands(2).setMinHandDetectionConfidence(.65f)
                    .setMinHandPresenceConfidence(.65f).setMinTrackingConfidence(.65f).build());
                if(closed)return;
                main.post(()->bind(service));
            }catch(Exception e){main.post(()->{if(!closed)failure.accept(e);});}
        });
    }
    private void bind(InputService service){
        if(closed)return;
        var future=ProcessCameraProvider.getInstance(service);
        future.addListener(()->{
            if(closed)return;
            try{
                provider=future.get();
                analysis=new ImageAnalysis.Builder().setTargetResolution(new Size(320,240))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                analysis.setAnalyzer(executor,this::analyze);
                provider.bindToLifecycle((LifecycleOwner)service,CameraSelector.DEFAULT_FRONT_CAMERA,analysis);
                hint.accept("Look normally at the camera while Swich learns your relaxed eyes.");
            }catch(Exception e){failure.accept(e);}
        },main::post);
    }
    private static JSONArray points(List<NormalizedLandmark> landmarks)throws Exception{
        JSONArray points=new JSONArray();
        for(NormalizedLandmark p:landmarks)points.put(new JSONObject().put("x",p.x()).put("y",p.y()));
        return points;
    }
    private void analyze(ImageProxy proxy){
        Bitmap raw=null,upright=null;
        MPImage image=null;
        try{
            long now=SystemClock.elapsedRealtime();
            if(closed||now-lastFrame<16)return;
            lastFrame=now;
            raw=proxy.toBitmap();Matrix rotation=new Matrix();rotation.postRotate(proxy.getImageInfo().getRotationDegrees());
            upright=Bitmap.createBitmap(raw,0,0,raw.getWidth(),raw.getHeight(),rotation,false);
            image=new BitmapImageBuilder(upright).build();
            FaceLandmarkerResult result=face.detectForVideo(image,now);
            JSONArray faces=new JSONArray(),blends=new JSONArray();
            for(var landmarks:result.faceLandmarks())faces.put(points(landmarks));
            if(result.faceBlendshapes().isPresent())for(List<Category> categories:result.faceBlendshapes().get()){
                JSONArray scores=new JSONArray();for(Category c:categories)scores.put(new JSONObject().put("categoryName",c.categoryName()).put("score",c.score()));
                blends.put(new JSONObject().put("categories",scores));
            }
            Object handData=JSONObject.NULL;
            if(handsEnabled&&(handPresent?now-lastHand>=180:(!winkPending&&now-lastHand>=650))){
                HandLandmarkerResult h=hands.detectForVideo(image,now);lastHand=now;handPresent=!h.landmarks().isEmpty();
                JSONArray values=new JSONArray();
                for(int i=0;i<h.landmarks().size();i++)values.put(new JSONObject().put("points",points(h.landmarks().get(i))).put("label",h.handedness().get(i).get(0).categoryName()));
                handData=values;
            }
            if(SystemClock.elapsedRealtime()-now>700){engine.call("cameraReset",SystemClock.elapsedRealtime());hint.accept("Camera catching up. Try winks without hand tracking.");return;}
            JSONObject frame=new JSONObject().put("aspect",(double)upright.getHeight()/upright.getWidth())
                .put("faceLandmarks",faces).put("faceBlendshapes",blends).put("hands",handData);
            winkPending=Boolean.TRUE.equals(engine.call("frame",frame.toString(),now));
            if(MainActivity.isVisible()&&now-lastPreview>500){lastPreview=now;Bitmap preview=Bitmap.createScaledBitmap(upright,240,Math.round(240f*upright.getHeight()/upright.getWidth()),true);if(preview==upright)preview=upright.copy(Bitmap.Config.ARGB_8888,false);MainActivity.showPreview(preview);}
        }catch(Exception e){if(!closed)main.post(()->{if(!closed)failure.accept(e);});}
        finally{if(image!=null)image.close();if(upright!=null&&upright!=raw)upright.recycle();if(raw!=null)raw.recycle();proxy.close();}
    }
    void calibrate(){if(!closed)executor.execute(()->{if(engine!=null)engine.call("calibrate");});}
    void close(){
        closed=true;
        if(analysis!=null){analysis.clearAnalyzer();if(provider!=null)provider.unbind(analysis);}
        executor.execute(()->{if(face!=null)face.close();if(hands!=null)hands.close();});executor.shutdown();
    }
}
