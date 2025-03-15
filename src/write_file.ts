import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import { validatePath } from './utils/file_utils.ts';
import { homedir } from 'os';

/**
 * Interface defining the expected options for writing a file
 */
interface Options extends RequestOptions {
    path: string;     // Path where to write the file
    content: string;  // Content to write to the file
}

/**
 * Main function to handle file writing operations
 * @param request The incoming request containing file path and content
 * @returns Response indicating success or failure
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    let options: Options = await request.json();


    if(!options.path || !options.content) {
        throw new Error("please provide path and content");
    }

    console.log("write file", options.path?.length, options.content?.length);
    // Ensure the directory exists
    const validPath = await validatePath(options.path);
    console.log("validPath", validPath);

    // Write the file
    await fs.writeFile(validPath, options.content, "utf-8");

    const successMessage = `Successfully wrote to ${validPath}`;

    // Return successful response
    return {
        type: "text",
        content: successMessage,
    };
} 