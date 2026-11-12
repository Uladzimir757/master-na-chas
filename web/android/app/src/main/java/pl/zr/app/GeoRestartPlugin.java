package pl.zr.app;

import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Мост кабинета к нативной части фоновой геолокации. Только Android.
 *
 * - setShouldShare: флаг «мастер делится геолокацией» (GeoServiceRestarter):
 *   веб-код ставит его, когда фоновая геолокация запущена, и снимает при
 *   выключении тумблера или выходе.
 * - keepAliveStatus / requestBatteryExemption / openAutostartSettings:
 *   блок «чтобы геолокация не выключалась» в кабинете
 *   (components/GeoKeepAlive.tsx). Сами настройки приложение включить не
 *   может — Android и Xiaomi это запрещают, — но может открыть нужный экран
 *   или системный запрос в одно нажатие.
 */
@CapacitorPlugin(name = "ZrGeoRestart")
public class GeoRestartPlugin extends Plugin {

    @PluginMethod
    public void setShouldShare(PluginCall call) {
        GeoServiceRestarter.setShouldShare(getContext(), Boolean.TRUE.equals(call.getBoolean("value", false)));
        call.resolve();
    }

    /** batteryUnrestricted — приложение в списке «без ограничений батареи»;
     * xiaomi — показывать ли кнопку «Автозапуск» (его состояние Xiaomi
     * наружу не отдаёт). */
    @PluginMethod
    public void keepAliveStatus(PluginCall call) {
        JSObject out = new JSObject();
        out.put("batteryUnrestricted", isIgnoringBatteryOptimizations(getContext()));
        out.put("xiaomi", isXiaomi());
        call.resolve(out);
    }

    /** Системный запрос «Разрешить работу в фоне без ограничений?». */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        if (isIgnoringBatteryOptimizations(ctx)) {
            call.resolve();
            return;
        }
        Intent direct = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
        if (!tryStart(direct) && !tryStart(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            tryStart(appDetails(ctx));
        }
        call.resolve();
    }

    /** Экран «Автозапуск» Xiaomi; на других телефонах — карточка приложения. */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        boolean opened = false;
        if (isXiaomi()) {
            opened = tryStart(
                new Intent().setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
            );
        }
        if (!opened) {
            opened = tryStart(appDetails(getContext()));
        }
        JSObject out = new JSObject();
        out.put("opened", opened);
        call.resolve(out);
    }

    private boolean tryStart(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static Intent appDetails(Context ctx) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
    }

    private static boolean isIgnoringBatteryOptimizations(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    private static boolean isXiaomi() {
        String m = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco");
    }
}
