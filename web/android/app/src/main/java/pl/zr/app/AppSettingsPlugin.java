package pl.zr.app;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * «Otwórz ustawienia» для голосового ввода (20.11.2026, как в zlecai): после
 * двух отказов в доступе к микрофону Android больше не показывает системный
 * диалог, и getUserMedia сразу падает с NotAllowedError. Веб-страница сама
 * открыть настройки Android не может — этот плагин открывает экран «О
 * приложении», где включается микрофон. Сайт зовёт его как
 * window.Capacitor.Plugins.AppSettings.open() (web/lib/appSettings.ts).
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", getContext().getPackageName(), null)
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app settings", e);
        }
    }
}
