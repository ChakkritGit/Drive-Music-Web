import type { DriveFile } from "@/types";
import { PICKER_APP_ID, PICKER_KEY } from "@/lib/googleConfig";

/** Audio types offered in the picker (Drive reports MP3 under both names). */
const AUDIO_MIME_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac", "audio/x-flac",
  "audio/wav", "audio/x-wav", "audio/ogg", "audio/opus", "audio/webm",
].join(",");

// The parts of Google's global picker API this file uses.
interface PickerDoc { id: string; name: string; mimeType: string }
interface PickerData { action: string; docs?: PickerDoc[] }
interface PickerApi {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  Feature: { MULTISELECT_ENABLED: string };
  DocsView: new (viewId: string) => {
    setMimeTypes(types: string): unknown;
    setIncludeFolders(on: boolean): unknown;
    setSelectFolderEnabled(on: boolean): unknown;
    setMode(mode: string): unknown;
  };
  PickerBuilder: new () => PickerBuilder;
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(cb: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible(on: boolean): void };
}
declare global {
  interface Window {
    gapi?: { load(name: string, opts: { callback: () => void; onerror: () => void }): void };
    google?: { picker?: PickerApi };
  }
}

let loading: Promise<PickerApi> | null = null;

function loadPicker(): Promise<PickerApi> {
  if (window.google?.picker) return Promise.resolve(window.google.picker);
  loading ??= new Promise<PickerApi>((resolve, reject) => {
    const fail = () => {
      loading = null;
      reject(new Error("Couldn't open Google's file picker"));
    };
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onerror = fail;
    script.onload = () =>
      window.gapi?.load("picker", {
        callback: () => (window.google?.picker ? resolve(window.google.picker) : fail()),
        onerror: fail,
      });
    document.head.append(script);
  });
  return loading;
}

/**
 * Opens Google's file picker with several audio files selectable at once. Resolves with what was
 * picked (empty on cancel); from then on the `drive.file` token can read those files.
 */
export async function pickAudioFiles(accessToken: string): Promise<DriveFile[]> {
  const picker = await loadPicker();
  const view = new picker.DocsView(picker.ViewId.DOCS);
  view.setMimeTypes(AUDIO_MIME_TYPES);
  view.setIncludeFolders(true); // folders to walk through, not to pick: drive.file grants no access to a folder's files
  view.setSelectFolderEnabled(false);
  view.setMode(picker.DocsViewMode.LIST);
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(PICKER_KEY)
      .setAppId(PICKER_APP_ID)
      .setOrigin(window.location.origin)
      .setTitle("Choose songs")
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          resolve((data.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })));
        } else if (data.action === picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build()
      .setVisible(true);
  });
}
