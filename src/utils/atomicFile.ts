import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 原子写入文件：同目录临时文件 + fsync + rename。
 *
 * 临时文件名带 pid/随机后缀，避免并发保存时互相覆盖；rename 在 POSIX 下是原子的。
 * Windows 上目录 fsync 会失败，这里忽略该错误，不影响数据写入。
 */
export const atomicWriteFile = (filePath: string, content: string, mode: number = 0o600): void => {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  let fd: number | undefined;

  try {
    fd = openSync(tempPath, 'w', mode);
    writeFileSync(fd, content, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;

    renameSync(tempPath, filePath);

    // 尽量把目录项也落盘；Windows 不支持对目录 fsync
    try {
      const dirFd = openSync(dirname(filePath), 'r');
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch {
      // ignore
    }
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore
    }
    throw error;
  }
};
