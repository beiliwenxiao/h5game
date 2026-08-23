import { ResourceNodeComponent } from '../../ecs/components/ResourceNodeComponent.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * 将首次死亡的敌对实体原地转换为非战斗尸体。
 * 尸体保留实际死亡位置和原表现；可选资源节点继续交给 GatheringSystem 结算。
 */
export class SceneCorpseRuntime {
  constructor({ entityStore, aiSystem = null } = {}) {
    if (!entityStore) throw new TypeError('SceneCorpseRuntime requires entityStore');
    this.entityStore = entityStore;
    this.aiSystem = aiSystem;
    this.disposed = false;
  }

  retain(entity, state = null) {
    if (this.disposed || !entity || entity.type === 'player') return false;
    if (entity.isCorpse === true) {
      this._applyState(entity, state);
      return true;
    }
    if (entity.type !== 'enemy') return false;

    const definition = entity.corpseDefinition || {};
    this.aiSystem?.unregisterAI?.(entity);
    this.entityStore.reclassifyAsCorpse?.(entity);

    entity.type = 'corpse';
    entity.isCorpse = true;
    entity.isDead = true;
    entity.isDying = true;
    entity.active = true;
    entity.corpseSource = Object.freeze({
      entityId: entity.id || null,
      placementId: entity.placementId || null,
      definitionId: entity.contentId || entity.definitionId || entity.templateId || null
    });
    entity.tags = [...new Set((entity.tags || []).filter(tag => tag !== 'enemy').concat('corpse'))];

    const movement = entity.getComponent?.('movement');
    if (movement) {
      movement.enabled = false;
      if (movement.velocity) {
        movement.velocity.x = 0;
        movement.velocity.y = 0;
      }
      if (Array.isArray(movement.path)) movement.path.length = 0;
    }
    entity.getComponent?.('combat')?.clearTarget?.();

    const name = entity.getComponent?.('name');
    if (name) {
      name.name = definition.name || `${entity.name || name.name || '怪物'}尸体`;
      name.visible = false;
    }
    entity.name = definition.name || `${entity.name || '怪物'}尸体`;

    if (definition.resourceNode && !entity.getComponent?.('resourceNode')) {
      entity.addComponent?.(new ResourceNodeComponent(clone(definition.resourceNode)));
    }
    this._applyState(entity, state);
    return true;
  }

  _applyState(entity, state = null) {
    if (!state || typeof state !== 'object') return;
    const transform = entity.getComponent?.('transform');
    if (transform && Number.isFinite(state.position?.x) && Number.isFinite(state.position?.y)) {
      transform.position.x = state.position.x;
      transform.position.y = state.position.y;
    }
    const node = entity.getComponent?.('resourceNode');
    if (node && state.resourceNode) node.deserialize?.(state.resourceNode);
  }

  capture(entity) {
    if (!entity?.isCorpse) return null;
    const position = entity.getComponent?.('transform')?.position;
    const resourceNode = entity.getComponent?.('resourceNode');
    return {
      kind: 'corpse',
      removed: false,
      position: position ? { x: Number(position.x) || 0, y: Number(position.y) || 0 } : null,
      ...(resourceNode?.serialize ? { resourceNode: resourceNode.serialize() } : {})
    };
  }

  dispose() {
    this.disposed = true;
    this.entityStore = null;
    this.aiSystem = null;
  }
}

export default SceneCorpseRuntime;