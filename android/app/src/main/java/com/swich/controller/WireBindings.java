package com.swich.controller;

import java.util.Arrays;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.LongSupplier;
import org.json.JSONObject;

/** Maps recognized combinations, preserving their timing and the original defaults. */
public final class WireBindings {
    public static final String[] KEYS={"tap1","tap2","tap3","tap4","hold1","hold2","hold3","hold4"};
    public static final String[] INPUTS={"1 tap","2 taps","3 taps","4 taps","Hold","1 tap, then hold","2 taps, then hold","3 taps, then hold"};
    public static final String[] DEFAULTS={"toggle","back","forward","shortcuts","volume_up","volume_down","scroll_down","scroll_up"};
    public static final String[] ACTIONS={"toggle","play","pause","back","forward","scroll_down","scroll_up","volume_up","volume_down","shortcuts","none"};
    public static final String[] LABELS={"Play / pause","Play","Pause","Seek back","Seek forward","Next / scroll down","Previous / scroll up","Volume up","Volume down","Open Swich","Do nothing"};
    private final Function<String,String> setting;
    private final Consumer<JSONObject> emit;
    private final LongSupplier clock;
    private String heldId="",heldAction="";
    private long heldAt;
    public WireBindings(Function<String,String> setting,Consumer<JSONObject> emit,LongSupplier clock){this.setting=setting;this.emit=emit;this.clock=clock;}
    public static String defaultFor(String key){int i=Arrays.asList(KEYS).indexOf(key);return i<0?"none":DEFAULTS[i];}
    public static String valid(String key,String action){return Arrays.asList(ACTIONS).contains(action)?action:defaultFor(key);}
    public void accept(JSONObject input){
        String key=input.optString("trigger"),phase=input.optString("action"),id=input.optString("gestureId");
        if(!Arrays.asList(KEYS).contains(key))return;
        if(key.startsWith("tap")){single(valid(key,setting.apply(key)));return;}
        if(phase.endsWith("Start")){
            reset();heldId=id;heldAction=valid(key,setting.apply(key));heldAt=clock.getAsLong();
            String kind=continuous(heldAction);
            if(kind.isEmpty())single(heldAction);else emit.accept(command(kind+"Start","gestureId",heldId));
        }else if(id.equals(heldId)&&!heldId.isEmpty()){
            String kind=continuous(heldAction);
            if(phase.endsWith("Move")&&!kind.isEmpty()){
                double delta=Math.min(1,Math.max(0,clock.getAsLong()-heldAt)/5000.0)*direction(heldAction);
                emit.accept(command(kind+"Move","gestureId",heldId,"delta",delta));
            }else if(phase.endsWith("End")){
                if(!kind.isEmpty())emit.accept(command(kind+"End","gestureId",heldId,"commit",input.optBoolean("commit")));
                heldId="";heldAction="";
            }
        }
    }
    public void reset(){String kind=continuous(heldAction);if(!heldId.isEmpty()&&!kind.isEmpty())emit.accept(command(kind+"End","gestureId",heldId,"commit",false));heldId="";heldAction="";}
    private static JSONObject command(String action,Object... pairs){
        try{JSONObject result=new JSONObject().put("action",action);for(int i=0;i<pairs.length;i+=2)result.put((String)pairs[i],pairs[i+1]);return result;}
        catch(org.json.JSONException e){throw new IllegalArgumentException("Invalid command",e);}
    }
    private static String continuous(String action){return action.startsWith("volume_")?"volume":action.startsWith("scroll_")?"scroll":"";}
    private static int direction(String action){return action.equals("volume_up")||action.equals("scroll_down")?1:-1;}
    private void single(String action){
        if(action.equals("none"))return;
        if(action.startsWith("volume_"))emit.accept(command("volumeStep","direction",direction(action)));
        else if(action.startsWith("scroll_"))emit.accept(command("scroll","direction",direction(action)));
        else if(action.equals("back")||action.equals("forward"))emit.accept(command("seek","seconds",action.equals("forward")?10:-10));
        else emit.accept(command(action));
    }
}
