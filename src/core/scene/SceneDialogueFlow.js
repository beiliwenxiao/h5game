/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

/** 统一处理对话继续、打字机跳过和点击消费。 */
export class SceneDialogueFlow {
  constructor(scene) {
    if (!scene) throw new TypeError('SceneDialogueFlow requires scene');
    this.scene = scene;
  }

  checkContinue() {
    const scene = this.scene;
    const dialogue = scene.dialogueSystem;
    const input = scene.inputManager;
    if (!dialogue?.isDialogueActive() || !input) return;

    const spacePressed = input.isKeyPressed('space');
    const interactPressed = input.isKeyPressed('e');
    const clicked = input.isMouseClicked?.() === true;
    if (!spacePressed && !interactPressed && !clicked) return;

    // isKeyPressed 是帧沿信号，无需额外防连；lastSpacePressed 保留为旧场景兼容字段。
    if (dialogue.isTyping()) {
      dialogue.skipTypewriter();
      if (clicked) input.markMouseClickHandled();
      return;
    }

    const currentNode = dialogue.getCurrentNode();
    if (!currentNode) return;
    // 选项节点必须由玩家明确选择，不能由继续信号自动越过。
    if (currentNode.choices?.length > 0) return;

    dialogue.continue();
    if (clicked) input.markMouseClickHandled();
    if (!dialogue.isDialogueActive()) scene.dialogueBox?.hide();
  }
}

export default SceneDialogueFlow;
