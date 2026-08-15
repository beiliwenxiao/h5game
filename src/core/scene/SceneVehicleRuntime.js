/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * @project YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 ************************************************************/

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

/**
 * canonical 场景载具的实体、命名空间快照与原子恢复运行时。
 * 只消费注入的场景数据和 ECS 服务，不识别具体游戏、场景 ID 或历史规则。
 */
export class SceneVehicleRuntime {
  constructor(config = {}) {
    this.entityFactory = config.entityFactory || null;
    this.entityStore = config.entityStore || null;
    this.entities = config.entities instanceof Map ? config.entities : new Map();
    this.getCurrentSceneId = config.getCurrentSceneId || (() => null);
    this.getChunk = config.getChunk || (() => null);
    this.findMarker = config.findMarker || (() => null);
    this.getVehicleSystem = config.getVehicleSystem || (() => null);
    this.getLogisticsSystem = config.getLogisticsSystem || (() => null);
    this.getPlayer = config.getPlayer || (() => null);
    this.team = config.team || 'neutral';
    this.createTags = config.createTags || ((sceneId, definition) => [
      `${String(sceneId).toLowerCase()}Vehicle`, definition.vehicleType, this.team
    ].filter(Boolean));
    this.onAfterDisposeScene = typeof config.onAfterDisposeScene === 'function'
      ? config.onAfterDisposeScene
      : null;
  }

  getDefinitions(sceneId = this.getCurrentSceneId()) {
    if (!sceneId) return [];
    return clone(this.getChunk(sceneId)?.sceneData?.gameplay?.vehicles || []);
  }

  ensure(sceneId = this.getCurrentSceneId()) {
    const vehicleSystem = this.getVehicleSystem();
    if (this.getCurrentSceneId() !== sceneId || !vehicleSystem || !this.entityFactory || !this.entityStore) return [];
    const created = [];
    for (const definition of this.getDefinitions(sceneId)) {
      if (!definition?.id || !definition.markerId) continue;
      const cached = this.entities.get(definition.id);
      if (cached && cached.vehicleSceneId === sceneId && this.entityStore.all.includes(cached)) continue;
      if (cached) this.disposeScene(cached.vehicleSceneId || sceneId, definition.id);
      const marker = this.findMarker(sceneId, definition.markerId);
      if (!marker) continue;
      const entity = this.entityFactory.createVehicle({
        ...clone(definition),
        position: {
          x: Number(marker.x) + (Number(marker.width) || 0) / 2,
          y: Number(marker.y) + (Number(marker.height) || 0)
        },
        team: this.team
      });
      entity.tags = this.createTags(sceneId, definition);
      entity.vehicleDefinitionId = definition.id;
      entity.vehicleSceneId = sceneId;
      if (definition.renderMode === 'sceneObject') {
        const sprite = entity.getComponent?.('sprite');
        if (sprite) sprite.visible = false;
        entity.name = '';
      }
      this.entityStore.add(entity);
      vehicleSystem.registerVehicle(entity);
      this.entities.set(definition.id, entity);
      created.push(entity);
    }
    return created;
  }

  disposeScene(sceneId, definitionId = null) {
    const vehicleSystem = this.getVehicleSystem();
    for (const [id, entity] of [...this.entities.entries()]) {
      if (entity?.vehicleSceneId !== sceneId || (definitionId && id !== definitionId)) continue;
      const vehicle = entity.getComponent?.('vehicle');
      for (const riderId of vehicle?.getRiders?.() || []) {
        const rider = this.entityStore?.all?.find?.(candidate => candidate?.id === riderId);
        if (rider) vehicleSystem?.dismount?.(rider);
      }
      vehicleSystem?.unregisterVehicle?.(entity);
      this.entityStore?.remove?.(entity);
      this.entities.delete(id);
      try { entity.destroy?.(); } catch (error) { /* best-effort lifecycle cleanup */ }
    }
    this.onAfterDisposeScene?.(sceneId, definitionId);
  }

  disposeAll() {
    const sceneIds = new Set([...this.entities.values()]
      .map(entity => entity?.vehicleSceneId)
      .filter(Boolean));
    for (const sceneId of sceneIds) this.disposeScene(sceneId);
  }

  resolveInventoryOwnerId(inventory) {
    const player = this.getPlayer();
    if (inventory === player?.getComponent?.('inventory')) {
      return `${player?.id || 'player'}:inventory`;
    }
    for (const [vehicleId, entity] of this.entities) {
      if (inventory === entity?.getComponent?.('cargo')) return `${vehicleId}:cargo`;
    }
    return null;
  }

