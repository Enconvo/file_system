import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import path from "path";
import { minimatch } from 'minimatch';
import { validatePath } from './file_utils.ts';

/**
 * Interface defining the expected options for file searching
 */
interface Options extends RequestOptions {
    path: string;                 // Root path to start search from
    pattern: string;             // Search pattern to match against
    excludePatterns?: string[];  // Patterns to exclude from search
}

/**
 * Recursively searches for files matching the pattern
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
    const results: string[] = [];

    async function search(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            // Check if path matches any exclude pattern
            const relativePath = path.relative(rootPath, fullPath);
            const shouldExclude = excludePatterns.some(pattern => {
                const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
                return minimatch(relativePath, globPattern, { dot: true });
            });

            if (shouldExclude) {
                continue;
            }

            if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
                results.push(fullPath);
            }

            if (entry.isDirectory()) {
                await search(fullPath);
            }
        }
    }

    await search(rootPath);
    return results;
}

/**
 * Main function to handle file searching
 * @param request The incoming request containing search parameters
 * @returns Response containing matching file paths
 */
export default async function main(request: Request): Promise<Response> {
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
} 