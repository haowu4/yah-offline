import os from "os";
import path from "path";

export function getAppDataPath(): string {

    const appName = 'yah'

    const platform = process.platform;
    const homeDir = os.homedir();

    let basePath: string;

    if (process.env.YAH_BASE_FOLDER) {
        basePath = process.env.YAH_BASE_FOLDER
    } else {
        if (platform === "win32") {
            basePath = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
        } else if (platform === "darwin") {
            basePath = path.join(homeDir, "Library", "Application Support");
        } else {
            // linux + everything else
            basePath =
                process.env.XDG_DATA_HOME || path.join(homeDir, ".local", "share");
        }
    }


    return path.join(basePath, appName)
}