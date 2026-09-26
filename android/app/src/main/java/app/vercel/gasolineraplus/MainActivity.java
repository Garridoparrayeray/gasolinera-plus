package app.vercel.gasolineraplus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.vercel.gasolineraplus.trips.TripRecorderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TripRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
