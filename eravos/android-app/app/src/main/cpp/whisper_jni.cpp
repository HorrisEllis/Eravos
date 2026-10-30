/**
 * whisper_jni.cpp
 *
 * PREPARED, NOT COMPILED -- see PREPARED-NOT-VERIFIED.md at the repo
 * root. This calls whisper.cpp's real, public, documented C API --
 * whisper_init_from_file_with_params, whisper_full_default_params,
 * whisper_full, whisper_full_n_segments, whisper_full_get_segment_text,
 * whisper_free -- genuine function signatures from the actual
 * ggerganov/whisper.cpp project, not invented. What's genuinely
 * untested is the JNI marshalling around them (jbyteArray <-> float
 * PCM conversion, jstring handling) -- that class of bug only shows up
 * at actual compile+run time, real NDK toolchain, real device.
 *
 * Build requirement (not done here): whisper.cpp itself must be built
 * as a static library first (its own CMakeLists.txt, real, already
 * exists in the real project) and linked against this file via the
 * app's CMakeLists.txt (see the companion file in this same directory).
 */

#include <jni.h>
#include <string>
#include <vector>
#include "whisper.h"  // whisper.cpp's real public header

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_eravos_whisper_WhisperBridge_nativeInit(JNIEnv *env, jobject /* this */, jstring modelPath) {
    const char *path = env->GetStringUTFChars(modelPath, nullptr);

    struct whisper_context_params cparams = whisper_context_default_params();
    // GPU/NNAPI acceleration is real and available in whisper.cpp for
    // Android, but left off here deliberately -- getting it working
    // requires a device-specific NNAPI validation pass this couldn't
    // do without a real device. CPU-only is the safe, correct starting
    // point; revisit once base transcription is confirmed working.
    cparams.use_gpu = false;

    struct whisper_context *ctx = whisper_init_from_file_with_params(path, cparams);
    env->ReleaseStringUTFChars(modelPath, path);

    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT jstring JNICALL
Java_com_eravos_whisper_WhisperBridge_nativeTranscribe(
    JNIEnv *env, jobject /* this */, jlong handle, jbyteArray pcmBytes, jstring language) {

    auto *ctx = reinterpret_cast<whisper_context *>(handle);
    if (ctx == nullptr) {
        return env->NewStringUTF("");
    }

    // Real PCM conversion: whisper.cpp's public API expects 16kHz mono
    // float32 samples in [-1, 1] -- the input here is assumed to
    // already be 16-bit signed PCM at 16kHz mono (resampling to 16kHz
    // is the caller's job, on the Kotlin/AudioRecord side, NOT done
    // here -- a real, separate, unverified step, see next-steps).
    jsize len = env->GetArrayLength(pcmBytes);
    jbyte *raw = env->GetByteArrayElements(pcmBytes, nullptr);

    std::vector<float> samples(len / 2);
    const int16_t *pcm16 = reinterpret_cast<const int16_t *>(raw);
    for (jsize i = 0; i < len / 2; i++) {
        samples[i] = static_cast<float>(pcm16[i]) / 32768.0f;
    }
    env->ReleaseByteArrayElements(pcmBytes, raw, JNI_ABORT);

    const char *lang = env->GetStringUTFChars(language, nullptr);

    struct whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wparams.language = lang;
    wparams.n_threads = 4; // real default worth tuning per-device -- see next-steps
    wparams.print_progress = false;
    wparams.print_special = false;

    int result = whisper_full(ctx, wparams, samples.data(), samples.size());
    env->ReleaseStringUTFChars(language, lang);

    if (result != 0) {
        return env->NewStringUTF("");
    }

    std::string fullText;
    const int n_segments = whisper_full_n_segments(ctx);
    for (int i = 0; i < n_segments; i++) {
        fullText += whisper_full_get_segment_text(ctx, i);
    }

    return env->NewStringUTF(fullText.c_str());
}

JNIEXPORT void JNICALL
Java_com_eravos_whisper_WhisperBridge_nativeFree(JNIEnv *env, jobject /* this */, jlong handle) {
    auto *ctx = reinterpret_cast<whisper_context *>(handle);
    if (ctx != nullptr) {
        whisper_free(ctx);
    }
}

} // extern "C"
