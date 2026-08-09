/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

import { ClickFeedbackRenderer } from '../../rendering/ClickFeedbackRenderer.js';
import { InputEventType } from '../input/InputEvent.js';

/** 统一处理 UI/世界点击、点击拾取、兼容轻功入口与右键反馈。 */
export class SceneWorldInteraction {
  constructor(scene, options = {}) {
    if (!scene) throw new TypeError('SceneWorldInteraction requires scene');
    this.scene = scene;
    this.feedbackRenderer = options.feedbackRenderer || ClickFeedbackRenderer;
    this.document = options.document || globalThis.document;
    this.clickRings = [];
  }

  handleUIClick() {
    const scene = this.scene;
    const input = scene.inputManager;
    if (!input?.isMouseClicked() || input.isMouseClickHandled()) return;

    const mousePos = input.getMousePosition();
    const button = input.getMouseButton() === 2 ? 'right' : 'left';
    if (button === 'left' && scene.minimap?.visible &&
        scene.minimap.containsPoint(mousePos.x, mousePos.y) &&
        scene.minimap.handleClick(mousePos.x, mousePos.y)) {
      input.markMouseClickHandled();
      return;
    }

    if (scene.dialogueSystem?.isDialogueActive()) {
      if (scene.dialogueBox?.visible &&
          scene.dialogueBox.handleMouseClick(mousePos.x, mousePos.y, button)) {
        input.markMouseClickHandled();
        return;
      }
      // 对话期间即使点击框外，也不能穿透到世界移动。
      input.markMouseClickHandled();
      return;
    }

    if (scene.uiClickHandler.handleClick(mousePos.x, mousePos.y, button)) {
      input.markMouseClickHandled();
    } else if (button === 'left' && scene.backpackPanel?.visible) {
      scene.backpackPanel.hide();
      input.markMouseClickHandled();
    }
  }

  handleGatheringCancel(event = {}) {
    const scene = this.scene;
    if (event.type !== InputEventType.KEY_PRESS || String(event.key).toLowerCase() !== 'e') return false;
    if (!scene.gatheringSystem?.isActiveFor?.(scene.playerEntity)) return false;
    scene.gatheringSystem.interrupt('cancelled');
    return true;
  }

  handlePickupInput(event = {}) {
    const scene = this.scene;
    if (scene.dialogueSystem?.isDialogueActive() || scene.backpackPanel?.visible) return false;
    if (this.handleGatheringCancel(event)) return true;

    if (event.type === InputEventType.POINTER_DOWN) {
      if (!event.world || event.button === 2) return false;
      return this.tryClickPickup(event.world.x, event.world.y, { operationId: `input-${event.id}` });
    }
    if (event.type === InputEventType.KEY_PRESS && String(event.key).toLowerCase() === 'e') {
      return this.tryRangePickup({ operationId: `input-${event.id}`, device: event.device });
    }
    return false;
  }

  /** 旧直接调用入口仅作为兼容转发；新输入统一走 handlePickupInput。 */
  handlePickupClick() {
    const input = this.scene.inputManager;
    if (!input?.isMouseClicked() || input.isMouseClickHandled() || input.getMouseButton() === 2) return false;
    const screen = input.getMousePosition();
    const world = this.scene.camera
      ? this.scene.camera.screenToWorld(screen.x, screen.y)
      : input.getMouseWorldPosition();
    const handled = this.handlePickupInput({
      id: `legacy-${Date.now()}`,
      type: InputEventType.POINTER_DOWN,
      button: input.getMouseButton(),
      world
    });
    if (handled) input.markMouseClickHandled();
    return handled;
  }

