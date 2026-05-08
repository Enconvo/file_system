import { EnconvoResponse, RequestOptions, getProjectEnv } from "@enconvo/api";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { validatePath } from "./utils/file_utils.ts";
import { RipgrepManager } from "./lib/ripgrep_manager.ts";

const execFileAsync = promisify(execFile);

const MAX_LINE_LENGTH = 2000;
const MAX_MATCHES = 100;
const MAX_FILES_TO_SCAN = MAX_MATCHES;
const RIPGREP_MAX_BUFFER = 10 * 1024 * 1024;

interface Options extends RequestOptions {
  pattern: string;
  path?: string;
  include?: string;
}

interface Match {
  path: string;
  modTime: number;
  lineNum: number;
  lineText: string;
}

interface FileEntry {
  path: string;
  modTime: number;
}

interface MatchCandidate {
  path: string;
  lineNum: number;
  lineText: string;
}

interface RipgrepResult {
  output: string;
  exitCode: number;
}

interface ExecFileError extends Error {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

interface RipgrepJsonMessage {
  type?: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
  };
}

function buildSearchArgs(pattern: string, include?: string): string[] {
  const args = ["--hidden", "--no-messages", "--regexp", pattern];

  if (include) {
    args.push("--glob", include);
  }

  return args;
}

async function runRipgrep(
  rgPath: string,
  args: string[],
): Promise<RipgrepResult> {
  try {
    const { stdout } = await execFileAsync(rgPath, args, {
      maxBuffer: RIPGREP_MAX_BUFFER,
      encoding: "utf8",
    });
    return { output: stdout, exitCode: 0 };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
      const execError = error as ExecFileError;
      const stdout =
        typeof execError.stdout === "string"
          ? execError.stdout
          : (execError.stdout?.toString() ?? "");

      // Exit code 1 = no matches, 2 = errors (may still have partial output)
      if (execError.code === 1) {
        return { output: "", exitCode: 1 };
      }
      if (execError.code === 2 && stdout) {
        return { output: stdout, exitCode: 2 };
      }
    }
    throw error;
  }
}

async function findMatchingFiles(
  rgPath: string,
  searchPath: string,
  pattern: string,
  include?: string,
): Promise<RipgrepResult> {
  const args = [
    "--files-with-matches",
    "--null",
    ...buildSearchArgs(pattern, include),
    searchPath,
  ];

  return runRipgrep(rgPath, args);
}

