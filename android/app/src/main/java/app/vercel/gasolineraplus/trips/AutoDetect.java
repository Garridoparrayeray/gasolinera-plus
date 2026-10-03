package app.vercel.gasolineraplus.trips;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityRecognitionClient;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.tasks.Task;

import java.util.ArrayList;
import java.util.List;

public final class AutoDetect {
    private static final long SAMPLE_INTERVAL_MS = 60 * 1000L;

    private AutoDetect() {
    }

    static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, ActivityTransitionReceiver.class);
        intent.setAction(ActivityTransitionReceiver.ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }

    static PendingIntent samplingIntent(Context context) {
        Intent intent = new Intent(context, ActivityTransitionReceiver.class);
        intent.setAction(ActivityTransitionReceiver.ACTION_SAMPLE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(context, 1, intent, flags);
    }

    public static boolean hasPermissions(Context context) {
        boolean location = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean background = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            background = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
        boolean activity = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            activity = ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
        }
        return location && background && activity;
    }

    public static Task<Void> enable(Context context) {
        List<ActivityTransition> transitions = new ArrayList<>();
        transitions.add(new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                .build());
        transitions.add(new ActivityTransition.Builder()
                .setActivityType(DetectedActivity.IN_VEHICLE)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
                .build());
        ActivityTransitionRequest request = new ActivityTransitionRequest(transitions);
        ActivityRecognitionClient client = ActivityRecognition.getClient(context);
        // Las transiciones solo avisan al subir o bajar del coche; el muestreo periódico
        // detecta también el viaje que ya estaba en marcha al activar la opción.
        return client.requestActivityTransitionUpdates(request, pendingIntent(context))
                .continueWithTask((task) -> client.requestActivityUpdates(SAMPLE_INTERVAL_MS, samplingIntent(context)));
    }

    public static Task<Void> disable(Context context) {
        ActivityRecognitionClient client = ActivityRecognition.getClient(context);
        return client.removeActivityTransitionUpdates(pendingIntent(context))
                .continueWithTask((task) -> client.removeActivityUpdates(samplingIntent(context)));
    }
}
