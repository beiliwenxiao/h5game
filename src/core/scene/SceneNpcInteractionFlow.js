/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { InputEventType } from '../input/InputEvent.js';

/**
 * 通用 NPC 世界交互流。
 *
 * 该 flow 只协调输入事件、距离/点击命中和 UI 表现；对话完成状态仍由
 * DialogueSystem 唯一拥有，商店、任务与剧情后果由注入的 adapter 处理。
 */
export class SceneNpcInteractionFlow {
  constructor({
    getNpcs = () => [],
    getPlayer = () => null,
    getDialogueSystem = () => null,
    getShopSystem = () => null,
    onInteract = () => {},
    showIdleText = () => {},
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    idleThrottleMs = 2000
  } = {}) {
    this.getNpcs = getNpcs;
    this.getPlayer = getPlayer;
    this.getDialogueSystem = getDialogueSystem;
    this.getShopSystem = getShopSystem;
    this.onInteract = onInteract;
    this.showIdleText = showIdleText;
    this.now = now;
    this.idleThrottleMs = idleThrottleMs;
  }

  /** 仅刷新范围与自动靠近交互；键鼠、触屏和手柄均由 handleInput 经路由进入。 */
  updatePresence() {
    const playerTransform = this.getPlayer()?.getComponent?.('transform');
    const dialogueSystem = this.getDialogueSystem();
    if (!playerTransform || dialogueSystem?.isDialogueActive?.()) return false;

    for (const npc of this.getNpcs() || []) {
      const transform = npc?.getComponent?.('transform');
      const npcComponent = npc?.getComponent?.('npc');
      if (!transform || !npcComponent?.hasInteraction?.()) continue;
      const inRange = this._updateRange(transform, playerTransform, npcComponent);
      if (npcComponent.interactionTrigger !== 'approach') continue;
      if (inRange && !npcComponent.interacted) {
        const succeeded = this._interact(npc, npcComponent, dialogueSystem);
        npcComponent.interacted = succeeded === true;
        return succeeded;
      }
      if (!inRange) npcComponent.interacted = false;
    }
    return false;
  }

  /** 由 SceneInputFlow 在 PICKUP 优先级调用；返回 true 即由路由独占消费。 */
  handleInput(event) {
    const playerTransform = this.getPlayer()?.getComponent?.('transform');
    const dialogueSystem = this.getDialogueSystem();
    if (!playerTransform || dialogueSystem?.isDialogueActive?.()) return false;
    const isInteractKey = event?.type === InputEventType.KEY_PRESS && event.key === 'e';
    const isPointer = event?.type === InputEventType.POINTER_DOWN;
    if (!isInteractKey && !isPointer) return false;

    for (const npc of this.getNpcs() || []) {
      const transform = npc?.getComponent?.('transform');
      const npcComponent = npc?.getComponent?.('npc');
      if (!transform || !npcComponent?.hasInteraction?.() || npcComponent.interactionTrigger === 'approach') continue;
      if (!this._updateRange(transform, playerTransform, npcComponent)) continue;
      if (isPointer && !this._isClickedNpc(event.world, npc, transform)) continue;
      return this._interact(npc, npcComponent, dialogueSystem);
    }
    return false;
  }

  _updateRange(transform, playerTransform, npcComponent) {
    const inRange = Math.hypot(
      transform.position.x - playerTransform.position.x,
      transform.position.y - playerTransform.position.y
    ) <= (npcComponent.interactionRadius || 60);
    npcComponent.inRange = inRange;
    return inRange;
  }

  _interact(npc, npcComponent, dialogueSystem) {
    const dialogueId = npcComponent.dialogueId;
    const dialogueDone = !!(dialogueId && dialogueSystem?.hasCompleted?.(dialogueId));
    const canTalk = !!(dialogueId && dialogueSystem?.startDialogue
      && (npcComponent.repeatableDialogue || !dialogueDone));
    if (canTalk) {
      const started = dialogueSystem.startDialogue(dialogueId) !== false;
      if (started) this.onInteract(npcComponent.npcId, npc, npcComponent);
      return started;
    }

    if (npcComponent.shopId && this.getShopSystem()?.openShop) {
      const opened = this.getShopSystem().openShop(npcComponent.shopId) !== false;
      if (opened) this.onInteract(npcComponent.npcId, npc, npcComponent);
      return opened;
    }
    if (!dialogueDone) return false;
    this._showIdleText(npc, npcComponent);
    return true;
  }

  _isClickedNpc(world, npc, transform) {
    if (!Number.isFinite(world?.x) || !Number.isFinite(world?.y)) return false;
    const sprite = npc.getComponent?.('sprite');
    const height = (sprite?.height || 48) * (sprite?.scale || 1);
    const width = (sprite?.width || 32) * (sprite?.scale || 1);
    return Math.abs(world.x - transform.position.x) <= width / 2 + 10
      && transform.position.y - world.y <= height + 10
      && world.y - transform.position.y <= 20;
  }

  _showIdleText(npc, npcComponent) {
    const current = this.now();
    if (npcComponent._idleTextAt && current - npcComponent._idleTextAt < this.idleThrottleMs) return;
    npcComponent._idleTextAt = current;
    const name = npc.getComponent?.('name')?.name || npc.name || npcComponent.npcId || '';
    const text = npcComponent.getIdleText?.(name) || `${name} 看了你一眼，继续忙事情去了。`;
    this.showIdleText({ npc, npcComponent, text });
  }
}

export default SceneNpcInteractionFlow;