import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { validatePath } from './file_utils.ts';

/**
 * Interface defining the expected options for listing directory contents
 */
interface Options extends RequestOptions {
    path: string;  // Path to the directory to list
}

/**
 * Main function to handle directory listing
 * @param request The incoming request containing directory path
 * @returns Response containing formatted directory listing
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();

    const validPath = await validatePath(options.path);

    // Read directory entries with file type information
    const entries = await fs.readdir(validPath, { withFileTypes: true });

    // Format entries with type prefix
    const formatted = entries
        .map(entry => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n");

    // Return successful response with formatted listing
    return {
        type: "text",
        content: formatted
    };
} 