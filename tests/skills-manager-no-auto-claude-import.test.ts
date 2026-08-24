import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cowork-skills-manager-'));
  tempRoots.push(root);
  return root;
}

function writeSkill(root: string, name: string): void {
  const skillDir = join(root, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} description\n---\n`,
    'utf-8'
  );
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('electron');
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('SkillsManager global skills loading', () => {
  it('does not auto-import skills from ~/.claude/skills', async () => {
    const root = makeTempRoot();
    const home = join(root, 'home');
    const userData = join(root, 'userData');
    const appPath = join(root, 'app');
    mkdirSync(home, { recursive: true });
    mkdirSync(userData, { recursive: true });
    mkdirSync(appPath, { recursive: true });
    writeSkill(join(home, '.claude', 'skills'), 'claude-only');

    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getAppPath: () => appPath,
        getPath: (name: string) => {
          if (name === 'home') return home;
          if (name === 'userData') return userData;
          return root;
        },
      },
    }));

    const { SkillsManager } = await import('../src/main/skills/skills-manager');
    const manager = new SkillsManager({ prepare: vi.fn() } as never);

    const skills = await manager.loadGlobalSkills();

    expect(skills).toEqual([]);
  });
});
