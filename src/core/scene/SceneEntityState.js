/** Shared entity-state predicates for scene projections and observers. */
export class SceneEntityState {
  static isDead(entity, entities = null) {
    if (!entity || entity.isDead || entity.isDying || entity.active === false) return true;
    const stats = entity.getComponent?.('stats');
    if (stats && Number(stats.hp) <= 0) return true;
    return Array.isArray(entities) && !entities.includes(entity);
  }
}

export default SceneEntityState;
