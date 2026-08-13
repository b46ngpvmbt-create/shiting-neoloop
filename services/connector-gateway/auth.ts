import { timingSafeEqual } from "node:crypto";

import type { OwnerAuthPort, OwnerAuthorization } from "./types.js";
import { verifyWorkbenchSession } from "./session.js";

export class StaticBearerOwnerAuth implements OwnerAuthPort {
  constructor(private readonly token: string) {}

  async authorize(request: Request): Promise<OwnerAuthorization> {
    if (this.token.length < 32) {
      return { ok: false, code: "owner_auth_unconfigured" };
    }
    const authorization = request.headers.get("authorization") ?? "";
    const prefix = "Bearer ";
    if (!authorization.startsWith(prefix)) {
      return { ok: false, code: "owner_unauthorized" };
    }
    const supplied = Buffer.from(authorization.slice(prefix.length), "utf8");
    const expected = Buffer.from(this.token, "utf8");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return { ok: false, code: "owner_unauthorized" };
    }
    return { ok: true, subject: "owner" };
  }
}

export class WorkbenchSessionOwnerAuth implements OwnerAuthPort {
  constructor(
    private readonly signingKey: string,
    private readonly clock: { now(): Date },
  ) {}

  async authorize(request: Request): Promise<OwnerAuthorization> {
    const authorization = request.headers.get("authorization") ?? "";
    const prefix = "Session ";
    if (!authorization.startsWith(prefix)) return { ok: false, code: "owner_unauthorized" };
    return verifyWorkbenchSession(authorization.slice(prefix.length), this.signingKey, this.clock.now());
  }
}

export class CompositeOwnerAuth implements OwnerAuthPort {
  constructor(private readonly ports: readonly OwnerAuthPort[]) {}

  async authorize(request: Request): Promise<OwnerAuthorization> {
    let unconfigured = false;
    for (const port of this.ports) {
      const result = await port.authorize(request);
      if (result.ok) return result;
      if (result.code === "owner_auth_unconfigured") unconfigured = true;
    }
    return { ok: false, code: unconfigured ? "owner_auth_unconfigured" : "owner_unauthorized" };
  }
}
