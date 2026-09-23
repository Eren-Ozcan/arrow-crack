package com.yilkgames.arrowcrack;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android audio focus for a WebView game (AUDIO.md 4). Web Audio never asks
 * the platform for focus on its own, so without this the music plays over a
 * call and over another app's podcast, and nothing tells the game to get out
 * of the way.
 *
 * The plugin owns nothing but the request: every decision about what to do
 * with a change is made in TypeScript (`src/audio/focus.ts`), so the rule is
 * testable without a device.
 */
@CapacitorPlugin(name = "AudioFocus")
public class AudioFocusPlugin extends Plugin {
    private static final String EVENT = "audioFocusChange";

    private AudioManager audioManager;
    private AudioFocusRequest request;
    private AudioManager.OnAudioFocusChangeListener listener;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        listener = change -> notifyListeners(EVENT, changeEvent(change));
    }

    @PluginMethod
    public void request(PluginCall call) {
        JSObject result = new JSObject();
        if (audioManager == null) {
            result.put("granted", false);
            call.resolve(result);
            return;
        }

        int granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (request == null) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
                // GAIN, not GAIN_TRANSIENT: the loop plays for as long as the
                // player is in the game, and a call takes it away by itself.
                request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attributes)
                    .setWillPauseWhenDucked(false)
                    .setOnAudioFocusChangeListener(listener)
                    .build();
            }
            granted = audioManager.requestAudioFocus(request);
        } else {
            granted = audioManager.requestAudioFocus(
                listener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
        }

        result.put("granted", granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void abandon(PluginCall call) {
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (request != null) audioManager.abandonAudioFocusRequest(request);
            } else {
                audioManager.abandonAudioFocus(listener);
            }
        }
        call.resolve();
    }

    /** Android's own names, passed through untranslated (AUDIO.md 4). */
    private JSObject changeEvent(int change) {
        String name;
        switch (change) {
            case AudioManager.AUDIOFOCUS_GAIN:
                name = "gained";
                break;
            case AudioManager.AUDIOFOCUS_LOSS:
                name = "lost";
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                name = "lostTransient";
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                name = "ducked";
                break;
            default:
                name = "gained";
                break;
        }

        JSObject data = new JSObject();
        data.put("change", name);
        return data;
    }
}
