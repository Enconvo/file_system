import { execFile } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const ENCONVO_BIN_DIR = path.join(os.homedir(), ".config", "enconvo", "bin");
const RIPGREP_BINARY = "rg";
const RIPGREP_RELEASE_API =
  "https://api.github.com/repos/BurntSushi/ripgrep/releases/latest";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  assets?: GitHubReleaseAsset[];
}

export class RipgrepManager {
  private static cachedPath: string | null = null;

  private static getArch(): string {
    if (process.arch === "arm64") return "aarch64";
    if (process.arch === "x64") return "x86_64";
    throw new Error(`Unsupported architecture for ripgrep: ${process.arch}`);
  }

  private static findExisting(): string | null {
    const candidates = [
      path.join(ENCONVO_BIN_DIR, RIPGREP_BINARY),
      "/opt/homebrew/bin/rg",
      "/usr/local/bin/rg",
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    return null;
  }

  private static async findInPath(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("which", [RIPGREP_BINARY], {
        timeout: 5_000,
        encoding: "utf8",
      });
      const binaryPath = stdout.trim().split(/\r?\n/)[0];
      return binaryPath || null;
    } catch {
      return null;
    }
  }

  private static async findFileByName(
    directory: string,
    fileName: string,
    depth = 0,
  ): Promise<string | null> {
    if (depth > 4) return null;

    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        return entryPath;
      }
      if (entry.isDirectory()) {
        const found = await this.findFileByName(entryPath, fileName, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  private static async getReleaseAsset(): Promise<GitHubReleaseAsset> {
    const arch = this.getArch();
    const { stdout } = await execFileAsync(
      "curl",
      ["-fsSL", "--max-time", "30", RIPGREP_RELEASE_API],
      { timeout: 35_000, encoding: "utf8" },
    );
    const release = JSON.parse(stdout) as GitHubRelease;
    const asset = release.assets?.find(
      (item) =>
        item.name.includes(arch) &&
        item.name.includes("apple-darwin") &&
        item.name.endsWith(".tar.gz"),
    );

    if (!asset) {
      throw new Error(
        `No compatible ripgrep release found for ${arch}-apple-darwin`,
      );
    }

    return asset;
  }

  private static async installFromRelease(): Promise<string> {
    await fs.mkdir(ENCONVO_BIN_DIR, { recursive: true });

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "enconvo-ripgrep-"),
    );
    const archivePath = path.join(tempDir, "ripgrep.tar.gz");
    const destinationPath = path.join(ENCONVO_BIN_DIR, RIPGREP_BINARY);

    try {
      const asset = await this.getReleaseAsset();
      await execFileAsync(
        "curl",
        [
          "-fsSL",
          "--max-time",
          "60",
          "-o",
          archivePath,
          asset.browser_download_url,
        ],
        { timeout: 75_000, encoding: "utf8" },
      );
      await execFileAsync("tar", ["-xzf", archivePath, "-C", tempDir], {
        timeout: 30_000,
        encoding: "utf8",
      });

      const extractedBinary = await this.findFileByName(
        tempDir,
        RIPGREP_BINARY,
      );
      if (!extractedBinary) {
        throw new Error(
          "Failed to install ripgrep: rg binary not found in archive",
        );
      }

      await fs.copyFile(extractedBinary, destinationPath);
      await fs.chmod(destinationPath, 0o755);
      await execFileAsync(destinationPath, ["--version"], {
        timeout: 5_000,
        encoding: "utf8",
      });

      return destinationPath;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  static async ensureBinary(): Promise<string> {
    if (this.cachedPath && existsSync(this.cachedPath)) {
      return this.cachedPath;
    }

    const existing = this.findExisting();
    if (existing) {
      this.cachedPath = existing;
      return existing;
    }

    const pathBinary = await this.findInPath();
    if (pathBinary) {
      this.cachedPath = pathBinary;
      return pathBinary;
    }

    const installed = await this.installFromRelease();
    this.cachedPath = installed;
    return installed;
  }
}
