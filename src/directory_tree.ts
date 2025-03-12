import { Response, RequestOptions } from '@enconvo/api';
import fs from "fs/promises";
import path from "path";
import { validatePath } from './utils/file_utils.ts';

/**
 * Interface for tree entry structure
 */
interface TreeEntry {
    name: string;
    type: 'file' | 'directory';
    children?: TreeEntry[];
}

/**
 * Interface defining the expected options for getting directory tree
 */
interface Options extends RequestOptions {
    path: string;  // Root path to start tree from
}

/**
 * Recursively builds a directory tree
 * @param currentPath Path to current directory
 * @returns Array of TreeEntry objects
 */
async function buildTree(currentPath: string): Promise<TreeEntry[]> {
    const validPath = await validatePath(currentPath);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const result: TreeEntry[] = [];

    for (const entry of entries) {
        const entryData: TreeEntry = {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        };

        if (entry.isDirectory()) {
            const subPath = path.join(currentPath, entry.name);
            entryData.children = await buildTree(subPath);
        }

        result.push(entryData);
    }

    return result;
}

/**
 * Main function to handle directory tree generation
 * @param request The incoming request containing root directory path
 * @returns Response containing JSON formatted directory tree
 */
export default async function main(request: Request): Promise<Response> {
    // Parse the request options
    const options: Options = await request.json();

    // Build the directory tree
    const treeData = await buildTree(options.path);

    // Format the tree as JSON with indentation
    const formattedTree = JSON.stringify(treeData, null, 2);

    // Return successful response with formatted tree
    return {
        type: "text",
        content: formattedTree
    };
} 