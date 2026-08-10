import type { Clock } from "../contracts/ports.js";

export class TestClock implements Clock {
  readonly source = "test" as const;
  private current: Date;

  constructor(initial: string | Date) {
    this.current = new Date(initial);
    if (Number.isNaN(this.current.getTime())) {
      throw new Error("Invalid test clock time");
    }
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: string | Date): void {
    const next = new Date(instant);
    if (Number.isNaN(next.getTime())) {
      throw new Error("Invalid test clock time");
    }
    this.current = next;
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds)) {
      throw new Error("Clock advance must be finite");
    }
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
