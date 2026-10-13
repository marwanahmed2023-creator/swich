package com.swich.controller;

import java.util.function.Consumer;
import org.mozilla.javascript.BaseFunction;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/** Executes only the bundled, build-time-transpiled Swich engines. No web content. */
public final class EngineCore {
    private final ScriptableObject scope;
    public EngineCore(String source, Consumer<String> emit, Consumer<String> hint) {
        Context cx = enter();
        try {
            scope = cx.initSafeStandardObjects();
            bind("emitNative", emit); bind("hintNative", hint);
            cx.evaluateString(scope, source, "swich-engines", 1, null);
        } finally { Context.exit(); }
    }
    private static Context enter() {
        Context cx = Context.enter();
        cx.setOptimizationLevel(-1); // Android cannot load Rhino-generated JVM bytecode.
        cx.setLanguageVersion(Context.VERSION_ES6);
        return cx;
    }
    private void bind(String name, Consumer<String> sink) {
        ScriptableObject.putProperty(scope, name, new BaseFunction() {
            @Override public Object call(Context cx, Scriptable s, Scriptable self, Object[] args) {
                if (args.length > 0) sink.accept(Context.toString(args[0]));
                return Context.getUndefinedValue();
            }
        });
    }
    synchronized void verify(String source) {
        Context cx=enter();
        try { cx.evaluateString(scope,source,"engine-conformance",1,null); }
        finally { Context.exit(); }
    }
    public synchronized Object call(String name, Object... args) {
        Context cx = enter();
        try { return ((Function) ScriptableObject.getProperty(scope, name)).call(cx, scope, scope, args); }
        finally { Context.exit(); }
    }
}
