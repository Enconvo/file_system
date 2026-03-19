import { EnconvoResponse, RequestOptions, getProjectEnv } from '@enconvo/api';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { validatePath } from './utils/file_utils.ts';

const execAsync = promisify(exec);

const MAX_LINE_LENGTH = 2000;
const MAX_MATCHES = 100;

interface Options extends RequestOptions {
    pattern: string;
    path?: string;
    include?: string;
}

interface Match {
    path: string;
    modTime: number;
    lineNum: number;
    lineText: string;
}

/**
 * Search file contents using ripgrep with structured parameters
 */
async function searchFiles(
    searchPath: string,
    pattern: string,
    include?: string,
): Promise<{ output: string; exitCode: number }> {
    const args = [
        '-nH',           // line numbers + filenames
        '--hidden',      // search hidden files
        '--no-messages', // suppress error messages (e.g. broken symlinks)
        "'--field-match-separator=|'", // use | as separator (quoted to avoid shell pipe interpretation)
        '--regexp', `'${pattern.replace(/'/g, "'\\''")}'`, // escape single quotes in pattern
    ];

    if (include) {
        args.push('--glob', `'${include}'`);
    }

    args.push(`'${searchPath.replace(/'/g, "'\\''")}'`);
    console.log('searchPath', searchPath);
    console.log('args', args);

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
 * Parse ripgrep output into structured match objects
 */
async function parseMatches(output: string): Promise<Match[]> {
    const lines = output.trim().split(/\r?\n/);
    const matches: Match[] = [];

    for (const line of lines) {
        if (!line) continue;

        const [filePath, lineNumStr, ...lineTextParts] = line.split('|');
        if (!filePath || !lineNumStr || lineTextParts.length === 0) continue;

        const lineNum = parseInt(lineNumStr, 10);
        if (isNaN(lineNum)) continue;

        const lineText = lineTextParts.join('|');

        try {
            const stats = await fs.stat(filePath);
            matches.push({
                path: filePath,
                modTime: stats.mtimeMs,
                lineNum,
                lineText,
            });
        } catch {
            // Skip files we can't stat
            continue;
        }
    }

    // Sort by modification time descending (most recently modified first)
    matches.sort((a, b) => b.modTime - a.modTime);

    return matches;
}

/**
 * Format matches into readable output
 */
function formatOutput(matches: Match[], truncated: boolean, hasErrors: boolean): string {
    const outputLines = [`Found ${matches.length} matches`];

    let currentFile = '';
    for (const match of matches) {
        if (currentFile !== match.path) {
            if (currentFile !== '') {
                outputLines.push('');
            }
            currentFile = match.path;
            outputLines.push(`${match.path}:`);
        }
        const truncatedLineText =
            match.lineText.length > MAX_LINE_LENGTH
                ? match.lineText.substring(0, MAX_LINE_LENGTH) + '...'
                : match.lineText;
        outputLines.push(`  Line ${match.lineNum}: ${truncatedLineText}`);
    }

    if (truncated) {
        outputLines.push('');
        outputLines.push('(Results are truncated. Consider using a more specific path or pattern.)');
    }

    if (hasErrors) {
        outputLines.push('');
        outputLines.push('(Some paths were inaccessible and skipped)');
    }

    return outputLines.join('\n');
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

        // Execute ripgrep search
        const { output, exitCode } = await searchFiles(searchPath, options.pattern, options.include);

        console.log('output', output, exitCode);

        // No matches found
        if (exitCode === 1 || (exitCode === 2 && !output.trim())) {
            return {
                type: "text",
                content: "No files found",
            };
        }

        const hasErrors = exitCode === 2;

        // Parse and sort matches
        const allMatches = await parseMatches(output);

        if (allMatches.length === 0) {
            return {
                type: "text",
                content: "No files found",
            };
        }

        // Truncate to limit
        const truncated = allMatches.length > MAX_MATCHES;
        const finalMatches = truncated ? allMatches.slice(0, MAX_MATCHES) : allMatches;

        // Format output
        const formattedResults = formatOutput(finalMatches, truncated, hasErrors);

        return {
            type: "text",
            content: formattedResults,
        };
    } catch (error: unknown) {
        return {
            type: "text",
            content: `Error during search: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
