package pl.zr.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.capgo.capacitor_background_geolocation.BackgroundGeolocationService;

/**
 * Поднимает фоновый сервис геолокации после того, как процесс приложения
 * был убит (docs/geo-service-restart-task.md).
 *
 * Почему это нужно: @capgo/background-geolocation при первом запуске
 * сервиса возвращает START_NOT_STICKY (его конфиг сохраняется чуть позже),
 * поэтому после kill процесса Android сервис сам не перезапускает. Сам
 * плагин не патчим — вместо этого два внешних триггера: BootReceiver
 * (перезагрузка/обновление приложения) и MainActivity.onResume (любое
 * открытие приложения, не только /cabinet/).
 *
 * Условия запуска — все сразу:
 *  1. наш флаг should_share = true: его ставит веб-код кабинета, когда
 *     мастер включил «показывать мою локацию» (lib/useLocationSharing.ts
 *     через GeoRestartPlugin), и снимает при выключении тумблера/выходе;
 *  2. у плагина сохранён конфиг нативной доставки (url + Bearer-заголовок
 *     + тексты уведомления) — по нему сервис работает без WebView. Это
 *     единственная точка, знающая имя его SharedPreferences: если плагин
 *     его переименует, перезапуск просто не произойдёт (без падения);
 *  3. есть разрешение на геолокацию, а для старта из фона (boot) — ещё и
 *     ACCESS_BACKGROUND_LOCATION («Всегда»): без него Android 14+ не даёт
 *     запускать location-сервис из фона.
 */
final class GeoServiceRestarter {

    private static final String TAG = "ZrGeoRestart";

    private static final String OWN_PREFS = "zr_geo_restart";
    private static final String KEY_SHOULD_SHARE = "should_share";

    // Хранилище и ключи плагина (LocationStore.java) и экстры его сервиса
    // (BackgroundGeolocationService.EXTRA_NOTIFICATION_*, package-private).
    private static final String PLUGIN_PREFS = "CapgoBackgroundGeolocationWatcher";
    private static final String PLUGIN_KEY_ENABLED = "enabled";
    private static final String PLUGIN_KEY_URL = "url";
    private static final String PLUGIN_KEY_TITLE = "title";
    private static final String PLUGIN_KEY_MESSAGE = "message";
    private static final String EXTRA_NOTIFICATION_TITLE = "notificationTitle";
    private static final String EXTRA_NOTIFICATION_MESSAGE = "notificationMessage";

    private GeoServiceRestarter() {}

    static void setShouldShare(Context context, boolean value) {
        context.getSharedPreferences(OWN_PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_SHOULD_SHARE, value).apply();
    }

    static boolean shouldShare(Context context) {
        return context.getSharedPreferences(OWN_PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SHOULD_SHARE, false);
    }

    /**
     * @param fromBackground true для BootReceiver: старт location-сервиса из
     *     фона требует «Всегда».
     * @return true, если сервис был (пере)запущен.
     */
    static boolean ensureRunning(Context context, String reason, boolean fromBackground) {
        if (!shouldShare(context)) {
            return false;
        }
        SharedPreferences plugin = context.getSharedPreferences(PLUGIN_PREFS, Context.MODE_PRIVATE);
        if (!plugin.getBoolean(PLUGIN_KEY_ENABLED, false) || plugin.getString(PLUGIN_KEY_URL, null) == null) {
            Log.i(TAG, reason + ": no persisted watcher config, nothing to restart");
            return false;
        }
        if (!granted(context, Manifest.permission.ACCESS_FINE_LOCATION) && !granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)) {
            Log.i(TAG, reason + ": location permission missing");
            return false;
        }
        if (fromBackground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)) {
            Log.i(TAG, reason + ": no \"Always\" permission, can't start from background");
            return false;
        }
        // Экстры обязательны: без них сервис с пустым конфигом (гонка со
        // stop() из JS) не вызвал бы startForeground и Android убил бы
        // приложение. Если сервис уже работает — onStartCommand ничего не
        // переинициализирует, только обновит уведомление.
        Intent intent = new Intent(context, BackgroundGeolocationService.class)
            .putExtra(EXTRA_NOTIFICATION_TITLE, plugin.getString(PLUGIN_KEY_TITLE, ""))
            .putExtra(EXTRA_NOTIFICATION_MESSAGE, plugin.getString(PLUGIN_KEY_MESSAGE, ""));
        try {
            ContextCompat.startForegroundService(context, intent);
            Log.i(TAG, reason + ": location service started");
            return true;
        } catch (Exception e) {
            // ForegroundServiceStartNotAllowedException и т.п. — следующий
            // триггер (открытие приложения) попробует снова.
            Log.w(TAG, reason + ": could not start location service", e);
            return false;
        }
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }
}
