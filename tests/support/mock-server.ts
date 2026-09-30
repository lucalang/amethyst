// Local HTTP server that impersonates Jikan (fixtures) and MyAnimeList
// (OAuth + API) for end-to-end tests. Started by Playwright's global setup.
import { createServer, type Server } from "node:http";
import { routeFixture } from "./jikan-fixtures";
import { createMalMock } from "./mal-mock";

export const MOCK_PORT = 4010;
export const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_PORT}`;

export function startMockProviders(): Promise<{ server: Server; mal: ReturnType<typeof createMalMock> }> {
  const mal = createMalMock({ base: `${MOCK_ORIGIN}/mal` });
  const seed = () => {
    mal.state.list.clear();
    mal.state.patches.length = 0;
    mal.setEntry(1001, "Fixture Saga", "watching", 7, 3);
    mal.setEntry(9999, "Not In Archive", "plan_to_watch", 0, 0);
  };
  seed();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", MOCK_ORIGIN);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);

    let response: Response;
    if (url.pathname === "/__reset") {
      seed();
      response = Response.json({ ok: true });
    } else if (url.pathname === "/__state") {
      response = Response.json({ patches: mal.state.patches, list: [...mal.state.list.values()], tokenRequests: mal.state.tokenRequests.length });
    } else if (url.pathname.startsWith("/v4/")) {
      response = routeFixture(url.pathname.slice(3), url.searchParams);
    } else if (url.pathname.startsWith("/mal/")) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
      response = await mal.handle(new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : body }));
    } else {
      response = new Response("not found", { status: 404 });
    }
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOCK_PORT, "127.0.0.1", () => resolve({ server, mal }));
  });
}
