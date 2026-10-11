import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

/** Local worker artifact check, not a codec/provenance or remote-storage check. */
export async function hasUsableLocalFile(filePath: string | null | undefined): Promise<boolean> {
  if (!filePath) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) return false;
    await access(filePath, constants.R_OK);
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw new Error("Unable to inspect local media artifact");
  }
}
