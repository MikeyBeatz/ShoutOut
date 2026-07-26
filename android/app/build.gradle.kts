import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val shoutOutKeystoreProperties = Properties()
val shoutOutKeystorePropertiesFile = rootProject.file("key.properties")
if (shoutOutKeystorePropertiesFile.exists()) {
    FileInputStream(shoutOutKeystorePropertiesFile).use {
        shoutOutKeystoreProperties.load(it)
    }
}

android {
    namespace = "cz.shoutout.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "cz.shoutout.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (shoutOutKeystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = shoutOutKeystoreProperties.getProperty("keyAlias")
                keyPassword = shoutOutKeystoreProperties.getProperty("keyPassword")
                storeFile = file(shoutOutKeystoreProperties.getProperty("storeFile"))
                storePassword = shoutOutKeystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // Never sign a distributable build with Flutter's shared debug key.
            // A missing key.properties intentionally produces an unsigned build.
            signingConfig = signingConfigs.findByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
