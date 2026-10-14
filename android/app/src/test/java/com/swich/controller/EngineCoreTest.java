package com.swich.controller;

import org.junit.Test;
import org.json.JSONObject;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class EngineCoreTest {
    private final List<JSONObject> events=new ArrayList<>();
    private EngineCore engine() throws Exception {
        return new EngineCore(new String(Files.readAllBytes(Paths.get(System.getProperty("swich.assets"),"engines.js")),StandardCharsets.UTF_8),s->{try{events.add(new JSONObject(s));}catch(Exception e){throw new IllegalArgumentException(e);}},s->{});
    }
    @Test public void allBrowserWinkScenariosRunInAndroidInterpreter() throws Exception {
        try(var in=getClass().getResourceAsStream("/generated/verify-winks.js")){assertNotNull(in);engine().verify(new String(in.readAllBytes(),StandardCharsets.UTF_8));}
    }
    @Test public void allBrowserHandScrollScenariosRunInAndroidInterpreter() throws Exception {
        try(var in=getClass().getResourceAsStream("/generated/verify-scroll.js")){assertNotNull(in);engine().verify(new String(in.readAllBytes(),StandardCharsets.UTF_8));}
    }
    @Test public void shortBatchedTapsKeepTheirCount() throws Exception {
        for(int count=1;count<=4;count++){
            events.clear();EngineCore e=engine();e.call("wireSample",445,0);e.call("wireSample",445,300);
            for(int i=0;i<count;i++){int time=400+i*100;e.call("wireSample",951,time);e.call("wireSample",951,time);e.call("wireSample",445,time);e.call("wireSample",445,time);}
            e.call("wireTick",400+(count-1)*100+301);
            assertEquals(1,events.size());assertEquals(new String[]{"","toggle","seek","seek","shortcuts"}[count],events.get(0).getString("action"));
        }
    }
    @Test public void staleReadingsStopHeldVolume() throws Exception {
        EngineCore e=engine();
        for(int t=0;t<=400;t+=20)e.call("wireSample",445,t);
        for(int t=420;t<=1600;t+=20)e.call("wireSample",951,t);
        assertTrue(events.stream().anyMatch(c->c.optString("action").equals("volumeMove")));
        e.call("wireTick",2300);
        JSONObject last=events.get(events.size()-1);assertEquals("volumeEnd",last.getString("action"));assertFalse(last.getBoolean("commit"));
        int count=events.size();for(int t=2320;t<=3600;t+=20)e.call("wireSample",951,t);assertEquals(count,events.size());
    }
}
