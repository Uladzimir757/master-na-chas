package pl.zr.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Где мастер выключает показ местоположения — туда ведёт тап по
    // уведомлению фоновой геолокации («Wyłącz w kabinecie»).
    private static final String LOCATION_SETTINGS_PATH = "/cabinet/?tab=settings";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeoRestartPlugin.class);
        super.onCreate(savedInstanceState);
        openSettingsIfFromGeoNotification(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openSettingsIfFromGeoNotification(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Любое открытие приложения (после kill процесса оно стартует с
        // главной, не с кабинета) — поднять фоновую геолокацию, если мастер
        // ею делился. См. GeoServiceRestarter.
        GeoServiceRestarter.ensureRunning(this, "resume", false);
    }

    /**
     * Уведомление @capgo/background-geolocation открывает приложение
     * launch-интентом с FLAG_ACTIVITY_REORDER_TO_FRONT (своего признака у
     * плагина нет), а иконка на рабочем столе этот флаг не ставит — по нему
     * и отличаем тап по уведомлению.
     */
    private void openSettingsIfFromGeoNotification(Intent intent) {
        if (intent == null || (intent.getFlags() & Intent.FLAG_ACTIVITY_REORDER_TO_FRONT) == 0) {
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        String base = getBridge().getServerUrl();
        if (base == null) {
            return;
        }
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        getBridge().getWebView().loadUrl(base + LOCATION_SETTINGS_PATH);
        // один раз: повторное открытие этой же активити не должно снова
        // уводить в настройки
        intent.setFlags(intent.getFlags() & ~Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    }
}
