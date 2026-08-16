/** 所有本地与未来远端 authority adapter 必须实现的唯一命令执行端口。 */
export class AuthorityPort {
  async execute(_command) {
    throw new Error('AuthorityPort.execute(command) must be implemented');
  }

  dispose() {}
}

export function assertAuthorityPort(port) {
  if (!port || typeof port.execute !== 'function') {
    throw new TypeError('AuthorityPort requires execute(command)');
  }
  return port;
}

/** 未来远端 adapter 的接口边界；当前交付不连接生产 transport。 */
export class RemoteAuthorityAdapter extends AuthorityPort {
  async execute(_command) {
    throw new Error('RemoteAuthorityAdapter is an interface; provide a loopback or future transport adapter');
  }
}

export default AuthorityPort;
