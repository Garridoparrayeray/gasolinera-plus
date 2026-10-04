package app.vercel.gasolineraplus.trips;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;

import com.google.android.gms.location.ActivityRecognitionResult;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;

public class ActivityTransitionReceiver extends BroadcastReceiver {
    public static final String ACTION = "app.vercel.gasolineraplus.trips.TRANSITION";
    public static final String ACTION_SAMPLE = "app.vercel.gasolineraplus.trips.SAMPLE";
    private static final int MIN_CONFIDENCE = 75;
    private static final long MAX_SAMPLE_AGE_MS = 2 * 60 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TripStore.isAutoDetectEnabled(context)) {
            return;
        }
        if (ActivityRecognitionResult.hasResult(intent)) {
            onSample(context, ActivityRecognitionResult.extractResult(intent));
            return;
        }
        if (!ActivityTransitionResult.hasResult(intent)) {
            return;
        }
        ActivityTransitionResult result = ActivityTransitionResult.extractResult(intent);
        if (result == null) {
            return;
        }
        for (ActivityTransitionEvent event : result.getTransitionEvents()) {
            if (event.getActivityType() != DetectedActivity.IN_VEHICLE) {
                continue;
            }
            if (event.getTransitionType() == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
                onEnterVehicle(context);
            } else {
                onExitVehicle(context);
            }
        }
    }

    private static void onSample(Context context, ActivityRecognitionResult result) {
        if (result == null) {
            return;
        }
        // Al registrarse, Google entrega enseguida la última actividad que conocía: si es vieja no vale.
        if (SystemClock.elapsedRealtime() - result.getElapsedRealtimeMillis() > MAX_SAMPLE_AGE_MS) {
            return;
        }
        DetectedActivity activity = result.getMostProbableActivity();
        if (activity == null || activity.getConfidence() < MIN_CONFIDENCE) {
            return;
        }
        int type = activity.getType();
        if (type == DetectedActivity.IN_VEHICLE) {
            onEnterVehicle(context);
        } else if (type == DetectedActivity.ON_FOOT || type == DetectedActivity.WALKING || type == DetectedActivity.RUNNING) {
            onExitVehicle(context);
        }
    }

    static void onEnterVehicle(Context context) {
        if (TripStore.currentTripId(context) != null || !AutoDetect.hasPermissions(context)) {
            return;
        }
        TripService.start(context, true, null, true);
    }

    static void onExitVehicle(Context context) {
        onExitVehicle(context, false);
    }

    // Con el Bluetooth del coche la salida es segura y el viaje termina en un minuto.
    static void onExitVehicle(Context context, boolean quick) {
        if (TripStore.currentTripId(context) == null) {
            return;
        }
        TripService.sendAction(context, TripService.ACTION_VEHICLE_EXIT, quick);
    }
}
