import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Perform best-effort shredding to securely erase a sensitive skill script from disk.
 * Restricts paths to standard skill workspace to prevent directory traversal and symlink exploits.
 */
export function shredFile(filePath: string): void {
  const resolvedPath = path.resolve(filePath);

  // 1. 安全沙箱路径穿越防御
  const allowedRoots = [
    path.resolve(process.cwd(), "skills"),
    path.resolve(process.env.HOME || "", ".openharness", "skills"),
    path.resolve("/tmp") // 用于单测试跑在 /tmp 目录下
  ];

  const isAllowed = allowedRoots.some(root => resolvedPath.startsWith(root));
  if (!isAllowed) {
    throw new Error(`Security Exception: Shred path is outside allowed sandbox directories: ${resolvedPath}`);
  }

  if (!fs.existsSync(resolvedPath)) {
    return;
  }

  // 2. Symlink 与普通文件校验保护
  const stat = fs.lstatSync(resolvedPath);
  if (stat.isSymbolicLink()) {
    throw new Error("Security Exception: Cannot shred a symbolic link");
  }
  if (!stat.isFile()) {
    throw new Error("Security Exception: Shred target is not a regular file");
  }

  const size = stat.size;

  if (size > 0) {
    const fd = fs.openSync(resolvedPath, "r+");
    try {
      // 覆写 3 次
      for (let run = 0; run < 3; run++) {
        const buffer = Buffer.alloc(size, 0); // 0x00 bytes
        fs.writeSync(fd, buffer, 0, size, 0);
        fs.fsyncSync(fd); // 强制刷盘到物理介质
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  // 截断文件为 0 字节并删除链接
  fs.truncateSync(resolvedPath, 0);
  fs.unlinkSync(resolvedPath);
}
