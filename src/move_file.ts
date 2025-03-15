import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { existsSync } from "fs";
import { validatePath } from './utils/file_utils.ts';
import path from "path";

/**
 * Interface defining the expected options for moving files
 */
interface Options extends RequestOptions {
    source: string;      // Source file path
    destination: string; // Destination file path
}

/**
 * Main function to handle file moving operations
 * @param request The incoming request containing source and destination paths
 * @returns Response indicating success or failure
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();
    console.log("move file",options);

    const validSourcePath = await validatePath(options.source);
    const validDestPath = await validatePath(options.destination);
    // Ensure destination directory exists
    const destDir = path.dirname(validDestPath);
    await fs.mkdir(destDir, { recursive: true });
    if(!existsSync(validSourcePath)) {
        throw new Error("source file does not exist");
    }

    // Move/rename the file
    await fs.rename(validSourcePath, validDestPath);

    const successMessage = `Successfully moved ${options.source} to ${options.destination}`;

    // Return successful response
    return {
        type: "text",
        content: successMessage,
    };
} 