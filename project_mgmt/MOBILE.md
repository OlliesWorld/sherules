# SheRules — Mobile app

The iOS and Android app. It's the website's question-asking UI, built as a static single-page app and wrapped in native shells with [Capacitor](https://capacitorjs.com). The app ships its own UI and talks to the website's JSON API for data and answers.

## How it fits together

```
mobile/                    the app (its own SvelteKit project, an npm workspace)
  src/                     screens and the API client (src/lib/api.ts)
  shared -> ../src/lib     symlink: the website's components, labels, types and theme
  build/                   static output (gitignored); Capacitor copies it into the native apps
  ios/, android/           the native projects (committed; their build output is gitignored)
  assets/                  source art for the icon and splash screens
  capacitor.config.ts      app id, splash and system bar settings
src/routes/api/v1/         the API the app calls (lives in the website)
```

- **Shared code:** components, labels, types and `layout.css` come from the website through `mobile/shared`, imported as `#lib/*`. A fix there applies to both. App-only code is `#mobile/*`.
- **API:** `GET /api/v1/sports`, `/sports/:sport`, `/sports/:sport/:league`; `POST /api/v1/install` (install token); `POST /api/v1/ask`. CORS allows only the app's origins (`capacitor://localhost` on iOS, `https://localhost` on Android, `http://localhost:5174` for dev).
- **API contract:** installed app versions stay in use for months, so `/api/v1` responses only ever gain fields. A breaking change needs `/api/v2`.
- **Daily limits:** the app counts per install, not per IP: 5 questions per install, at most 25 per IP across installs, 5 new installs per IP, and its own site-wide caps (300 questions, 1,200 league guesses), separate from the website's 500. See `appGate` in `src/lib/server/rate-limit.ts` and `src/lib/server/install-token.ts`.
- **Voice** isn't in the app yet.

## Running it in a browser

```sh
npm run dev          # the website and API on :5173 (keys exported)
npm run mobile:dev   # the app on :5174
```

Or against production, with nothing else running (questions are real and count against the limits):

```sh
VITE_API_BASE=https://sherules.olliesworld.xyz npm run mobile:dev
```

Use Safari's Responsive Design Mode (Develop menu) for an iPhone-sized WebKit view, which is closest to the real app.

## Running it on a phone or emulator

After any change to the app, `npm run mobile:sync` builds it and copies it into both native projects. Native builds use the production API.

**Android** (needs Android Studio, which includes the Java the build uses). Capacitor 8 builds with Android Gradle Plugin 8.13, so Android Studio must be recent enough to support it. Older versions (2024.3 "Meerkat" and earlier) refuse the project with "incompatible version (AGP 8.13.0)"; update through Android Studio → Check for Updates. Recent Android Studio bundles Java 25, which the project's Gradle (8.14) doesn't support: when it asks for a Gradle JVM, pick **Use JVM 21** (or Settings → Build Tools → Gradle → Gradle JDK → Download JDK → 21). `gradle/gradle-daemon-jvm.properties` pins Gradle to Java 21 for terminal builds too. **Don't accept Android Studio's offer to upgrade the Android Gradle Plugin**: Capacitor 8 needs AGP 8.x, and AGP 9 fails with errors like "getDefaultProguardFile('proguard-android.txt') is no longer supported". Stay on the versions `npx cap add android` generates until a Capacitor release moves them. The "flatDir should be avoided" warning comes from Capacitor's template and is harmless.

```sh
npm run mobile:sync
npm run mobile:android   # opens Android Studio; press Run for an emulator or a USB phone
```

From the terminal instead:

```sh
cd mobile/android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

If a build fails with "Failed to exec spawn helper" (or "AAPT2 … Daemon startup failed") after updating Android Studio, a Gradle daemon is still running on the old Java: run `./gradlew --stop` in `mobile/android` and build again.

**iOS** (needs the full Xcode app from the Mac App Store, not just the command-line tools):

```sh
npm run mobile:sync
npm run mobile:ios       # opens Xcode; pick a simulator or a plugged-in iPhone, press Run
```

A real iPhone also needs a signing team (Xcode → the App target → Signing & Capabilities). A free Apple ID works for your own phone; the App Store needs the paid developer account.

## Icons and splash screens

The source art is in `mobile/assets/`. It's currently a placeholder made from the site's whistle logo. To replace it, overwrite the files with the same names and sizes, then run `npm run assets -w mobile` and `npm run mobile:sync`:

| File | Size | Notes |
|---|---|---|
| `icon-only.png` | 1024×1024 | iOS icon and Android fallback. No transparency, square corners |
| `icon-foreground.png` | 1024×1024 | Android adaptive icon foreground, transparent; keep the mark in the middle ~60% |
| `icon-background.png` | 1024×1024 | Android adaptive icon background (solid teal) |
| `splash.png`, `splash-dark.png` | 2732×2732 | Logo centered; edges get cropped on narrow screens |

## Native details worth knowing

- **App id** `xyz.olliesworld.sherules` (in `capacitor.config.ts`). Free to change until the app is first uploaded to a store; permanent after that.
- **Splash** stays up until the first screen has drawn (`SplashScreen.hide()` in `+layout.svelte`), with a 5-second safety net.
- **System bars** follow the app's light/dark theme, including the in-app toggle (`src/lib/system-bars.ts`). On Android WebViews older than 140, Capacitor pads the page clear of the bars and the gaps show the window background. The app's own small Android plugin, `WindowBackgroundPlugin.java`, sets that background to match, because Android 15+ ignores the status-bar colour API.
- **Back button** (Android) goes back a screen and leaves the app from the home screen.
- **Rulebook links** open in an in-app browser sheet (`@capacitor/browser`). On Android, Chrome downloads PDFs rather than showing them, so the "page N" jump is lost; the mobile website behaves the same way.
- **Install token** requests are sent as JSON: SvelteKit refuses a cross-site POST without a JSON content type as a possible form submission. Local dev doesn't apply that check, so test on a build against production.
- The log line "Error injecting safe area CSS" on Android comes from Capacitor running before the page exists. It's harmless.
