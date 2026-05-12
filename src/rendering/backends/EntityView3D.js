/**
 * EntityView3D.js
 * 把 ECS 实体映射为 three.js Object3D（精灵 billboard 为主，模型为辅）
 *
 * 资源策略：
 *  - 如果 AssetManager.getAsset(name) 返回 HTMLImageElement，动态创建 Texture
 *  - 若没有资源，返回占位方块
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
  tex.needsUpdate = true;
  _textureCache.set(image, tex);
  return tex;
}

function makePlaceholderMesh(size = 32) {
  const geom = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshBasicMaterial({ color: 0x4a9eff });
  return new THREE.Mesh(geom, mat);
}

function makeSpriteFromSpriteComponent(sprite, assetManager) {
  const image = assetManager?.getAsset?.(sprite.spriteSheet);
  if (image && image.complete !== false) {
    const tex = getOrCreateTextureFromImage(image);
    // 子帧 UV 将在 update 时设置
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(sprite.width || 32, sprite.height || 32, 1);
    return spr;
  }
  // 占位 sprite（纯色方块）
  const mat = new THREE.SpriteMaterial({ color: 0x4a9eff });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(sprite.width || 32, sprite.height || 32, 1);
  return spr;
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

  // 优先：Model3D 组件（阶段 A 只做占位，加载实际 glTF 留给 M6+）
  if (model) {
    // TODO: 接 GLTFLoader
    return makePlaceholderMesh(32);
  }

  if (sprite) {
    return makeSpriteFromSpriteComponent(sprite, assetManager);
  }

  return makePlaceholderMesh(32);
}

/**
 * 依据实体状态更新 Object3D
 * @param {THREE.Object3D} object3D
 * @param {*} entity
 */
export function updateEntityView(object3D, entity) {
  if (!object3D || !entity) return;
  const transform = entity.getComponent?.('transform');
  const sprite = entity.getComponent?.('sprite');
  const layer = entity.getComponent?.('layer');

  if (transform) applyTransformToObject3D(object3D, transform);

  // 可见性
  object3D.visible = entity.active !== false && (!sprite || sprite.visible !== false);

  // 分层 renderOrder
  if (layer) {
    const orderMap = { ground: 0, decal: 1, entity: 2, aerial: 3, effect: 4 };
    const base = orderMap[layer.worldLayer] ?? 2;
    object3D.renderOrder = base * 1000 + (layer.renderOrder || 0);
  }

  // 精灵 UV 驱动（若是 THREE.Sprite + SpriteMaterial.map）
  if (sprite && object3D.isSprite && object3D.material?.map) {
    try {
      const frame = sprite.useAnimatedSprite ? sprite.getAnimatedFrame() : null;
      const map = object3D.material.map;
      if (frame && typeof frame.row === 'number') {
        const cols = sprite.spriteColumns || 4;
        const rows = sprite.spriteRows || 8;
        map.offset.set(frame.col / cols, 1 - (frame.row + 1) / rows);
        map.repeat.set(1 / cols, 1 / rows);
        map.needsUpdate = true;
      }
    } catch (_) { /* noop */ }
  }
}

export default { createEntityView, updateEntityView };