function parseFileList(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

async function getSortedFiles(filePaths: string[]): Promise<FileEntry[]> {
  const uniquePaths = [...new Set(filePaths)];
  const files = await Promise.all(
    uniquePaths.map(async (filePath): Promise<FileEntry | null> => {
      try {
        const stats = await fs.stat(filePath);
        return {
          path: filePath,
          modTime: stats.mtimeMs,
        };
      } catch {
        return null;
      }
    }),
  );

  return files
    .filter((file): file is FileEntry => file !== null)
    .sort((a, b) => b.modTime - a.modTime || a.path.localeCompare(b.path));
}

async function searchFiles(
  rgPath: string,
  filePaths: string[],
  pattern: string,
): Promise<RipgrepResult> {
  const args = [
    "--json",
    "--line-number",
    "--with-filename",
    ...buildSearchArgs(pattern),
    "--",
    ...filePaths,
  ];

  return runRipgrep(rgPath, args);
}

/**
 * Parse ripgrep JSON output into structured match objects.
 */
function parseMatches(
  output: string,
  fileModTimes: Map<string, number>,
): Match[] {
  const matches: MatchCandidate[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;

    let message: RipgrepJsonMessage;
    try {
      message = JSON.parse(line) as RipgrepJsonMessage;
    } catch {
      continue;
    }

    if (message.type !== "match") continue;

    const filePath = message.data?.path?.text;
    const lineNum = message.data?.line_number;
    const lineText = message.data?.lines?.text;

    if (
      !filePath ||
      typeof lineNum !== "number" ||
      typeof lineText !== "string"
    )
      continue;

    matches.push({
      path: filePath,
      lineNum,
      lineText: lineText.replace(/\r?\n$/, ""),
    });
  }

  const hydratedMatches = matches
    .map((match): Match | null => {
      const modTime = fileModTimes.get(match.path);
      if (modTime === undefined) return null;
      return { ...match, modTime };
    })
    .filter((match): match is Match => match !== null);

  hydratedMatches.sort(
    (a, b) =>
      b.modTime - a.modTime ||
      a.path.localeCompare(b.path) ||
      a.lineNum - b.lineNum,
  );

  return hydratedMatches;
}

/**
 * Format matches into readable output
 */
function formatOutput(
  matches: Match[],
  truncated: boolean,
  hasErrors: boolean,
): string {
  const outputLines = [`Found ${matches.length} matches`];

  let currentFile = "";
  for (const match of matches) {
    if (currentFile !== match.path) {
      if (currentFile !== "") {
        outputLines.push("");
      }
      currentFile = match.path;
      outputLines.push(`${match.path}:`);
    }
    const truncatedLineText =
      match.lineText.length > MAX_LINE_LENGTH
        ? match.lineText.substring(0, MAX_LINE_LENGTH) + "..."
        : match.lineText;
    outputLines.push(`  Line ${match.lineNum}: ${truncatedLineText}`);
  }

  if (truncated) {
    outputLines.push("");
    outputLines.push(
      "(Results are truncated. Consider using a more specific path or pattern.)",
    );
  }

  if (hasErrors) {
    outputLines.push("");
    outputLines.push("(Some paths were inaccessible and skipped)");
  }

  return outputLines.join("\n");
}

export default async function main(request: Request): Promise<EnconvoResponse> {
  try {
    const options: Options = await request.json();

    if (!options.pattern) {
      return {
        type: "text",
        content: "Error: pattern is required",
      };
    }

    // Resolve search path
    const projectEnv = await getProjectEnv();
    let searchPath = options.path ?? projectEnv;
    if (!path.isAbsolute(searchPath)) {
      searchPath = path.resolve(projectEnv, searchPath);
    }
    searchPath = await validatePath(searchPath);

    const rgPath = await RipgrepManager.ensureBinary();
    const fileResult = await findMatchingFiles(
      rgPath,
      searchPath,
      options.pattern,
      options.include,
    );

    // No matches found
    if (
      fileResult.exitCode === 1 ||
      (fileResult.exitCode === 2 && !fileResult.output)
    ) {
      return {
        type: "text",
        content: "No files found",
      };
    }

    const matchingFiles = await getSortedFiles(
      parseFileList(fileResult.output),
    );
    if (matchingFiles.length === 0) {
      return {
        type: "text",
        content: "No files found",
      };
    }

    const selectedFiles = matchingFiles.slice(0, MAX_FILES_TO_SCAN);
    const fileModTimes = new Map(
      selectedFiles.map((file) => [file.path, file.modTime]),
    );
    const matchResult = await searchFiles(
      rgPath,
      selectedFiles.map((file) => file.path),
      options.pattern,
    );

    if (
      matchResult.exitCode === 1 ||
      (matchResult.exitCode === 2 && !matchResult.output.trim())
    ) {
      return {
        type: "text",
        content: "No files found",
      };
    }

    const hasErrors = fileResult.exitCode === 2 || matchResult.exitCode === 2;
    const allMatches = parseMatches(matchResult.output, fileModTimes);

    // Truncate to limit
    const truncated =
      matchingFiles.length > selectedFiles.length ||
      allMatches.length > MAX_MATCHES;
    const finalMatches = truncated
      ? allMatches.slice(0, MAX_MATCHES)
      : allMatches;

    // Format output
    const formattedResults = formatOutput(finalMatches, truncated, hasErrors);

    return {
      type: "text",
      content: formattedResults,
    };
  } catch (error: unknown) {
    return {
      type: "text",
      content: `Error during search: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
