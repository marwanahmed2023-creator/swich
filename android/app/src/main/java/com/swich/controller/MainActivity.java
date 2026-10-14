package com.swich.controller;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.*;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.graphics.drawable.GradientDrawable;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import java.lang.ref.WeakReference;
import java.util.*;

@SuppressLint("MissingPermission")
public final class MainActivity extends Activity {
    private static WeakReference<MainActivity> visible=new WeakReference<>(null);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private TextView status,access,wireGuide;
    private Button camera,wire;
    private CheckBox hands;
    private ImageView preview;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private AlertDialog scanDialog;
    private String pending="";
    private int buttonIndex=0;
    private static final int[] BUTTON_COLORS={Color.rgb(0,190,255),Color.rgb(130,85,255),Color.rgb(255,87,128),Color.rgb(0,190,145),Color.rgb(255,154,45)};
    private final Runnable refresh=new Runnable(){public void run(){render();handler.postDelayed(this,500);}};
    static boolean isVisible(){return visible.get()!=null;}
    static void showPreview(Bitmap bitmap){
        MainActivity activity=visible.get();
        if(activity==null){bitmap.recycle();return;}
        activity.handler.post(()->{if(visible.get()==activity)activity.preview.setImageBitmap(bitmap);});
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(22),dp(18),dp(22),dp(28));content.setBackgroundColor(Color.rgb(12,18,42));scroll.addView(content);setContentView(scroll);
        // Target SDK 35 uses edge-to-edge. Respect status/navigation bars and cutouts.
        scroll.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        text(content,"swich",34,true);text(content,"YouTube. Reels. Your controls.",21,true);
        text(content,"Use your touch wire, winks, or hand gestures while watching in YouTube, Facebook, or Instagram.",15,false);
        access=text(content,"",14,false);
        button(content,"Android accessibility setup",()->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        text(content,"One-time setup: Swich uses accessibility to read player button labels and perform your requested taps/swipes. It acts only in the supported apps while an input is running. Camera images and screen content are not saved or uploaded.",13,false);
        preview=new ImageView(this);preview.setScaleType(ImageView.ScaleType.FIT_CENTER);preview.setScaleX(-1);preview.setBackgroundColor(Color.rgb(18,24,56));content.addView(preview,new LinearLayout.LayoutParams(-1,dp(180)));
        hands=new CheckBox(this);hands.setText("Also track hand gestures");hands.setChecked(getPreferences(0).getBoolean("hands",false));content.addView(hands);
        hands.setOnCheckedChangeListener((b,on)->getPreferences(0).edit().putBoolean("hands",on).apply());
        camera=button(content,"Start camera",()->{if(AppState.cameraOn)send(InputService.STOP_CAMERA);else requestInput(InputService.CAMERA);});
        button(content,"Set relaxed eyes again",()->{if(AppState.cameraOn)send(InputService.CALIBRATE);else toast("Start the camera first.");});
        wire=button(content,"Connect touch wire",()->{if(AppState.wireOn)send(InputService.STOP_WIRE);else requestInput(InputService.WIRE);});
        button(content,"Change wire actions",this::editBindings);
        status=text(content,"",14,false);status.setMinHeight(dp(100));
        button(content,"Open YouTube app",()->openApp("com.google.android.youtube","https://www.youtube.com/"));
        button(content,"Open YouTube in Chrome",this::openYouTubeInChrome);
        button(content,"Open Facebook",()->openApp("com.facebook.katana","https://www.facebook.com/"));
        button(content,"Open Instagram",()->openApp("com.instagram.android","https://www.instagram.com/"));
        button(content,"STOP ALL CONTROLS",()->{send(InputService.STOP);preview.setImageDrawable(null);});
        text(content,"Winks",20,true);
        text(content,"Look normally at the camera for a moment. Briefly close your own left eye and reopen for next / down; right eye for previous / up. Ordinary blinks are filtered. You do not need to hold for a second.",14,false);
        text(content,"Touch wire",20,true);
        wireGuide=text(content,"",14,false);
        text(content,"Keep tap gaps under 0.3 seconds. Hold the final touch for 0.7 seconds; release to stop. You can swap any combination’s action in Change wire actions.",14,false);
        text(content,"Hands",20,true);
        text(content,"Thumbs-up plays; thumbs-down pauses. Upright index finger sideways seeks, up/down changes volume. Two fingers sideways select the timeline; bend them to apply. Horizontal finger flicked 45° down scrolls down; fingers together swiped up scroll up.",14,false);
        text(content,"Start the camera here before opening another app. Keep the screen unlocked. Only enable hand tracking if needed to reduce load. Seeking, playback keys, and timeline access depend on the player; scrolling cannot override an app’s disabled navigation or advertisements. This is a test APK, not yet tested on your phone.",13,false);
        render();
    }
    private TextView text(LinearLayout parent,String value,int size,boolean bold){TextView view=new TextView(this);view.setText(value);view.setTextSize(size);view.setTextColor(Color.rgb(241,246,255));view.setPadding(0,dp(9),0,dp(9));if(bold)view.setTypeface(null,android.graphics.Typeface.BOLD);parent.addView(view);return view;}
    private Button button(LinearLayout parent,String label,Runnable click){Button button=new Button(this);button.setText(label);button.setAllCaps(false);GradientDrawable bg=new GradientDrawable();bg.setColor(BUTTON_COLORS[buttonIndex++%BUTTON_COLORS.length]);bg.setCornerRadius(dp(16));button.setBackground(bg);button.setTextColor(Color.WHITE);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,dp(4),0,dp(5));parent.addView(button,lp);button.setOnClickListener(v->click.run());return button;}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private void toast(String value){Toast.makeText(this,value,Toast.LENGTH_LONG).show();}
    private void render(){if(status==null)return;if(wireGuide!=null)wireGuide.setText(wireSummary());access.setText(ControlService.instance==null?"Accessibility: not connected":"Accessibility: ready");camera.setText(AppState.cameraOn?"Stop camera":"Start camera");wire.setText(AppState.wireOn?"Disconnect wire":"Connect touch wire");hands.setEnabled(!AppState.cameraOn);status.setText("Camera "+(AppState.cameraOn?"on":"off")+": "+AppState.camera+"\n\nWire "+(AppState.wireOn?"on":"off")+": "+AppState.wire+"\n\n"+AppState.action);}
    private void editBindings(){
        ScrollView scroll=new ScrollView(this);LinearLayout rows=new LinearLayout(this);rows.setOrientation(LinearLayout.VERTICAL);rows.setPadding(dp(18),dp(8),dp(18),dp(8));scroll.addView(rows);
        text(rows,"Keep the same tap/hold combinations and choose what each does. Tap volume changes one step; held volume or scrolling continues until release. Other held actions happen once.",14,false);
        Spinner[] choices=new Spinner[WireBindings.KEYS.length];SharedPreferences prefs=getSharedPreferences("wire-bindings",MODE_PRIVATE);
        for(int i=0;i<choices.length;i++){
            text(rows,WireBindings.INPUTS[i],15,true);Spinner spinner=new Spinner(this);
            ArrayAdapter<String> options=new ArrayAdapter<>(this,android.R.layout.simple_spinner_item,WireBindings.LABELS);options.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);spinner.setAdapter(options);
            spinner.setSelection(Arrays.asList(WireBindings.ACTIONS).indexOf(WireBindings.valid(WireBindings.KEYS[i],prefs.getString(WireBindings.KEYS[i],WireBindings.DEFAULTS[i]))));rows.addView(spinner);choices[i]=spinner;
        }
        new AlertDialog.Builder(this).setTitle("Wire actions").setView(scroll).setPositiveButton("Save",(d,w)->{
            SharedPreferences.Editor edit=prefs.edit();for(int i=0;i<choices.length;i++)edit.putString(WireBindings.KEYS[i],WireBindings.ACTIONS[choices[i].getSelectedItemPosition()]);edit.apply();render();toast("Wire actions saved. Release any held touch before starting the next combination.");
        }).setNeutralButton("Restore defaults",(d,w)->{prefs.edit().clear().apply();render();toast("Original wire actions restored.");}).setNegativeButton("Cancel",null).show();
    }
    private String wireSummary(){
        StringBuilder summary=new StringBuilder();SharedPreferences prefs=getSharedPreferences("wire-bindings",MODE_PRIVATE);
        for(int i=0;i<WireBindings.KEYS.length;i++){String action=WireBindings.valid(WireBindings.KEYS[i],prefs.getString(WireBindings.KEYS[i],WireBindings.DEFAULTS[i]));summary.append(WireBindings.INPUTS[i]).append(": ").append(WireBindings.LABELS[Arrays.asList(WireBindings.ACTIONS).indexOf(action)]).append('\n');}
        return summary.toString().trim();
    }
    private void requestInput(String kind){
        if(ControlService.instance==null){toast("Enable Swich in Android Accessibility, then return here.");startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));return;}
        pending=kind;ArrayList<String> permissions=new ArrayList<>();
        if(kind.equals(InputService.CAMERA))permissions.add(Manifest.permission.CAMERA);
        else if(Build.VERSION.SDK_INT>=31){permissions.add(Manifest.permission.BLUETOOTH_SCAN);permissions.add(Manifest.permission.BLUETOOTH_CONNECT);}
        else permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if(Build.VERSION.SDK_INT>=33)permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        permissions.removeIf(p->checkSelfPermission(p)==PackageManager.PERMISSION_GRANTED);
        if(!permissions.isEmpty())requestPermissions(permissions.toArray(new String[0]),7);else beginPending();
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request!=7)return;for(int i=0;i<permissions.length;i++)if(results[i]!=PackageManager.PERMISSION_GRANTED&&!permissions[i].equals(Manifest.permission.POST_NOTIFICATIONS)){toast("That permission is needed for this input. You can grant it in Android app settings.");pending="";return;}beginPending();}
    private void beginPending(){String kind=pending;pending="";if(kind.equals(InputService.CAMERA))startForegroundService(new Intent(this,InputService.class).setAction(kind).putExtra("hands",hands.isChecked()));else if(kind.equals(InputService.WIRE))scan();}
    private void send(String action){if(AppState.cameraOn||AppState.wireOn)startService(new Intent(this,InputService.class).setAction(action));}
    private void openYouTubeInChrome(){
        Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("https://m.youtube.com/shorts/"));
        intent.setPackage("com.android.chrome");
        try{startActivity(intent);toast("YouTube opened in Chrome. Start the camera before switching apps.");}
        catch(ActivityNotFoundException e){toast("Chrome is not installed. Install Chrome, then try again.");}
    }
    private void openApp(String name,String website){
        Intent launch=getPackageManager().getLaunchIntentForPackage(name);
        if(launch==null&&name.equals("com.facebook.katana"))launch=getPackageManager().getLaunchIntentForPackage("com.facebook.lite");
        if(launch!=null)startActivity(launch);else toast("Install/open the "+(name.contains("youtube")?"YouTube":name.contains("facebook")?"Facebook":"Instagram")+" app first. This version controls the apps, not a browser tab.");
    }
    private void scan(){
        BluetoothManager manager=getSystemService(BluetoothManager.class);BluetoothAdapter adapter=manager==null?null:manager.getAdapter();
        if(adapter==null||!adapter.isEnabled()){toast("Turn on Bluetooth, then connect again.");return;}
        scanner=adapter.getBluetoothLeScanner();if(scanner==null){toast("Bluetooth scanning is unavailable.");return;}
        ArrayList<BluetoothDevice> devices=new ArrayList<>();HashSet<String> seen=new HashSet<>();ArrayAdapter<String> labels=new ArrayAdapter<>(this,android.R.layout.simple_list_item_1);
        scanDialog=new AlertDialog.Builder(this).setTitle("Choose your HM-10").setAdapter(labels,(dialog,which)->{
            BluetoothDevice device=devices.get(which);stopScan();startForegroundService(new Intent(this,InputService.class).setAction(InputService.WIRE).putExtra("address",device.getAddress()));
        }).setNegativeButton("Cancel",null).create();scanDialog.setOnDismissListener(d->stopScan());scanDialog.show();
        scanCallback=new ScanCallback(){
            @Override public void onScanResult(int callbackType,ScanResult result){runOnUiThread(()->{
                if(scanCallback==null||!scanDialog.isShowing())return;BluetoothDevice device=result.getDevice();String address=device.getAddress();
                if(seen.add(address)){devices.add(device);String name=device.getName();labels.add((name==null?"HM-10 compatible device":name)+"\n"+address);}
            });}
            @Override public void onScanFailed(int code){runOnUiThread(()->{toast("Bluetooth scan failed ("+code+"). Try toggling Bluetooth.");stopScan();});}
        };
        try{scanner.startScan(Collections.singletonList(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(BleInput.SERVICE)).build()),new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),scanCallback);}
        catch(Exception e){stopScan();toast("Bluetooth: "+e.getMessage());}
        handler.postDelayed(()->{stopScan();if(scanDialog!=null&&scanDialog.isShowing()&&devices.isEmpty())scanDialog.setTitle("No HM-10 found. Check power and Bluetooth. On Android 11 or older, enable Location too.");},12000);
    }
    private void stopScan(){if(scanner!=null&&scanCallback!=null)try{scanner.stopScan(scanCallback);}catch(SecurityException ignored){}scanCallback=null;scanner=null;}
    @Override protected void onResume(){super.onResume();visible=new WeakReference<>(this);handler.post(refresh);}
    @Override protected void onPause(){visible.clear();handler.removeCallbacks(refresh);stopScan();super.onPause();}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);stopScan();if(scanDialog!=null)scanDialog.dismiss();super.onDestroy();}
}
