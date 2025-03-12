import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { validatePath } from './file_utils.ts';

/**
 * Interface defining the expected options for creating a directory
 */
interface Options extends RequestOptions {
    path: string;  // Path where to create the directory
}

/**
 * Main function to handle directory creation
 * @param request The incoming request containing directory path
 * @returns Response indicating success or failure
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();

    const validPath = await validatePath(options.path);
    // Create directory with recursive option to handle nested paths
    await fs.mkdir(validPath, { recursive: true });

    const successMessage = `Successfully created directory ${options.path}`;

    // Return successful response
    return {
        type: "text",
        content: successMessage
    };
} 