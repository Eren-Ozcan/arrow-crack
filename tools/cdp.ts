/**
 * A headless Chrome driven over the DevTools protocol, shared by the browser
 * checks in `tools/`: `shoot.ts` (ART.md 10 stills), `smoke.ts` (the end-to-end
 * flows), `layout-check.ts` and `perf-check.ts`.
 *
 * It is the protocol directly rather than a test-runner dependency: the checks
 * need a page, a pointer and a screenshot, and Chrome answers all three itself.
 * Every input goes through `Input.dispatchMouseEvent`, so the page sees real
 * pointer events and the gesture arbitration in `src/input` is exercised the
 * way a thumb exercises it.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** `STORAGE_KEY` in `src/state/save.ts`; duplicated so the tools stay CLIs. */
export const SAVE_KEY = "arrowcrack.save";

export const DEFAULT_URL = "http://localhost:5173";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/** Whatever a DevTools command answers with; each caller reads its own keys. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CdpResult = Record<string, any>;

type Listener = (params: CdpResult) => void;

/** A CDP session over one WebSocket endpoint: the browser, or one page. */
export class Session {
  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (value: CdpResult) => void; reject: (error: Error) => void }
  >();
  #listeners = new Map<string, Listener[]>();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) {
        for (const listener of this.#listeners.get(message.method) ?? []) {
          listener(message.params);
        }
        return;
      }
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async open(endpoint: string): Promise<Session> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("cdp connect failed")), {
        once: true,
      });
    });
    return new Session(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<CdpResult> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, listener: Listener): void {
    this.#listeners.set(method, [...(this.#listeners.get(method) ?? []), listener]);
  }

  close(): void {
    this.#socket.close();
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

export function fail(tool: string, message: string): never {
  console.error(`${tool}: ${message}`);
  process.exit(1);
}

function chromePath(): string {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found)
    throw new Error(
      "no Chrome found — add its path to CHROME_CANDIDATES in tools/cdp.ts",
    );
  return found;
}

async function targetEndpoint(port: number): Promise<string> {
  // Chrome needs a moment to write its listening socket.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const body = (await response.json()) as { webSocketDebuggerUrl: string };
      return body.webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Chrome did not open a debugging port");
}

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

/** A page, plus the handful of things every check does with one. */
export class Page {
  readonly cdp: Session;
  /** Uncaught exceptions and `console.error` lines, in arrival order. */
  readonly errors: string[] = [];

