const clone = value => value == null ? value : (typeof structuredClone === 'function'
  ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

/**
 * 将已验证的导航事实投影到宿主状态。
 *
 * 此类不保存导航、Story 或 Region 状态；它只在 ChunkNavigator/RegionCoordinator
 * 已建立的事务边界内调用注入的读写端口，因此失败仍由既有导航 owner 回滚。
 */
export class SceneNavigationProjection {
  constructor({
    getCurrentSceneId = () => null,
    setCurrentSceneId = () => {},
    getStoryState = () => null,
    setStoryState = () => {},
    onSceneChanged = () => {}
  } = {}) {
    this.getCurrentSceneId = getCurrentSceneId;
    this.setCurrentSceneId = setCurrentSceneId;
    this.getStoryState = getStoryState;
    this.setStoryState = setStoryState;
    this.onSceneChanged = onSceneChanged;
  }

  capture() {
    return {
      currentSceneId: this.getCurrentSceneId(),
      storyState: clone(this.getStoryState())
    };
  }

  apply({ sceneId, unlock = false, projectStory = true } = {}) {
    if (typeof sceneId !== 'string' || !sceneId) {
      throw Object.assign(new Error('navigation sceneId is required'), { code: 'missingNavigationSceneId' });
    }
    const storyState = this.getStoryState();
    if (projectStory && storyState) {
      const unlockedScenes = unlock
        ? [...new Set([...(storyState.unlockedScenes || []), sceneId])]
        : storyState.unlockedScenes;
      this.setStoryState({ ...storyState, currentSceneId: sceneId, ...(unlock ? { unlockedScenes } : {}) });
    }
    this.setCurrentSceneId(sceneId);
    this.onSceneChanged(sceneId);
    return { ok: true, sceneId };
  }

  restore(snapshot = {}) {
    if (snapshot.storyState !== undefined) this.setStoryState(clone(snapshot.storyState));
    if (snapshot.currentSceneId !== undefined) {
      this.setCurrentSceneId(snapshot.currentSceneId);
      this.onSceneChanged(snapshot.currentSceneId);
    }
    return { ok: true };
  }
}

export default SceneNavigationProjection;