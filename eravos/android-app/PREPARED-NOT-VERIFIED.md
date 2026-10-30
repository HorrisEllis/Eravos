# PREPARED, NOT VERIFIED

Everything under `android-app/` was written correctly as far as it can
be reasoned through against real, documented APIs (Capacitor's real
Plugin API, whisper.cpp's real public C functions, Android's real
permission model) — but it has not been compiled, built, or run. No
Android SDK, no NDK, no device or emulator was available in the
environment this was written in. This is different from everything
else in this whole project, which was built and then actually run to
prove it worked. Say so plainly rather than let this file blend in
with the rest.

## What's real and correct as written

- `capacitor.config.json` — matches Capacitor's real, documented config
  shape, points at the actual `eravos/` folder as-is.
- `AndroidManifest-additions.xml` — real, specific permissions for what
  this app genuinely needs (mic, camera, foreground service for
  background mic access — the actual reason a native app is worth
  building over the web version).
- `WhisperPlugin.kt` — real Capacitor `@CapacitorPlugin`/`@PluginMethod`
  shape.
- `whisper_jni.cpp` — calls whisper.cpp's real public API
  (`whisper_init_from_file_with_params`, `whisper_full`,
  `whisper_full_get_segment_text`) with correct real function
  signatures.

## What's genuinely unverified and needs real testing

1. **JNI marshalling correctness** — the `jbyteArray` -> `float` PCM
   conversion in `whisper_jni.cpp` is written the way whisper.cpp's own
   documentation describes, but JNI bugs (buffer alignment, string
   lifetime) only ever show up by actually compiling and running on a
   device. Untested.

2. **whisper.cpp itself isn't vendored here.** The real project
   (`ggerganov/whisper.cpp`) needs to be added as a real dependency
   (`git submodule add`) before `CMakeLists.txt`'s `add_subdirectory()`
   call resolves to anything.

3. **PCM capture and resampling isn't built.** `whisper_jni.cpp`
   assumes it's handed 16kHz mono 16-bit PCM. Getting real audio
   samples out of a `MediaStream` inside a Capacitor WebView and into
   native code, resampled to 16kHz, is a real, separate piece of work
   — most likely a second small native bridge using Android's
   `AudioRecord` directly (bypassing the WebView's `MediaStream`
   entirely for the *transcription* path, while the WebView's own
   `clarity-engine.js` still handles what you actually *hear*).

4. **Model download/storage.** Whisper models are 100MB-1.5GB and
   should not ship inside the APK. Real next step: download the chosen
   model (`small` or `base` for real-time-usable speed on phone
   hardware -- `medium`, used for the desktop path, is likely too slow
   on-device) on first run, store it in app-private storage, pass that
   real path to `loadModel()`.

5. **GPU/NNAPI acceleration is off.** whisper.cpp genuinely supports
   it on Android, but validating it needs a real device -- left as
   CPU-only (`cparams.use_gpu = false`) until base transcription is
   confirmed working at all.

6. **`ClarityForegroundService`** is referenced in the manifest but not
   implemented -- a real Android foreground `Service` class needs
   writing so mic access survives backgrounding.

## The realistic build order, when this gets picked up

1. `npx cap add android` for real, merge in the manifest additions.
2. Confirm the existing web app (with `clarity-engine.js` already
   wired into `attachRemoteStream()`) runs correctly inside the
   Capacitor WebView first -- this part should mostly just work, since
   it's real, already-tested web code.
3. Vendor real whisper.cpp, get `whisper_jni.cpp` actually compiling.
4. Build the PCM capture path (native `AudioRecord`, not the WebView).
5. Wire `WhisperPlugin`'s JS-side call from `eravos-kernel.js` -- most
   likely as an *additional* transcription path alongside the existing
   browser `SpeechRecognition` one, not a replacement, given Eravos's
   real "both sides transcribe, it merges into one shared record"
   design (see `MAP.md`'s note on this).
6. Only then: real device testing, accuracy tuning, model size
   tradeoffs.
