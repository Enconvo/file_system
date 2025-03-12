import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { validatePath } from './file_utils.ts';

/**
 * Interface defining the expected options for reading multiple files
 */
interface Options extends RequestOptions {
    paths: string[];  // Array of file paths to be read
}

/**
 * Main function to handle reading multiple files
 * @param request The incoming request containing array of file paths
 * @returns Response containing concatenated file contents or error messages
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();

    // Read all files concurrently
    const results = await Promise.all(
        options.paths.map(async (filePath: string) => {
            const validPath = await validatePath(filePath);
            const content = await fs.readFile(validPath, "utf-8");
            return `${filePath}:\n${content}\n`;
        })
    );

    // Combine all results with separators
    const combinedContent = results.join("\n---\n");

    // Return successful response with combined contents
    return {
        type: "text",
        content: combinedContent,
    };
} 