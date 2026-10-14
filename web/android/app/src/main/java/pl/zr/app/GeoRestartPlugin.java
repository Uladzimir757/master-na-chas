package pl.zr.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Мост для флага «мастер делится геолокацией» (GeoServiceRestarter): веб-код
 * кабинета ставит его, когда фоновая геолокация запущена, и снимает при
 * выключении тумблера или выходе. Только Android.
 */
@CapacitorPlugin(name = "ZrGeoRestart")
public class GeoRestartPlugin extends Plugin {

    @PluginMethod
    public void setShouldShare(PluginCall call) {
        GeoServiceRestarter.setShouldShare(getContext(), Boolean.TRUE.equals(call.getBoolean("value", false)));
        call.resolve();
    }
}
