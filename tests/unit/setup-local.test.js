import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = resolve('scripts/setup-local.js');
const temporaryRoots = [];

function createTemporaryRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), 'my-flower-pots-setup-'));
  temporaryRoots.push(rootDir);
  return rootDir;
}

function writeFixture(rootDir, relativePath, content) {
  const target = join(rootDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return target;
}

async function loadSetupModule() {
  if (!existsSync(scriptPath)) return null;
  return import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}`);
}

afterEach(() => {
  for (const rootDir of temporaryRoots.splice(0)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

describe('local setup utility', () => {
  it('exists as a reusable module', async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const setupModule = await loadSetupModule();
    expect(setupModule?.setupLocalFiles).toBeTypeOf('function');
  });

  it('creates the missing private local configuration file', async () => {
    const setupModule = await loadSetupModule();
    if (!setupModule) return;

    const rootDir = createTemporaryRoot();
    writeFixture(rootDir, '.dev.vars.example', 'dev-template');

    const result = setupModule.setupLocalFiles({ rootDir, log() {} });

    expect(result).toEqual({
      created: ['.dev.vars'],
      skipped: [],
    });
    expect(readFileSync(join(rootDir, '.dev.vars'), 'utf8')).toBe('dev-template');
    expect(existsSync(join(rootDir, 'frontend/js/config.js'))).toBe(false);
  });

  it('never overwrites existing local configuration', async () => {
    const setupModule = await loadSetupModule();
    if (!setupModule) return;

    const rootDir = createTemporaryRoot();
    writeFixture(rootDir, '.dev.vars.example', 'new-dev-template');
    writeFixture(rootDir, '.dev.vars', 'keep-dev');

    const result = setupModule.setupLocalFiles({ rootDir, log() {} });

    expect(result).toEqual({
      created: [],
      skipped: ['.dev.vars'],
    });
    expect(readFileSync(join(rootDir, '.dev.vars'), 'utf8')).toBe('keep-dev');
  });

  it('fails before copying when a required template is missing', async () => {
    const setupModule = await loadSetupModule();
    if (!setupModule) return;

    const rootDir = createTemporaryRoot();
    expect(() => setupModule.setupLocalFiles({ rootDir, log() {} }))
      .toThrow(/模板文件不存在.*\.dev\.vars\.example/);
    expect(existsSync(join(rootDir, '.dev.vars'))).toBe(false);
  });
});
