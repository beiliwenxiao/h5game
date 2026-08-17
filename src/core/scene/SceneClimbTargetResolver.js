/**
 * Resolves the nearest semantic climb surface from an already projected world view.
 * It does not own ability checks, UI hints, or scene-specific content.
 */
export class SceneClimbTargetResolver {
  static resolve({
    entity = null,
    sceneId = null,
    projectedObjects = [],
    sceneData = null,
    worldOffset = { x: 0, y: 0 }
  } = {}) {
    const transform = entity?.getComponent?.('transform');
    if (!transform || !sceneId) return null;

    const offsetX = Number(worldOffset?.x) || 0;
    const offsetY = Number(worldOffset?.y) || 0;
    const projected = Array.isArray(projectedObjects)
      ? projectedObjects.filter(object => (
        object?.sceneId === sceneId && object?.semanticRole === 'climbSurface'
      ))
      : [];
    const sources = projected.length > 0
      ? projected
      : this._projectLocalSurfaces(sceneData, offsetX, offsetY);

    let best = null;
    for (const surface of sources) {
      const centerX = Number(surface.x) + (Number(surface.width) || 0) / 2;
      const centerY = Number(surface.y) + (Number(surface.height) || 0) / 2;
      const distance = Math.hypot(
        transform.position.x - centerX,
        transform.position.y - centerY
      );
      const radius = Math.max(32, Number(surface.radius) || 96);
      if (distance > radius || (best && best.distance <= distance)) continue;

      const target = surface.climbTarget || {};
      const targetX = Number(target.x);
      const targetY = Number(target.y);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;
      best = {
        id: surface.id,
        distance,
        promptTemplate: surface.prompt || '{climb}攀爬',
        targetPosition: {
          x: targetX + (surface.climbTargetWorld === true ? 0 : offsetX),
          y: targetY + (surface.climbTargetWorld === true ? 0 : offsetY)
        }
      };
    }
    return best;
  }

  static _projectLocalSurfaces(sceneData, offsetX, offsetY) {
    if (!Array.isArray(sceneData?.layers)) return [];
    return sceneData.layers.flatMap(layer => (layer.objects || [])
      .filter(object => object?.semanticRole === 'climbSurface')
      .map(object => ({
        ...object,
        x: Number(object.x) + offsetX,
        y: Number(object.y) + offsetY
      })));
  }
}

export default SceneClimbTargetResolver;
