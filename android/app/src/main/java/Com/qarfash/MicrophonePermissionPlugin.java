package Com.qarfash;

import android.Manifest;
import android.media.MediaRecorder;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;

@CapacitorPlugin(
    name = "MicrophonePermission",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class MicrophonePermissionPlugin extends Plugin {
    private MediaRecorder recorder;
    private File recordingFile;

    private void resolveWithStatus(PluginCall call, String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveWithStatus(call, "granted");
            return;
        }
        requestPermissionForAlias("microphone", call, "permissionCallback");
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        String status = getPermissionState("microphone") == PermissionState.GRANTED ? "granted" : "denied";
        resolveWithStatus(call, status);
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "startCaptureAfterPermission");
            return;
        }
        beginCapture(call);
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        if (recorder == null || recordingFile == null) {
            call.reject("MICROPHONE_NOT_RECORDING");
            return;
        }

        File completedFile = recordingFile;
        try {
            recorder.stop();
            releaseRecorder();

            FileInputStream input = new FileInputStream(completedFile);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            input.close();

            JSObject result = new JSObject();
            result.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            result.put("mimeType", "audio/mp4");
            result.put("filename", "رسالة-صوتية-" + System.currentTimeMillis() + ".m4a");
            call.resolve(result);
        } catch (Exception error) {
            releaseRecorder();
            call.reject("MICROPHONE_STOP_FAILED", error);
        } finally {
            if (completedFile.exists()) completedFile.delete();
            recordingFile = null;
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveWithStatus(call, "granted");
        } else {
            resolveWithStatus(call, "denied");
        }
    }

    @PermissionCallback
    private void startCaptureAfterPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginCapture(call);
        } else {
            call.reject("MICROPHONE_DENIED");
        }
    }

    private void beginCapture(PluginCall call) {
        if (recorder != null) {
            call.reject("MICROPHONE_RECORDING_IN_PROGRESS");
            return;
        }

        try {
            recordingFile = File.createTempFile("alpha-byte-voice-", ".m4a", getContext().getCacheDir());
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(96000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(recordingFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            JSObject result = new JSObject();
            result.put("status", "started");
            call.resolve(result);
        } catch (Exception error) {
            File failedFile = recordingFile;
            releaseRecorder();
            recordingFile = null;
            if (failedFile != null && failedFile.exists()) failedFile.delete();
            call.reject("MICROPHONE_START_FAILED", error);
        }
    }

    private void releaseRecorder() {
        if (recorder != null) {
            try { recorder.reset(); } catch (Exception ignored) { }
            try { recorder.release(); } catch (Exception ignored) { }
            recorder = null;
        }
    }
}