  constructor(cdp: Session) {
    this.cdp = cdp;
    cdp.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails;
      this.errors.push(`exception: ${details?.exception?.description ?? details?.text}`);
    });
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type !== "error") return;
      const text = (params.args as { value?: unknown; description?: string }[])
        .map((arg) => arg.description ?? String(arg.value))
        .join(" ");
      this.errors.push(`console.error: ${text}`);
    });
  }

  async setViewport(viewport: Viewport): Promise<void> {
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor ?? 2,
      mobile: true,
    });
  }

  /** Navigates and waits for the load event. */
  async goto(url: string): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      const done = (): void => resolve();
      this.cdp.on("Page.loadEventFired", done);
    });
    await this.cdp.send("Page.navigate", { url });
    await Promise.race([loaded, sleep(10_000)]);
  }

  /** Evaluates an expression in the page and returns its JSON value. */
  async eval<T = unknown>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(
        `page threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
      );
    }
    return result?.value as T;
  }

  /** Polls an expression until it is truthy; throws with `what` on timeout. */
  async waitFor(expression: string, what: string, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.eval<boolean>(`Boolean(${expression})`)) return;
      await sleep(50);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  /** A press and release at one point, as a tap. */
  async tap(x: number, y: number): Promise<void> {
    const base = { x, y, button: "left", clickCount: 1, pointerType: "mouse" };
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await sleep(40);
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
  }

  /** A press held for `ms` without moving, as a long press. */
  async hold(x: number, y: number, ms: number): Promise<void> {
    const base = { x, y, button: "left", clickCount: 1, pointerType: "mouse" };
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await sleep(ms);
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
  }

  /** A press, a drag through `steps` moves, and a release. */
  async drag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 8,
  ): Promise<void> {
    const press = { button: "left", clickCount: 1, pointerType: "mouse" };
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...from,
      ...press,
    });
    for (let step = 1; step <= steps; step += 1) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      await this.cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "left",
        buttons: 1,
        pointerType: "mouse",
      });
      await sleep(16);
    }
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...to,
      ...press,
    });
  }

  /**
   * Taps the visible button whose text (or aria-label) is `label`, at its
   * centre. Throws when there is none, or when something else sits on top
   * of it — a button a thumb cannot reach is a failure, not a skip. A button
   * still animating in, or behind the win panel's tap guard, is waited for.
   */
  async tapButton(label: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const point = await this.#buttonPoint(label);
      if (typeof point !== "string") {
        await this.tap(point.x, point.y);
        return;
      }
      if (Date.now() > deadline) throw new Error(`button "${label}": ${point}`);
      await sleep(80);
    }
  }

  #buttonPoint(label: string): Promise<{ x: number; y: number } | string> {
    return this.eval<{ x: number; y: number } | string>(`(() => {
      const label = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")].filter((node) => {
        const text = (node.textContent ?? "").replace(/\\s+/g, " ").trim();
        return text === label || node.getAttribute("aria-label") === label;
      });
      const visible = buttons.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !node.closest("[hidden]");
      });
      if (visible.length === 0) return "no visible button";
      // Two screens can carry the same label (the HUD's Restart under the fail
      // panel's), so the one a thumb would hit is the one on top.
      let reason = "";
      for (const node of visible) {
        // A thumb scrolls a button into reach before it taps it.
        node.scrollIntoView({ block: "nearest" });
        const rect = node.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const top = document.elementFromPoint(x, y);
        if (!top || !(top === node || node.contains(top))) {
          reason = "covered by " + (top ? top.className || top.tagName : "nothing");
          continue;
        }
        if (node.disabled) return "disabled";
        if (node.closest(".is-locked, .is-pending")) return "not yet tappable";
        return { x, y };
      }
      return reason;
    })()`);
  }

  async screenshot(): Promise<Buffer> {
    const { data } = await this.cdp.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data as string, "base64");
  }
}

export interface Browser {
  page: Page;
  /** A second page in the same profile, so it shares the save. */
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

/**
 * A fresh headless Chrome with its own throwaway profile — so every run starts
 * with no save — and one page at the given viewport.
 */
export async function launch(viewport: Viewport): Promise<Browser> {
  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), "arrow-cdp-"));
  const chrome: ChildProcess = spawn(
    chromePath(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const browser = await Session.open(await targetEndpoint(port));
  const sessions: Session[] = [browser];

  const newPage = async (): Promise<Page> => {
    const { targetId } = await browser.send("Target.createTarget", {
      url: "about:blank",
    });
    const cdp = await Session.open(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
    sessions.push(cdp);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const page = new Page(cdp);
    await page.setViewport(viewport);
    return page;
  };

  return {
    page: await newPage(),
    newPage,
    close: async () => {
      for (const session of sessions) session.close();
      chrome.kill();
      // Chrome holds its profile open for a moment after the kill.
      await sleep(300);
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/** Reads a flag of the form `--name value` or `--name=value`. */
export function flag(argv: string[], name: string): string | undefined {
  const index = argv.findIndex(
    (arg) => arg === `--${name}` || arg.startsWith(`--${name}=`),
  );
  if (index === -1) return undefined;
  const arg = argv[index]!;
  return arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[index + 1];
}

/** Fails fast with a readable line when the dev server is not up. */
export async function requireDevServer(tool: string, url: string): Promise<void> {
  try {
    await fetch(url);
  } catch {
    fail(tool, `no dev server at ${url} — start it with \`npm run dev\``);
  }
}
