/** Chromium-family heuristics for debug launch (issue #206).
 * Deliberately a filename-heuristic engine, not a known-good library:
 * we only test the executable's basename against a family-pattern list,
 * never paths or binary contents.
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROMIUM_BASENAME_PATTERNS: RegExp[] = [
  /^chrome(\.exe)?$/i,
  /^chromium(-browser)?(\.exe)?$/i,
  /^msedge(\.exe)?$/i,
  /^brave(\.exe)?$/i,
  /^vivaldi(\.exe)?$/i,
  /^opera(\.exe)?$/i,
  /^electron(\.exe)?$/i,
  /^msedge\.beta|msedge\.dev|msedge\.sxs$/i,
  /^chrome(-beta|-dev|-canary|sxs)?(\.exe)?$/i,
];

/** True when the executable basename looks like a Chromium-family binary. */
export function isChromiumLikeExecutable(executablePath: string): boolean {
  const basename =
    String(executablePath || '')
      .split(/[\\/]/)
      .pop() || '';
  return CHROMIUM_BASENAME_PATTERNS.some((re) => re.test(basename));
}

/** True when the caller already supplied a --user-data-dir argument. */
function hasUserDataDir(args: string[]): boolean {
  return args.some((a) => a === '--user-data-dir' || a.startsWith('--user-data-dir='));
}

export interface ChromiumDebugLaunchPlan {
  /** Final argv to spawn with (debug flags first, then user args). */
  debugArgs: string[];
  /** Basename heuristic verdict. */
  chromiumLike: boolean;
  /** False for non-Chromium targets: no debug flag was added. */
  debugPortSupported: boolean;
  /** True when we appended a fresh --user-data-dir (Chrome 136+ requirement). */
  userDataDirInjected: boolean;
}

/**
 * Build the argv for a debug launch:
 * - Chromium targets get `--remote-debugging-port` prepended and, when the
 *   caller did not pass one, a fresh `--user-data-dir` (required since
 *   Chrome 136 for non-default profiles).
 * - Non-Chromium targets are launched as-is without any debug flag.
 */
export function buildChromiumDebugLaunch(
  executablePath: string,
  debugPort: number,
  args: string[],
): ChromiumDebugLaunchPlan {
  const chromiumLike = isChromiumLikeExecutable(executablePath);

  if (!chromiumLike) {
    return {
      debugArgs: [...args],
      chromiumLike,
      debugPortSupported: false,
      userDataDirInjected: false,
    };
  }

  const userDataDirInjected = !hasUserDataDir(args);
  const debugArgs = [
    `--remote-debugging-port=${debugPort}`,
    ...(userDataDirInjected
      ? [`--user-data-dir=${join(tmpdir(), `jshook-debug-${randomUUID()}`)}`]
      : []),
    ...args,
  ];

  return { debugArgs, chromiumLike, debugPortSupported: true, userDataDirInjected };
}
