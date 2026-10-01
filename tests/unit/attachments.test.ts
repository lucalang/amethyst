import { describe, expect, it } from "vitest";
import {
  attachmentUrl,
  findImageEmbeds,
  isValidAttachmentName,
  pastedImageName,
  resolveImageSrc,
  sanitizeAttachmentName,
  withSuffix,
} from "@/lib/attachments";

describe("note image embeds", () => {
  it("finds Obsidian embeds with optional sizes", () => {
    expect(findImageEmbeds("Look: ![[Pasted image 20261001173400.png]] nice")).toEqual([
      { from: 6, to: 42, target: "Pasted image 20261001173400.png", alt: "Pasted image 20261001173400.png", width: null, height: null },
    ]);
    expect(findImageEmbeds("![[map.jpg|300]]")[0]).toMatchObject({ target: "map.jpg", width: 300, height: null });
    expect(findImageEmbeds("![[map.jpg|300x200]]")[0]).toMatchObject({ width: 300, height: 200 });
    // Note embeds (![[Some note]]) are not images.
    expect(findImageEmbeds("![[Some note]]")).toEqual([]);
  });

  it("finds Markdown images, including size in the alt text and <…> targets", () => {
    expect(findImageEmbeds("![Luffy](https://example.com/luffy.png)")[0]).toMatchObject({ target: "https://example.com/luffy.png", alt: "Luffy", width: null });
    expect(findImageEmbeds("![Luffy|250](https://example.com/a.png \"title\")")[0]).toMatchObject({ alt: "Luffy", width: 250 });
    expect(findImageEmbeds("![](<Pasted image 1.png>)")[0]).toMatchObject({ target: "Pasted image 1.png" });
    expect(findImageEmbeds("[not an image](https://example.com)")).toEqual([]);
    expect(findImageEmbeds("![[a.png]] and ![b](b.png)").map((embed) => embed.target)).toEqual(["a.png", "b.png"]);
  });

  it("resolves own attachments and public images, never other schemes", () => {
    expect(resolveImageSrc("Pasted image 1.png")).toBe(attachmentUrl("Pasted image 1.png"));
    expect(resolveImageSrc("Pasted%20image%201.png")).toBe(attachmentUrl("Pasted image 1.png"));
    expect(resolveImageSrc("folder/sub/map.png")).toBe(attachmentUrl("map.png"));
    expect(resolveImageSrc("https://example.com/a.png")).toBe(`/api/image?url=${encodeURIComponent("https://example.com/a.png")}`);
    expect(resolveImageSrc("http://127.0.0.1/a.png")).toBeNull();
    expect(resolveImageSrc("javascript:alert(1)")).toBeNull();
    expect(resolveImageSrc("data:image/png;base64,AAAA")).toBeNull();
  });
});

describe("attachment names", () => {
  it("names pasted images like Obsidian", () => {
    expect(pastedImageName("png", new Date(2026, 9, 1, 17, 34, 5))).toBe("Pasted image 20261001173405.png");
  });

  it("removes characters that break links or paths", () => {
    expect(sanitizeAttachmentName("my [cool] map#1|v2?.PNG", "png")).toBe("my cool map 1 v2.png");
    expect(sanitizeAttachmentName("../../etc/passwd", "jpg")).toBe(".. .. etc passwd.jpg");
    expect(sanitizeAttachmentName("   ", "gif")).toBe("Image.gif");
    expect(sanitizeAttachmentName("a".repeat(300), "png")).toHaveLength(104);
    expect(withSuffix("Pasted image 1.png", 2)).toBe("Pasted image 1 2.png");
  });

  it("accepts only clean names with an image extension", () => {
    expect(isValidAttachmentName("Pasted image 20261001173405.png")).toBe(true);
    expect(isValidAttachmentName("map 2.webp")).toBe(true);
    expect(isValidAttachmentName("../secret.png")).toBe(false);
    expect(isValidAttachmentName("other-user/a.png")).toBe(false);
    expect(isValidAttachmentName("evil.svg")).toBe(false);
    expect(isValidAttachmentName("page.html")).toBe(false);
  });
});
