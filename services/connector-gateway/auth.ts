import { timingSafeEqual } from "node:crypto";

import type { OwnerAuthPort, OwnerAuthorization } from "./types.js";

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