  capture(sceneId = this.getCurrentSceneId()) {
    if (this.getCurrentSceneId() === sceneId) this.ensure(sceneId);
    return [...this.entities.entries()]
      .filter(([, entity]) => entity?.vehicleSceneId === sceneId)
      .map(([definitionId, entity]) => {
        const transform = entity.getComponent?.('transform');
        return {
          schemaVersion: 1,
          sceneId,
          definitionId,
          entityId: entity.id,
          transform: transform ? {
            x: Number(transform.position.x) || 0,
            y: Number(transform.position.y) || 0,
            rotation: Number(transform.rotation) || 0
          } : null,
          vehicle: clone(entity.getComponent?.('vehicle')?.serialize?.() || null),
          cargo: clone(entity.getComponent?.('cargo')?.serialize?.() || null)
        };
      });
  }

  validate(sceneId, states, logisticsState = null) {
    if (!sceneId || (states != null && !Array.isArray(states))) {
      return { ok: false, code: 'invalidSceneVehicleStates' };
    }
    const definitions = new Map(this.getDefinitions(sceneId).map(entry => [entry.id, entry]));
    const ids = new Set();
    for (const entry of states || []) {
      const definition = definitions.get(entry?.definitionId);
      if (entry?.schemaVersion !== 1 || entry.sceneId !== sceneId || !definition || ids.has(entry.definitionId)
        || entry.entityId !== entry.definitionId || !entry.transform
        || !Number.isFinite(entry.transform.x) || !Number.isFinite(entry.transform.y)
        || !Number.isFinite(entry.transform.rotation)) {
        return { ok: false, code: 'invalidSceneVehicleState', definitionId: entry?.definitionId };
      }
      ids.add(entry.definitionId);
      const probe = this.entityFactory?.createVehicle?.({ ...clone(definition), position: { x: 0, y: 0 } });
      if (!probe) return { ok: false, code: 'vehicleValidationProbeFailed', definitionId: entry.definitionId };
      try {
        const vehicleCheck = probe.getComponent?.('vehicle')?.validateSerialized?.(entry.vehicle);
        if (!vehicleCheck?.ok) return {
          ok: false,
          code: vehicleCheck?.code || 'invalidVehicleSnapshot',
          definitionId: entry.definitionId,
          path: vehicleCheck?.path
        };
        const cargoProbe = probe.getComponent?.('cargo');
        if (!!entry.cargo !== !!cargoProbe) {
          return { ok: false, code: 'cargoDefinitionMismatch', definitionId: entry.definitionId };
        }
        if (entry.cargo) {
          const cargoCheck = cargoProbe.validateSerialized?.(entry.cargo);
          if (!cargoCheck?.ok) return {
            ok: false,
            code: cargoCheck?.code || 'invalidCargoSnapshot',
            definitionId: entry.definitionId
          };
        }
      } finally {
        try { probe.destroy?.(); } catch (error) { /* validation probe cleanup */ }
      }
    }
    if ((states || []).length > 0 && ids.size !== definitions.size) {
      return { ok: false, code: 'incompleteSceneVehicleStates', sceneId };
    }
    return this._validateLogistics(logisticsState);
  }

  _validateLogistics(logisticsState) {
    if (!logisticsState) return { ok: true };
    if (logisticsState.schemaVersion !== 1 || !Array.isArray(logisticsState.operations)) {
      return { ok: false, code: 'invalidVehicleLogisticsSnapshot' };
    }
    const operationIds = new Set();
    for (const operation of logisticsState.operations) {
      if (!operation?.operationId || operationIds.has(operation.operationId)
        || !operation.fingerprint || !operation.result) {
        return { ok: false, code: 'invalidVehicleLogisticsSnapshot' };
      }
      operationIds.add(operation.operationId);
    }
    return { ok: true };
  }

