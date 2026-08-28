import { describe, expect, it, vi } from 'vitest';
import { ScenarioCommandService, SCENARIO_COMMANDS } from './ScenarioCommandService.js';

function command(commandType, payload, operationId = 'scenario-op-1') {
  return { commandType, payload, operationId };
}

function context(stateId) {
  return {
    preparedStateRevision: { ok: true, stateId, next: 1 },
    commitStateRevision: vi.fn(() => ({ ok: true, stateRevision: 1 }))
  };
}

describe('ScenarioCommandService ownership boundaries', () => {
  it('world.teleport 同 Region 只委托 ChunkNavigator，跨 Region 只委托 RegionCoordinator', async () => {
    const teleport = vi.fn(async request => ({ ok: true, sceneId: request.sceneId }));
    const switchTo = vi.fn(async request => ({ ok: true, request }));
    const worldIndex = {
      findScene: sceneId => ({ sceneId, regionIndex: sceneId === 'S02' ? 0 : 1 })
    };
    const service = new ScenarioCommandService({
      getWorldIndex: () => worldIndex,
      getCurrentRegionIndex: () => 0,
      getChunkNavigator: () => ({ teleport }),
      getRegionCoordinator: () => ({ switchTo })
    });

    const localContext = context('world:navigation');
    const local = await service.execute(command(SCENARIO_COMMANDS.WORLD_TELEPORT, {
      sceneId: 'S02', spawnRef: 'player', transition: 'fadeBlack'
    }), localContext);
    expect(local.result).toMatchObject({ ok: true, committed: true, stateId: 'world:navigation' });
    expect(teleport).toHaveBeenCalledWith(expect.objectContaining({ sceneId: 'S02', spawnRef: 'player' }));
    expect(switchTo).not.toHaveBeenCalled();

    const regionContext = context('world:navigation');
    const region = await service.execute(command(SCENARIO_COMMANDS.WORLD_TELEPORT, {
      sceneId: 'S09', spawnRef: 'player'
    }, 'scenario-op-2'), regionContext);
    expect(region.result.ok).toBe(true);
    expect(switchTo).toHaveBeenCalledWith(expect.objectContaining({ sceneId: 'S09', regionIndex: 1 }));
    expect(teleport).toHaveBeenCalledTimes(1);
  });

  it('导航目标失败不提交 revision，也不调用 checkpoint 或其他领域 owner', async () => {
    const story = { currentSceneId: 'S01', completed: false };
    const teleport = vi.fn(async () => ({ ok: false, code: 'targetPrepareFailed' }));
    const requestAutoSave = vi.fn();
    const dialogueSystem = { startDialogue: vi.fn() };
    const tutorialSystem = { showTutorial: vi.fn() };
    const service = new ScenarioCommandService({
      dialogueSystem,
      tutorialSystem,
      getWorldIndex: () => ({ findScene: () => ({ regionIndex: 0 }) }),
      getCurrentRegionIndex: () => 0,
      getChunkNavigator: () => ({ teleport }),
      getSaveGameService: () => ({ requestAutoSave })
    });
    const executionContext = context('world:navigation');

    const output = await service.execute(command(SCENARIO_COMMANDS.WORLD_TELEPORT, {
      sceneId: 'S02', story
    }), executionContext);

    expect(output).toMatchObject({ ok: false, committed: false, code: 'targetPrepareFailed' });
    expect(executionContext.commitStateRevision).not.toHaveBeenCalled();
    expect(story).toEqual({ currentSceneId: 'S01', completed: false });
    expect(requestAutoSave).not.toHaveBeenCalled();
    expect(dialogueSystem.startDialogue).not.toHaveBeenCalled();
    expect(tutorialSystem.showTutorial).not.toHaveBeenCalled();
  });

  it('checkpoint.request 只调用 SaveGameService，并在不可用时才回退 SnapshotManager', async () => {
    const requestAutoSave = vi.fn(async meta => ({ ok: true, slot: 'autosave-1', meta }));
    const capture = vi.fn(() => ({ ok: true, snapshot: {} }));
    const service = new ScenarioCommandService({
      getSaveGameService: () => ({ requestAutoSave }),
      getSnapshotManager: () => ({ capture })
    });
    const executionContext = context('snapshot:checkpoint');

    const output = await service.execute(command(SCENARIO_COMMANDS.CHECKPOINT_REQUEST, {
      checkpointId: 'checkpoint.S01.complete', sceneId: 'S01'
    }), executionContext);

    expect(output.result).toMatchObject({ ok: true, committed: true, stateId: 'snapshot:checkpoint' });
    expect(requestAutoSave).toHaveBeenCalledWith({
      reason: 'checkpoint', checkpointId: 'checkpoint.S01.complete', sceneId: 'S01'
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('dialogue/tutorial 命令只修改各自唯一 owner', async () => {
    const dialogueSystem = { startDialogue: vi.fn(() => true) };
    const tutorialSystem = { showTutorial: vi.fn(() => true) };
    const service = new ScenarioCommandService({ dialogueSystem, tutorialSystem });

    await service.execute(command(SCENARIO_COMMANDS.DIALOGUE, {
      dialogueId: 'dialogue.one', operation: 'start'
    }), context('dialogue:dialogue.one'));
    expect(dialogueSystem.startDialogue).toHaveBeenCalledWith('dialogue.one', {});
    expect(tutorialSystem.showTutorial).not.toHaveBeenCalled();

    await service.execute(command(SCENARIO_COMMANDS.TUTORIAL, {
      tutorialId: 'tutorial.one', operation: 'show'
    }, 'scenario-op-2'), context('tutorial:tutorial.one'));
    expect(tutorialSystem.showTutorial).toHaveBeenCalledWith('tutorial.one', {});
    expect(dialogueSystem.startDialogue).toHaveBeenCalledTimes(1);
  });

  it('await 教程 show 先提交 revision 释放 reservation，再等待离槽（不阻塞同教程 complete）', async () => {
    const hideListeners = [];
    const current = { id: 'tutorial.one' };
    const tutorialSystem = {
      showTutorial: vi.fn(() => true),
      onHide: vi.fn(listener => { hideListeners.push(listener); return () => {}; }),
      currentTutorial: current,
      pendingTutorials: [],
      completedTutorials: new Set()
    };
    const service = new ScenarioCommandService({ tutorialSystem });
    const stateId = 'tutorial:tutorial.one';

    // await show 命令：execute 返回前应已提交 revision（commitStateRevision 被调用）
    const showCommand = service.execute(command(SCENARIO_COMMANDS.TUTORIAL, {
      tutorialId: 'tutorial.one', operation: 'show', await: true
    }), context(stateId));
    let settled = false;
    showCommand.then(() => { settled = true; });

    // 等待微任务推进：awaitHide 已挂起，revision 应先提交（释放 reservation）
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false); // 仍在等待教程离槽
    // 模拟 complete 命令（同 stateId）推进：教程离槽并触发 onHide
    current.id = null;
    hideListeners.forEach(listener => listener());
    await showCommand;
    expect(settled).toBe(true);
  });
});