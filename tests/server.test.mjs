import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";

async function withServer(run) {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("serves the letter-only application", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Мороз\.Письмо/);
    assert.match(html, /Создать письмо/);
    assert.doesNotMatch(html, /type="file"/);
    assert.doesNotMatch(html, /FLUX|GPT Image|генерац(?:ия|ию) изображений/i);
  });
});

test("reports a static, browser-only health mode", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.mode, "browser-only-personalisation");
    assert.equal(body.storesPersonalData, false);
  });
});

test("serves the supplied letter assets", async () => {
  await withServer(async (baseUrl) => {
    const [png, pdf] = await Promise.all([
      fetch(`${baseUrl}/assets/letter-template.png`, { method: "HEAD" }),
      fetch(`${baseUrl}/assets/letter-template.pdf`, { method: "HEAD" }),
    ]);
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
  });
});

test("does not expose the old image-generation endpoint", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childName: "Маша" }),
    });
    assert.equal(response.status, 405);
  });
});

test("adds browser security headers", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl);
    assert.match(response.headers.get("content-security-policy"), /object-src 'none'/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  });
});
