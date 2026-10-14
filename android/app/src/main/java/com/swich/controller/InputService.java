package com.swich.controller;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.*;
import androidx.lifecycle.LifecycleService;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public final class InputService extends LifecycleService {
    static final String CAMERA="camera", WIRE="wire", STOP_CAMERA="stop-camera", STOP_WIRE="stop-wire", STOP="stop", CALIBRATE="calibrate";
    private static final String CHANNEL="swich-inputs";
    private static final Pattern READING=Pattern.compile("^A:(\\d{1,4}),B:([01])$");
    private final Handler main=new Handler(Looper.getMainLooper());
    private NativeCamera camera;
    private BleInput ble;
    private EngineCore wire;
    private WireBindings bindings;
    private String buffer="";
    private boolean wireWanted,cameraWanted,destroyed;
    private int wireGeneration,cameraGeneration;
    private final Runnable tick=new Runnable(){public void run(){if(destroyed)return;try{if(wire!=null)wire.call("wireTick",SystemClock.elapsedRealtime());}catch(Exception e){AppState.wire="Wire processing stopped: "+e.getMessage();stopWire();}main.postDelayed(this,40);}};
    @Override public void onCreate(){
        super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Swich controls",NotificationManager.IMPORTANCE_LOW));main.post(tick);
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        super.onStartCommand(intent,flags,startId);
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        String action=intent.getAction();
        try{
            if(STOP.equals(action)){stopCamera();stopWire();stopSelf();return START_NOT_STICKY;}
            if(STOP_CAMERA.equals(action)){stopCamera();return START_NOT_STICKY;}
            if(STOP_WIRE.equals(action)){stopWire();return START_NOT_STICKY;}
            if(CALIBRATE.equals(action)){if(camera!=null)camera.calibrate();return START_NOT_STICKY;}
            if(ControlService.instance==null){AppState.action="Enable Swich under Android Accessibility first.";stopSelf();return START_NOT_STICKY;}
            if(CAMERA.equals(action)&&!cameraWanted){
                cameraWanted=true;AppState.cameraOn=true;AppState.camera="Loading camera models…";foreground();
                int generation=++cameraGeneration;
                camera=new NativeCamera(this,main,intent.getBooleanExtra("hands",true),
                    json->dispatch("camera",generation,json),hint->AppState.camera=hint,
                    error->{AppState.camera="Camera stopped: "+error.getMessage();stopCamera();});
            }
            if(WIRE.equals(action)&&!wireWanted){
                wireWanted=true;AppState.wireOn=true;AppState.wire="Connecting to HM-10…";foreground();
                int generation=++wireGeneration;
                bindings=new WireBindings(key->getSharedPreferences("wire-bindings",MODE_PRIVATE).getString(key,WireBindings.defaultFor(key)),
                    command->dispatch("wire",generation,command.toString()),SystemClock::elapsedRealtime);
                wire=new EngineCore(AppState.engines(this),this::mapWire,hint->AppState.wire=hint);
                ble=new BleInput(this,intent.getStringExtra("address"),main,this::receive,hint->AppState.wire=hint,this::stopWire);
            }
        }catch(Exception e){AppState.action="Could not start controls: "+e.getMessage();stopCamera();stopWire();stopSelf();}
        return START_NOT_STICKY;
    }
    private void dispatch(String source,int generation,String json){
        long received=SystemClock.elapsedRealtime();
        main.post(()->{
            if(destroyed||SystemClock.elapsedRealtime()-received>700)return;
            if(source.equals("camera")?(!cameraWanted||generation!=cameraGeneration):(!wireWanted||generation!=wireGeneration))return;
            try{ControlService control=ControlService.instance;if(control!=null)control.command(source,new JSONObject(json));}
            catch(Exception e){AppState.action="Control not available: "+e.getMessage();}
        });
    }
    private void mapWire(String json){
        try{
            JSONObject input=new JSONObject(json);
            // Hover is a dedicated proximity gesture, independent of tap/hold mappings.
            if("speedToggle".equals(input.optString("action"))){dispatch("wire",wireGeneration,json);return;}
            if(bindings!=null)bindings.accept(input);
        }catch(org.json.JSONException e){AppState.wire="Invalid wire command ignored.";}
    }
    private void receive(String text){
        buffer+=text;int end;long now=SystemClock.elapsedRealtime();
        while((end=buffer.indexOf('\n'))>=0){
            String line=buffer.substring(0,end).trim();buffer=buffer.substring(end+1);
            Matcher match=READING.matcher(line);
            if(match.matches()&&wire!=null)wire.call("wireSample",Integer.parseInt(match.group(1)),now);
        }
        if(buffer.length()>4096)buffer="";
    }
    private void foreground(){
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent content=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,InputService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_swich).setContentTitle("Swich controls running")
            .setContentText(cameraWanted?(wireWanted?"Camera + touch wire":"Camera gestures"):"Touch wire")
            .setContentIntent(content).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE)
            .addAction(new Notification.Action.Builder(null,"Stop all",stop).build()).build();
        if(Build.VERSION.SDK_INT>=30)startForeground(1,notification,(cameraWanted?ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA:0)|(wireWanted?ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE:0));
        else startForeground(1,notification);
    }
    private void remaining(){if(destroyed)return;if(!cameraWanted&&!wireWanted){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}else foreground();}
    private void stopCamera(){
        cameraWanted=false;cameraGeneration++;AppState.cameraOn=false;
        if(camera!=null){camera.close();camera=null;}
        if(ControlService.instance!=null)ControlService.instance.cancel("camera");remaining();
    }
    private void stopWire(){
        wireWanted=false;wireGeneration++;AppState.wireOn=false;
        if(ble!=null){ble.close();ble=null;}if(wire!=null){wire.call("wireReset");wire=null;}if(bindings!=null){bindings.reset();bindings=null;}buffer="";
        if(ControlService.instance!=null)ControlService.instance.cancel("wire");remaining();
    }
    @Override public void onDestroy(){destroyed=true;main.removeCallbacksAndMessages(null);stopCamera();stopWire();super.onDestroy();}
}
