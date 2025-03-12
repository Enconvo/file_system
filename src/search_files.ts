import { Response, RequestOptions } from '@enconvo/api';
import { exec } from 'child_process';
import { promisify } from 'util';
import { validatePath } from './utils/file_utils.ts';

// Convert exec to promise-based
const execAsync = promisify(exec);

/**
 * Interface defining the expected options for file searching
 */
interface Options extends RequestOptions {
    path: string;                 // Root path to start search from
    pattern: string;             // Search pattern to match against
    excludePatterns?: string[];  // Patterns to exclude from search
}

/**
 * Search for files using ripgrep
 * @param rootPath Root directory to start search from
 * @param pattern Pattern to match against file names
 * @param excludePatterns Patterns to exclude from search
 * @returns Array of matching file paths
 */
async function searchFiles(
    rootPath: string,
    pattern: string,
    excludePatterns: string[] = []
): Promise<string[]> {
    try {
        // Build the ripgrep command
        let command = `rg --files "${rootPath}"`;

        // Add exclude patterns if any
        for (const excludePattern of excludePatterns) {
            // Convert glob patterns to ripgrep compatible format
            const rgPattern = excludePattern.includes('*')
                ? excludePattern
                : `**/${excludePattern}/**`;
            command += ` --glob '!${rgPattern}'`;
        }

        // Add case-insensitive pattern matching
        command += ` | rg -i "${pattern}"`;

        // Execute the ripgrep command
        const { stdout } = await execAsync(command);

        // Split output into array and filter empty lines
        return stdout.split('\n').filter(line => line.trim());
    } catch (error: unknown) {
        // Type guard for ExecException
        if (error && typeof error === 'object' && 'code' in error) {
            // If rg returns no results, it exits with code 1
            if (error.code === 1 && !('stdout' in error)) {
                return [];
            }
        }
        throw error;
    }
}

/**
 * Main function to handle file searching
 * @param request The incoming request containing search parameters
 * @returns Response containing matching file paths
 */
export default async function main(request: Request): Promise<Response> {
    try {
        // Parse the request options
        const options: Options = await request.json();

        const validPath = await validatePath(options.path);

        // Perform the search
        const results = await searchFiles(
            validPath,
            options.pattern,
            options.excludePatterns
        );

        // Format results
        const formattedResults = results.length > 0
            ? results.join("\n")
            : "No matches found";

        // Return successful response
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