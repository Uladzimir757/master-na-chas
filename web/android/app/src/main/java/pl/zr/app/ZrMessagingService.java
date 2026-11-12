package pl.zr.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.RemoteMessage;
import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;
import java.util.Locale;

/**
 * Пуши приложения: всё, как у плагина @capacitor-firebase/messaging (его
 * сервис заменён этим в AndroidManifest.xml), плюс тихий пуш сторожа
 * геолокации {"type": "geo_wake"} (app/geo_watchdog.py).
 *
 * geo_wake приходит, когда сервер давно не получал точек от мастера,
 * который ими делится, — обычно Xiaomi убил приложение смахиванием. Тогда
 * поднимаем сервис геолокации (GeoServiceRestarter, как при перезагрузке);
 * не вышло — показываем уведомление, тап по нему открывает приложение, и
 * MainActivity.onResume поднимает сервис уже наверняка. На телефоне, где
 * мастер геолокацией не делился, geo_wake молча игнорируется.
 */
public class ZrMessagingService extends MessagingService {

    private static final String TAG = "ZrGeoWake";
    private static final String CHANNEL_ID = "zr_geo_off";
    private static final int NOTIFICATION_ID = 4711;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        if ("geo_wake".equals(remoteMessage.getData().get("type"))) {
            onGeoWake();
            return;
        }
        super.onMessageReceived(remoteMessage);
    }

    private void onGeoWake() {
        if (!GeoServiceRestarter.shouldShare(this)) {
            Log.i(TAG, "geo_wake: this phone isn't sharing location, ignoring");
            return;
        }
        if (GeoServiceRestarter.ensureRunning(this, "geo_wake", true)) {
            NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID);
            return;
        }
        showLocationOffNotification(this);
    }

    private static void showLocationOffNotification(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "geo_wake: no notification permission");
            return;
        }
        boolean pl = "pl".equals(Locale.getDefault().getLanguage());
        String title = pl ? "Lokalizacja wyłączona" : "Location is off";
        String text = pl
            ? "Klienci nie widzą, gdzie jesteś. Dotknij, aby włączyć."
            : "Clients can't see where you are. Tap to turn it back on.";

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            nm.createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, pl ? "Lokalizacja" : "Location", NotificationManager.IMPORTANCE_HIGH)
            );
        }
        // Тот же признак, что у уведомления фоновой геолокации: MainActivity
        // по нему откроет настройки кабинета (там тумблер и кнопки).
        Intent open = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent pi = PendingIntent.getActivity(
            context, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi);
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            Log.w(TAG, "geo_wake: notify failed", e);
        }
    }
}
