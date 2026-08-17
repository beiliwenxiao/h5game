/**
 * Scans compatible scene object lists for objects already marked as picked.
 * State commitment and domain-specific reactions remain with the injected callback.
 */
export class ScenePickedObjectObserver {
  constructor({ lists = [], onPicked = null } = {}) {
    this.lists = lists;
    this.onPicked = typeof onPicked === 'function' ? onPicked : null;
  }

  scan() {
    if (!this.onPicked) return 0;
    let observed = 0;
    for (const source of this.lists || []) {
      const values = typeof source === 'function' ? source() : source;
      if (!values || typeof values[Symbol.iterator] !== 'function') continue;
      for (const value of values) {
        if (value?.picked !== true) continue;
        this.onPicked(value);
        observed++;
      }
    }
    return observed;
  }
}

export default ScenePickedObjectObserver;