  restore(sceneId, states = [], logisticsState = null) {
    const checked = this.validate(sceneId, states, logisticsState);
    if (!checked.ok) return checked;
    if (states.length > 0 && this.getCurrentSceneId() !== sceneId) {
      return { ok: false, code: 'sceneVehicleSceneMismatch', sceneId };
    }

    const entityEntriesBefore = new Map(this.entities);
    const entityValuesBefore = new Set(entityEntriesBefore.values());
    const collectCreated = () => [...this.entities.values()]
      .filter(entity => !entityValuesBefore.has(entity));
    const discardCreated = created => {
      let ok = true;
      const vehicleSystem = this.getVehicleSystem();
      for (const entity of [...created].reverse()) {
        const definitionId = entity?.vehicleDefinitionId;
        try { vehicleSystem?.unregisterVehicle?.(entity); } catch (error) { ok = false; }
        try { this.entityStore?.remove?.(entity); } catch (error) { ok = false; }
        if (definitionId && this.entities.get(definitionId) === entity) {
          const previous = entityEntriesBefore.get(definitionId);
          if (previous && this.entityStore?.all?.includes?.(previous)) this.entities.set(definitionId, previous);
          else this.entities.delete(definitionId);
        }
        try { entity?.destroy?.(); } catch (error) { ok = false; }
      }
      return ok;
    };

    try {
      this.ensure(sceneId);
    } catch (error) {
      const rolledBack = discardCreated(collectCreated());
      return rolledBack
        ? { ok: false, code: 'sceneVehicleRebuildFailed', sceneId, message: error?.message }
        : { ok: false, code: 'sceneVehicleRollbackFailed', cause: 'sceneVehicleRebuildFailed' };
    }

    const created = collectCreated();
    const vehicleSystem = this.getVehicleSystem();
    const logisticsSystem = this.getLogisticsSystem();
    const prepared = [];
    for (const entry of states) {
      const entity = this.entities.get(entry.definitionId);
      const transform = entity?.getComponent?.('transform');
      const vehicle = entity?.getComponent?.('vehicle');
      const cargo = entity?.getComponent?.('cargo');
      const movement = entity?.getComponent?.('movement');
      if (!entity || entity.vehicleSceneId !== sceneId || !transform || !vehicle || (!!entry.cargo !== !!cargo)) {
        const rolledBack = discardCreated(created);
        return rolledBack
          ? { ok: false, code: 'sceneVehicleRebuildFailed', definitionId: entry.definitionId }
          : { ok: false, code: 'sceneVehicleRollbackFailed', cause: 'sceneVehicleRebuildFailed' };
      }
      prepared.push({
        entry, entity, transform, vehicle, cargo, movement,
        before: {
          transform: { x: transform.position.x, y: transform.position.y, rotation: transform.rotation },
          vehicle: clone(vehicle.serialize()),
          cargo: clone(cargo?.serialize?.() || null),
          movement: movement ? {
            enabled: movement.enabled,
            velocity: { x: movement.velocity.x, y: movement.velocity.y },
            isMoving: movement.isMoving,
            movementType: movement.movementType
          } : null,
          registered: vehicleSystem?.vehicles?.has?.(entity) === true
        }
      });
    }
    const logisticsBefore = clone(logisticsSystem?.serialize?.() || null);
    const rollback = () => {
      let ok = true;
      for (const item of [...prepared].reverse()) {
        try {
          item.transform.setPosition(item.before.transform.x, item.before.transform.y);
          item.transform.rotation = item.before.transform.rotation;
          if (item.vehicle.deserialize(clone(item.before.vehicle))?.ok === false) ok = false;
          if (item.before.cargo && item.cargo?.deserialize(clone(item.before.cargo))?.ok === false) ok = false;
          if (item.before.movement && item.movement) {
            item.movement.enabled = item.before.movement.enabled;
            item.movement.velocity.x = item.before.movement.velocity.x;
            item.movement.velocity.y = item.before.movement.velocity.y;
            item.movement.isMoving = item.before.movement.isMoving;
            item.movement.movementType = item.before.movement.movementType;
          }
          if (item.before.registered) vehicleSystem?.registerVehicle?.(item.entity);
          else vehicleSystem?.unregisterVehicle?.(item.entity);
        } catch (error) {
          ok = false;
        }
      }
      try {
        if (logisticsBefore && logisticsSystem?.deserialize?.(clone(logisticsBefore))?.ok === false) ok = false;
      } catch (error) {
        ok = false;
      }
      if (!discardCreated(created)) ok = false;
      return ok;
    };

    let failure = null;
    for (const item of prepared) {
      try {
        item.transform.setPosition(item.entry.transform.x, item.entry.transform.y);
        item.transform.rotation = item.entry.transform.rotation;
        const vehicleResult = item.vehicle.deserialize(clone(item.entry.vehicle));
        if (!vehicleResult?.ok) {
          failure = { ...vehicleResult, definitionId: item.entry.definitionId };
          break;
        }
        if (item.entry.cargo) {
          const cargoResult = item.cargo.deserialize(clone(item.entry.cargo));
          if (!cargoResult?.ok) {
            failure = { ...cargoResult, definitionId: item.entry.definitionId };
            break;
          }
        }
        if (item.movement) {
          item.movement.enabled = !item.vehicle.destroyed && !item.vehicle.logistics.starved;
          if (!item.movement.enabled) item.movement.stop?.();
        }
        if (item.vehicle.destroyed) vehicleSystem?.unregisterVehicle?.(item.entity);
        else vehicleSystem?.registerVehicle?.(item.entity);
      } catch (error) {
        failure = {
          ok: false,
          code: 'sceneVehicleRestoreFailed',
          definitionId: item.entry.definitionId,
          message: error?.message || String(error)
        };
        break;
      }
    }
    if (!failure && logisticsState) {
      try {
        const logisticsResult = logisticsSystem?.deserialize?.(clone(logisticsState));
        if (!logisticsResult?.ok) failure = logisticsResult || { ok: false, code: 'vehicleLogisticsUnavailable' };
      } catch (error) {
        failure = { ok: false, code: 'vehicleLogisticsRestoreFailed', message: error?.message || String(error) };
      }
    }
    if (failure) {
      const rolledBack = rollback();
      return rolledBack ? failure : { ok: false, code: 'sceneVehicleRollbackFailed', cause: failure.code };
    }
    return { ok: true };
  }

  dispose() {
    this.disposeAll();
    this.entities.clear();
  }
}

export default SceneVehicleRuntime;
