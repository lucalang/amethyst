import { describe, expect, it } from "vitest";
import { getAllowedImageHosts, isAllowedImageUrl, parseExtraImageHosts } from "@/lib/validation/image-hosts";
import { safeNextPath } from "@/lib/validation/redirect";

describe("safeNextPath", () => {
  it.each([
    ["/franchise/1?tab=movies", "/franchise/1?tab=movies"],
    ["/", "/"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "", "relative", "/a\u0000b", undefined, 42])(
    "rejects %s",
    (input) => {
      expect(safeNextPath(input)).toBe("/");
    },
  );
});

describe("image host allow-list", () => {
  const hosts = getAllowedImageHosts("images.example.com, bad_host, ");

  it("includes provider defaults and valid extras only", () => {
    expect(hosts).toContain("cdn.myanimelist.net");
    expect(hosts).toContain("images.example.com");
    expect(parseExtraImageHosts("bad_host,,-x.com")).toEqual([]);
  });

  it("accepts https URLs on allowed hosts", () => {
    expect(isAllowedImageUrl("https://cdn.myanimelist.net/images/anime/1/1.jpg", hosts)).toBe(true);
  });

  it.each([
    "http://cdn.myanimelist.net/a.jpg",
    "https://evil.test/a.jpg",
    "https://user:pw@cdn.myanimelist.net/a.jpg",
    "https://cdn.myanimelist.net:8443/a.jpg",
    "https://cdn.myanimelist.net.evil.test/a.jpg",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedImageUrl(url, hosts)).toBe(false);
  });
});
