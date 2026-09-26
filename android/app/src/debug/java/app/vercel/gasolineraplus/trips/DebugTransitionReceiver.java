package app.vercel.gasolineraplus.trips;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class DebugTransitionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String state = intent.getStringExtra("state");
        if ("enter".equals(state)) {
            ActivityTransitionReceiver.onEnterVehicle(context);
        } else if ("exit".equals(state)) {
            ActivityTransitionReceiver.onExitVehicle(context);
        }
    }
}
