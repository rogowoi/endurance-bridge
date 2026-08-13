import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import setupHandler from "../api/setup.js";

test("renders a valid friend-facing onboarding page", () => {
  let html = "";
  const response = {
    setHeader() {},
    status() {
      return this;
    },
    send(value: unknown) {
      html = String(value);
      return this;
    }
  };

  setupHandler({ method: "GET" } as never, response as never);

  assert.match(html, /Your training\./);
  assert.match(html, /You’re invited/);
  assert.match(html, /Add your AI client/);
  assert.match(html, /Partner operations/);
  assert.match(html, /History loading/);
  assert.match(html, /13 tools/);
  assert.match(html, /Review my training from last week/);
  assert.match(html, /launchctl setenv ENDURANCE_BRIDGE_API_KEY/);
  assert.match(html, /fully quit Codex with ⌘Q/);

  const browserScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(browserScript);
  assert.doesNotThrow(() => new vm.Script(browserScript));
});
