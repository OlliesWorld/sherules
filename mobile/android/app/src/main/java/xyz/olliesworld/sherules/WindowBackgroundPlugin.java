package xyz.olliesworld.sherules;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Sets the window's background colour, so the status and navigation bar areas match the
 * app's light/dark theme (see +layout.svelte).
 *
 * Why: on Android WebViews older than 140, Capacitor's SystemBars pads the page clear of the
 * system bars instead of drawing it underneath them, and those padded areas show the window
 * background (white by default). The status-bar plugin's setBackgroundColor is ignored on
 * Android 15+. With newer WebViews the page draws under the bars and covers this anyway.
 */
@CapacitorPlugin(name = "WindowBackground")
public class WindowBackgroundPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        String color = call.getString("color");
        int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (IllegalArgumentException | NullPointerException e) {
            call.reject("Expected a colour like #060e18");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(parsed);
            call.resolve();
        });
    }
}
