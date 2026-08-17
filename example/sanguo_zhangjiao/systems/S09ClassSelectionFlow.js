import { SceneFlowCoordinator } from '../../../src/core/scene/SceneFlowCoordinator.js';
import { ClassType } from '../../../src/systems/ClassSystem.js';

const SUPPORTED_CLASSES = Object.freeze([ClassType.WARRIOR, ClassType.ARCHER, ClassType.STRATEGIST]);
const STARTER_NODES = Object.freeze({
  warrior: { graphId: 'warrior-skill', nodeId: 'cleave', passiveStart: 'start_warrior' },
  archer: { graphId: 'archer-skill', nodeId: 'arrow_shot', passiveStart: 'start_archer' },
  strategist: { graphId: 'strategist-skill', nodeId: 'talisman_water', passiveStart: 'start_strategist' }
});
const STARTER_POINT_TOTALS = Object.freeze({ skill: 8, talent: 4, unit: 4, passive: 4 });
const clone = value => JSON.parse(JSON.stringify(value));

const reject = (scene, message, code) => {
  scene._showScreenTip(message, { title: '无法选择职业' });
  return { ok: false, code, message };
};

const methods = {
  async selectClass(payload = {}) {
    const classType = payload.classId || payload.class || ClassType.WARRIOR;
    if (!SUPPORTED_CLASSES.includes(classType) || this._classSelectionBusy) {
      return { ok: false, code: 'invalidClassSelection' };
    }

    const player = this.playerEntity;
    const playerId = player?.id;
    const stats = player?.getComponent?.('stats');
    const inventory = player?.getComponent?.('inventory');
    const blackboard = this.gameLoader?.blackboard;
    const storyState = blackboard?.get?.('storyState');
    const progression = this.gameLoader?.progressionSystem;
    const classSystem = this._ensureClassSystem();
    if (this.currentSceneId !== 'S09' || !playerId || !stats || !inventory || !blackboard
      || !progression || !classSystem || storyState?.joinedYellowTurban !== true) {
      return reject(this, '职业选择前置状态不完整', 'classSelectionPreconditionFailed');
    }

    if (storyState.classSelectionCommitted === true) {
      if (storyState.selectedClass !== classType) {
        return reject(this, '职业已经固定，不能改选', 'classAlreadyCommitted');
      }
      classSystem.restoreClass(playerId, classType);
      this._classSelected = true;
      this.selectedClass = classType;
      this._syncUnlockedClassSkills();
      return { ok: true, idempotent: true, classType };
    }
    if (classSystem.getCharacterClass(playerId)) {
      return reject(this, '检测到未完成的职业运行状态，请重新读取检查点', 'classRuntimeConflict');
    }

    const classData = classSystem.getClassData(classType);
    const itemRegistry = this.gameLoader.getRegistry?.('items');
    const equipmentEntries = classSystem.getStartingEquipment(classType).map(spec => ({
      item: itemRegistry?.get?.(spec.id),
      quantity: Math.max(1, Math.floor(Number(spec.quantity) || 1))
    }));
    if (!classData || equipmentEntries.length === 0 || equipmentEntries.some(entry => !entry.item?.id)) {
      return reject(this, '职业初始装备定义缺失', 'classEquipmentDefinitionMissing');
    }
    const inventoryPreview = this.inventoryTransactions.previewBatchAdd(inventory, equipmentEntries);
    if (!inventoryPreview.valid || inventoryPreview.remainder > 0) {
      return reject(this, '背包空间不足，整理后再确认职业', 'classInventoryCapacityExceeded');
    }

    const initial = STARTER_NODES[classType];
    if (!progression.getGraph(initial.graphId)?.getNode?.(initial.nodeId)
      || !progression.getGraph('global-passive')?.getNode?.(initial.passiveStart)) {
      return reject(this, `职业初始能力或天赋盘起点不存在：${initial.nodeId}`, 'classProgressionDefinitionMissing');
    }

    const inventoryBefore = clone(inventory.exportItems());
    const blackboardBefore = clone(blackboard.serialize());
    const progressionBefore = clone(progression.serializeCharacter(playerId));
    const statsBefore = { class: stats.class, skillPoints: stats.skillPoints, unitType: stats.unitType };
    const playerClassBefore = player.class;
    const operationId = payload.operationId || `class-select:${playerId}:${classType}`;
    this._classSelectionBusy = true;

    try {
      const equipmentResult = this.inventoryTransactions.commit({
        type: 'batchAdd', inventory, entries: equipmentEntries, allowPartial: false, operationId
      });
      if (!equipmentResult.ok) throw new Error(equipmentResult.code || '初始装备提交失败');
      if (!classSystem.selectClass(playerId, classType)) throw new Error('职业系统拒绝选择');

      player.class = classType;
      stats.class = classType;
      if (typeof stats.setUnitType === 'function') stats.setUnitType(classData.baseUnitType);
      else stats.unitType = classData.baseUnitType;

      const ledger = progression.getLedger(playerId);
      for (const [pool, targetTotal] of Object.entries(STARTER_POINT_TOTALS)) {
        const currentTotal = ledger.getAvailable(pool) + ledger.getSpent(pool);
        if (currentTotal < targetTotal) progression.grantPoints(playerId, pool, targetTotal - currentTotal);
      }
      if (progression.getRank(playerId, initial.graphId, initial.nodeId) === 0) {
        const allocated = progression.allocateNode(playerId, initial.graphId, initial.nodeId, {
          characterLevel: Number(stats.level) || 1
        });
        if (!allocated.ok) throw new Error(allocated.message || `无法解锁 ${initial.nodeId}`);
      }
      if (progression.getRank(playerId, 'global-passive', initial.passiveStart) === 0) {
        const allocated = progression.allocateNode(playerId, 'global-passive', initial.passiveStart, {
          characterLevel: Number(stats.level) || 1
        });
        if (!allocated.ok) throw new Error(allocated.message || `无法激活 ${initial.passiveStart}`);
      }
      stats.skillPoints = progression.getLedger(playerId).getAvailable('skill');
      blackboard.set('storyState', {
        ...storyState,
        joinedYellowTurban: true,
        classSelectionCommitted: true,
        selectedClass: classType,
        lastCheckpointId: 'checkpoint.S09.classSelected'
      });
      blackboard.set('joinedYellowTurban', true);
      blackboard.set('selectedClass', classType);
      blackboard.set('classSelected', true);
      this._classSelected = true;
      this.selectedClass = classType;
      this._syncUnlockedClassSkills();

      const checkpoint = await this._executeScenarioCommand('checkpoint.request', {
        reason: 'checkpoint', checkpointId: 'checkpoint.S09.classSelected', sceneId: 'S09'
      }, `${operationId}:checkpoint`);
      if (!checkpoint?.ok || !checkpoint.committed) throw new Error(checkpoint?.error?.message || '职业检查点未提交');
      return { ok: true, classType };
    } catch (error) {
      inventory.loadItems(inventoryBefore);
      this.inventoryTransactions.forgetOperation?.(operationId);
      progression.deserializeCharacter(playerId, progressionBefore);
      classSystem.clearClass(playerId);
      player.class = playerClassBefore;
      for (const [key, value] of Object.entries(statsBefore)) {
        if (value === undefined) delete stats[key];
        else stats[key] = value;
      }
      blackboard.deserialize(blackboardBefore);
      this._classSelected = false;
      this.selectedClass = null;
      this.gatheringPuppetSystem?.cancelActive?.('classRollback');
      if (this.gatheringPuppetSystem) this.gatheringPuppetSystem.chargesRemaining = null;
      this._syncUnlockedClassSkills();
      this._showScreenTip(`职业提交失败：${error.message || error}。状态已回滚，可重试。`, { title: '检查点失败' });
      return { ok: false, code: error.code || 'classSelectionFailed', message: error.message || String(error) };
    } finally {
      this._classSelectionBusy = false;
    }
  }
};

export class S09ClassSelectionCoordinator extends SceneFlowCoordinator {
  constructor(scene) { super(scene, methods, { name: 'S09ClassSelectionCoordinator' }); }
}

export default S09ClassSelectionCoordinator;