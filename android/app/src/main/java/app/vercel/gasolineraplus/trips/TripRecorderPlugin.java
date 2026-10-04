package app.vercel.gasolineraplus.trips;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(
        name = "TripRecorder",
        permissions = {
                @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
                @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
                @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION }),
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
                @Permission(alias = "bluetooth", strings = { "android.permission.BLUETOOTH_CONNECT" })
        }
)
public class TripRecorderPlugin extends Plugin {
    private static final long REREGISTER_MUTE_MS = 30 * 1000L;

    @Override
    public void load() {
        TripService.setListener((snapshot) -> notifyListeners("tripUpdate", snapshotJson(snapshot)));
        // Se vuelve a registrar por si Android olvidó el registro (por ejemplo, al forzar el cierre).
        Context context = getContext();
        if (TripStore.isAutoDetectEnabled(context) && AutoDetect.hasPermissions(context)) {
            AutoDetect.mute(context, REREGISTER_MUTE_MS);
            AutoDetect.enable(context);
        }
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
        boolean bluetooth = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            bluetooth = granted("android.permission.BLUETOOTH_CONNECT");
        }
        out.put("bluetooth", bluetooth);
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
        out.put("paused", snapshot.paused);
        out.put("pausedAt", snapshot.pausedAt);
        out.put("pausedMs", snapshot.pausedMs);
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
        JSObject bluetooth = new JSObject();
        bluetooth.put("devices", TripStore.bluetoothCars(getContext()));
        out.put("bluetooth", bluetooth);
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
    public void pause(PluginCall call) {
        if (TripStore.currentTripId(getContext()) != null) {
            TripService.sendAction(getContext(), TripService.ACTION_PAUSE);
        }
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (TripStore.currentTripId(getContext()) != null) {
            TripService.sendAction(getContext(), TripService.ACTION_RESUME);
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
    public void requestBluetooth(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            call.resolve(permissionsJson());
            return;
        }
        requestPermissionForAlias("bluetooth", call, "afterPermissions");
    }

    // Devuelve los emparejados y los que están conectados ahora (audio, manos libres y BLE).
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void bluetoothDevices(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !granted("android.permission.BLUETOOTH_CONNECT")) {
            call.reject("Falta el permiso de Bluetooth", "permissions");
            return;
        }
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = null;
        if (manager != null) {
            adapter = manager.getAdapter();
        }
        final JSObject out = new JSObject();
        if (adapter == null) {
            out.put("devices", new JSArray());
            out.put("available", false);
            call.resolve(out);
            return;
        }
        out.put("available", true);
        out.put("enabled", adapter.isEnabled());
        final Map<String, JSObject> found = new LinkedHashMap<>();
        for (BluetoothDevice device : adapter.getBondedDevices()) {
            addDevice(found, device, false);
        }
        for (BluetoothDevice device : manager.getConnectedDevices(BluetoothProfile.GATT)) {
            addDevice(found, device, true);
        }
        collectConnected(adapter, found, () -> {
            JSArray devices = new JSArray();
            synchronized (found) {
                for (JSObject item : found.values()) {
                    devices.put(item);
                }
            }
            out.put("devices", devices);
            call.resolve(out);
        });
    }

    // Los perfiles de audio y manos libres se consultan de forma asíncrona; si tardan, se responde con lo que haya.
    @SuppressLint("MissingPermission")
    private void collectConnected(BluetoothAdapter adapter, Map<String, JSObject> found, Runnable done) {
        int[] profiles = { BluetoothProfile.A2DP, BluetoothProfile.HEADSET };
        AtomicInteger pending = new AtomicInteger(profiles.length);
        AtomicBoolean finished = new AtomicBoolean(false);
        Runnable finish = () -> {
            if (finished.compareAndSet(false, true)) {
                done.run();
            }
        };
        new Handler(Looper.getMainLooper()).postDelayed(finish, 1500);
        for (int profile : profiles) {
            BluetoothProfile.ServiceListener listener = new BluetoothProfile.ServiceListener() {
                @Override
                public void onServiceConnected(int type, BluetoothProfile proxy) {
                    synchronized (found) {
                        for (BluetoothDevice device : proxy.getConnectedDevices()) {
                            addDevice(found, device, true);
                        }
                    }
                    adapter.closeProfileProxy(type, proxy);
                    if (pending.decrementAndGet() == 0) {
                        finish.run();
                    }
                }

                @Override
                public void onServiceDisconnected(int type) {
                }
            };
            boolean asked = false;
            try {
                asked = adapter.getProfileProxy(getContext(), listener, profile);
            } catch (RuntimeException error) {
                asked = false;
            }
            if (!asked && pending.decrementAndGet() == 0) {
                finish.run();
            }
        }
    }

    @SuppressLint("MissingPermission")
    private static void addDevice(Map<String, JSObject> found, BluetoothDevice device, boolean connected) {
        String address = device.getAddress();
        JSObject item = found.get(address);
        if (item == null) {
            item = new JSObject();
            item.put("name", device.getName());
            item.put("address", address);
            item.put("car", isCar(device));
            item.put("connected", false);
            found.put(address, item);
        }
        if (connected) {
            item.put("connected", true);
        }
    }

    // Los manos libres y equipos de audio de coche se anuncian con su clase Bluetooth.
    @SuppressLint("MissingPermission")
    private static boolean isCar(BluetoothDevice device) {
        BluetoothClass type = device.getBluetoothClass();
        if (type == null) {
            return false;
        }
        int kind = type.getDeviceClass();
        return kind == BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO || kind == BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE;
    }

    @PluginMethod
    public void addBluetoothDevice(PluginCall call) {
        TripStore.addBluetoothCar(getContext(), call.getString("address"), call.getString("name"));
        call.resolve();
    }

    @PluginMethod
    public void removeBluetoothDevice(PluginCall call) {
        TripStore.removeBluetoothCar(getContext(), call.getString("address"));
        call.resolve();
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
