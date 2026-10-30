/**
 * WhisperPlugin.kt
 *
 * PREPARED, NOT COMPILED OR RUN -- see PREPARED-NOT-VERIFIED.md at the
 * repo root. Written against Capacitor's real, documented Plugin API
 * (@CapacitorPlugin annotation, Plugin base class, @PluginMethod,
 * PluginCall.resolve/reject) and whisper.cpp's real, documented public
 * C API (whisper_init_from_file, whisper_full, whisper_full_get_segment_text
 * -- genuine function names from the actual project, not invented).
 * The JNI bridge below (WhisperBridge) is the one piece that
 * genuinely needs a real NDK build + real device test before trusting
 * it -- everything about JNI's actual calling-convention correctness
 * can only be proven by compiling it.
 *
 * WHAT THIS IS FOR: a real, on-device, offline transcription path --
 * the thing raw Web APIs structurally cannot give Eravos (see the
 * conversation this was designed in: Web Speech API is real but
 * cloud-based and has zero accent control; this is real, local,
 * accent-model-selectable Whisper, callable from the same JS call flow
 * already wired into eravos-kernel.js).
 */
package com.eravos.whisper

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "Whisper")
class WhisperPlugin : Plugin() {

    private var bridge: WhisperBridge? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    /**
     * loadModel({ modelPath: string }) -> { ok: boolean }
     * modelPath: absolute path to a .bin ggml model file already
     * downloaded to device storage (models are 100MB-1.5GB depending
     * on size -- NOT bundled in the APK; see PREPARED-NOT-VERIFIED.md's
     * real model-download-on-first-run plan).
     */
    @PluginMethod
    fun loadModel(call: PluginCall) {
        val modelPath = call.getString("modelPath")
        if (modelPath == null) {
            call.reject("modelPath is required")
            return
        }
        scope.launch {
            try {
                bridge = WhisperBridge(modelPath)
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e("WhisperPlugin", "loadModel failed", e)
                call.reject("Failed to load model: ${e.message}", e)
            }
        }
    }

    /**
     * transcribe({ pcmBase64: string, sampleRate: number, language: string })
     *   -> { text: string, durationMs: number }
     * pcmBase64: raw 16-bit PCM mono audio, base64-encoded. Getting
     * real PCM samples out of a MediaStream on Android needs
     * AudioRecord (native) or an AudioWorklet-equivalent bridge from
     * the WebView side -- NOT built here, see next-steps.
     */
    @PluginMethod
    fun transcribe(call: PluginCall) {
        val b = bridge
        if (b == null) {
            call.reject("Model not loaded -- call loadModel() first")
            return
        }
        val pcmBase64 = call.getString("pcmBase64")
        val language = call.getString("language", "en")
        if (pcmBase64 == null) {
            call.reject("pcmBase64 is required")
            return
        }
        scope.launch {
            try {
                val start = System.currentTimeMillis()
                val pcm = android.util.Base64.decode(pcmBase64, android.util.Base64.DEFAULT)
                val text = b.transcribePcm16(pcm, language)
                val ret = JSObject()
                ret.put("text", text)
                ret.put("durationMs", System.currentTimeMillis() - start)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e("WhisperPlugin", "transcribe failed", e)
                call.reject("Transcription failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun unloadModel(call: PluginCall) {
        bridge?.release()
        bridge = null
        call.resolve()
    }
}

/**
 * WhisperBridge -- the actual JNI boundary. Function names on the
 * Kotlin side (`init`, `transcribe`, `free`) map to native functions
 * declared `extern "C"` in whisper_jni.cpp, which itself calls
 * whisper.cpp's real public API (whisper_init_from_file_with_params,
 * whisper_full, whisper_full_n_segments, whisper_full_get_segment_text).
 *
 * `System.loadLibrary("whisper_jni")` expects a real compiled
 * .so per real Android CPU ABI (arm64-v8a covers the overwhelming
 * majority of real Android phones; armeabi-v7a for older/budget
 * devices, x86_64 only matters for the emulator) -- produced by a real
 * NDK build of whisper_jni.cpp against a real, separately-compiled
 * whisper.cpp static library. None of that compilation has happened
 * here -- see PREPARED-NOT-VERIFIED.md.
 */
class WhisperBridge(modelPath: String) {
    private val nativeHandle: Long

    init {
        System.loadLibrary("whisper_jni")
        nativeHandle = nativeInit(modelPath)
        if (nativeHandle == 0L) {
            throw RuntimeException("whisper_init_from_file failed for path: $modelPath")
        }
    }

    fun transcribePcm16(pcm: ByteArray, language: String): String {
        return nativeTranscribe(nativeHandle, pcm, language)
    }

    fun release() {
        if (nativeHandle != 0L) nativeFree(nativeHandle)
    }

    private external fun nativeInit(modelPath: String): Long
    private external fun nativeTranscribe(handle: Long, pcm: ByteArray, language: String): String
    private external fun nativeFree(handle: Long)
}
