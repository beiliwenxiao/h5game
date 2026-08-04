/**
 * SceneGameLoaderBridge - 将 GameLoader 的通用依赖与场景生命周期连接起来。
 *
 * 场景剧情专属动作仍通过 onReady 注入；本桥接只处理可复用的默认依赖、
 * 对话结束事件、物品奖励回调、场景标记、上下文同步和 sceneEnter。
 */
import { GameLoader } from '../GameLoader.js';

export class SceneGameLoaderBridge {
  /** @param {Object} scene @param {Object} [options] */
  constructor(scene, { GameLoaderClass = GameLoader } = {}) {
    this.scene = scene;
    this.GameLoaderClass = GameLoaderClass;
    this._dialogueEndOff = null;
  }

  /** 装配项目并将 GameLoader 写回 scene.gameLoader。 */
  async initialize(projectUrl = 'game.project.json', options = {}) {
    const scene = this.scene;
    this.dispose();

    const loader = new this.GameLoaderClass();
    scene.gameLoader = loader;
    const engine = typeof window !== 'undefined' ? window.gameEngine : null;
    const deps = {
      dialogueSystem: scene.dialogueSystem,
      questSystem: scene.questSystem,
      combatSystem: scene.combatSystem,
      sceneManager: engine ? engine.sceneManager : (scene.sceneManager || null),
      audioManager: scene.audioManager || engine?.audioManager || null,
      floatingText: scene.floatingTextManager,
      tutorial: { showTip: params => scene._showScreenTip((params?.text) || '') },
      onItemGained: (item, player) => scene.onItemGained(item, player || scene.playerEntity),
      player: scene.playerEntity || null,
      scene,
      ...(options.deps || {})
    };

    await loader.load(projectUrl, deps);
    const triggerSystem = loader.triggerSystem;
    this._bindDialogueEnd(triggerSystem);

    if (options.sceneFlag) loader.blackboard.set(options.sceneFlag, true);
    // 保持旧顺序：子类自定义动作先注册，再由通用动作定义最终默认实现。
    if (typeof options.onReady === 'function') options.onReady(loader, triggerSystem);
    if (typeof scene._startPromptSwitch === 'function') {
      triggerSystem.registerAction('promptSwitch', params => scene._startPromptSwitch(params));
    }
    if (typeof scene._toggleDebugPanel === 'function') {
      triggerSystem.registerAction('toggleDebug', () => scene._toggleDebugPanel());
    }
    if (scene.playerEntity) loader.updateContext({ player: scene.playerEntity });
    if (options.sceneId) triggerSystem.fire('sceneEnter', { sceneId: options.sceneId });
    return loader;
  }

  /** 释放桥接事件监听；不销毁场景拥有的 DialogueSystem。 */
  dispose() {
    if (typeof this._dialogueEndOff === 'function') this._dialogueEndOff();
    this._dialogueEndOff = null;
  }

  _bindDialogueEnd(triggerSystem) {
    const dialogue = this.scene.dialogueSystem;
    if (!dialogue?.onEnd) return;
    const off = dialogue.onEnd(data => triggerSystem.fire('dialogueEnd', { id: data?.id }));
    this._dialogueEndOff = typeof off === 'function' ? off : null;
  }
}

export default SceneGameLoaderBridge;