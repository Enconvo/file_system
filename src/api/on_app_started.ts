import { RipgrepManager } from "../lib/ripgrep_manager.ts";

/**
 * Auto-check and install ripgrep on app startup.
 * @private
 */
export default async function main(_request: Request) {
  try {
    const binaryPath = await RipgrepManager.ensureBinary();
    console.log("ripgrep ready at:", binaryPath);
    return Response.json({ success: true, path: binaryPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("ripgrep auto-install failed:", message);
    return Response.json({ success: false, error: message });
  }
}
