package pl.zr.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeoRestartPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Любое открытие приложения (после kill процесса оно стартует с
        // главной, не с кабинета) — поднять фоновую геолокацию, если мастер
        // ею делился. См. GeoServiceRestarter.
        GeoServiceRestarter.ensureRunning(this, "resume", false);
    }
}
