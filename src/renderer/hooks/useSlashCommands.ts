import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Skill, InstalledPlugin } from '../types';

export interface SlashCommandItem {
  id: string;
  name: string;
  description?: string;
  category: 'skill' | 'command' | 'agent';
}

export function useSlashCommands() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [allSkills, installedPlugins] = await Promise.all([
        window.electronAPI.skills.getAll(),
        window.electronAPI.plugins.listInstalled(),
      ]);
      setSkills(allSkills.filter((s) => s.enabled));
      setPlugins(installedPlugins.filter((p) => p.enabled));
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo<SlashCommandItem[]>(() => {
    const result: SlashCommandItem[] = [];

    // Skills
    skills.forEach((skill) => {
      result.push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: 'skill',
      });
    });

    // Plugin commands (placeholder entries based on component counts)
    plugins.forEach((plugin) => {
      if (plugin.componentsEnabled.commands && plugin.componentCounts.commands > 0) {
        result.push({
          id: `cmd:${plugin.pluginId}`,
          name: plugin.name,
          description: `${plugin.componentCounts.commands} command(s)`,
          category: 'command',
        });
      }
      if (plugin.componentsEnabled.agents && plugin.componentCounts.agents > 0) {
        result.push({
          id: `agent:${plugin.pluginId}`,
          name: plugin.name,
          description: `${plugin.componentCounts.agents} agent(s)`,
          category: 'agent',
        });
      }
    });

    return result;
  }, [skills, plugins]);

  return { items, loaded, reload: load };
}
