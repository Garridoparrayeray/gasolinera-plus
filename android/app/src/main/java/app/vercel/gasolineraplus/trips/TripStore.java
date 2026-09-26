package app.vercel.gasolineraplus.trips;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public final class TripStore {
    private static final String PREFS = "trip_recorder";
    private static final String KEY_CURRENT = "current_trip";
    private static final String KEY_AUTO_DETECT = "auto_detect";

    private TripStore() {
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static File dir(Context context) {
        File dir = new File(context.getFilesDir(), "trips");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    static File pointsFile(Context context, String id) {
        return new File(dir(context), id + ".csv");
    }

    static File metaFile(Context context, String id) {
        return new File(dir(context), id + ".json");
    }

    public static String currentTripId(Context context) {
        return prefs(context).getString(KEY_CURRENT, null);
    }

    public static boolean isAutoDetectEnabled(Context context) {
        return prefs(context).getBoolean(KEY_AUTO_DETECT, false);
    }

    public static void setAutoDetectEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_AUTO_DETECT, enabled).apply();
    }

    static synchronized String begin(Context context, boolean auto, String vehicleId) throws IOException, JSONException {
        String id = System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);
        JSONObject meta = new JSONObject();
        meta.put("id", id);
        meta.put("startedAt", System.currentTimeMillis());
        meta.put("auto", auto);
        if (vehicleId != null) {
            meta.put("vehicleId", vehicleId);
        }
        meta.put("finished", false);
        writeText(metaFile(context, id), meta.toString());
        pointsFile(context, id).createNewFile();
        prefs(context).edit().putString(KEY_CURRENT, id).apply();
        return id;
    }

    static synchronized void append(Context context, String id, List<Location> locations) throws IOException {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(pointsFile(context, id), true))) {
            for (Location location : locations) {
                float speed = -1f;
                if (location.hasSpeed()) {
                    speed = location.getSpeed();
                }
                float speedAccuracy = -1f;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
                    speedAccuracy = location.getSpeedAccuracyMetersPerSecond();
                }
                float bearing = -1f;
                if (location.hasBearing()) {
                    bearing = location.getBearing();
                }
                double altitude = 0;
                if (location.hasAltitude()) {
                    altitude = location.getAltitude();
                }
                writer.write(String.format(Locale.US, "%d,%.7f,%.7f,%.1f,%.2f,%.2f,%.1f,%.1f%n",
                        location.getTime(), location.getLatitude(), location.getLongitude(), location.getAccuracy(),
                        speed, speedAccuracy, bearing, altitude));
            }
        }
    }

    static synchronized JSONObject finish(Context context, String id, double distanceMeters, boolean discard) throws IOException, JSONException {
        prefs(context).edit().remove(KEY_CURRENT).apply();
        if (discard) {
            delete(context, id);
            return null;
        }
        JSONObject meta = readMeta(context, id);
        meta.put("endedAt", System.currentTimeMillis());
        meta.put("finished", true);
        meta.put("distanceM", distanceMeters);
        writeText(metaFile(context, id), meta.toString());
        return meta;
    }

    static JSONObject readMeta(Context context, String id) throws IOException, JSONException {
        return new JSONObject(readText(metaFile(context, id)));
    }

    public static synchronized JSONArray listFinished(Context context) throws IOException, JSONException {
        JSONArray out = new JSONArray();
        File[] files = dir(context).listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return out;
        }
        List<JSONObject> metas = new ArrayList<>();
        for (File file : files) {
            JSONObject meta = new JSONObject(readText(file));
            if (meta.optBoolean("finished", false)) {
                metas.add(meta);
            }
        }
        metas.sort((a, b) -> Long.compare(a.optLong("startedAt"), b.optLong("startedAt")));
        for (JSONObject meta : metas) {
            out.put(meta);
        }
        return out;
    }

    public static synchronized JSONArray readPoints(Context context, String id) throws IOException, JSONException {
        JSONArray points = new JSONArray();
        File file = pointsFile(context, id);
        if (!file.exists()) {
            return points;
        }
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split(",");
                if (parts.length < 8) {
                    continue;
                }
                JSONArray point = new JSONArray();
                point.put(Long.parseLong(parts[0]));
                point.put(Double.parseDouble(parts[1]));
                point.put(Double.parseDouble(parts[2]));
                point.put(Double.parseDouble(parts[3]));
                point.put(Double.parseDouble(parts[4]));
                point.put(Double.parseDouble(parts[5]));
                point.put(Double.parseDouble(parts[6]));
                point.put(Double.parseDouble(parts[7]));
                points.put(point);
            }
        }
        return points;
    }

    public static synchronized void delete(Context context, String id) {
        pointsFile(context, id).delete();
        metaFile(context, id).delete();
    }

    private static String readText(File file) throws IOException {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private static void writeText(File file, String text) throws IOException {
        Files.write(file.toPath(), text.getBytes(StandardCharsets.UTF_8));
    }
}