  tryRangePickup(request = {}) {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.pickupSystem) return false;
    const result = scene.pickupSystem.requestPickup({
      playerEntity: scene.playerEntity,
      pickupItems: scene.pickupItems,
      equipmentItems: scene.equipmentItems,
      ...request
    });
    this._applyPickupResult(result);
    const picked = (result.pickedItems?.length || 0) > 0 || (result.removedEntities?.length || 0) > 0;
    return picked || this.scene.harvestByFacing?.({ silent: true }) === true;
  }

  tryClickPickup(worldX, worldY, request = {}) {
    const scene = this.scene;
    if (!scene.playerEntity || !scene.pickupSystem) return false;
    const isHit = (x, y) => Math.hypot(x - worldX, y - worldY) <= 30;
    let hit = scene.pickupItems.some(item => !item.picked && isHit(item.x, item.y));
    if (!hit) {
      hit = scene.equipmentItems.some(item => {
        if (item.picked) return false;
        const position = item.getComponent?.('transform')?.position;
        return isHit(position?.x ?? item.x, position?.y ?? item.y);
      });
    }
    if (!hit) return false;

    const result = scene.pickupSystem.requestPickup({
      playerEntity: scene.playerEntity,
      pickupItems: scene.pickupItems,
      equipmentItems: scene.equipmentItems,
      ...request
    });
    this._applyPickupResult(result);
    // 命中物品即消费指针，背包已满时也不能穿透成攻击。
    return true;
  }

  _applyPickupResult(result = {}) {
    const scene = this.scene;
    const removedEntities = result.removedEntities || [];
    if (scene.entityStore?.removeMany) {
      scene.entityStore.removeMany(removedEntities);
    } else if (Array.isArray(scene.entities)) {
      const removedSet = new Set(removedEntities);
      for (let index = scene.entities.length - 1; index >= 0; index--) {
        if (removedSet.has(scene.entities[index])) scene.entities.splice(index, 1);
      }
    }
  }

  /** 保留旧 Ctrl+左键轻功入口；当前 PC 主路径由瞄准服务驱动。 */
  handleTeleport() {
    const scene = this.scene;
    const input = scene.inputManager;
    if (!input?.isCtrlClick() || input.isMouseClickHandled()) return;
    if (scene.flightSystem?.isPlayerFlying()) {
      input.markMouseClickHandled();
      return;
    }
    if (!scene.playerEntity || !scene.camera) return;
    const transform = scene.playerEntity.getComponent('transform');
    if (!transform) return;

    try {
      console.log('=== 轻功开始 ===');
      const mouseScreenPos = input.getMousePosition();
      const mouseWorld = scene.camera.screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
      if (scene.flightSystem?.startFlight(transform, mouseWorld.x, mouseWorld.y)) {
        input.markMouseClickHandled();
      }
    } catch (error) {
      console.error('轻功过程中发生错误:', error);
      console.error('错误堆栈:', error.stack);
      input.markMouseClickHandled();
    }
  }

  /** 右键点击正式反馈；详细坐标日志仅在 debugMode 下输出。 */
  debugRightClick() {
    const scene = this.scene;
    const input = scene.inputManager;
    const mouseScreen = input.getMousePosition();
    const mouseWorld = input.getMouseWorldPosition();
    const cameraWorldPos = scene.camera?.screenToWorld(mouseScreen.x, mouseScreen.y) || null;
    const playerPos = scene.playerEntity?.getComponent('transform')?.position || null;

    if (scene.debugMode) {
      const viewBounds = scene.camera?.getViewBounds() || null;
      const rawMouse = input.mouse;
      console.log('=== 右键点击调试 ===');
      console.log('屏幕坐标 (mouse.x/y):', mouseScreen.x.toFixed(1), mouseScreen.y.toFixed(1));
      console.log('InputManager worldX/Y:', mouseWorld.x.toFixed(1), mouseWorld.y.toFixed(1));
      console.log('Camera.screenToWorld:', cameraWorldPos ? `${cameraWorldPos.x.toFixed(1)}, ${cameraWorldPos.y.toFixed(1)}` : 'N/A');
      console.log('相机位置:', scene.camera ? `${scene.camera.position.x.toFixed(1)}, ${scene.camera.position.y.toFixed(1)}` : 'N/A');
      console.log('相机尺寸:', scene.camera ? `${scene.camera.width} x ${scene.camera.height}` : 'N/A');
      console.log('视野边界:', viewBounds ? `L=${viewBounds.left} T=${viewBounds.top} R=${viewBounds.right} B=${viewBounds.bottom}` : 'N/A');
      console.log('InputManager cameraX/Y:', input.cameraX?.toFixed(1), input.cameraY?.toFixed(1));
      console.log('玩家位置:', playerPos ? `${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}` : 'N/A');
      const canvas = this.document?.getElementById('gameCanvas');
      const rect = canvas?.getBoundingClientRect();
      console.log('Canvas尺寸:', scene.logicalWidth, 'x', scene.logicalHeight, '| canvas.width:', canvas?.width, '| rect:', rect ? `left=${rect.left.toFixed(1)} top=${rect.top.toFixed(1)} w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)}` : 'N/A');
      console.log('原始 clientX/Y:', rawMouse._rawClientX, rawMouse._rawClientY);
      console.log('==================');
    }

    const targetPos = cameraWorldPos || mouseWorld;
    this.clickRings.push(this.feedbackRenderer.createRing({
      worldX: targetPos.x,
      worldY: targetPos.y,
      screenX: mouseScreen.x,
      screenY: mouseScreen.y,
      playerX: playerPos?.x || 0,
      playerY: playerPos?.y || 0
    }));
  }

  renderClickRings(ctx) {
    if (this.clickRings.length === 0) return;
    this.clickRings = this.feedbackRenderer.prune(this.clickRings);
    this.feedbackRenderer.renderWorldRings(ctx, this.clickRings, this.scene.debugMode);
  }

  renderClickScreenMarkers(ctx) {
    if (!this.scene.debugMode) return;
    this.feedbackRenderer.renderScreenMarkers(ctx, this.clickRings);
  }

  handleEnemySelection() {
    // 不再需要选中敌人，使用滑动攻击。
  }

  reset() {
    this.clickRings.length = 0;
  }
}

export default SceneWorldInteraction;
