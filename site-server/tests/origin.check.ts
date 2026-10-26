export {};
/**
 * Same-origin gate — offline unit checks.
 * ---------------------------------------------------------------------------
 * Regression cover for the defect that made every browser POST to the account
 * routes fail with `forbidden_origin`: behind the platform proxy the request
 * carries the internal host (e.g. `localhost:3000`) while the browser sends the
 * public hostname, and the gate compared the two directly. curl sends no Origin
 * at all, so the bug was invisible from the command line.
 *
 * Run: bun run tests/origin.check.ts   (from the site dir)
 */
const { isSameOrigin } = await import("../src/lib/http.ts");

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    console.log("  ❌", name);
  }
};

const req = (headers: Record<string, string>) =>
  new Request("http://127.0.0.1:3000/api/auth/login", { method: "POST", headers });

const PUBLIC = "https://576127cef4e964ad11707bbdd13ace2d.ctonew.app";

console.log("\nsame-origin gate");
check("no Origin (curl / SSR fetch) is allowed", isSameOrigin(req({})) === true);
check(
  "browser POST to the public site is allowed (public host in x-forwarded-host)",
  isSameOrigin(req({ origin: PUBLIC, host: "127.0.0.1:3000", "x-forwarded-host": "576127cef4e964ad11707bbdd13ace2d.ctonew.app" })) === true
);
check(
  "plain same-origin POST is allowed",
  isSameOrigin(req({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" })) === true
);
check(
  "a forwarded host list is handled",
  isSameOrigin(req({ origin: PUBLIC, host: "internal:3000", "x-forwarded-host": "internal:3000, 576127cef4e964ad11707bbdd13ace2d.ctonew.app" })) === true
);
check(
  "a different site is still rejected",
  isSameOrigin(req({ origin: "https://evil.example", host: "127.0.0.1:3000", "x-forwarded-host": "576127cef4e964ad11707bbdd13ace2d.ctonew.app" })) === false
);
check(
  "an opaque Origin (sandboxed iframe / file://) is rejected",
  isSameOrigin(req({ origin: "null", host: "127.0.0.1:3000" })) === false
);
check("a malformed Origin is rejected", isSameOrigin(req({ origin: "not a url", host: "127.0.0.1:3000" })) === false);

// An explicitly configured public address is honoured even without proxy headers.
process.env.PUBLIC_ORIGIN = PUBLIC;
check(
  "PUBLIC_ORIGIN is accepted when no proxy header is present",
  isSameOrigin(req({ origin: PUBLIC, host: "internal:3000" })) === true
);
check(
  "a different site is still rejected with PUBLIC_ORIGIN set",
  isSameOrigin(req({ origin: "https://evil.example", host: "internal:3000" })) === false
);
delete process.env.PUBLIC_ORIGIN;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
