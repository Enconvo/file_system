import path from "path";
import os from "os";
import fs from "fs/promises";
import { getProjectEnv } from "@enconvo/api";

const allowedDirectories = ['~', '~/Documents', '~/Downloads', '~/Desktop'].map(dir =>
    normalizePath(path.resolve(expandHome(dir)))
);

export function expandHome(filepath: string): string {
    if (filepath.startsWith('~/') || filepath === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}

// Normalize all paths consistently
function normalizePath(p: string): string {
    return path.normalize(p);
}

export async function validatePath(requestedPath: string): Promise<string> {
    const expandedPath = expandHome(requestedPath);
    const projectEnv = getProjectEnv();
    const absolute = path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(projectEnv, expandedPath);

    const normalizedRequested = normalizePath(absolute);

    // Check if path is within allowed directories
    const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
    if (!isAllowed) {
        throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
    }

    // Handle symlinks by checking their real path
    try {
        const realPath = await fs.realpath(absolute);
        const normalizedReal = normalizePath(realPath);
        const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
        if (!isRealPathAllowed) {
            throw new Error("Access denied - symlink target outside allowed directories");
        }
        return realPath;
    } catch (error) {
        // For new files that don't exist yet, verify parent directory
        const parentDir = path.dirname(absolute);
        try {
            const realParentPath = await fs.realpath(parentDir);
            const normalizedParent = normalizePath(realParentPath);
            const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
            if (!isParentAllowed) {
                throw new Error("Access denied - parent directory outside allowed directories");
            }
            return absolute;
        } catch {
            throw new Error(`Parent directory does not exist: ${parentDir}`);
        }
    }
}