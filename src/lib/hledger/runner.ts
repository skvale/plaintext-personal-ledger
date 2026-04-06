import { exec } from "node:child_process";
import { promisify } from "node:util";
import { HLEDGER_MIN_VERSION, HLEDGER_MAX_MAJOR } from "./constants.js";

const execAsync = promisify(exec);

export async function isHledgerAvailable(): Promise<boolean> {
  try {
    await execAsync("hledger --version");
    return true;
  } catch {
    return false;
  }
}

export async function getHledgerVersion(): Promise<{
  version: string;
  supported: boolean;
  message?: string;
} | null> {
  try {
    const { stdout } = await execAsync("hledger --version");
    const match = stdout.match(/hledger\s+(\d+\.\d+)/);
    if (!match)
      return {
        version: stdout.trim(),
        supported: false,
        message: "Could not parse version",
      };

    const version = match[1];
    const [major, minor] = version.split(".").map(Number);

    if (major >= HLEDGER_MAX_MAJOR) {
      return {
        version,
        supported: false,
        message: `hledger ${major}.x is not yet supported. This app is tested with 1.x.`,
      };
    }
    if (parseFloat(version) < parseFloat(HLEDGER_MIN_VERSION)) {
      return {
        version,
        supported: false,
        message: `hledger ${version} is too old. Minimum required: ${HLEDGER_MIN_VERSION}`,
      };
    }

    return { version, supported: true };
  } catch {
    return null;
  }
}
