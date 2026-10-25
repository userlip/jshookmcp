import { describe, expect, it } from 'vitest';
import {
  buildChromiumDebugLaunch,
  isChromiumLikeExecutable,
} from '@modules/process/chromium-launch';

describe('isChromiumLikeExecutable', () => {
  it('recognizes Chromium-family executable names with or without .exe', () => {
    for (const path of [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      '/usr/bin/chromium',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
      'C:/Users/x/AppData/Local/Vivaldi/Application/vivaldi.exe',
      '/Applications/Opera.app/Contents/MacOS/Opera',
      'C:/app/electron.exe',
    ]) {
      expect(isChromiumLikeExecutable(path), path).toBe(true);
    }
  });

  it('rejects non-Chromium executables', () => {
    for (const path of [
      'C:/Python/python.exe',
      '/usr/bin/java',
      'C:/ghidra/ghidraRun.exe',
      'C:/Windows/System32/notepad.exe',
    ]) {
      expect(isChromiumLikeExecutable(path), path).toBe(false);
    }
  });

  it('matches by basename only, ignoring path decoys', () => {
    expect(isChromiumLikeExecutable('C:/tools/chrome/decoder.exe')).toBe(false);
    expect(isChromiumLikeExecutable('C:/tools/java-chrome-plugin/java.exe')).toBe(false);
  });
});

describe('buildChromiumDebugLaunch', () => {
  it('prepends debug port and auto user-data-dir for Chromium targets without one', () => {
    const plan = buildChromiumDebugLaunch('C:/chrome/chrome.exe', 9222, ['--headless']);

    expect(plan.chromiumLike).toBe(true);
    expect(plan.debugPortSupported).toBe(true);
    expect(plan.userDataDirInjected).toBe(true);
    expect(plan.debugArgs[0]).toBe('--remote-debugging-port=9222');
    const udd = plan.debugArgs.find((a) => a.startsWith('--user-data-dir='));
    expect(udd).toBeDefined();
    // user-data-dir must point somewhere outside the default profile dir
    expect(udd).not.toBe('--user-data-dir=');
    expect(plan.debugArgs.slice(2)).toEqual(['--headless']);
  });

  it('keeps a user-supplied --user-data-dir untouched', () => {
    const plan = buildChromiumDebugLaunch('C:/chrome/chrome.exe', 9222, [
      '--user-data-dir=C:/my-profile',
    ]);

    expect(plan.userDataDirInjected).toBe(false);
    expect(plan.debugArgs).toContain('--user-data-dir=C:/my-profile');
    expect(plan.debugArgs.filter((a) => a.startsWith('--user-data-dir='))).toHaveLength(1);
  });

  it('launches non-Chromium targets without any debug flag', () => {
    const plan = buildChromiumDebugLaunch('C:/Python/python.exe', 9222, ['script.py']);

    expect(plan.chromiumLike).toBe(false);
    expect(plan.debugPortSupported).toBe(false);
    expect(plan.debugArgs).toEqual(['script.py']);
    expect(plan.debugArgs.some((a) => a.includes('remote-debugging'))).toBe(false);
  });
});
