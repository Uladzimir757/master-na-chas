package pl.zr.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * После перезагрузки телефона или обновления приложения фоновый сервис
 * геолокации не работает, пока мастер сам не откроет приложение. Если он
 * делился геолокацией — поднимаем сервис сразу (см. GeoServiceRestarter).
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            GeoServiceRestarter.ensureRunning(context, action, true);
        }
    }
}
