import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";

/**
 * Interface for file information
 */
interface FileInfo {
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions: string;
}

/**
 * Interface defining the expected options for getting file info
 */
interface Options extends RequestOptions {
    path: string;  // Path to the file to get info for
}

/**
 * Gets detailed file statistics
 * @param filePath Path to the file
 * @returns FileInfo object containing file metadata
 */
async function getFileStats(filePath: string): Promise<FileInfo> {
    const stats = await fs.stat(filePath);
    return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8).slice(-3)
    };
}

/**
 * Main function to handle file info retrieval
 * @param request The incoming request containing file path
 * @returns Response containing formatted file information
 */
export default async function main(request: Request): Promise<Response> {
        // Parse the request options
        const options: Options = await request.json();
        
        // Get file information
        const info = await getFileStats(options.path);
        
        // Format the information
        const formattedInfo = Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");
        
        // Return successful response
        return {
            type: "text",
            content: formattedInfo,
        };

}