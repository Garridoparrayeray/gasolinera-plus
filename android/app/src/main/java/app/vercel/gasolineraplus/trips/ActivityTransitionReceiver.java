package app.vercel.gasolineraplus.trips;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;

public class ActivityTransitionReceiver extends BroadcastReceiver {
    public static final String ACTION = "app.vercel.gasolineraplus.trips.TRANSITION";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TripStore.isAutoDetectEnabled(context) || !ActivityTransitionResult.hasResult(intent)) {
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

    static void onEnterVehicle(Context context) {
        if (TripStore.currentTripId(context) != null || !AutoDetect.hasPermissions(context)) {
            return;
        }
        TripService.start(context, true, null);
    }

    static void onExitVehicle(Context context) {
        if (TripStore.currentTripId(context) == null) {
            return;
        }
        TripService.sendAction(context, TripService.ACTION_VEHICLE_EXIT);
    }
}
