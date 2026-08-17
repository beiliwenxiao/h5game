/**
 * Finds enemy groups that transitioned to fully cleared state.
 * The caller owns state commitment and any domain/trigger notification.
 */
export class SceneGroupClearObserver {
  static findCleared({ groups = {}, clearedGroups = new Set(), isEntityDead } = {}) {
    if (!groups || typeof groups !== 'object' || typeof isEntityDead !== 'function') return [];
    const cleared = [];
    for (const [group, entities] of Object.entries(groups)) {
      if (clearedGroups.has(group) || !Array.isArray(entities) || entities.length === 0) continue;
      if (entities.every(entity => isEntityDead(entity))) cleared.push(group);
    }
    return cleared;
  }
}

export default SceneGroupClearObserver;
