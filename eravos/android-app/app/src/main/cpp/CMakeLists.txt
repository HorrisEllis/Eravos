# PREPARED, NOT BUILT -- see PREPARED-NOT-VERIFIED.md.
#
# Real CMake structure for building whisper_jni.cpp against a real
# whisper.cpp checkout. whisper.cpp itself is NOT vendored here --
# real next step: `git submodule add https://github.com/ggerganov/whisper.cpp`
# into android-app/app/src/main/cpp/whisper.cpp/, then this file's
# add_subdirectory() call below will pick up its own real, existing
# CMakeLists.txt (whisper.cpp already ships one, this isn't inventing
# a build for a project that doesn't have one).

cmake_minimum_required(VERSION 3.22.1)
project(eravos_whisper)

set(CMAKE_CXX_STANDARD 17)

# real whisper.cpp checkout expected at this path -- not present yet
add_subdirectory(whisper.cpp)

add_library(whisper_jni SHARED
    whisper_jni.cpp
)

target_link_libraries(whisper_jni
    whisper
    android
    log
)

target_include_directories(whisper_jni PRIVATE
    whisper.cpp
)
