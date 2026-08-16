import { describe, expect, it } from 'vitest';
import { SceneEditorHistory } from './SceneEditorHistory.js';

describe('SceneEditorHistory lossless save', () => {
  it('保存不清理 imageAssets、不舍入坐标且不注入字段', async () => {
    const sceneData = {
      id: 'S01',
      imageAssets: {
        used: { src: 'used.png' },
        retainedUnknown: { src: 'keep.png', unknownAllowed: true }
      },
      layers: [{ id: 'objects', objects: [{ id: 'stable', imageId: 'used', x: 1.23456789, y: 0, enabled: false }] }],
      unknownAllowed: { nullable: null, empty: '' }
    };
    const before = structuredClone(sceneData);
    const editor = {
      sceneData,
      onSceneChange: async candidate => ({ ok: true, committed: true, value: structuredClone(candidate) }),
      ui: { showToast() {} }
    };

    const result = await new SceneEditorHistory(editor).save();
    expect(result.committed).toBe(true);
    expect(editor.sceneData).toEqual(before);
    expect(editor.sceneData.layers[0].objects[0].x).toBe(1.23456789);
    expect(editor.sceneData.imageAssets.retainedUnknown).toBeTruthy();
  });
});
