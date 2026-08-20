/**
 * GatheringProgressPresenter - 采集会话的世界空间头顶进度表现。
 * 只消费 GatheringSystem 事件，不持有或修改采集、库存与节点业务状态。
 */
export class GatheringProgressPresenter {
  constructor({ width = 84, height = 9, offsetY = 18 } = {}) {
    this.width = Math.max(20, Number(width) || 84);
    this.height = Math.max(4, Number(height) || 9);
    this.offsetY = Math.max(0, Number(offsetY) || 18);
    this.actor = null;
    this.progress = 0;
    this.visible = false;
  }

  handleEvent(event, data = {}, actor = null) {
    if (event === 'started' || event === 'progress') {
      this.actor = actor || this.actor;
      this.progress = Math.max(0, Math.min(1, Number(data.progress) || 0));
      this.visible = Boolean(this.actor);
      return this.visible;
    }
    if (event === 'completed' || event === 'interrupted') this.clear();
    return false;
  }

  render(ctx) {
    if (!this.visible || !this.actor) return false;
    const transform = this.actor.getComponent?.('transform');
    if (!transform?.position) {
      this.clear();
      return false;
    }
    const sprite = this.actor.getComponent?.('sprite');
    const spriteHeight = (Number(sprite?.height) || 48) * (Number(sprite?.scale) || 1);
    const x = transform.position.x;
    const y = transform.position.y - (Number(transform.position.elevation) || 0)
      - spriteHeight - this.offsetY;
    const left = x - this.width / 2;
    const top = y - this.height / 2;
    const fillWidth = Math.max(0, (this.width - 2) * this.progress);

    ctx.save();
    ctx.fillStyle = 'rgba(12, 10, 8, 0.88)';
    ctx.fillRect(left - 2, top - 2, this.width + 4, this.height + 4);
    ctx.fillStyle = '#362f25';
    ctx.fillRect(left, top, this.width, this.height);
    if (fillWidth > 0) {
      ctx.fillStyle = this.progress >= 1 ? '#e5c45b' : '#7fc45b';
      ctx.fillRect(left + 1, top + 1, fillWidth, this.height - 2);
    }
    ctx.strokeStyle = '#ead89a';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top - 0.5, this.width + 1, this.height + 1);
    ctx.restore();
    return true;
  }

  clear() {
    this.actor = null;
    this.progress = 0;
    this.visible = false;
  }

  dispose() {
    this.clear();
  }
}

export default GatheringProgressPresenter;