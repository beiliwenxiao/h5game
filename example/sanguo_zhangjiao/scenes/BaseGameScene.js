import { BaseGameScenePresentation } from './BaseGameScenePresentation.js';

export { CAMPAIGN_ID, SAVE_SCHEMA_VERSION } from './BaseGameSceneSetup.js';

/**
 * 场景薄组合根：保留稳定 import API 与生命周期入口；行为由显式父层和已注入服务承接。
 */
export class BaseGameScene extends BaseGameScenePresentation {
  constructor(sceneData = {}) {
    super(sceneData);
  }

  update(deltaTime) {
    return this._ensureFramePipeline().run(deltaTime);
  }

  render(ctx) {
    return this._ensureRenderPipeline().render(ctx);
  }

  exit() {
    super.exit();
    this._lifecycleCoordinator?.exit({ synchronous: true });
  }
}

export default BaseGameScene;
