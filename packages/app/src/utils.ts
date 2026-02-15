import os from "os";
import path from "path";

/**
 * Returns a platform-specific app data directory.
 * 
 * @param appName - Optional application folder name
 * */
export function getAppDataPath(appName?: string): string {
    const platform = process.platform;
    const homeDir = os.homedir();

    let basePath: string;

    if (platform === "win32") {
        basePath = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    } else if (platform === "darwin") {
        basePath = path.join(homeDir, "Library", "Application Support");
    } else {
        // linux + everything else
        basePath =
            process.env.XDG_DATA_HOME || path.join(homeDir, ".local", "share");
    }

    return appName ? path.join(basePath, appName) : basePath;
}