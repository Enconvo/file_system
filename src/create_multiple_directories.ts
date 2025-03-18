import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { validatePath } from './utils/file_utils.ts';

/**
 * Interface defining the expected options for creating a directory
 */
interface Options extends RequestOptions {
    paths: string[];  // Array of paths to create
}

/**
 * Main function to handle directory creation
 * @param request The incoming request containing directory path
 * @returns Response indicating success or failure
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();

    const validPaths = await Promise.all(options.paths.map(async (path) => await validatePath(path)));
    // Create directory with recursive option to handle nested paths
    await Promise.all(validPaths.map(async (path) => await fs.mkdir(path, { recursive: true })));

    const successMessage = `Successfully created directories ${options.paths.join(", ")}`;

    // Return successful response
    return {
        type: "text",
        content: successMessage
    };
} 