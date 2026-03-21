import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, validateConfigObject } from "./config.js";
import { withTempHomeConfig } from "./test-helpers.js";

describe("config discord", () => {
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.HOME;
  });

  afterEach(() => {
    process.env.HOME = previousHome;
  });

  it("loads discord guild map + dm group settings", async () => {
    await withTempHomeConfig(
      {
        channels: {
          discord: {
            enabled: true,
            dm: {
              enabled: true,
              allowFrom: ["steipete"],
              groupEnabled: true,
              groupChannels: ["openclaw-dm"],
            },
            actions: {
              emojiUploads: true,
              stickerUploads: false,
              channels: true,
            },
            guilds: {
              "123": {
                slug: "friends-of-openclaw",
                requireMention: false,
                users: ["steipete"],
                channels: {
                  general: { allow: true, autoThread: true },
                },
              },
            },
          },
        },
      },
      async () => {
        const cfg = loadConfig();

        expect(cfg.channels?.discord?.enabled).toBe(true);
        expect(cfg.channels?.discord?.dm?.groupEnabled).toBe(true);
        expect(cfg.channels?.discord?.dm?.groupChannels).toEqual(["openclaw-dm"]);
        expect(cfg.channels?.discord?.actions?.emojiUploads).toBe(true);
        expect(cfg.channels?.discord?.actions?.stickerUploads).toBe(false);
        expect(cfg.channels?.discord?.actions?.channels).toBe(true);
        expect(cfg.channels?.discord?.guilds?.["123"]?.slug).toBe("friends-of-openclaw");
        expect(cfg.channels?.discord?.guilds?.["123"]?.channels?.general?.allow).toBe(true);
        expect(cfg.channels?.discord?.guilds?.["123"]?.channels?.general?.autoThread).toBe(true);
      },
    );
  });

  it("preserves large discord IDs as strings during validation", () => {
    const largeId = "1234567890123456789";
    const res = validateConfigObject({
      channels: {
        discord: {
          allowFrom: [largeId],
          dm: { allowFrom: [largeId], groupChannels: [largeId] },
          guilds: {
            guild: {
              users: [largeId],
              roles: [largeId],
              channels: {
                general: { users: [largeId], roles: [largeId] },
              },
            },
          },
          execApprovals: { approvers: [largeId] },
        },
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.discord?.allowFrom?.[0]).toBe(largeId);
      expect(typeof res.config.channels?.discord?.allowFrom?.[0]).toBe("string");
      expect(res.config.channels?.discord?.dm?.allowFrom?.[0]).toBe(largeId);
      expect(res.config.channels?.discord?.dm?.groupChannels?.[0]).toBe(largeId);
      expect(res.config.channels?.discord?.guilds?.guild?.users?.[0]).toBe(largeId);
      expect(res.config.channels?.discord?.guilds?.guild?.roles?.[0]).toBe(largeId);
      expect(res.config.channels?.discord?.guilds?.guild?.channels?.general?.users?.[0]).toBe(
        largeId,
      );
      expect(res.config.channels?.discord?.guilds?.guild?.channels?.general?.roles?.[0]).toBe(
        largeId,
      );
      expect(res.config.channels?.discord?.execApprovals?.approvers?.[0]).toBe(largeId);
    }
  });

  it("coerces numeric discord IDs to strings", () => {
    const res = validateConfigObject({
      channels: {
        discord: {
          allowFrom: [12345],
          dm: { allowFrom: [456], groupChannels: [789] },
          guilds: {
            "123": {
              users: [111],
              roles: [222],
              channels: {
                general: { users: [333], roles: [444] },
              },
            },
          },
          execApprovals: { approvers: [555] },
        },
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      // Small numeric IDs should be coerced to strings
      expect(res.config.channels?.discord?.allowFrom?.[0]).toBe("12345");
      expect(typeof res.config.channels?.discord?.allowFrom?.[0]).toBe("string");
      expect(res.config.channels?.discord?.dm?.allowFrom?.[0]).toBe("456");
      expect(res.config.channels?.discord?.guilds?.["123"]?.users?.[0]).toBe("111");
      expect(res.config.channels?.discord?.guilds?.["123"]?.roles?.[0]).toBe("222");
      expect(res.config.channels?.discord?.execApprovals?.approvers?.[0]).toBe("555");
    }
  });
});
