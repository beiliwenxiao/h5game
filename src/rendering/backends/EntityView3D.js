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
 * EntityView3D.js
 * 把 ECS 实体映射为 three.js Object3D
 *
 * 渲染策略：
 *  - 有 SpriteComponent + AssetManager 图片 → PlaneGeometry 贴图（billboard）
 *  - 有 Model3D → 占位方块（TODO: glTF）
 *  - 无资源 → 彩色占位方块
 */

import * as THREE from 'three';
import { applyTransformToObject3D } from './Transform3DAdapter.js';

const _textureCache = new Map();

function getOrCreateTextureFromImage(image) {
  if (!image) return null;
  if (_textureCache.has(image)) return _textureCache.get(image);
  const tex = new THREE.Texture(image);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  _textureCache.set(image, tex);
  return tex;
}

/**
 * 为实体 mesh 添加 3D 血条（头顶小长方体）
 */
function addHealthBar(parentMesh, entity) {
  const barWidth = 40;
  const barHeight = 4;
  const barDepth = 4;
  const spriteH = (entity?.getComponent?.('sprite')?.height || 64);
  const yOffset = spriteH + 8; // 头顶上方
  
  // 背景条（深灰）
  const bgGeom = new THREE.BoxGeometry(barWidth, barHeight, barDepth);
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const bgMesh = new THREE.Mesh(bgGeom, bgMat);
  bgMesh.position.set(0, yOffset, 0);
  parentMesh.add(bgMesh);
  
  // 前景条（绿色，会根据 HP 缩放）
  const fgGeom = new THREE.BoxGeometry(barWidth - 2, barHeight - 1, barDepth + 0.5);
  const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const fgMesh = new THREE.Mesh(fgGeom, fgMat);
  fgMesh.position.set(0, yOffset, 0);
  parentMesh.add(fgMesh);
  
  parentMesh.userData.healthBar = { bg: bgMesh, fg: fgMesh, maxWidth: barWidth - 2 };
}

function makePlaceholderMesh(entity) {
  const size = 32;
  const geom = new THREE.BoxGeometry(size, size * 1.5, size * 0.3);
  // 根据实体类型选颜色
  let color = 0x4a9eff; // 默认蓝色
  if (entity?.type === 'enemy') color = 0xff4444;
  else if (entity?.type === 'player') color = 0x44ff44;
  else if (entity?.type === 'npc') color = 0xffaa00;
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  // 锚点在底部
  mesh.geometry.translate(0, size * 0.75, 0);
  mesh.userData.isBillboard = true;
  addHealthBar(mesh, entity);
  return mesh;
}

/**
 * 从 SpriteComponent 创建带贴图的立方体（正面贴序列帧，其他面纯色）
 */
function makeSpriteFromSpriteComponent(sprite, assetManager, entity) {
  const w = sprite.width || 64;
  const h = sprite.height || 64;
  const depth = w * 0.4; // 厚度为宽度的 40%
  
  const image = assetManager?.getAsset?.(sprite.spriteSheet) 
             || assetManager?.getImage?.(sprite.spriteSheet);
  
  if (image && (image instanceof HTMLCanvasElement || (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))) {
    const tex = getOrCreateTextureFromImage(image);
    const cols = sprite.spriteColumns || 4;
    const rows = sprite.spriteRows || 8;
    
    // 正面和背面贴序列帧纹理
    const frontTex = tex.clone();
    frontTex.repeat.set(1 / cols, 1 / rows);
    frontTex.offset.set(0, 1 - 1 / rows);
    frontTex.needsUpdate = true;
    
    const frontMat = new THREE.MeshBasicMaterial({
      map: frontTex,
      transparent: true,
      alphaTest: 0.1
    });
    
    // 其他面透明（不显示侧面）
    const sideMat = new THREE.MeshBasicMaterial({ visible: false });
    
    // BoxGeometry 面顺序: +x, -x, +y, -y, +z(正面), -z(背面)
    const materials = [
      sideMat,    // 右
      sideMat,    // 左
      sideMat,    // 顶
      sideMat,    // 底
      frontMat,   // 正面（+z）
      frontMat    // 背面（-z）也贴图
    ];
    
    const geom = new THREE.BoxGeometry(w, h, depth);
    const mesh = new THREE.Mesh(geom, materials);
    // 锚点在底部中心
    mesh.geometry.translate(0, h / 2, 0);
    mesh.userData.isBillboard = true;
    mesh.userData.hasTexture = true;
    // 记录正面材质索引，用于 UV 更新
    mesh.userData.frontMatIndex = 4;
    mesh.userData.backMatIndex = 5;
    addHealthBar(mesh, entity);
    return mesh;
  }
  
  // 没有图片资源，用占位方块
  return makePlaceholderMesh(entity);
}

