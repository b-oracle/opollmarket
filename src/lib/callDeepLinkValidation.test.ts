import { describe, it, expect } from "vitest";
import {
  isValidCallId,
  parseAutoAcceptIntent,
  stripCallDeepLinkParams,
} from "./callDeepLinkUrl";

describe("isValidCallId", () => {
  it("accepts a canonical RFC 4122 v4 UUID", () => {
    expect(isValidCallId("914a3926-f603-4e46-b2cb-ed2f34a09fa5")).toBe(true);
  });

  it("accepts uppercase UUIDs", () => {
    expect(isValidCallId("914A3926-F603-4E46-B2CB-ED2F34A09FA5")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidCallId("  914a3926-f603-4e46-b2cb-ed2f34a09fa5  ")).toBe(
      true,
    );
  });

  it("rejects non-string values", () => {
    expect(isValidCallId(undefined)).toBe(false);
    expect(isValidCallId(null)).toBe(false);
    expect(isValidCallId(123)).toBe(false);
    expect(isValidCallId({})).toBe(false);
  });

  it.each([
    ["empty string", ""],
    ["short token", "abc"],
    ["numeric id", "12345"],
    ["wrong shape", "914a3926f6034e46b2cbed2f34a09fa5"],
    ["wrong segment lengths", "914a392-f603-4e46-b2cb-ed2f34a09fa5"],
    ["non-hex chars", "g14a3926-f603-4e46-b2cb-ed2f34a09fa5"],
    ["invalid version digit", "914a3926-f603-9e46-b2cb-ed2f34a09fa5"],
    ["invalid variant digit", "914a3926-f603-4e46-c2cb-ed2f34a09fa5"],
    [
      "javascript injection attempt",
      "<script>alert(1)</script>",
    ],
    ["sql-ish payload", "1' OR '1'='1"],
    ["path traversal", "../../etc/passwd"],
    ["overlong padded uuid", `${"a".repeat(70)}`],
  ])("rejects %s", (_label, value) => {
    expect(isValidCallId(value)).toBe(false);
  });
});

describe("parseAutoAcceptIntent", () => {
  const VALID = "914a3926-f603-4e46-b2cb-ed2f34a09fa5";

  it("returns the validated callId when both params are well-formed", () => {
    const params = new URLSearchParams(
      `auto_accept=1&call_id=${VALID}&utm_source=push`,
    );
    expect(parseAutoAcceptIntent(params)).toEqual({ callId: VALID });
  });

  it("trims whitespace from a valid call_id", () => {
    const params = new URLSearchParams();
    params.set("auto_accept", "1");
    params.set("call_id", `  ${VALID}  `);
    expect(parseAutoAcceptIntent(params)).toEqual({ callId: VALID });
  });

  it("returns null when auto_accept is missing", () => {
    const params = new URLSearchParams(`call_id=${VALID}`);
    expect(parseAutoAcceptIntent(params)).toBeNull();
  });

  it.each(["0", "true", "yes", "on", ""])(
    "returns null when auto_accept=%s (not '1')",
    (val) => {
      const params = new URLSearchParams();
      params.set("auto_accept", val);
      params.set("call_id", VALID);
      expect(parseAutoAcceptIntent(params)).toBeNull();
    },
  );

  it("returns null when call_id is missing", () => {
    const params = new URLSearchParams("auto_accept=1");
    expect(parseAutoAcceptIntent(params)).toBeNull();
  });

  it.each([
    "not-a-uuid",
    "abc",
    "<script>",
    "../../something",
    "00000000-0000-0000-0000-000000000000", // null UUID — wrong version digit
  ])("returns null when call_id is malformed (%s)", (bad) => {
    const params = new URLSearchParams();
    params.set("auto_accept", "1");
    params.set("call_id", bad);
    expect(parseAutoAcceptIntent(params)).toBeNull();
  });

  it("does not mutate the input params", () => {
    const params = new URLSearchParams(
      `auto_accept=1&call_id=${VALID}&ref=u1`,
    );
    parseAutoAcceptIntent(params);
    expect(params.get("auto_accept")).toBe("1");
    expect(params.get("call_id")).toBe(VALID);
    expect(params.get("ref")).toBe("u1");
  });

  it("composes with stripCallDeepLinkParams to drop a malformed deep link cleanly", () => {
    const params = new URLSearchParams(
      "auto_accept=1&call_id=not-a-uuid&utm_source=push&ref=u1",
    );

    expect(parseAutoAcceptIntent(params)).toBeNull();

    const stripped = stripCallDeepLinkParams(params);
    expect(stripped.has("auto_accept")).toBe(false);
    expect(stripped.has("call_id")).toBe(false);
    expect(stripped.get("utm_source")).toBe("push");
    expect(stripped.get("ref")).toBe("u1");
  });
});
