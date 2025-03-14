import path from "path";
import os from "os";
import fs from "fs/promises";
import { getProjectEnv } from "@enconvo/api";


export function expandHome(filepath: string): string {
    if (filepath.startsWith('~/') || filepath === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}


export async function validatePath(requestedPath: string): Promise<string> {
    const expandedPath = expandHome(requestedPath);
    const projectEnv = getProjectEnv();
    const absolute = path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(projectEnv, expandedPath);


    // Handle symlinks by checking their real path
    try {
        const realPath = await fs.realpath(absolute);
        return realPath;
    } catch (error) {
        return absolute;
    }
}