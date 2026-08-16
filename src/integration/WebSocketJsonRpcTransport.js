/**
 * 未来 WebSocket JSON-RPC transport 的接口边界。
 * 当前单机交付不建立连接；测试或未来宿主必须显式提供 request(request) 实现。
 */
export class WebSocketJsonRpcTransport {
  async request(_request) {
    throw new Error('WebSocketJsonRpcTransport is an interface; no production transport is configured');
  }
}

export function assertJsonRpcTransport(transport) {
  if (!transport || typeof transport.request !== 'function') {
    throw new TypeError('JSON-RPC transport requires request(request)');
  }
  return transport;
}

export default WebSocketJsonRpcTransport;
