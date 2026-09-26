package app.vercel.gasolineraplus.trips;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.List;
import java.util.Locale;

import app.vercel.gasolineraplus.MainActivity;
import app.vercel.gasolineraplus.R;

public class TripService extends Service {
    public static final String ACTION_START = "app.vercel.gasolineraplus.trips.START";
    public static final String ACTION_STOP = "app.vercel.gasolineraplus.trips.STOP";
    public static final String ACTION_VEHICLE_EXIT = "app.vercel.gasolineraplus.trips.VEHICLE_EXIT";
    public static final String EXTRA_AUTO = "auto";
    public static final String EXTRA_VEHICLE_ID = "vehicleId";

    private static final String CHANNEL_ID = "trips";
    private static final int NOTIFICATION_ID = 7301;
    private static final float MAX_ACCURACY_M = 25f;
    private static final float MOVING_MS = 2f;
    private static final long AUTO_STOP_IDLE_MS = 5 * 60 * 1000L;
    private static final long AFTER_EXIT_IDLE_MS = 2 * 60 * 1000L;
    private static final long MANUAL_STOP_IDLE_MS = 60 * 60 * 1000L;
    private static final double MIN_AUTO_DISTANCE_M = 500;

    public interface Listener {
        void onUpdate(TripService.Snapshot snapshot);
    }

    public static final class Snapshot {
        public final String tripId;
        public final long startedAt;
        public final double distanceM;
        public final float speedMs;
        public final float maxSpeedMs;
        public final int points;
        public final boolean auto;
        public final boolean recording;

        Snapshot(String tripId, long startedAt, double distanceM, float speedMs, float maxSpeedMs, int points, boolean auto, boolean recording) {
            this.tripId = tripId;
            this.startedAt = startedAt;
            this.distanceM = distanceM;
            this.speedMs = speedMs;
            this.maxSpeedMs = maxSpeedMs;
            this.points = points;
            this.auto = auto;
            this.recording = recording;
        }
    }

    private static volatile Listener listener;
    private static volatile Snapshot lastSnapshot;

    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private String tripId;
    private boolean auto;
    private long startedAt;
    private long lastMovingAt;
    private long vehicleExitAt;
    private Location lastGood;
    private double distanceM;
    private float speedMs;
    private float maxSpeedMs;
    private int points;
    private long lastNotificationAt;

    public static void setListener(Listener value) {
        listener = value;
    }

    public static Snapshot snapshot() {
        return lastSnapshot;
    }

    public static void start(Context context, boolean auto, String vehicleId) {
        Intent intent = new Intent(context, TripService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_AUTO, auto);
        if (vehicleId != null) {
            intent.putExtra(EXTRA_VEHICLE_ID, vehicleId);
        }
        ContextCompat.startForegroundService(context, intent);
    }

