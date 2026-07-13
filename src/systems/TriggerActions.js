/************************************************************
 * Copyright (c) 2026 Liu Xiao (beiliwenxiao)
 * 
 * @project   H5Game - 基于HTML5的游戏引擎
 * @author    刘枭 (beiliwenxiao)
 * @email     beiliwenxiao@qq.com
 * @date      2026-01-14
 * @blog      https://blog.csdn.net/beiliwenxiao
 * @repo      https://github.com/beiliwenxiao/h5game
 *            https://gitee.com/coderaaa/h5game
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
    switchScene: (p, ctx) => { ctx.sceneManager?.switchTo?.(p.scene, p.data || null); },
    loadRegion: (p, ctx) => {
      // 大区流式切换（P5 WorldStreamingManager 接入前，先走 sceneManager）
      if (ctx.world && ctx.world.loadRegion) ctx.world.loadRegion(p.region, p.at);
      else ctx.sceneManager?.switchTo?.(p.region, { at: p.at });
    },

    // ---- 奖励 ----
    giveReward: (p, ctx) => {
      const player = ctx.player;
      if (!player) return;
      if (p.exp && player.addExp) player.addExp(p.exp);
      const inv = player.getComponent && player.getComponent('inventory');
      if (inv && Array.isArray(p.items)) {
        for (const it of p.items) inv.addItem?.(it, it.quantity || 1);
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
