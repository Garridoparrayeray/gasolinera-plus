package app.vercel.gasolineraplus.trips;

import android.Manifest;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

public class BluetoothReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String saved = TripStore.bluetoothAddress(context);
        if (saved == null) {
            return;
        }
        BluetoothDevice device;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
        } else {
            device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
        }
        if (device == null || !saved.equalsIgnoreCase(device.getAddress())) {
            return;
        }
        String action = intent.getAction();
        if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action)) {
            onCarConnected(context);
        } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
            ActivityTransitionReceiver.onExitVehicle(context);
        }
    }

    private static void onCarConnected(Context context) {
        if (TripStore.currentTripId(context) != null) {
            return;
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            TripService.start(context, true, null);
        } catch (RuntimeException error) {
        }
    }
}
