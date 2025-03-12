import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { validatePath } from './file_utils.ts';

/**
 * Interface defining the expected options for the read file operation
 */
interface Options extends RequestOptions {
    path: string;  // Path to the file to be read
}

/**
 * Main function to handle file reading operations
 * @param request The incoming request containing file path information
 * @returns Response containing the file contents or error message
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();

    const validPath = await validatePath(options.path);
    // Read the file contents
    const content = await fs.readFile(validPath, 'utf-8');

    // Return successful response with file contents
    return {
        type: "text",
        content: content
    };
} 