import type { LookupAddress } from "node:dns";
import { describe, expect, it, vi } from "vitest";
import { checkImageUrl, imageProxyUrl, isPublicIpAddress, parseIPv6 } from "@/lib/validation/image-url";

vi.mock("server-only", () => ({}));
const { safeLookup, sniffImageType, fetchRemoteImage } = await import("@/lib/images/remote");

describe("image URL syntax", () => {
  it.each([
    "https://i.imgur.com/abc.jpg",
    "http://static.example.org/covers/one-piece.png",
    "https://pbs.twimg.com/media/X.jpg?format=jpg&name=large",
    "https://upload.wikimedia.org/wikipedia/en/9/90/One_Piece.png",
    "https://cdn.example.com:443/a.webp",
    "https://8.8.8.8/a.png",
  ])("accepts public http(s) address %s", (url) => {
    expect(checkImageUrl(url).ok).toBe(true);
  });

  it.each([
    ["not a url", "invalid"],
    ["ftp://files.example.com/a.png", "protocol"],
    ["data:image/png;base64,AAAA", "protocol"],
    ["javascript:alert(1)", "protocol"],
    ["https://user:pw@example.com/a.png", "credentials"],
    ["https://example.com:8443/a.png", "port"],
    ["http://localhost/a.png", "private"],
    ["http://printer.local/a.png", "private"],
    ["http://metadata.google.internal/a.png", "private"],
    ["http://127.0.0.1/a.png", "private"],
    ["http://10.0.0.8/a.png", "private"],
    ["http://172.20.1.1/a.png", "private"],
    ["http://192.168.1.10/a.png", "private"],
    ["http://169.254.169.254/latest/meta-data", "private"],
    ["http://100.64.0.1/a.png", "private"],
    ["http://0.0.0.0/a.png", "private"],
    ["http://[::1]/a.png", "private"],
    ["http://[fd00::1]/a.png", "private"],
    ["http://[fe80::1]/a.png", "private"],
    ["http://[::ffff:127.0.0.1]/a.png", "private"],
    ["http://[::ffff:7f00:1]/a.png", "private"],
    ["http://2130706433/a.png", "private"], // decimal 127.0.0.1, normalized by URL
    ["http://0x7f.1/a.png", "private"], // hex shorthand, normalized by URL
    ["http://intranet/a.png", "invalid"],
  ])("rejects %s (%s)", (url, problem) => {
    const result = checkImageUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe(problem);
  });

  it("classifies IP addresses", () => {
    expect(isPublicIpAddress("93.184.216.34")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicIpAddress("::ffff:10.1.2.3")).toBe(false);
    expect(isPublicIpAddress("64:ff9b::a00:1")).toBe(false); // NAT64 of 10.0.0.1
    expect(isPublicIpAddress("2001:db8::1")).toBe(false);
    expect(isPublicIpAddress("2002:c0a8:0101::1")).toBe(false);
    expect(isPublicIpAddress("not-an-ip")).toBe(false);
    expect(parseIPv6("1::2::3")).toBeNull();
  });

  it("builds same-origin proxy URLs", () => {
    expect(imageProxyUrl("https://a.example.com/x y.png?q=1&r=2")).toBe(`/api/image?url=${encodeURIComponent("https://a.example.com/x y.png?q=1&r=2")}`);
  });
});

describe("connect-time address checks", () => {
  const resolverFor =
    (addresses: LookupAddress[]) =>
    (_host: string, callback: (error: Error | null, addresses: LookupAddress[]) => void) =>
      callback(null, addresses);

  function lookup(addresses: LookupAddress[], options: object = {}) {
    return new Promise<{ error: Error | null; address: unknown }>((resolve) => {
      safeLookup(resolverFor(addresses))("images.example.com", options, (error, address) => resolve({ error, address }));
    });
  }

  it("allows hosts that resolve only to public addresses", async () => {
    const result = await lookup([{ address: "93.184.216.34", family: 4 }]);
    expect(result.error).toBeNull();
    expect(result.address).toBe("93.184.216.34");
  });

  it("blocks DNS answers containing any private address (rebinding)", async () => {
    expect((await lookup([{ address: "10.0.0.1", family: 4 }])).error).toBeInstanceOf(Error);
    expect((await lookup([{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }])).error).toBeInstanceOf(Error);
    expect((await lookup([{ address: "::1", family: 6 }])).error).toBeInstanceOf(Error);
    expect((await lookup([])).error).toBeInstanceOf(Error);
  });

  it("refuses private targets before connecting, including via DNS", async () => {
    await expect(fetchRemoteImage("http://127.0.0.1/a.png")).resolves.toMatchObject({ ok: false, code: "private_address" });
    const rebinding = resolverFor([{ address: "192.168.0.10", family: 4 }]);
    await expect(fetchRemoteImage("http://nas.example.com/a.png", { resolve: rebinding })).resolves.toMatchObject({ ok: false, code: "private_address" });
    await expect(fetchRemoteImage("gopher://example.com/")).resolves.toMatchObject({ ok: false, code: "invalid_url" });
  });
});

describe("image sniffing", () => {
  it.each([
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[...Buffer.from("GIF89a")], "image/gif"],
    [[...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")], "image/webp"],
    [[0, 0, 0, 0x1c, ...Buffer.from("ftypavif")], "image/avif"],
    [[...Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')], "image/svg+xml"],
  ])("recognizes %j as %s", (bytes, type) => {
    expect(sniffImageType(Buffer.from(bytes))).toBe(type);
  });

  it("rejects HTML and text", () => {
    expect(sniffImageType(Buffer.from("<!doctype html><html><body>Not an image</body></html>"))).toBeNull();
    expect(sniffImageType(Buffer.from("hello"))).toBeNull();
  });
});
