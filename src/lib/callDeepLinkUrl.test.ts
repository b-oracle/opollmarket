import { describe, it, expect } from "vitest";
import { stripCallDeepLinkParams } from "./callDeepLinkUrl";

// Simulates the end-to-end flow:
//   1. User taps an OS notification → app opens at
//      /messages/<id>?call_id=...&auto_accept=1&<other params>
//   2. ChatView's auto-accept effect fires, joins the call, and calls
//      stripCallDeepLinkParams against the LIVE URLSearchParams.
//   3. Only auto_accept + call_id may be removed; every other param —
//      including marketing attribution (utm_*, ref, fbclid, gclid) and
//      arbitrary feature flags — must survive byte-for-byte.
describe("stripCallDeepLinkParams (deep-link URL preservation)", () => {
  const VALID = "914a3926-f603-4e46-b2cb-ed2f34a09fa5";
  const buildIncoming = (extra: string) =>
    `auto_accept=1&call_id=${VALID}&${extra}`;

  it("removes auto_accept and call_id while preserving utm_* and ref", () => {
    const incoming = buildIncoming(
      "utm_source=push&utm_medium=notification&utm_campaign=call-rejoin&ref=user-42",
    );

    const result = stripCallDeepLinkParams(incoming);

    expect(result.has("auto_accept")).toBe(false);
    expect(result.has("call_id")).toBe(false);
    expect(result.get("utm_source")).toBe("push");
    expect(result.get("utm_medium")).toBe("notification");
    expect(result.get("utm_campaign")).toBe("call-rejoin");
    expect(result.get("ref")).toBe("user-42");
  });

  it("preserves params regardless of position relative to call params", () => {
    const incoming = `utm_source=push&auto_accept=1&utm_medium=notification&call_id=${VALID}&ref=u1`;

    const result = stripCallDeepLinkParams(incoming);

    expect(result.toString()).toBe(
      "utm_source=push&utm_medium=notification&ref=u1",
    );
  });

  it("preserves third-party tracking params (fbclid, gclid)", () => {
    const incoming = buildIncoming(
      "fbclid=IwAR_test123&gclid=Cj0KCQiA_test&msclkid=abc",
    );

    const result = stripCallDeepLinkParams(incoming);

    expect(result.get("fbclid")).toBe("IwAR_test123");
    expect(result.get("gclid")).toBe("Cj0KCQiA_test");
    expect(result.get("msclkid")).toBe("abc");
  });

  it("preserves duplicate values for the same non-call param key", () => {
    const incoming = `auto_accept=1&call_id=${VALID}&tag=a&tag=b&tag=c`;

    const result = stripCallDeepLinkParams(incoming);

    expect(result.getAll("tag")).toEqual(["a", "b", "c"]);
    expect(result.has("auto_accept")).toBe(false);
    expect(result.has("call_id")).toBe(false);
  });

  it("preserves URL-encoded values exactly", () => {
    const incoming = `auto_accept=1&call_id=${VALID}&ref=${encodeURIComponent(
      "campaign/q4=launch",
    )}&utm_content=${encodeURIComponent("Hello World!")}`;

    const result = stripCallDeepLinkParams(incoming);

    expect(result.get("ref")).toBe("campaign/q4=launch");
    expect(result.get("utm_content")).toBe("Hello World!");
  });

  it("is a no-op on URLs that have no call params", () => {
    const incoming = "utm_source=email&ref=newsletter";
    const result = stripCallDeepLinkParams(incoming);
    expect(result.toString()).toBe("utm_source=email&ref=newsletter");
  });

  it("returns empty params when only call params were present", () => {
    const result = stripCallDeepLinkParams(`auto_accept=1&call_id=${VALID}`);
    expect(result.toString()).toBe("");
  });

  it("accepts a URLSearchParams instance and does not mutate it", () => {
    const input = new URLSearchParams(buildIncoming("utm_source=push"));
    const result = stripCallDeepLinkParams(input);

    expect(input.get("auto_accept")).toBe("1");
    expect(input.get("call_id")).toBe(VALID);
    expect(result.has("auto_accept")).toBe(false);
    expect(result.has("call_id")).toBe(false);
    expect(result.get("utm_source")).toBe("push");
  });

  it("matches the round-trip a real navigation would produce", () => {
    const url = new URL(
      `https://app.example.com/messages/conv-1?auto_accept=1&call_id=${VALID}&utm_source=push&utm_campaign=rejoin&ref=u42`,
    );

    const stripped = stripCallDeepLinkParams(url.searchParams);
    url.search = stripped.toString();

    expect(url.toString()).toBe(
      "https://app.example.com/messages/conv-1?utm_source=push&utm_campaign=rejoin&ref=u42",
    );
  });
});
