package com.swich.controller;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Path;
import android.graphics.Rect;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

public final class ControlService extends AccessibilityService {
    static volatile ControlService instance;
    private static final Set<String> APPS=new HashSet<>(Arrays.asList("com.google.android.youtube","com.android.chrome","com.chrome.beta","com.chrome.dev","com.facebook.katana","com.facebook.lite","com.instagram.android"));
    private String owner="",gesture="",kind="",targetPackage="",seekId="";
    private double base,seekTarget;
    private long deadline,lastScroll;
    private boolean swiping;
    @Override protected void onServiceConnected(){instance=this;AppState.action="Accessibility ready. Start your camera or wire.";}
    @Override public void onAccessibilityEvent(AccessibilityEvent event){
        // Commands always re-check the active window. No screen history is collected.
    }
    @Override public void onInterrupt(){clear();}
    @Override public void onDestroy(){if(instance==this)instance=null;clear();stopService(new Intent(this,InputService.class));super.onDestroy();}
    void cancel(String source){if(owner.equals(source))clear();}
    private void clear(){owner="";gesture="";kind="";targetPackage="";seekId="";}
    private void tell(String message){AppState.action=message;}
    private AccessibilityNodeInfo target(){
        if(!getSystemService(PowerManager.class).isInteractive()||getSystemService(KeyguardManager.class).isKeyguardLocked())return null;
        AccessibilityNodeInfo root=getRootInActiveWindow();
        return root!=null&&root.getPackageName()!=null&&APPS.contains(root.getPackageName().toString())?root:null;
    }
    void command(String source,JSONObject c){
        String action=c.optString("action"),id=c.optString("gestureId");long now=SystemClock.elapsedRealtime();
        if(!owner.isEmpty()&&now>deadline)clear();
        if(action.equals("cancel")){cancel(source);return;}
        if(action.equals("shortcuts")){
            if(getSystemService(KeyguardManager.class).isKeyguardLocked())return;
            startActivity(new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));return;
        }
        AccessibilityNodeInfo root=target();
        if(root==null){clear();tell("Open YouTube, Facebook, or Instagram to control it.");return;}
        String pkg=root.getPackageName().toString();
        if(!targetPackage.isEmpty()&&!targetPackage.equals(pkg))clear();
        if(!owner.isEmpty()&&!owner.equals(source)){tell("Finish the other input’s gesture first.");return;}
        AudioManager audio=getSystemService(AudioManager.class);
        double delta=c.optDouble("delta",0);if(!Double.isFinite(delta))return;delta=Math.max(-1,Math.min(1,delta));
        if(action.equals("scroll")){clear();swipe(root,c.optInt("direction",1),now);return;}
        if(action.endsWith("Start")){
            clear();owner=source;gesture=id;kind=action.substring(0,action.length()-5);targetPackage=pkg;deadline=now+2500;
            if(kind.equals("volume"))base=audio.getStreamVolume(AudioManager.STREAM_MUSIC);
            else if(kind.equals("seek")){
                AccessibilityNodeInfo seek=seekBar(root);
                if(seek==null){clear();tell("This player does not expose a timeline. Try the skip gesture instead.");return;}
                base=seek.getRangeInfo().getCurrent();seekTarget=base;seekId=seek.getViewIdResourceName()==null?"":seek.getViewIdResourceName();
            }
            return;
        }
        if(action.endsWith("Move")||action.endsWith("End")){
            String expected=action.substring(0,action.length()-(action.endsWith("Move")?4:3));
            if(!source.equals(owner)||!id.equals(gesture)||!kind.equals(expected)||!pkg.equals(targetPackage))return;
            deadline=now+2500;
            if(action.endsWith("End")){
                if(kind.equals("seek")&&c.optBoolean("commit")){
                    AccessibilityNodeInfo seek=seekBar(root);
                    if(seek!=null&&(seekId.isEmpty()||seekId.equals(seek.getViewIdResourceName()))){Bundle b=new Bundle();b.putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE,(float)seekTarget);tell(seek.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId(),b)?"Timeline set":"This player did not accept timeline control.");}
                }
                clear();return;
            }
            if(kind.equals("volume")){
                int max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC),volume=(int)Math.round(Math.max(0,Math.min(max,base+delta*max)));
                audio.setStreamVolume(AudioManager.STREAM_MUSIC,volume,AudioManager.FLAG_SHOW_UI);tell("Media volume "+Math.round(100f*volume/Math.max(1,max))+"%");
            }else if(kind.equals("scroll")){if(Math.abs(delta)>.001)swipe(root,delta>0?1:-1,now);}
            else if(kind.equals("seek")){
                AccessibilityNodeInfo seek=seekBar(root);if(seek!=null){var r=seek.getRangeInfo();seekTarget=Math.max(r.getMin(),Math.min(r.getMax(),base+delta*(r.getMax()-r.getMin())));tell("Timeline selected. Bend your fingers to apply.");}
            }
            return;
        }
        clear();
        if(action.equals("volumeStep")){
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,c.optInt("direction",1)>0?AudioManager.ADJUST_RAISE:AudioManager.ADJUST_LOWER,AudioManager.FLAG_SHOW_UI);tell("Media volume adjusted.");
        }else if(action.equals("toggle")||action.equals("play")||action.equals("pause")){
            AccessibilityNodeInfo button=playerButton(root,action);
            if(button!=null&&click(button)){tell(action.equals("toggle")?"Play / pause":"Playback command sent");return;}
            int key=action.equals("play")?KeyEvent.KEYCODE_MEDIA_PLAY:action.equals("pause")?KeyEvent.KEYCODE_MEDIA_PAUSE:KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
            mediaKey(audio,key);tell("Playback key sent. Player support varies.");
        }else if(action.equals("seek")){
            boolean forward=c.optInt("seconds",10)>0;
            AccessibilityNodeInfo button=find(root,n->label(n).matches(forward?"(fast forward|forward|skip forward)( 10 seconds)?":"(rewind|back|skip back)( 10 seconds)?"));
            if(button!=null&&click(button)){tell(forward?"Skip forward":"Skip back");return;}
            mediaKey(audio,forward?KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:KeyEvent.KEYCODE_MEDIA_REWIND);tell("Seek key sent. Distance and support depend on the player.");
        }
    }
    private void swipe(AccessibilityNodeInfo root,int direction,long now){
        if(swiping||now-lastScroll<600)return;
        Rect r=new Rect();root.getBoundsInScreen(r);if(r.width()<100||r.height()<200)return;
        float x=r.left+r.width()*.55f,upper=r.top+r.height()*.30f,lower=r.top+r.height()*.78f;
        Path path=new Path();path.moveTo(x,direction>0?lower:upper);path.lineTo(x,direction>0?upper:lower);
        swiping=true;lastScroll=now;
        boolean accepted=dispatchGesture(new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path,0,220)).build(),new GestureResultCallback(){
            @Override public void onCompleted(GestureDescription gesture){swiping=false;}
            @Override public void onCancelled(GestureDescription gesture){swiping=false;}
        },null);
        if(!accepted)swiping=false;
        tell(accepted?(direction>0?"Next / scroll down":"Previous / scroll up"):"The screen did not accept that swipe.");
    }
    private interface Match{boolean test(AccessibilityNodeInfo n);}
    private AccessibilityNodeInfo find(AccessibilityNodeInfo root,Match match){
        ArrayDeque<AccessibilityNodeInfo> queue=new ArrayDeque<>();queue.add(root);int count=0;
        while(!queue.isEmpty()&&count++<500){AccessibilityNodeInfo node=queue.removeFirst();if(node.isVisibleToUser()&&node.isEnabled()&&match.test(node))return node;for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)queue.addLast(child);}}
        return null;
    }
    private String label(AccessibilityNodeInfo n){CharSequence value=n.getContentDescription();if(value==null||value.length()==0)value=n.getText();return value==null?"":value.toString().toLowerCase(Locale.ROOT).trim();}
    private AccessibilityNodeInfo playerButton(AccessibilityNodeInfo root,String action){
        return find(root,n->{String s=label(n);boolean play=s.matches("play( video)?(, button)?"),pause=s.matches("pause( video)?(, button)?");return action.equals("toggle")?(play||pause):action.equals("play")?play:pause;});
    }
    private AccessibilityNodeInfo seekBar(AccessibilityNodeInfo root){
        return find(root,n->n.getRangeInfo()!=null&&n.getActionList().contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS)
            &&((n.getClassName()!=null&&n.getClassName().toString().contains("SeekBar"))||label(n).matches(".*(seek|timeline|progress).*"))&&!label(n).contains("volume"));
    }
    private boolean click(AccessibilityNodeInfo n){for(int i=0;n!=null&&i<3;i++,n=n.getParent())if(n.isClickable()&&n.performAction(AccessibilityNodeInfo.ACTION_CLICK))return true;return false;}
    private void mediaKey(AudioManager audio,int key){audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,key));audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,key));}
}
