/**
 * Which Google Drive access the app asks for.
 *
 * With a Google Picker API key and the Cloud project number configured, sign-in asks only for
 * `drive.file` (the files the user picks in Google's own file picker). That scope is non-sensitive,
 * so Google shows no "unverified app" warning. Without them the app keeps the older folder
 * browser, which needs the restricted `drive.readonly` scope.
 */
export const PICKER_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_KEY ?? "";
export const PICKER_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";
export const PICK_MODE = Boolean(PICKER_KEY && PICKER_APP_ID);

export const DRIVE_SCOPE = PICK_MODE
  ? "https://www.googleapis.com/auth/drive.file"
  : "https://www.googleapis.com/auth/drive.readonly";
