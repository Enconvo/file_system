import { EnconvoResponse, RequestOptions, getProjectEnv } from '@enconvo/api';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { validatePath } from './utils/file_utils.ts';

const execAsync = promisify(exec);

const MAX_FILES = 100;

interface Options extends RequestOptions {
    pattern: string;
    path?: string;
}

interface FileEntry {
    path: string;
    mtime: number;
}

/**
 * Find files matching a glob pattern using ripgrep --files
 */
async function findFiles(
    searchPath: string,
    pattern: string,
): Promise<{ output: string; exitCode: number }> {
    const args = [
        '--files',       // list files instead of searching content
        '--hidden',      // include hidden files
        '--no-messages', // suppress error messages
        '--glob', `'${pattern}'`,
    ];

    args.push(`'${searchPath.replace(/'/g, "'\\''")}'`);

    const command = `rg ${args.join(' ')}`;
    console.log(`Executing command: ${command}`);

    try {
        const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        return { output: stdout, exitCode: 0 };
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error) {
            const execError = error as { code: number; stdout?: string; stderr?: string };
            // Exit code 1 = no matches, 2 = errors (may still have partial output)
            if (execError.code === 1) {
                return { output: '', exitCode: 1 };
            }
            if (execError.code === 2 && execError.stdout) {
                return { output: execError.stdout, exitCode: 2 };
            }
        }
        throw error;
    }
}

/**
 * Parse file list output and get modification times
 */
async function parseFiles(output: string): Promise<FileEntry[]> {
    const lines = output.trim().split(/\r?\n/);
    const files: FileEntry[] = [];

    for (const line of lines) {
        const filePath = line.trim();
        if (!filePath) continue;

        try {
            const stats = await fs.stat(filePath);
            files.push({
                path: filePath,
                mtime: stats.mtimeMs,
            });
        } catch {
            // Skip files we can't stat
            continue;
        }
    }

    // Sort by modification time descending (most recently modified first)
    files.sort((a, b) => b.mtime - a.mtime);

    return files;
}

export default async function main(request: Request): Promise<EnconvoResponse> {
    try {
        const options: Options = await request.json();

        if (!options.pattern) {
            return {
                type: "text",
                content: "Error: pattern is required",
            };
        }

        // Resolve search path
        const projectEnv = await getProjectEnv();
        let searchPath = options.path ?? projectEnv;
        if (!path.isAbsolute(searchPath)) {
            searchPath = path.resolve(projectEnv, searchPath);
        }
        searchPath = await validatePath(searchPath);

        // Execute ripgrep file search
        const { output, exitCode } = await findFiles(searchPath, options.pattern);

        // No matches found
        if (exitCode === 1 || (exitCode === 2 && !output.trim())) {
            return {
                type: "text",
                content: "No files found",
            };
        }

        // Parse files and sort by mtime
        const allFiles = await parseFiles(output);

        if (allFiles.length === 0) {
            return {
                type: "text",
                content: "No files found",
            };
        }

        // Truncate to limit
        const truncated = allFiles.length > MAX_FILES;
        const finalFiles = truncated ? allFiles.slice(0, MAX_FILES) : allFiles;

        // Format output
        const outputLines = finalFiles.map(f => f.path);

        if (truncated) {
            outputLines.push('');
            outputLines.push('(Results are truncated. Consider using a more specific path or pattern.)');
        }

        return {
            type: "text",
            content: outputLines.join('\n'),
        };
    } catch (error: unknown) {
        return {
            type: "text",
            content: `Error during search: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
