import {
  createJsonRpcRequest,
  unwrapJsonRpcResponse
} from './JsonRpcProtocol.js';

export const BattleMethod = Object.freeze({
  CREATE: 'createBattle',
  INTERVENE: 'intervene',
  REPORT_RESULT: 'reportBattleResult'
});

/** JSON-RPC 2.0 战斗契约的唯一客户端入口。 */
export class BattleClient {
  constructor(config = {}) {
    if (!config.transport || typeof config.transport.request !== 'function') {
      throw new Error('BattleClient: 必须配置唯一 transport');
    }
    this.transport = config.transport;
    this._sequence = 0;
    this.requestIdFactory = config.requestIdFactory || (() => `battle-request-${++this._sequence}`);
  }

  createBattle(params, options = {}) {
    return this._call(BattleMethod.CREATE, params, options.requestId);
  }

  intervene(params, options = {}) {
    return this._call(BattleMethod.INTERVENE, params, options.requestId);
  }

  reportBattleResult(params, options = {}) {
    return this._call(BattleMethod.REPORT_RESULT, params, options.requestId);
  }

  async _call(method, params, explicitRequestId) {
    const requestId = explicitRequestId ?? this.requestIdFactory(method, params);
    const request = createJsonRpcRequest(requestId, method, params);
    const response = await this.transport.request(request);
    return unwrapJsonRpcResponse(response, requestId);
  }
}

export default BattleClient;