/**
 * 为单个实体创建 Object3D
 * @param {*} entity
 * @param {*} [assetManager]
 * @returns {THREE.Object3D}
 */
export function createEntityView(entity, assetManager) {
  const sprite = entity.getComponent?.('sprite');
  const model = entity.getComponent?.('model3d');

  if (model) {
    return makePlaceholderMesh(entity);
  }

  // 掉落物特殊处理：用离屏 canvas 画药瓶图标
  if (entity.type === 'loot' && entity.itemData) {
    return makeLootView(entity);
  }

  if (sprite) {
    return makeSpriteFromSpriteComponent(sprite, assetManager, entity);
  }

  return makePlaceholderMesh(entity);
}

/**
 * 为掉落物创建带图标的面片
 */
function makeLootView(entity) {
  const size = 28;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  
  const itemType = entity.itemData.type;
  ctx.save();
  ctx.translate(32, 32);
  
  if (itemType === 'health_potion') {
    // 红色药瓶
    ctx.fillStyle = '#cc0000';
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.lineTo(-10, 15); ctx.quadraticCurveTo(-10, 22, 0, 22);
    ctx.quadraticCurveTo(10, 22, 10, 15); ctx.lineTo(8, -10); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.lineTo(-7, 12); ctx.quadraticCurveTo(-7, 16, 0, 16);
    ctx.quadraticCurveTo(4, 16, 4, 12); ctx.lineTo(3, -8); ctx.closePath();
    ctx.fill();
    // 瓶口
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-5, -16, 10, 8);
    // 高光
    ctx.fillStyle = '#ffffff55';
    ctx.fillRect(-3, -5, 3, 12);
    // 十字
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1.5, 0, 3, 10);
    ctx.fillRect(-4, 3, 8, 3);
  } else if (itemType === 'mana_potion') {
    // 蓝色药瓶
    ctx.fillStyle = '#0033cc';
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.lineTo(-10, 15); ctx.quadraticCurveTo(-10, 22, 0, 22);
    ctx.quadraticCurveTo(10, 22, 10, 15); ctx.lineTo(8, -10); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4488ff';
    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.lineTo(-7, 12); ctx.quadraticCurveTo(-7, 16, 0, 16);
    ctx.quadraticCurveTo(4, 16, 4, 12); ctx.lineTo(3, -8); ctx.closePath();
    ctx.fill();
    // 瓶口
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-5, -16, 10, 8);
    // 高光
    ctx.fillStyle = '#ffffff55';
    ctx.fillRect(-3, -5, 3, 12);
    // 星形
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✦', 0, 8);
  } else {
    // 默认金色圆
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
  
  const tex = new THREE.Texture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.geometry.translate(0, size / 2, 0);
  mesh.userData.isBillboard = true;
  mesh.userData.isLoot = true;
  addHealthBar(mesh, entity);
  return mesh;
}

/**
 * 依据实体状态更新 Object3D
 * @param {THREE.Object3D} object3D
 * @param {*} entity
 * @param {THREE.Camera} [camera] - 用于 billboard 朝向
 */
