import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirror the production DiscordIdSchema to test in isolation
const DiscordIdSchema = z.preprocess(
  (val) => (typeof val === "number" ? String(val) : val),
  z.string({
    invalid_type_error: "Discord IDs must be strings (wrap numeric IDs in quotes).",
  }),
);

describe("DiscordIdSchema", () => {
  it("accepts string Discord IDs", () => {
    const result = DiscordIdSchema.safeParse("123456789012345678");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("123456789012345678");
    }
  });

  it("preserves large snowflake IDs as strings without precision loss", () => {
    const largeId = "1234567890123456789";
    // This ID exceeds Number.MAX_SAFE_INTEGER, so casting to number loses precision
    expect(Number(largeId).toString()).not.toBe(largeId);
    const result = DiscordIdSchema.safeParse(largeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(largeId);
      expect(result.data).toHaveLength(19);
    }
  });

  it("coerces small numeric IDs to strings", () => {
    const result = DiscordIdSchema.safeParse(12345);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("12345");
    }
  });

  it("rejects non-string non-number values", () => {
    const result = DiscordIdSchema.safeParse(true);
    expect(result.success).toBe(false);
  });

  it("accepts wildcard string", () => {
    const result = DiscordIdSchema.safeParse("*");
    expect(result.success).toBe(true);
  });
});
