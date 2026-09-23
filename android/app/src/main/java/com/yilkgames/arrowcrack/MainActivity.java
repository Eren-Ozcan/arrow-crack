package com.yilkgames.arrowcrack;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Audio focus is the one thing a WebView cannot ask for itself
        // (AUDIO.md 4); every rule about what to do with it is in TypeScript.
        registerPlugin(AudioFocusPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
