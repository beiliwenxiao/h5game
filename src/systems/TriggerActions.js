/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   YiJian18-Engine - 跨平台2D/3D ECS游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/yijian18-engine
 *            https://gitee.com/coderaaa/yijian18-engine
 ************************************************************/

/**
 * TriggerActions - 触发器默认动作注册表
 *
 * 每个动作 fn(params, ctx)：从 ctx 取已有系统执行副作用，返回 Promise（需 await 的动作）。
 * ctx 由 TriggerSystem.init 注入：
 *   { blackboard, dialogue(DialogueSystem), sceneManager, questSystem, world,
 *     player, audioManager, floatingText, triggerSystem }
 *
 * 覆盖：变量/开关、对话、场景/大区、奖励、任务、提示、音频、生成、编排(wait/parallel)、战场。
 * 战场动作(battleWin 等)在 §14 实现 BattleMode 时补充具体逻辑，这里先占位。
 */
export function registerDefaultActions(triggerSystem) {
  triggerSystem.registerActions({
    // ---- 变量 / 开关 ----
    setVar: (p, ctx) => { ctx.blackboard?.set(p.key, p.value); },
    addVar: (p, ctx) => { ctx.blackboard?.add(p.key, p.delta ?? 1); },
    setFlag: (p, ctx) => { ctx.blackboard?.set(p.key, p.value !== false); },
    toggleFlag: (p, ctx) => { ctx.blackboard?.toggle(p.key); },

    // ---- 对话（await: true 时等待对话结束）----
    startDialogue: (p, ctx) => {
      const ds = ctx.dialogue;
      if (!ds || !ds.startDialogue) return;
      ds.startDialogue(p.id, p.context || {});
      // 返回 Promise，在对话结束时 resolve（供 await）
      return new Promise((resolve) => {
        if (!ds.onEnd) { resolve(); return; }
        const off = ds.onEnd(() => { if (typeof off === 'function') off(); resolve(); });
      });
    },

    // ---- 场景 / 大区切换 ----
    switchScene: (p, ctx) => {
      const sm = ctx.sceneManager;
      if (!sm || !sm.switchTo) return;
      if (p.transition === 'text' && sm.startTextTransition) {
        sm.startTextTransition({
          mainText: p.text || '场景切换中...',
          onComplete: () => sm.switchTo(p.scene, p.data || null)
        });
      } else {
        sm.switchTo(p.scene, p.data || null);
      }
    },
    loadRegion: (p, ctx) => {
      // 大区流式切换（P5 WorldStreamingManager 接入前，先走 sceneManager）
      if (ctx.world && ctx.world.loadRegion) ctx.world.loadRegion(p.region, p.at);
      else ctx.sceneManager?.switchTo?.(p.region, { at: p.at });
    },

    // ---- 大地图内传送（同 region 内 chunk 间移动）----
    teleportToChunk: (p, ctx) => {
      const scene = ctx.scene; // DataDrivenPrologueScene 或任何大地图场景
      if (scene && scene.teleportToChunk) {
        return scene.teleportToChunk(p);
      }
      // 回退：走 switchScene
      console.warn('[TriggerActions] teleportToChunk: 当前场景不支持大地图传送，回退 switchScene');
      ctx.sceneManager?.switchTo?.(p.scene, p.data || null);
    },

    // ---- 奖励 ----
    // giveReward{ exp, gold, items }：items 每项可为完整物品对象，或 { id, quantity }（按内容库 registries.items 解析）
    giveReward: (p, ctx) => {
      const player = ctx.player;
      if (!player) return;
      if (p.exp && player.addExp) player.addExp(p.exp);
      const inv = player.getComponent && player.getComponent('inventory');
      const itemReg = ctx.registries && ctx.registries.items;
      if (inv && Array.isArray(p.items)) {
        for (const raw of p.items) {
          let it = raw;
          // 只给了 id（或 {id,quantity} 无其它字段）时，从内容库解析完整定义
          if (raw && raw.id && !raw.name && itemReg && itemReg.get) {
            const def = itemReg.get(raw.id);
            if (def) it = { ...def, ...raw };
          }
          inv.addItem?.(it, (raw && raw.quantity) || 1);
          // 获得物品回调（弹出"获得物品"窗口 + 系统提示）；食物/装备才弹
          if (ctx.onItemGained) {
            try { ctx.onItemGained({ ...it, quantity: (raw && raw.quantity) || 1 }, player); } catch (e) { /* ignore */ }
          }
        }
      }
      if (p.gold && ctx.blackboard) ctx.blackboard.add('gold', p.gold);
    },

    // ---- 治疗 / 恢复 ----
    // heal{ hp, mp, full }：恢复玩家生命/法力；full=true 时全满。作用于 ctx.player。
    heal: (p, ctx) => {
      const player = ctx.player;
      if (!player) return;
      const stats = player.getComponent && player.getComponent('stats');
      if (!stats) return;
      if (p.full) {
        if (stats.maxHp != null) stats.hp = stats.maxHp;
        if (stats.maxMp != null) stats.mp = stats.maxMp;
        return;
      }
      if (p.hp != null && stats.maxHp != null) stats.hp = Math.min(stats.maxHp, (stats.hp || 0) + p.hp);
      if (p.mp != null && stats.maxMp != null) stats.mp = Math.min(stats.maxMp, (stats.mp || 0) + p.mp);
    },

    // ---- 任务 ----
    startQuest: (p, ctx) => { ctx.questSystem?.acceptQuest?.(p.quest); },
    completeQuest: (p, ctx) => { ctx.questSystem?.turnInQuest?.(p.quest); },

    // ---- 提示 / 引导 ----
    showTip: (p, ctx) => {
      if (ctx.tutorial && ctx.tutorial.showTip) ctx.tutorial.showTip(p);
      else if (ctx.floatingText && ctx.player) {
        const t = ctx.player.getComponent && ctx.player.getComponent('transform');
        if (t) ctx.floatingText.addText(t.position.x, t.position.y - 40, p.text || '', '#ffffff');
      }
    },

    // ---- 音频 ----
    playSound: (p, ctx) => { ctx.audioManager?.playSfx?.(p.id); },
    playBgm: (p, ctx) => { ctx.audioManager?.playMusic?.(p.id, p.loop !== false); },

    // ---- 生成 ----
    spawnEnemy: (p, ctx) => { ctx.world?.spawnEnemy?.(p); },

    // ---- 编排 ----
    wait: (p) => new Promise((resolve) => setTimeout(resolve, (p.seconds || 0) * 1000)),
    parallel: (p, ctx) => {
      // 并行执行子动作（不逐个 await）
      for (const act of p.actions || []) {
        const fn = ctx.triggerSystem?.actions?.[act.action];
        if (fn) { try { fn(act.params || {}, ctx); } catch (e) { /* ignore */ } }
      }
    },

    // ---- 战场（§14 BattleMode 占位，具体逻辑待实现）----
    battleWin:  (p, ctx) => { ctx.blackboard?.set('_battleResult', { win: true, team: p.team }); },
    battleLose: (p, ctx) => { ctx.blackboard?.set('_battleResult', { win: false, team: p.team }); },
    spawnWave:  (p, ctx) => { ctx.world?.spawnWave?.(p); },
    mount:      (p, ctx) => { ctx.world?.mount?.(p.rider, p.vehicle, p.seat); }
  });
}

export default registerDefaultActions;
