import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mainActivityPath = path.join(
  root,
  "android",
  "app",
  "src",
  "main",
  "java",
  "com",
  "opollmarket",
  "app",
  "MainActivity.java"
);

if (!fs.existsSync(path.dirname(mainActivityPath))) {
  console.log("Android source directory not found, skipping MainActivity patch.");
  process.exit(0);
}

const mainActivityContent = `package com.opollmarket.app;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.Plugin;
import android.content.Intent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

// ModifiedMainActivityForSocialLoginPlugin is VERY VERY important !!!!!!
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

      @Override
      public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
          PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
          if (pluginHandle == null) {
            Log.i("Google Activity Result", "SocialLogin login handle is null");
            return;
          }
          Plugin plugin = pluginHandle.getInstance();
          if (!(plugin instanceof SocialLoginPlugin)) {
            Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
            return;
          }
          ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
      }

      // This function will never be called, leave it empty
      @Override
      public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
`;

fs.writeFileSync(mainActivityPath, mainActivityContent, "utf8");
console.log("Android MainActivity patch complete.");