export function updateEntityView(object3D, entity, camera) {
  if (!object3D || !entity) return;
  const transform = entity.getComponent?.('transform');
  const sprite = entity.getComponent?.('sprite');
  const layer = entity.getComponent?.('layer');

  if (transform) applyTransformToObject3D(object3D, transform);

  // 可见性
  object3D.visible = entity.active !== false && 
                     !entity.isDead &&
                     (!sprite || sprite.visible !== false);

  // Billboard：让面片始终面向相机
  if (object3D.userData.isBillboard && camera) {
    if (object3D.userData.isLoot) {
      // 掉落物：自转 + 浮动
      object3D.rotation.y += 0.03;
      const baseY = object3D.position.y;
      // 用 sin 做浮动（基于时间和位置）
      object3D.position.y = (transform?.position?.elevation ?? 0) + 16 + Math.sin(Date.now() * 0.003 + object3D.position.x) * 4;
    } else {
      // 普通实体：只绕 Y 轴旋转面向相机（保持直立）
      const camPos = camera.position || camera.native?.position;
      if (camPos) {
        const dx = camPos.x - object3D.position.x;
        const dz = camPos.z - object3D.position.z;
        object3D.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  // 更新 3D 血条
  if (object3D.userData.healthBar) {
    const stats = entity.getComponent?.('stats');
    const bar = object3D.userData.healthBar;
    if (stats && stats.maxHp > 0) {
      const ratio = Math.max(0, Math.min(1, stats.hp / stats.maxHp));
      bar.fg.scale.x = ratio;
      // 让血条从左向右缩短
      bar.fg.position.x = -(bar.maxWidth * (1 - ratio)) / 2;
      // 颜色随 HP 变化
      if (ratio > 0.5) bar.fg.material.color.setHex(0x00ff00);
      else if (ratio > 0.2) bar.fg.material.color.setHex(0xffaa00);
      else bar.fg.material.color.setHex(0xff0000);
      bar.bg.visible = true;
      bar.fg.visible = true;
    } else {
      bar.bg.visible = false;
      bar.fg.visible = false;
    }
  }

  // 分层 renderOrder
  if (layer) {
    const orderMap = { ground: 0, decal: 1, entity: 2, aerial: 3, effect: 4 };
    const base = orderMap[layer.worldLayer] ?? 2;
    object3D.renderOrder = base * 1000 + (layer.renderOrder || 0);
  }

  // 精灵 UV 驱动（贴图帧动画）
  if (sprite && object3D.userData.hasTexture) {
    try {
      const frame = sprite.useAnimatedSprite ? sprite.getAnimatedFrame?.() : null;
      if (frame && typeof frame.row === 'number') {
        const cols = sprite.spriteColumns || 4;
        const rows = sprite.spriteRows || 8;
        const offsetX = frame.col / cols;
        const offsetY = 1 - (frame.row + 1) / rows;
        
        // 多材质模式（BoxGeometry）
        if (Array.isArray(object3D.material)) {
          const frontIdx = object3D.userData.frontMatIndex ?? 4;
          const backIdx = object3D.userData.backMatIndex ?? 5;
          for (const idx of [frontIdx, backIdx]) {
            const mat = object3D.material[idx];
            if (mat?.map) {
              mat.map.offset.set(offsetX, offsetY);
              mat.map.repeat.set(1 / cols, 1 / rows);
              mat.map.needsUpdate = true;
            }
          }
        } else if (object3D.material?.map) {
          // 单材质模式（PlaneGeometry 兼容）
          const map = object3D.material.map;
          map.offset.set(offsetX, offsetY);
          map.repeat.set(1 / cols, 1 / rows);
          map.needsUpdate = true;
        }
      }
    } catch (_) { /* noop */ }
  }
}

export default { createEntityView, updateEntityView };
