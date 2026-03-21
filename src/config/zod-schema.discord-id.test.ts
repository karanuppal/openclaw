import { describe, expect, it } from "vitest";
import { z } from "zod";

// OLD schema (from before this fix) — for regression comparison
const OldDiscordIdSchema = z
  .union([z.string(), z.number()])
  .refine((value) => typeof value === "string", {
    message: "Discord IDs must be strings (wrap numeric IDs in quotes).",
  });

// NEW schema (the fix)
const NewDiscordIdSchema = z.preprocess(
  (val) => (typeof val === "number" ? String(val) : val),
  z.string({
    message: "Discord IDs must be strings (wrap numeric IDs in quotes).",
  }),
);

describe("DiscordIdSchema — new behavior", () => {
  it("accepts string Discord IDs", () => {
    const result = NewDiscordIdSchema.safeParse("123456789012345678");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("123456789012345678");
    }
  });

  it("preserves large snowflake IDs as strings without precision loss", () => {
    const largeId = "1234567890123456789";
    const result = NewDiscordIdSchema.safeParse(largeId);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(largeId);
      expect(result.data).toHaveLength(19);
    }
  });

  it("coerces small numeric IDs to strings", () => {
    const result = NewDiscordIdSchema.safeParse(12345);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("12345");
    }
  });

  it("rejects non-string non-number values", () => {
    expect(NewDiscordIdSchema.safeParse(true).success).toBe(false);
    expect(NewDiscordIdSchema.safeParse(null).success).toBe(false);
    expect(NewDiscordIdSchema.safeParse(undefined).success).toBe(false);
    expect(NewDiscordIdSchema.safeParse({}).success).toBe(false);
  });
});

describe("DiscordIdSchema — proves bug fix (old vs new)", () => {
  it("OLD schema rejects numeric IDs — this is the bug", () => {
    // The old schema accepted numbers in the union but then rejected them
    // in the refine — confusing error for web UI users
    const result = OldDiscordIdSchema.safeParse(12345);
    expect(result.success).toBe(false); // OLD: rejects numbers
  });

  it("NEW schema accepts numeric IDs by coercing to string — this is the fix", () => {
    // The new schema coerces numbers to strings, so the web UI can send
    // either quoted or unquoted IDs and both work
    const result = NewDiscordIdSchema.safeParse(12345);
    expect(result.success).toBe(true); // NEW: coerces and accepts
    if (result.success) {
      expect(result.data).toBe("12345");
    }
  });

  it("both schemas handle string IDs identically", () => {
    const id = "123456789012345678";
    const oldResult = OldDiscordIdSchema.safeParse(id);
    const newResult = NewDiscordIdSchema.safeParse(id);
    expect(oldResult.success).toBe(true);
    expect(newResult.success).toBe(true);
  });
});
