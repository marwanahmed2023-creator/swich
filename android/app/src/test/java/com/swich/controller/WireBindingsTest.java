package com.swich.controller;

import org.junit.Test;
import org.json.JSONObject;
import java.util.*;
import static org.junit.Assert.*;

public class WireBindingsTest {
    private final Map<String,String> settings=new HashMap<>();
    private final List<JSONObject> commands=new ArrayList<>();
    private long now;
    private final WireBindings mapper=new WireBindings(settings::get,commands::add,()->now);
    private void send(String key,String action,double delta,boolean commit)throws Exception{
        mapper.accept(new JSONObject().put("trigger",key).put("action",action).put("gestureId","g").put("delta",delta).put("commit",commit));
    }
    @Test public void defaultsRemainTheSame()throws Exception{
        String[] expected={"toggle","seek","seek","shortcuts"};
        for(int i=0;i<4;i++){send("tap"+(i+1),"unused",0,false);assertEquals(expected[i],commands.get(i).getString("action"));}
        assertEquals(-10,commands.get(1).getInt("seconds"));assertEquals(10,commands.get(2).getInt("seconds"));
        for(int i=1;i<=4;i++){
            commands.clear();now=0;send("hold"+i,i<=2?"volumeStart":"scrollStart",0,false);now=1000;send("hold"+i,i<=2?"volumeMove":"scrollMove",.3,false);send("hold"+i,i<=2?"volumeEnd":"scrollEnd",0,true);
            assertEquals(i<=2?"volumeStart":"scrollStart",commands.get(0).getString("action"));assertEquals(i%2==1?1:-1,(int)Math.signum(commands.get(1).getDouble("delta")));assertTrue(commands.get(2).getBoolean("commit"));
        }
    }
    @Test public void everyCombinationCanChooseEveryAction()throws Exception{
        for(String key:WireBindings.KEYS)for(String action:WireBindings.ACTIONS){
            commands.clear();settings.put(key,action);
            send(key,key.startsWith("tap")?"toggle":"volumeStart",0,false);
            if(action.equals("none"))assertTrue(commands.isEmpty());else assertEquals(1,commands.size());
            mapper.reset();
        }
    }
    @Test public void swappingVolumeAndScrollUsesNewDirectionAndTiming()throws Exception{
        settings.put("hold1","scroll_up");send("hold1","volumeStart",0,false);now=1000;send("hold1","volumeMove",.2,false);send("hold1","volumeEnd",0,true);
        assertEquals("scrollStart",commands.get(0).getString("action"));assertTrue(commands.get(1).getDouble("delta")<0);assertEquals("scrollEnd",commands.get(2).getString("action"));
        commands.clear();settings.put("hold4","volume_up");send("hold4","scrollStart",0,false);now=2000;send("hold4","scrollMove",-.55,false);assertEquals(.2,commands.get(1).getDouble("delta"),.0001);
    }
    @Test public void heldToggleIsOnceAndMappingChangesWaitForRelease()throws Exception{
        settings.put("hold1","toggle");send("hold1","volumeStart",0,false);settings.put("hold1","scroll_down");
        for(int i=0;i<5;i++)send("hold1","volumeMove",.1,false);send("hold1","volumeEnd",0,true);
        assertEquals(1,commands.size());assertEquals("toggle",commands.get(0).getString("action"));
        send("hold1","volumeStart",0,false);assertEquals("scrollStart",commands.get(1).getString("action"));
    }
    @Test public void tapVolumeIsOneStepAndDisconnectEndsHold()throws Exception{
        settings.put("tap2","volume_down");send("tap2","seek",0,false);assertEquals("volumeStep",commands.get(0).getString("action"));assertEquals(-1,commands.get(0).getInt("direction"));
        send("hold1","volumeStart",0,false);mapper.reset();JSONObject last=commands.get(commands.size()-1);assertEquals("volumeEnd",last.getString("action"));assertFalse(last.getBoolean("commit"));
    }
}
