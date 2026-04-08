import { toast } from "sonner";

/**
 * Validate file size and show a toast if it exceeds the limit.
 * @returns true if file is within the limit, false otherwise.
 */
export function validateFileSize(file: File, maxMB: number): boolean {
  if (file.size > maxMB * 1024 * 1024) {
    toast.error(`File must be under ${maxMB}MB`);
    return false;
  }
  return true;
}
