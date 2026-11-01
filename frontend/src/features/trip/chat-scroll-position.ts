export interface ChatScrollMetrics {
  contentHeight: number;
  viewportHeight: number;
  offsetY: number;
}

/** Keep layout/programmatic scroll events from cancelling the initial bottom alignment. */
export class ChatScrollPosition {
  private contentHeight = 0;
  private viewportHeight = 0;
  private offsetY = 0;
  private following = true;
  private initial = true;
  private aligning = true;

  reset() {
    this.following = true;
    this.initial = true;
    this.aligning = true;
  }

  contentChanged(height: number) {
    if (height !== this.contentHeight && this.following) this.aligning = true;
    this.contentHeight = height;
  }

  layoutChanged(height: number) {
    if (height !== this.viewportHeight && this.following) this.aligning = true;
    this.viewportHeight = height;
  }

  beginDrag() {
    this.initial = false;
    this.aligning = false;
    this.following = false;
  }

  scrolled(metrics: ChatScrollMetrics) {
    const resized =
      metrics.contentHeight !== this.contentHeight ||
      metrics.viewportHeight !== this.viewportHeight;
    const movedUp = metrics.offsetY < this.offsetY - 1;
    this.contentHeight = metrics.contentHeight;
    this.viewportHeight = metrics.viewportHeight;
    this.offsetY = metrics.offsetY;
    const distance = this.contentHeight - this.viewportHeight - this.offsetY;
    if (this.initial) {
      if (this.contentHeight > 0 && this.viewportHeight > 0 && distance <= 1) {
        this.initial = false;
        this.aligning = false;
      }
      return;
    }
    if (resized) {
      if (this.following) this.aligning = distance > 1;
      return;
    }
    if (this.aligning && !movedUp && distance > 1) return;
    this.aligning = false;
    this.following = distance < 100;
  }

  shouldScrollToLatest() {
    if (!this.following || this.contentHeight <= 0 || this.viewportHeight <= 0)
      return false;
    const distance = this.contentHeight - this.viewportHeight - this.offsetY;
    this.aligning = distance > 1;
    if (!this.aligning) this.initial = false;
    return true;
  }
}
