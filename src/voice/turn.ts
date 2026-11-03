// Every asynchronous stage checks this token before producing user-visible effects.
export class TurnGate {
  private version = 0;
  next() { return ++this.version; }
  current(token: number) { return token === this.version; }
  invalidate() { ++this.version; }
}
