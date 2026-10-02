import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/security/password";
import { createOpaqueToken, hashToken, safeStringEqual } from "../src/security/tokens";

describe("security primitives", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const encoded = await hashPassword("uma-senha-segura-123");
    expect(encoded).not.toContain("uma-senha-segura-123");
    await expect(verifyPassword("uma-senha-segura-123", encoded)).resolves.toBe(true);
    await expect(verifyPassword("senha-incorreta", encoded)).resolves.toBe(false);
  });

  it("creates opaque tokens and keyed hashes", async () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThan(32);
    expect(await hashToken(token, "segredo")).toHaveLength(64);
    expect(safeStringEqual("mesmo", "mesmo")).toBe(true);
    expect(safeStringEqual("mesmo", "outro")).toBe(false);
  });
});
