import { SelectedCharacterStore } from '../data/SelectedCharacterStore.js';

function createDefaultSkills() {
  return [
    {
      id: 'flame_palm',
      name: '火焰掌',
      type: 'magic',
      damageMin: 30,
      damageMax: 100,
      splashDamageMin: 5,
      splashDamageMax: 20,
      splashCount: 8,
      manaCost: 15,
      cooldown: 3.0,
      range: 400,
      effectType: 'flame_palm',
      projectileSpeed: 450,
      hotkey: '1'
    },
    {
      id: 'ice_finger',
      name: '寒冰指',
      type: 'magic',
      damageMin: 20,
      damageMax: 50,
      finalDamageMin: 50,
      finalDamageMax: 120,
      manaCost: 12,
      cooldown: 3.0,
      range: 550,
      effectType: 'ice_finger',
      projectileSpeed: 600,
      hotkey: '2'
    },

    {
      id: 'inferno_palm',
      name: '烈焰掌',
      type: 'magic',
      damageMin: 50,
      damageMax: 200,
      projectileCount: 5,
      manaCost: 25,
      cooldown: 10.0,
      range: 450,
      effectType: 'inferno_palm',
      projectileSpeed: 400,
      hotkey: '3'
    },
    {
      id: 'heal',
      name: '治疗',
      type: 'heal',
      healAmount: 50,
      manaCost: 20,
      cooldown: 20.0,
      range: 0,
      effectType: 'heal',
      hotkey: '4'
    },
    {
      id: 'meditation',
      name: '打坐',
      type: 'channel',
      healPerSecond: 0.1,
      manaPerSecond: 0.1,
      manaCost: 0,
      cooldown: 5.0,
      range: 0,
      effectType: 'meditation',
      hotkey: '5',
      requiresNonCombat: true
    }
  ];
}

/** 张角 Demo 玩家内容工厂；底层 ECS 创建仍委托框架 EntityFactory。 */
export class DemoPlayerFactory {
  create(scene, { x = 420, y = 330 } = {}) {
    const selected = SelectedCharacterStore.get();
    this._loadSelectedAsset(scene, selected);

    const player = scene.entityFactory.createPlayer({
      name: selected?.name || '玩家',
      class: selected?.class || 'refugee',
      spriteSheet: selected?.spriteSheet,
      spriteConfig: selected?.spriteConfig || undefined,
      level: 1,
      position: { x, y },
      stats: {
        maxHp: 150,
        hp: 150,
        maxMp: 100,
        mp: 100,
        attack: 15,
        defense: 8,
        speed: 120
      },
      skills: createDefaultSkills(),
      equipment: {},
      inventory: []
    });

    const sprite = player.getComponent('sprite');
    console.log('BaseGameScene: 玩家精灵组件', {
      spriteSheet: sprite?.spriteSheet,
      useDirectionalSprite: sprite?.useDirectionalSprite,
      direction: sprite?.direction,
      width: sprite?.width,
      height: sprite?.height
    });

    console.log('BaseGameScene: 创建玩家实体', player);
    return player;
  }


  _loadSelectedAsset(scene, selected) {
    if (!selected?.assetImage || !scene.assetManager) return;
    const { key, path } = selected.assetImage;
    const manager = scene.assetManager;
    if (!manager.getImage || manager.images.has(key)) return;

    const fullPath = manager.resolveAssetPath
      ? manager.resolveAssetPath(path.replace(/^assets\//, ''))
      : path;
    const onError = () => {
      console.warn(`createPlayerEntity: 无法加载主角图片 ${path}`);
    };
    manager.loadImage(key, fullPath).catch(scene.resourceScope?.guard(onError) || onError);
  }
}

export default DemoPlayerFactory;