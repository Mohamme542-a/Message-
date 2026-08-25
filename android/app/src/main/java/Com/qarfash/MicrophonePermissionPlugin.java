package Com.qarfash;

import android.Manifest;

import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MicrophonePermission",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class MicrophonePermissionPlugin extends Plugin {
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

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            resolveWithStatus(call, "granted");
        } else {
            resolveWithStatus(call, "denied");
        }
    }
}
