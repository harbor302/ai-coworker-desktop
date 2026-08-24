import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultResourceLoader } from '../src/main/agent/pi-sdk';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cowork-skills-loader-'));
  tempRoots.push(root);
  return root;
}

function writeSkill(root: string, name: string, description: string): string {
  const skillDir = join(root, name);
  mkdirSync(skillDir, { recursive: true });
  const skillFile = join(skillDir, 'SKILL.md');
  writeFileSync(
    skillFile,
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    'utf-8'
  );
  return skillFile;
}

afterEach(() => {
  vi.unstubAllEnvs();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('pi DefaultResourceLoader skill filtering', () => {
  it('loads only app-filtered additionalSkillPaths when SDK auto-discovery is disabled', async () => {
    const root = makeTempRoot();
    const cwd = join(root, 'workspace');
    const appAgentDir = join(root, 'app-agent');
    const home = join(root, 'home');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(appAgentDir, { recursive: true });
    mkdirSync(home, { recursive: true });
    vi.stubEnv('HOME', home);

    writeSkill(join(cwd, '.agents', 'skills'), 'auto-skill', 'Auto-discovered project skill');
    writeSkill(join(home, '.agents', 'skills'), 'user-skill', 'Auto-discovered user skill');
    const enabledSkill = writeSkill(
      join(root, 'enabled-skills'),
      'enabled-skill',
      'Skill selected by the app enabled state'
    );

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: appAgentDir,
      additionalSkillPaths: [enabledSkill],
      noSkills: true,
    });
    await loader.reload();

    expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual(['enabled-skill']);
  });

  it('loads the Confluence connector-bound skill from its SKILL.md path', async () => {
    const root = makeTempRoot();
    const cwd = join(root, 'workspace');
    const appAgentDir = join(root, 'app-agent');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(appAgentDir, { recursive: true });

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: appAgentDir,
      additionalSkillPaths: [resolve('src/main/mcp/connectors/confluence/skill/SKILL.md')],
      noSkills: true,
    });
    await loader.reload();

    expect(loader.getSkills().skills.map((skill) => skill.name)).toContain('confluence');
  });
});
