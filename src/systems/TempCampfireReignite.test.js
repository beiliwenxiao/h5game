import { describe, it, expect } from 'vitest';
import { SceneCampfireService } from '../core/scene/SceneCampfireService.js';
import fs from 'fs';
import path from 'path';

function loadJson(relative) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8'));
}

function findItem(project, id) {
  for (const key of ['items', 'equipment', 'resourceNodes', 'stories']) {
    const arr = project?.library?.[key] || project?.[key];
    if (Array.isArray(arr)) {
      const it = arr.find(e => e?.id === id);
      if (it) return it;
    }
  }
  return null;
}

describe('Temp campfire re-ignition', () => {
  it('ignite -> extinguish -> re-ignite sets lit and fog', () => {
    const project = loadJson('example/sanguo_zhangjiao/game.project.json');
    const allArrays = [];
    const collect = (node) => {
      if (Array.isArray(node)) allArrays.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(collect);
    };
    collect(project);
    let item = null;
    for (const arr of allArrays) {
      const it = arr.find(e => e?.id === 'story.s01.campfire');
      if (it && it.campfirePresentation) { item = it; break; }
    }
    expect(item).toBeTruthy();
    const service = new SceneCampfireService({
      configView: item.campfirePresentation,
      createCanvas: () => ({ width: 0, height: 0, getContext: () => null })
    });
    expect(service.isConfigured()).toBe(true);
    const mockParticles = { createEmitter: () => ({ active: true, position: {}, particleConfig: { velocity: {}, sortY: 0 } }), updateEmitter: () => {} };
    const rt = { particleSystem: mockParticles };

    // 首次点燃
    expect(service.ignite({ runtime: rt })).toBe(true);
    expect(service.isLit()).toBe(true);
    console.log('initial lit=', service.isLit(), 'fogActive=', service.fog.active, 'fogOpacity=', service.fog.opacity);

    // 模拟燃料烧尽：restore 到接近烧尽状态再 update 触发 extinguish
    service.restore({ lit: true, hasBeenIgnited: true, fuel: { remainingSeconds: 0.5, active: true } }, rt);
    service.update(0.6, rt);
    expect(service.isLit()).toBe(false);
    expect(service.fuel.remainingSeconds).toBe(0);
    console.log('after extinguish lit=', service.isLit(), 'hasBeenIgnited=', service.campfire.hasBeenIgnited);

    // 投柴 + 重新点燃
    expect(service.addFuelUnits(1)).toBe(true);
    expect(service.canIgnite()).toBe(true);
    expect(service.ignite({ runtime: rt })).toBe(true);
    expect(service.isLit()).toBe(true);
    console.log('reignited lit=', service.isLit(), 'fog=', JSON.stringify(service.fog), 'hasBeenIgnited=', service.campfire.hasBeenIgnited);
  });
});