# GlucoPilot

GlucoPilot is a type 1 diabetes support app built as:

- a responsive web app for desktop and Android browsers
- a packaged Windows executable
- a native Android APK

## Features

- getting started flow for safety, privacy, and AI consent
- carb lookup for common foods
- AI carb estimation for foods you cannot find
- custom food library and saved repeat meals
- meal carb logging
- glucose notes with range tracking
- reminders
- AI coach for everyday planning questions
- supply checklist
- data export to JSON and CSV

## Stack

- React 19 + TypeScript + Vite
- Zustand for local persistence
- Express + OpenRouter-compatible AI routes
- Electron + Electron Builder for the Windows executable
- Capacitor + Capacitor Local Notifications + Android SDK for the Android APK

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` if you want to override the built-in OpenRouter configuration:

```bash
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
VITE_OPENROUTER_API_KEY=your_key_here
VITE_OPENROUTER_MODEL=openai/gpt-4o-mini
PORT=3001
```

This project can also ship with a built-in OpenRouter key, but that means the key is embedded in the distributed app bundle.

3. Start the web app and API together:

```bash
npm run dev
```

4. Open `http://localhost:5173`.

## Build

```bash
npm run build
```

## Windows Executable

Build the portable Windows app:

```bash
npm run package:win
```

Output:

- `release/GlucoPilot-Portable-0.0.0.exe`

Build the faster installed Windows app:

```bash
npm run package:win:nsis
```

Output:

- `release/GlucoPilot-Setup-0.0.0.exe`

Build the Microsoft Store package:

```bash
npm run package:appx
```

Output:

- `release/GlucoPilot-0.0.0.appx`

The portable `.exe` self-extracts before launch, so it opens slower than the installed Windows build or the Store `.appx`. If startup speed matters, use the installed build or AppX package instead of the portable wrapper.

If you want the Windows executable to use `.env`, place the `.env` file next to the packaged `.exe` before launching it, or save a key in the Account tab after opening the app.

## Android APK

Build the Android debug APK:

```bash
npm run android:build:debug
```

If the Android SDK is installed but Gradle cannot find it, create `android/local.properties` with:

```properties
sdk.dir=C:\\Users\\<your-user>\\AppData\\Local\\Android\\Sdk
```

Output:

- `android/app/build/outputs/apk/debug/app-debug.apk`

Install on Android:

1. Copy `app-debug.apk` to your phone, or install it with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
2. On the phone, open the APK file.
3. If Android blocks it, allow installs from that app or file manager for this one install.
4. Finish the install and open GlucoPilot.

Inside Android, turn on AI sharing in the app if you want live AI coach and food estimates.

## Privacy Policy

The project includes an in-app and hostable privacy policy page at:

- `public/privacy.html`

If you submit to stores, publish that file at a public HTTPS URL and use that URL in your store listing metadata.

## Important AI Note

The app is wired to the real OpenRouter API. If the UI shows an AI warning banner, it means the request reached OpenRouter but the account returned an error such as missing credits, invalid key, provider rejection, or billing not being active. In that case, update the OpenRouter account rather than the app code.

## Store Submission Notes

Code changes in this repo now cover:

- a visible medical-use disclaimer
- explicit consent before storing local health data
- explicit opt-in before sending prompts to OpenRouter
- an in-app privacy policy link
- a user-facing report export for unsafe AI responses
- delete-all-local-data controls

Console-only tasks still need to be completed manually before submission:

- Play Console: add the public privacy policy URL and complete any health-related disclosures for your listing.
- Microsoft Partner Center: disclose live generative AI in metadata and provide the support contact users should use for AI reports.

## Notes

- The app persists user data in browser local storage.
- Android reminders are scheduled as native local notifications after notification permission is granted.
- Browser reminders are limited by browser support and are less reliable than the Android APK.
- JSON and CSV exports do not include any AI provider secrets.
