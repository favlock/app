import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function bridge() {
  let receive;
  const window = { location: { origin: "https://vault.favlock.example", pathname: "/extension/firefox/pair" }, addEventListener: (_type, fn) => { receive = fn; }, postMessage: vi.fn() };
  window.top = window;
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  runInNewContext(readFileSync(new URL("./pairing-bridge.js", import.meta.url), "utf8"), { window, browser: { runtime: { id: "firefox@favlock.app", sendMessage } } });
  const request = { type: "favlock.firefox.pair-request", extensionId: "firefox@favlock.app", requestId: "request", pairingAttempt: "p".repeat(43), userId: "11111111-1111-4111-8111-111111111111", rawKey: "A".repeat(32), sessionTokenHash: "test-token" };
  return { window, receive, sendMessage, request };
}

describe("Firefox page bridge", () => {
  it("relays only the pairing fields and returns the correlated acknowledgment", async () => {
    const { window, receive, sendMessage, request } = bridge();
    receive({ source: window, origin: window.location.origin, data: { ...request, unrelated: "ignored" } });
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith({ type: "favlock.firefox.pair-key", pairingAttempt: request.pairingAttempt, userId: request.userId, rawKey: request.rawKey, sessionTokenHash: request.sessionTokenHash });
    expect(window.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "favlock.firefox.pair-response", requestId: "request", ok: true }), window.location.origin);
  });
  it.each(["origin", "source", "frame", "route", "id", "size", "attempt", "chrome"])("rejects invalid %s", (kind) => {
    const { window, receive, sendMessage, request } = bridge();
    const event = { source: window, origin: window.location.origin, data: request };
    if (kind === "origin") event.origin = "https://attacker.example";
    if (kind === "source") event.source = {};
    if (kind === "frame") window.top = {};
    if (kind === "route") window.location.pathname = "/settings";
    if (kind === "id") request.extensionId = "other@example.com";
    if (kind === "size") request.rawKey = "a".repeat(129);
    if (kind === "attempt") request.pairingAttempt = "x";
    if (kind === "chrome") request.type = "favlock.extension.pair-request";
    receive(event);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});


describe("Firefox installation detection", () => {
  it("acknowledges installation on dashboard routes without forwarding account data", () => {
    const { window, receive, sendMessage } = bridge();
    window.location.pathname = "/";
    receive({ source: window, origin: window.location.origin, data: { type: "favlock.firefox.installation-request", requestId: "install-check" } });
    expect(window.postMessage).toHaveBeenCalledWith({ type: "favlock.firefox.installation-response", requestId: "install-check", extensionId: "firefox@favlock.app" }, window.location.origin);
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it.each(["origin", "source", "frame", "size", "empty"])("ignores invalid installation request %s", (kind) => {
    const { window, receive } = bridge();
    const event = { source: window, origin: window.location.origin, data: { type: "favlock.firefox.installation-request", requestId: "install-check" } };
    if (kind === "origin") event.origin = "https://attacker.example";
    if (kind === "source") event.source = {};
    if (kind === "frame") window.top = {};
    if (kind === "size") event.data.requestId = "x".repeat(65);
    if (kind === "empty") event.data.requestId = "";
    receive(event);
    expect(window.postMessage).not.toHaveBeenCalled();
  });
});
