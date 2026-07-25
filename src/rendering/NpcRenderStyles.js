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
 * NpcRenderStyles.js
 * NPC 内置代码立绘渲染样式库。
 *
 * 用于「无序列帧图片时」用代码绘制精美 NPC 立绘（移植自旧 ActXScene 的 renderNPC/renderCookNPC）。
 * NPC 定义 library.npcs[].renderStyle 指定样式 key。
 *
 * 渲染优先级（BaseGameScene.renderEntity）：
 *   序列帧图片 > renderStyle 代码立绘 > 占位色块
 *
 * 每个绘制函数签名：draw(ctx, x, y, scale)
 *   (x, y) = 底部中心锚点（脚下）；scale = 缩放系数（默认 1）。
 *   不绘制名字/称号（由 renderEntity 统一绘制，避免重复）。
 */

/** 张角立绘（黄色道袍 + 道冠 + 拂尘 + 长须） */
function drawZhangjiao(ctx, x, y, scale = 1) {
  ctx.save();
  const s = 40 * scale;

  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.05, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // 左腿
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.15, y - s * 0.5);
  ctx.quadraticCurveTo(x - s * 0.17, y - s * 0.28, x - s * 0.18, y - s * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.18, y - s * 0.02, s * 0.09, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // 右腿
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.15, y - s * 0.5);
  ctx.quadraticCurveTo(x + s * 0.17, y - s * 0.28, x + s * 0.18, y - s * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.18, y - s * 0.02, s * 0.09, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // 道袍身体
  const bodyGrad = ctx.createLinearGradient(x, y - s * 1.15, x, y - s * 0.45);
  bodyGrad.addColorStop(0, '#c8a84e');
  bodyGrad.addColorStop(0.5, '#b89840');
  bodyGrad.addColorStop(1, '#a08830');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y - s * 1.08);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.8, x - s * 0.38, y - s * 0.45);
  ctx.lineTo(x + s * 0.38, y - s * 0.45);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.8, x + s * 0.42, y - s * 1.08);
  ctx.closePath();
  ctx.fill();

  // 道袍中线
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.05);
  ctx.lineTo(x, y - s * 0.45);
  ctx.stroke();

  // 腰带
  ctx.fillStyle = '#5a4a20';
  ctx.fillRect(x - s * 0.42, y - s * 0.78, s * 0.84, s * 0.08);

  // 左臂 + 袖 + 手
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y - s * 1.0);
  ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.8, x - s * 0.5, y - s * 0.6);
  ctx.stroke();
  ctx.strokeStyle = '#b89840';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y - s * 1.0);
  ctx.lineTo(x - s * 0.48, y - s * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#d4a574';
  ctx.beginPath();
  ctx.arc(x - s * 0.5, y - s * 0.6, s * 0.055, 0, Math.PI * 2);
  ctx.fill();

  // 右臂 + 袖 + 手
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.42, y - s * 1.0);
  ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.8, x + s * 0.5, y - s * 0.6);
  ctx.stroke();
  ctx.strokeStyle = '#b89840';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.42, y - s * 1.0);
  ctx.lineTo(x + s * 0.48, y - s * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#d4a574';
  ctx.beginPath();
  ctx.arc(x + s * 0.5, y - s * 0.6, s * 0.055, 0, Math.PI * 2);
  ctx.fill();

  // 拂尘
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y - s * 0.6);
  ctx.lineTo(x + s * 0.55, y - s * 1.4);
  ctx.stroke();
  ctx.strokeStyle = '#e8e0d0';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.55, y - s * 1.4);
    ctx.quadraticCurveTo(
      x + s * 0.55 + (i - 2) * 3, y - s * 1.25,
      x + s * 0.55 + (i - 2) * 4, y - s * 1.1
    );
    ctx.stroke();
  }

  // 脖子
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - s * 0.07, y - s * 1.16, s * 0.14, s * 0.1);

  // 头部
  const headY = y - s * 1.4;
  const headGrad = ctx.createRadialGradient(x - s * 0.04, headY - s * 0.04, 0, x, headY, s * 0.32);
  headGrad.addColorStop(0, '#f5d4a8');
  headGrad.addColorStop(1, '#d4a574');
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(x, headY, s * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // 发髻
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(x, headY - s * 0.06, s * 0.28, Math.PI * 0.8, Math.PI * 2.2);
  ctx.fill();
  ctx.fillStyle = '#c8a84e';
  ctx.beginPath();
  ctx.ellipse(x, headY - s * 0.35, s * 0.08, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 长须
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.06, headY + s * 0.2);
  ctx.quadraticCurveTo(x - s * 0.08, headY + s * 0.45, x - s * 0.05, headY + s * 0.6);
  ctx.moveTo(x, headY + s * 0.22);
  ctx.quadraticCurveTo(x, headY + s * 0.45, x + s * 0.02, headY + s * 0.65);
  ctx.moveTo(x + s * 0.06, headY + s * 0.2);
  ctx.quadraticCurveTo(x + s * 0.08, headY + s * 0.45, x + s * 0.05, headY + s * 0.6);
  ctx.stroke();

  // 眉毛
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.16, headY - s * 0.06);
  ctx.lineTo(x - s * 0.07, headY - s * 0.08);
  ctx.moveTo(x + s * 0.07, headY - s * 0.08);
  ctx.lineTo(x + s * 0.16, headY - s * 0.06);
  ctx.stroke();

  // 眼睛
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.11, headY + s * 0.01, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
  ctx.ellipse(x + s * 0.11, headY + s * 0.01, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(x - s * 0.11, headY + s * 0.01, s * 0.025, 0, Math.PI * 2);
  ctx.arc(x + s * 0.11, headY + s * 0.01, s * 0.025, 0, Math.PI * 2);
  ctx.fill();

  // 嘴巴
  ctx.strokeStyle = '#a07050';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, headY + s * 0.15, s * 0.04, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

/** 粥棚伙夫立绘（灰衣 + 围裙 + 头巾 + 勺子） */
function drawCook(ctx, x, y, scale = 1) {
  ctx.save();
  const s = 30 * scale;

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.05, s * 0.4, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腿
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.12, y - s * 0.4);
  ctx.lineTo(x - s * 0.15, y - s * 0.05);
  ctx.moveTo(x + s * 0.12, y - s * 0.4);
  ctx.lineTo(x + s * 0.15, y - s * 0.05);
  ctx.stroke();

  // 身体
  ctx.fillStyle = '#787878';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y - s * 0.95);
  ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.65, x - s * 0.3, y - s * 0.4);
  ctx.lineTo(x + s * 0.3, y - s * 0.4);
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.65, x + s * 0.35, y - s * 0.95);
  ctx.closePath();
  ctx.fill();

  // 围裙
  ctx.fillStyle = '#a09080';
  ctx.fillRect(x - s * 0.25, y - s * 0.7, s * 0.5, s * 0.3);

  // 右臂 + 勺子
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.35, y - s * 0.85);
  ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.7, x + s * 0.55, y - s * 0.5);
  ctx.stroke();
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.55, y - s * 0.5);
  ctx.lineTo(x + s * 0.7, y - s * 0.2);
  ctx.stroke();
  ctx.fillStyle = '#6b4226';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.7, y - s * 0.15, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 左臂
  ctx.strokeStyle = '#d4a574';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y - s * 0.85);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.65, x - s * 0.4, y - s * 0.5);
  ctx.stroke();

  // 脖子 + 头
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x - s * 0.06, y - s * 1.05, s * 0.12, s * 0.1);
  ctx.beginPath();
  ctx.arc(x, y - s * 1.25, s * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // 头巾
  ctx.fillStyle = '#a09080';
  ctx.beginPath();
  ctx.arc(x, y - s * 1.3, s * 0.2, Math.PI * 0.85, Math.PI * 2.15);
  ctx.fill();

  // 眼睛
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(x - s * 0.08, y - s * 1.24, 1.5, 0, Math.PI * 2);
  ctx.arc(x + s * 0.08, y - s * 1.24, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** 煮粥大锅（火焰/柴火/粥面气泡/蒸汽，带动画）。(x,y) = 锅的中心。 */
function drawCauldron(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);
  x = 0; y = 0;
  const time = performance.now() / 200;

  // 锅底火焰
  ctx.fillStyle = '#ff6600';
  for (let i = 0; i < 7; i++) {
    const fx = x - 18 + i * 6;
    const fh = 10 + Math.sin(time + i * 1.3) * 6;
    ctx.globalAlpha = 0.6 + Math.sin(time + i) * 0.3;
    ctx.beginPath();
    ctx.ellipse(fx, y + 20, 4, fh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 柴火
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 30, y + 26); ctx.lineTo(x + 20, y + 22);
  ctx.moveTo(x - 20, y + 30); ctx.lineTo(x + 30, y + 24);
  ctx.moveTo(x - 12, y + 22); ctx.lineTo(x + 10, y + 32);
  ctx.stroke();

  // 锅身
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 36, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 锅口（粥）
  ctx.fillStyle = '#d4c8a0';
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 30, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // 粥面气泡
  ctx.fillStyle = '#e8dcc0';
  for (let i = 0; i < 4; i++) {
    const bx = x - 12 + i * 8 + Math.sin(time * 0.7 + i * 2) * 4;
    const by = y - 9 + Math.sin(time + i) * 2;
    ctx.beginPath();
    ctx.arc(bx, by, 3 + Math.sin(time + i) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 蒸汽
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const sx = x - 10 + i * 7;
    const sOffset = Math.sin(time * 0.5 + i * 1.5) * 6;
    ctx.beginPath();
    ctx.moveTo(sx, y - 16);
    ctx.quadraticCurveTo(sx + sOffset, y - 35, sx - sOffset, y - 55);
    ctx.stroke();
  }

  // 锅边高光
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 30, 13, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();

  ctx.restore();
}

/** 张梁立绘（战士，红色铠甲 + 头盔 + 大刀） */
function drawZhangliang(ctx, x, y, scale = 1) {
  ctx.save();
  const s = 26 * scale;
  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.05, s * 0.55, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  // 腿（铠甲裙摆）
  ctx.fillStyle = '#8B0000';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y - s * 0.5);
  ctx.lineTo(x - s * 0.38, y - s * 0.05);
  ctx.lineTo(x + s * 0.38, y - s * 0.05);
  ctx.lineTo(x + s * 0.35, y - s * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a0000';
  ctx.beginPath(); ctx.ellipse(x - s * 0.22, y - s * 0.02, s * 0.1, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.22, y - s * 0.02, s * 0.1, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // 身体（红色铠甲）
  const bg = ctx.createLinearGradient(x, y - s * 1.15, x, y - s * 0.45);
  bg.addColorStop(0, '#cc2200'); bg.addColorStop(0.5, '#aa1800'); bg.addColorStop(1, '#881000');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.45, y - s * 1.1); ctx.lineTo(x - s * 0.48, y - s * 0.5);
  ctx.lineTo(x + s * 0.48, y - s * 0.5); ctx.lineTo(x + s * 0.45, y - s * 1.1);
  ctx.closePath(); ctx.fill();
  // 铠甲纹路
  ctx.strokeStyle = '#ff4422'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 1.05); ctx.lineTo(x - s * 0.3, y - s * 0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.3, y - s * 1.05); ctx.lineTo(x + s * 0.3, y - s * 0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.8); ctx.lineTo(x + s * 0.45, y - s * 0.8); ctx.stroke();
  // 护肩
  ctx.fillStyle = '#cc2200';
  ctx.beginPath(); ctx.ellipse(x - s * 0.5, y - s * 1.0, s * 0.15, s * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.5, y - s * 1.0, s * 0.15, s * 0.1, 0.3, 0, Math.PI * 2); ctx.fill();
  // 臂
  ctx.strokeStyle = '#c47050'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.48, y - s * 0.98); ctx.quadraticCurveTo(x - s * 0.58, y - s * 0.78, x - s * 0.52, y - s * 0.58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.48, y - s * 0.98); ctx.quadraticCurveTo(x + s * 0.58, y - s * 0.78, x + s * 0.52, y - s * 0.58); ctx.stroke();
  // 右手持大刀
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x + s * 0.52, y - s * 0.58); ctx.lineTo(x + s * 0.6, y - s * 1.5); ctx.stroke();
  ctx.fillStyle = '#aaa';
  ctx.beginPath(); ctx.moveTo(x + s * 0.55, y - s * 1.5); ctx.lineTo(x + s * 0.72, y - s * 1.35); ctx.lineTo(x + s * 0.58, y - s * 1.2); ctx.closePath(); ctx.fill();
  // 头
  const headY = y - s * 1.38;
  ctx.fillStyle = '#c47050'; ctx.beginPath(); ctx.arc(x, headY, s * 0.3, 0, Math.PI * 2); ctx.fill();
  // 头盔
  ctx.fillStyle = '#aa1800';
  ctx.beginPath(); ctx.arc(x, headY - s * 0.05, s * 0.32, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#cc2200';
  ctx.beginPath(); ctx.ellipse(x, headY - s * 0.05, s * 0.32, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // 头盔顶饰
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.moveTo(x - s * 0.05, headY - s * 0.35); ctx.lineTo(x + s * 0.05, headY - s * 0.35); ctx.lineTo(x, headY - s * 0.55); ctx.closePath(); ctx.fill();
  // 眼
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(x - s * 0.11, headY + s * 0.02, s * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.11, headY + s * 0.02, s * 0.03, 0, Math.PI * 2); ctx.fill();
  // 胡须
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x - s * 0.08, headY + s * 0.18); ctx.quadraticCurveTo(x - s * 0.1, headY + s * 0.38, x - s * 0.06, headY + s * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.08, headY + s * 0.18); ctx.quadraticCurveTo(x + s * 0.1, headY + s * 0.38, x + s * 0.06, headY + s * 0.5); ctx.stroke();
  ctx.restore();
}

/** 张宝立绘（弓箭手，绿色猎装 + 弓 + 箭袋） */
function drawZhangbao(ctx, x, y, scale = 1) {
  ctx.save();
  const s = 24 * scale;
  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.05, s * 0.5, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  // 腿
  ctx.strokeStyle = '#4a6a30'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.15, y - s * 0.5); ctx.lineTo(x - s * 0.16, y - s * 0.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.15, y - s * 0.5); ctx.lineTo(x + s * 0.16, y - s * 0.05); ctx.stroke();
  ctx.fillStyle = '#2a3a18';
  ctx.beginPath(); ctx.ellipse(x - s * 0.16, y - s * 0.02, s * 0.09, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.16, y - s * 0.02, s * 0.09, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // 身体（绿色猎装）
  const bg = ctx.createLinearGradient(x, y - s * 1.1, x, y - s * 0.45);
  bg.addColorStop(0, '#4a7a30'); bg.addColorStop(1, '#2a5a18');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y - s * 1.05); ctx.quadraticCurveTo(x - s * 0.46, y - s * 0.8, x - s * 0.36, y - s * 0.45);
  ctx.lineTo(x + s * 0.36, y - s * 0.45); ctx.quadraticCurveTo(x + s * 0.46, y - s * 0.8, x + s * 0.4, y - s * 1.05);
  ctx.closePath(); ctx.fill();
  // 腰带
  ctx.fillStyle = '#3a2810'; ctx.fillRect(x - s * 0.38, y - s * 0.73, s * 0.76, s * 0.07);
  // 箭袋（背后）
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x + s * 0.3, y - s * 1.05, s * 0.12, s * 0.45);
  ctx.strokeStyle = '#5a2a08'; ctx.lineWidth = 0.8; ctx.strokeRect(x + s * 0.3, y - s * 1.05, s * 0.12, s * 0.45);
  // 箭
  ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + s * 0.33 + i * 3, y - s * 1.05); ctx.lineTo(x + s * 0.33 + i * 3, y - s * 1.25); ctx.stroke();
  }
  // 臂
  ctx.strokeStyle = '#c4a070'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.98); ctx.quadraticCurveTo(x - s * 0.52, y - s * 0.78, x - s * 0.48, y - s * 0.58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.4, y - s * 0.98); ctx.quadraticCurveTo(x + s * 0.52, y - s * 0.78, x + s * 0.48, y - s * 0.58); ctx.stroke();
  // 左手持弓
  ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x - s * 0.48, y - s * 0.88, s * 0.32, -0.8, 0.8); ctx.stroke();
  ctx.strokeStyle = '#c8a870'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x - s * 0.48 + s * 0.32 * Math.cos(-0.8), y - s * 0.88 + s * 0.32 * Math.sin(-0.8));
  ctx.lineTo(x - s * 0.48 + s * 0.32 * Math.cos(0.8), y - s * 0.88 + s * 0.32 * Math.sin(0.8)); ctx.stroke();
  // 头
  const headY = y - s * 1.33;
  ctx.fillStyle = '#c4a070'; ctx.beginPath(); ctx.arc(x, headY, s * 0.28, 0, Math.PI * 2); ctx.fill();
  // 头巾（绿色）
  ctx.fillStyle = '#2a5a18';
  ctx.beginPath(); ctx.arc(x, headY - s * 0.05, s * 0.3, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#4a7a30';
  ctx.beginPath(); ctx.ellipse(x, headY - s * 0.05, s * 0.3, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // 头巾飘带
  ctx.strokeStyle = '#2a5a18'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + s * 0.28, headY - s * 0.05); ctx.quadraticCurveTo(x + s * 0.4, headY + s * 0.1, x + s * 0.35, headY + s * 0.3); ctx.stroke();
  // 眼
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(x - s * 0.1, headY + s * 0.01, s * 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.1, headY + s * 0.01, s * 0.025, 0, Math.PI * 2); ctx.fill();
  // 嘴
  ctx.strokeStyle = '#8B5030'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, headY + s * 0.12, s * 0.05, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.restore();
}

/** 样式注册表：renderStyle key → 绘制函数 */
const NPC_RENDER_STYLES = {
  zhangjiao: drawZhangjiao,
  cook: drawCook,
  cauldron: drawCauldron,
  zhangliang: drawZhangliang,
  zhangbao: drawZhangbao
};

/** 获取指定样式的绘制函数（不存在返回 null） */
export function getNpcRenderStyle(styleKey) {
  return NPC_RENDER_STYLES[styleKey] || null;
}

/** 注册自定义 NPC 渲染样式（供扩展） */
export function registerNpcRenderStyle(key, drawFn) {
  if (key && typeof drawFn === 'function') NPC_RENDER_STYLES[key] = drawFn;
}

export { NPC_RENDER_STYLES };
