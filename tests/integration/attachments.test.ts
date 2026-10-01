import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";
import { anonClient, createTestUser, deleteTestUser, type TestUser } from "../support/local-supabase";

// 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  a = await createTestUser("img-a");
  b = await createTestUser("img-b");
});

afterAll(async () => {
  for (const user of [a, b]) {
    if (user) await user.client.storage.from(ATTACHMENT_BUCKET).remove([`${user.id}/Pasted image 1.png`]);
  }
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe("note image storage", () => {
  it("lets users upload into and read from their own folder only", async () => {
    const own = await a.client.storage.from(ATTACHMENT_BUCKET).upload(`${a.id}/Pasted image 1.png`, PNG, { contentType: "image/png" });
    expect(own.error).toBeNull();
    const duplicate = await a.client.storage.from(ATTACHMENT_BUCKET).upload(`${a.id}/Pasted image 1.png`, PNG, { contentType: "image/png" });
    expect(duplicate.error).not.toBeNull();

    const signed = await a.client.storage.from(ATTACHMENT_BUCKET).createSignedUrl(`${a.id}/Pasted image 1.png`, 60);
    expect(signed.error).toBeNull();
    expect((await fetch(signed.data!.signedUrl)).status).toBe(200);

    // Another account can neither read, sign, list nor overwrite it, nor write into the folder.
    expect((await b.client.storage.from(ATTACHMENT_BUCKET).download(`${a.id}/Pasted image 1.png`)).error).not.toBeNull();
    expect((await b.client.storage.from(ATTACHMENT_BUCKET).createSignedUrl(`${a.id}/Pasted image 1.png`, 60)).error).not.toBeNull();
    expect((await b.client.storage.from(ATTACHMENT_BUCKET).list(a.id)).data ?? []).toEqual([]);
    expect((await b.client.storage.from(ATTACHMENT_BUCKET).upload(`${a.id}/planted.png`, PNG, { contentType: "image/png" })).error).not.toBeNull();
    expect((await b.client.storage.from(ATTACHMENT_BUCKET).remove([`${a.id}/Pasted image 1.png`])).data ?? []).toEqual([]);
    expect((await anonClient().storage.from(ATTACHMENT_BUCKET).download(`${a.id}/Pasted image 1.png`)).error).not.toBeNull();
  });

  it("rejects non-image uploads and oversized files at the bucket", async () => {
    const html = await a.client.storage.from(ATTACHMENT_BUCKET).upload(`${a.id}/page.html`, Buffer.from("<script>alert(1)</script>"), { contentType: "text/html" });
    expect(html.error).not.toBeNull();
    const svg = await a.client.storage.from(ATTACHMENT_BUCKET).upload(`${a.id}/x.svg`, Buffer.from("<svg/>"), { contentType: "image/svg+xml" });
    expect(svg.error).not.toBeNull();
    const huge = await a.client.storage.from(ATTACHMENT_BUCKET).upload(`${a.id}/huge.png`, Buffer.alloc(10 * 1024 * 1024 + 1), { contentType: "image/png" });
    expect(huge.error).not.toBeNull();
  });
});
