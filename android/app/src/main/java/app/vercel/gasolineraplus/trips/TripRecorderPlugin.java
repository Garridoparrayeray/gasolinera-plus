package app.vercel.gasolineraplus.trips;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
        name = "TripRecorder",
        permissions = {
                @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
                @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
                @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION }),
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class TripRecorderPlugin extends Plugin {

    @Override
    public void load() {
        TripService.setListener((snapshot) -> notifyListeners("tripUpdate", snapshotJson(snapshot)));
    }

    @Override
    protected void handleOnDestroy() {
        TripService.setListener(null);
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject permissionsJson() {
        JSObject out = new JSObject();
        out.put("location", granted(Manifest.permission.ACCESS_FINE_LOCATION));
        boolean background = true;
        boolean activity = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            background = granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
            activity = granted(Manifest.permission.ACTIVITY_RECOGNITION);
        }
        boolean notifications = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifications = granted(Manifest.permission.POST_NOTIFICATIONS);
        }
        out.put("background", background);
        out.put("activity", activity);
        out.put("notifications", notifications);
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        out.put("unrestrictedBattery", power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        return out;
    }

    private JSObject snapshotJson(TripService.Snapshot snapshot) {
        JSObject out = new JSObject();
        if (snapshot == null) {
            out.put("recording", false);
            return out;
        }
        out.put("recording", snapshot.recording);
        out.put("tripId", snapshot.tripId);
        out.put("startedAt", snapshot.startedAt);
        out.put("distanceM", snapshot.distanceM);
        out.put("speedMs", snapshot.speedMs);
        out.put("maxSpeedMs", snapshot.maxSpeedMs);
        out.put("points", snapshot.points);
        out.put("auto", snapshot.auto);
        return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        TripService.Snapshot snapshot = TripService.snapshot();
        boolean recording = TripStore.currentTripId(getContext()) != null && snapshot != null && snapshot.recording;
        JSObject live = snapshotJson(snapshot);
        live.put("recording", recording);
        out.put("trip", live);
        out.put("recording", recording);
        out.put("autoDetect", TripStore.isAutoDetectEnabled(getContext()));
        out.put("permissions", permissionsJson());
        out.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            call.reject("Falta el permiso de ubicación precisa", "permissions");
            return;
        }
        TripService.start(getContext(), false, call.getString("vehicleId"));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (TripStore.currentTripId(getContext()) != null) {
            TripService.sendAction(getContext(), TripService.ACTION_STOP);
        }
        call.resolve();
    }

    @PluginMethod
    public void listTrips(PluginCall call) {
        try {
            JSONArray trips = TripStore.listFinished(getContext());
            JSObject out = new JSObject();
            out.put("trips", new JSArray(trips.toString()));
            call.resolve(out);
        } catch (Exception error) {
            call.reject("No se pudieron leer los viajes", error);
        }
    }

    @PluginMethod
    public void readTrip(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Falta el id del viaje");
            return;
        }
        try {
            JSONObject meta = TripStore.readMeta(getContext(), id);
            JSObject out = new JSObject();
            out.put("meta", new JSObject(meta.toString()));
            out.put("points", new JSArray(TripStore.readPoints(getContext(), id).toString()));
            call.resolve(out);
        } catch (Exception error) {
            call.reject("No se pudo leer el viaje", error);
        }
    }

    @PluginMethod
    public void deleteTrip(PluginCall call) {
        String id = call.getString("id");
        if (id != null && !id.equals(TripStore.currentTripId(getContext()))) {
            TripStore.delete(getContext(), id);
        }
        call.resolve();
    }

    @PluginMethod
    public void setAutoDetect(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context context = getContext();
        if (!enabled) {
            TripStore.setAutoDetectEnabled(context, false);
            AutoDetect.disable(context).addOnCompleteListener((task) -> call.resolve());
            return;
        }
        if (!AutoDetect.hasPermissions(context)) {
            call.reject("Faltan permisos: ubicación siempre y actividad física", "permissions");
            return;
        }
        AutoDetect.enable(context)
                .addOnSuccessListener((ignored) -> {
                    TripStore.setAutoDetectEnabled(context, true);
                    call.resolve();
                })
                .addOnFailureListener((error) -> call.reject("No se pudo activar la detección de viajes: " + error.getMessage()));
    }

    @PluginMethod
    public void requestForeground(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        aliases.add("location");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            aliases.add("notifications");
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "afterPermissions");
    }

    @PluginMethod
    public void requestActivity(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve(permissionsJson());
            return;
        }
        requestPermissionForAlias("activity", call, "afterPermissions");
    }

    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve(permissionsJson());
            return;
        }
        requestPermissionForAlias("background", call, "afterPermissions");
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        call.resolve(permissionsJson());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
