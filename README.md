# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Android native Google sign-in

The Android app uses `@capgo/capacitor-social-login` for native Google account selection while the web app keeps using the existing Lovable Cloud Google OAuth flow.

Before syncing Android, replace `REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com` in `src/lib/nativeGoogleAuth.ts` with the Web application Client ID from the same Google Cloud project. If Google returns an Android-client audience in the ID token, also add that Android Client ID to `GOOGLE_ANDROID_CLIENT_IDS` in the same file.

In Lovable Cloud, keep Google sign-in enabled and add your own Google OAuth credentials if you want to accept native token exchange with your Google project. The accepted Client IDs should include the Web Client ID first, followed by every Android Client ID used for debug, release, or Play App Signing builds.

In Google Cloud Console, keep the Android OAuth Client ID configured with:

```text
Package name: app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f
SHA-1: your debug, release, and Play App Signing fingerprints
```

Troubleshooting native token exchange:

- `invalid audience`, `invalid_client`, or client ID errors: add the token audience Client ID to the Google sign-in provider's accepted Client IDs in Lovable Cloud.
- `nonce` errors: retry sign-in; the native token nonce must match the nonce sent during app-session exchange.
- No ID token returned: verify the Web Client ID, Android package name, SHA-1 fingerprints, and Google Play Services availability.

After pulling these changes locally, run:

```sh
npm install
npm run build
npx cap sync android
```
