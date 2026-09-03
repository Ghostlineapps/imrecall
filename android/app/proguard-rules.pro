# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Capacitor ---
# Capacitor's bridge discovers and invokes plugin classes/methods via Java
# reflection (capacitor.plugins.json lists class names, @PluginMethod-annotated
# methods are called by name at runtime). Without these keep rules, R8/ProGuard
# renames or strips those classes/methods in the minified release build, so the
# reflection lookup fails at runtime and crashes the app the moment a plugin
# method (e.g. Geolocation.requestPermissions()) is actually invoked — this is
# what caused the app to close right after the location permission was granted
# (2026-08-28).
-keep class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keepclassmembers public class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep class com.capacitorjs.plugins.** { *; }

-dontwarn com.getcapacitor.**
-dontwarn com.capacitorjs.plugins.**