    public static void sendAction(Context context, String action) {
        Intent intent = new Intent(context, TripService.class);
        intent.setAction(action);
        context.startService(intent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = ACTION_START;
        if (intent != null && intent.getAction() != null) {
            action = intent.getAction();
        }
        if (ACTION_STOP.equals(action)) {
            stopRecording(false);
            return START_NOT_STICKY;
        }
        if (ACTION_VEHICLE_EXIT.equals(action)) {
            if (tripId == null) {
                stopSelf();
            } else {
                vehicleExitAt = System.currentTimeMillis();
            }
            return START_NOT_STICKY;
        }
        if (tripId != null) {
            return START_STICKY;
        }
        if (!hasLocationPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        boolean isAuto = intent != null && intent.getBooleanExtra(EXTRA_AUTO, false);
        String vehicleId = null;
        if (intent != null) {
            vehicleId = intent.getStringExtra(EXTRA_VEHICLE_ID);
        }
        startForegroundCompat(buildNotification("Preparando el GPS…"));
        try {
            tripId = TripStore.begin(this, isAuto, vehicleId);
        } catch (Exception error) {
            stopSelf();
            return START_NOT_STICKY;
        }
        auto = isAuto;
        startedAt = System.currentTimeMillis();
        lastMovingAt = startedAt;
        vehicleExitAt = 0;
        distanceM = 0;
        maxSpeedMs = 0;
        points = 0;
        requestUpdates();
        publish(true);
        return START_STICKY;
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void requestUpdates() {
        client = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
                .setMinUpdateIntervalMillis(1000)
                .setMaxUpdateDelayMillis(0)
                .setWaitForAccurateLocation(false)
                .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                handle(result.getLocations());
            }
        };
        try {
            client.requestLocationUpdates(request, callback, Looper.getMainLooper());
        } catch (SecurityException error) {
            stopRecording(true);
        }
    }

    private void handle(List<Location> locations) {
        if (tripId == null || locations.isEmpty()) {
            return;
        }
        try {
            TripStore.append(this, tripId, locations);
        } catch (Exception error) {
            return;
        }
        long now = System.currentTimeMillis();
        for (Location location : locations) {
            points++;
            if (location.getAccuracy() > MAX_ACCURACY_M) {
                continue;
            }
            float speed = 0f;
            if (location.hasSpeed()) {
                speed = location.getSpeed();
            } else if (lastGood != null && location.getTime() > lastGood.getTime()) {
                speed = lastGood.distanceTo(location) / ((location.getTime() - lastGood.getTime()) / 1000f);
            }
            speedMs = speed;
            if (speed >= MOVING_MS) {
                lastMovingAt = now;
                if (lastGood != null) {
                    float step = lastGood.distanceTo(location);
                    long dt = location.getTime() - lastGood.getTime();
                    if (dt > 0 && step / (dt / 1000f) < 70f) {
                        distanceM += step;
                    }
                }
                if (speed > maxSpeedMs) {
                    maxSpeedMs = speed;
                }
            }
            lastGood = location;
        }
        if (now - lastNotificationAt > 5000) {
            lastNotificationAt = now;
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.notify(NOTIFICATION_ID, buildNotification(String.format(Locale.forLanguageTag("es-ES"),
                    "%.1f km · %.0f km/h", distanceM / 1000.0, speedMs * 3.6)));
        }
        publish(true);
        long idle = now - lastMovingAt;
        if (auto && idle > AUTO_STOP_IDLE_MS) {
            stopRecording(false);
        } else if (vehicleExitAt > 0 && now - vehicleExitAt > AFTER_EXIT_IDLE_MS && idle > AFTER_EXIT_IDLE_MS) {
            stopRecording(false);
        } else if (!auto && idle > MANUAL_STOP_IDLE_MS) {
            stopRecording(false);
        }
    }

    private void publish(boolean recording) {
        Snapshot snapshot = new Snapshot(tripId, startedAt, distanceM, speedMs, maxSpeedMs, points, auto, recording);
        lastSnapshot = snapshot;
        Listener current = listener;
        if (current != null) {
            current.onUpdate(snapshot);
        }
    }

    private void stopRecording(boolean discard) {
        if (client != null && callback != null) {
            client.removeLocationUpdates(callback);
        }
        callback = null;
        if (tripId != null) {
            boolean tooShort = auto && distanceM < MIN_AUTO_DISTANCE_M;
            try {
                TripStore.finish(this, tripId, distanceM, discard || tooShort);
            } catch (Exception error) {
                TripStore.delete(this, tripId);
            }
            publish(false);
            tripId = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (tripId != null) {
            stopRecording(false);
        }
        super.onDestroy();
    }

    private Notification buildNotification(String text) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Viajes", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Aviso mientras Gasolinera+ graba un viaje con el GPS");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, TripService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String title = "Grabando viaje";
        if (auto) {
            title = "Viaje detectado · grabando";
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat_trip)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openPending)
                .addAction(0, "Terminar viaje", stopPending)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                .build();
    }
}
