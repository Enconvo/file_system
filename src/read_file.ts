import { AttachmentUtils, RequestOptions, EnconvoResponse, ChatMessageContent, Runtime } from '@enconvo/api';
import fs from "fs/promises";
import path from "path";
import { validatePath } from './utils/file_utils.ts';

interface Options extends RequestOptions {
    path: string;
    chunk_enable?: boolean;
}

const DOCUMENT_EXTS = new Set([
    '.pdf', '.epub', '.docx', '.doc', '.xlsx', '.xls',
    '.pptx', '.ppt', '.odt', '.ods', '.odp', '.rtf'
]);

const IMAGE_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg',
    '.webp', '.ico', '.tiff', '.tif', '.heic', '.heif'
]);

const AUDIO_EXTS = new Set([
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma'
]);

const VIDEO_EXTS = new Set([
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v'
]);

function getFileType(filePath: string): 'text' | 'document' | 'image' | 'audio' | 'video' {
    const ext = path.extname(filePath).toLowerCase();
    if (DOCUMENT_EXTS.has(ext)) return 'document';
    if (IMAGE_EXTS.has(ext)) return 'image';
    if (AUDIO_EXTS.has(ext)) return 'audio';
    if (VIDEO_EXTS.has(ext)) return 'video';
    return 'text';
}

export default async function main(request: Request): Promise<EnconvoResponse> {
    const options: Options = await request.json();
    const { chunk_enable } = options;
    const validPath = await validatePath(options.path);
    const fileType = getFileType(validPath);

    const isInteractiveMode = Runtime.isInteractiveMode();
    const fileUrl = validPath;

    switch (fileType) {
        case 'image': {
            const contents: ChatMessageContent[] = [
                ChatMessageContent.imageUrl(fileUrl)
            ];
            return EnconvoResponse.content(contents);
        }

        case 'audio': {
            const contents: ChatMessageContent[] = [
                ChatMessageContent.audio(fileUrl)
            ];
            return EnconvoResponse.content(contents);
        }

        case 'video': {
            const contents: ChatMessageContent[] = [
                ChatMessageContent.video(fileUrl)
            ];
            return EnconvoResponse.content(contents);
        }

        case 'document': {
            const content = await AttachmentUtils.getAttachmentsReadableContent({
                files: [validPath]
            });

            if (!isInteractiveMode) {
                let result;
                if (chunk_enable) {
                    result = { contents: content[0].contents };
                } else {
                    result = content[0].contents.map((item) => item.text).join("\n");
                }
                return Response.json({ result });
            }

            const textContent = content[0].contents.map((item) => item.text).join("\n");
            return EnconvoResponse.content([
                ChatMessageContent.text(textContent)
            ]);
        }

        case 'text':
        default: {
            const text = await fs.readFile(validPath, 'utf-8');

            if (!isInteractiveMode) {
                return Response.json({ result: text });
            }

            return EnconvoResponse.content([
                ChatMessageContent.text(text)
            ]);
        }
    }
} 