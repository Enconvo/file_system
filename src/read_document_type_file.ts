import { AttachmentUtils, EnconvoResponse, RequestOptions, Runtime } from '@enconvo/api';
import { validatePath } from './utils/file_utils.ts';

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
export default async function main(request: Request): Promise<EnconvoResponse> {
    // Parse the request options
    const options: Options = await request.json();

    const { chunk_enable } = options;

    const validPath = await validatePath(options.path);

    const content = await AttachmentUtils.getAttachmentsReadableContent({
        files: [validPath]
    })
    const isInteractiveMode = Runtime.isInteractiveMode()

    if (!isInteractiveMode) {
        let result
        if (chunk_enable) {
            result = {
                contents: content[0].contents
            }
        } else {
            result = content[0].contents.map((item) => item.text).join("\n")
        }

        // console.log("content[0].contents",JSON.stringify(content[0].contents,null,2))

        return Response.json({
            result
        })
    }

    const textContent = content[0].contents.map((item) => item.text).join("\n")


    return {
        type: "text",
        content: textContent
    };
} 