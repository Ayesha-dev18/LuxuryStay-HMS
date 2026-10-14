// Drives headless Edge through real user actions (typing, clicking) against
// the running app, takes screenshots, checks expectations, and can record the
// session as an MJPEG .avi. No dependencies.
//   node walk.js <planFile.js> <shotDir> [recording.avi]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const [planFile, shotDir, recording] = process.argv.slice(2);
const plan = require(path.resolve(planFile));
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9334;
const BASE = process.env.WALK_BASE || "http://localhost:5199";
const FPS = 5;

fs.mkdirSync(shotDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helpers that run inside the page.
const PAGE_HELPERS = `
window.__w = {
  visible: (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed",
  scope: () => { const o = document.querySelectorAll(".app-overlay"); return o.length ? o[o.length - 1] : document; },
  click(text, nth) {
    const all = [...this.scope().querySelectorAll("button, a, [role=tab], [role=radio]")].filter((el) => this.visible(el) && !el.disabled);
    const exact = all.filter((el) => el.innerText.trim() === text);
    const list = exact.length ? exact : all.filter((el) => el.innerText.trim().startsWith(text));
    const el = list[nth === undefined ? list.length - 1 : nth];
    if (!el) return "NOT FOUND: " + text;
    el.scrollIntoView({ block: "center" });
    el.click();
    return "";
  },
  field(label) {
    const labels = [...this.scope().querySelectorAll("label")].filter((el) => this.visible(el) && el.innerText.replace("*", "").trim() === label);
    const found = labels[labels.length - 1];
    return found ? document.getElementById(found.htmlFor) : null;
  },
  fill(label, value) {
    const el = this.field(label);
    if (!el) return "FIELD NOT FOUND: " + label;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
    el.scrollIntoView({ block: "center" });
    el.focus();
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return "";
  },
};`;

const avi = (frames, width, height, file) => {
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const chunk = (id, data) => Buffer.concat([Buffer.from(id), u32(data.length), data, Buffer.alloc(data.length % 2)]);
  const list = (id, parts) => { const body = Buffer.concat([Buffer.from(id), ...parts]); return Buffer.concat([Buffer.from("LIST"), u32(body.length), body]); };

  const biggest = Math.max(...frames.map((frame) => (frame ? frame.length : 0)));
  const avih = Buffer.concat([u32(1e6 / FPS), u32(biggest * FPS), u32(0), u32(0x10), u32(frames.length), u32(0), u32(1), u32(biggest), u32(width), u32(height), Buffer.alloc(16)]);
  const strh = Buffer.concat([Buffer.from("vids"), Buffer.from("MJPG"), u32(0), u16(0), u16(0), u32(0), u32(1), u32(FPS), u32(0), u32(frames.length), u32(biggest), u32(0xffffffff), u32(0), u16(0), u16(0), u16(width), u16(height)]);
  const strf = Buffer.concat([u32(40), u32(width), u32(height), u16(1), u16(24), Buffer.from("MJPG"), u32(width * height * 3), u32(0), u32(0), u32(0), u32(0)]);
  const hdrl = list("hdrl", [chunk("avih", avih), list("strl", [chunk("strh", strh), chunk("strf", strf)])]);

  const movie = [];
  const index = [];
  let offset = 4;
  for (const frame of frames) {
    // A repeated frame is an empty chunk: players hold the previous picture.
    const data = frame || Buffer.alloc(0);
    index.push(Buffer.concat([Buffer.from("00dc"), u32(frame ? 0x10 : 0), u32(offset), u32(data.length)]));
    const piece = chunk("00dc", data);
    movie.push(piece);
    offset += piece.length;
  }

  const body = Buffer.concat([Buffer.from("AVI "), hdrl, list("movi", movie), chunk("idx1", Buffer.concat(index))]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from("RIFF"), u32(body.length), body]));
};

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(require("os").tmpdir(), "luxurystay-shots-" + Date.now())}`,
    "--no-first-run",
    "--hide-scrollbars", "--disable-features=Translate,msEdgeShoppingAssistant,OptimizationHints", "--disable-extensions", "--disable-gpu",
    ...(recording || process.env.WALK_MOTION === "1" ? [] : ["--force-prefers-reduced-motion"]),
    "about:blank",
  ]);

  let target;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((item) => item.type === "page");
    } catch {
      // Not up yet.
    }
  }
  if (!target) throw new Error("Edge did not start");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));

  let seq = 0;
  const pending = new Map();
  const problems = [];
  const captured = [];
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      seq += 1;
      const id = seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        problems.push("protocol timeout: " + method);
        resolve({ timedOut: true });
      }, 20000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    if (message.method === "Page.screencastFrame") {
      captured.push({ at: Date.now(), data: Buffer.from(message.params.data, "base64") });
      send("Page.screencastFrameAck", { sessionId: message.params.sessionId });
    }
    if (message.method === "Runtime.exceptionThrown") {
      problems.push(`EXCEPTION ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`.slice(0, 240));
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      problems.push(`console.error ${message.params.args.map((arg) => arg.value || arg.description || "").join(" ")}`.slice(0, 240));
    }
  });

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return result.result?.result?.value;
  };
  const helper = async (call) => {
    await evaluate(`window.__w || (${JSON.stringify(PAGE_HELPERS)}, eval(${JSON.stringify(PAGE_HELPERS)}))`);
    return evaluate(`window.__w.${call}`);
  };

  await send("Page.enable");
  await send("Runtime.enable");

  let width = 1280;
  let height = 720;
  const resize = () => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await resize();

  if (recording) {
    await send("Page.startScreencast", { format: "jpeg", quality: 58, maxWidth: width, maxHeight: height, everyNthFrame: 2 });
  }

  const pause = recording ? 1 : 0.45;
  const log = [];
  const note = (ok, text) => log.push(`${ok ? "PASS" : "FAIL"}  ${text}`);

  for (const step of plan) {
    const [kind, a, b] = step;
    if (process.env.WALK_TRACE) console.error("step", kind, typeof a === "string" ? a.slice(0, 40) : a);

    if (kind === "size") {
      [width, height] = [a, b];
      await resize();
    } else if (kind === "goto") {
      await send("Page.navigate", { url: `${BASE}${a}` });
      await sleep(2400 * (recording ? 1 : 0.8));
    } else if (kind === "signout") {
      await evaluate("localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); localStorage.setItem('ls-theme', 'light');");
    } else if (kind === "login") {
      await send("Page.navigate", { url: `${BASE}/auth` });
      await sleep(1800);
      await evaluate("localStorage.removeItem('token'); localStorage.removeItem('user');");
      await send("Page.navigate", { url: `${BASE}/auth` });
      await sleep(1600);
      await helper(`fill("Email address", "${a}@demo.test")`);
      await sleep(400 * pause);
      await helper(`fill("Password", "Passw0rd!demo")`);
      await sleep(500 * pause);
      await helper(`click("Sign in")`);
      await sleep(2600);
      const where = await evaluate("location.pathname");
      note(where !== "/auth", `sign in as ${a} -> ${where}`);
    } else if (kind === "tokenLogin") {
      // Signs in through the API and stores the session, without the form.
      await send("Page.navigate", { url: `${BASE}/auth` });
      await sleep(1500);
      const ok = await evaluate(`fetch("http://localhost:5055/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "${a}@demo.test", password: "Passw0rd!demo" }) }).then((r) => r.json()).then((d) => { if (!d.token) return "failed"; localStorage.setItem("token", d.token); localStorage.setItem("user", JSON.stringify(d.user)); localStorage.setItem("ls-theme", "light"); return "ok"; })`);
      note(ok === "ok", `session for ${a}`);
    } else if (kind === "click") {
      const result = await helper(`click(${JSON.stringify(a)}${b === undefined ? "" : `, ${b}`})`);
      note(!result, `click "${a}"${result ? ` (${result})` : ""}`);
      await sleep(1500 * (recording ? 1 : 0.8));
    } else if (kind === "clickSel") {
      const result = await evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(a)})[${b || 0}]; if (!el) return "NOT FOUND"; el.scrollIntoView({ block: "center" }); el.click(); return ""; })()`);
      note(!result, `click ${a}${result ? ` (${result})` : ""}`);
      await sleep(1400 * (recording ? 1 : 0.8));
    } else if (kind === "fill") {
      const result = await helper(`fill(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
      if (result) note(false, result);
      await sleep(380 * pause);
    } else if (kind === "uploadAll") {
      // Finds every file input once, then gives each of them the file.
      const doc = await send("DOM.getDocument", { depth: 0 });
      const found = await send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
      const ids = found.result?.nodeIds || [];
      for (const nodeId of ids) await send("DOM.setFileInputFiles", { files: [a], nodeId });
      note(ids.length > 0, `chose a file in ${ids.length} input(s)`);
      await sleep(600);
    } else if (kind === "upload") {
      // Chooses a real file in the nth file input, as a person would.
      const doc = await send("DOM.getDocument", { depth: 0 });
      const found = await send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
      const nodeId = found.result?.nodeIds?.[a];
      if (!nodeId) note(false, `file input ${a} not found`);
      else {
        const done = await send("DOM.setFileInputFiles", { files: [b], nodeId });
        if (done.timedOut || done.error) note(false, `upload ${a}: ${done.error?.message || "timed out"}`);
      }
      await sleep(500);
    } else if (kind === "key") {
      // Presses a key (for example Tab) the given number of times.
      for (let i = 0; i < (b || 1); i += 1) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: a, code: a, windowsVirtualKeyCode: a === "Tab" ? 9 : 13 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: a, code: a, windowsVirtualKeyCode: a === "Tab" ? 9 : 13 });
        await sleep(120);
      }
    } else if (kind === "eval") {
      // Evaluates an expression in the page; passes when the result contains the expected text.
      const value = String(await evaluate(a));
      note(value.includes(b), `${a.slice(0, 60)} -> ${value.slice(0, 80)}`);
    } else if (kind === "hover") {
      // Moves the real mouse pointer over an element (fx, fy offsets from its centre, -0.5..0.5).
      const [, selector, index = 0, fx = 0, fy = 0] = step;
      const box = await evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return null; const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { el.scrollIntoView({ block: "center" }); } const q = el.getBoundingClientRect(); return JSON.stringify({ x: q.left + q.width * (0.5 + ${fx}), y: q.top + q.height * (0.5 + ${fy}) }); })()`);
      if (!box) note(false, `hover target not found: ${selector}`);
      else {
        const { x, y } = JSON.parse(box);
        for (let i = 1; i <= 6; i += 1) {
          await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x - (6 - i) * 8, y: y - (6 - i) * 4 });
          await sleep(40);
        }
        await sleep(900);
      }
    } else if (kind === "pointerClick") {
      // A real mouse click at the centre of an element (no element.click()).
      const box = await evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(a)})[${b || 0}]; if (!el) return null; const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`);
      if (!box) note(false, `click target not found: ${a}`);
      else {
        const { x, y } = JSON.parse(box);
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
        await sleep(1800);
      }
    } else if (kind === "mouseAway") {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
      await sleep(900);
    } else if (kind === "measure") {
      // Records a value from the page, to compare before and after an interaction.
      const value = String(await evaluate(a));
      log.push(`VALUE ${b}: ${value.slice(0, 160)}`);
    } else if (kind === "wait") {
      await sleep(a);
    } else if (kind === "scroll") {
      await evaluate(`(async () => { const el = document.scrollingElement; const end = ${a === "bottom" ? "el.scrollHeight" : a}; const step = (end - el.scrollTop) / 40; for (let i = 0; i < 40; i++) { el.scrollTop += step; await new Promise(r => setTimeout(r, ${recording ? 55 : 15})); } })()`);
      await sleep(500 * pause);
    } else if (kind === "expect") {
      const text = await evaluate("document.body.innerText");
      note(String(text).includes(a), `page shows "${a}"`);
    } else if (kind === "expectIn") {
      // Checked inside the topmost dialog or drawer only.
      const text = await helper("scope().innerText");
      note(String(text).includes(a), `dialog shows "${a}"`);
    } else if (kind === "expectNot") {
      const text = await evaluate("document.body.innerText");
      note(!String(text).includes(a), `page does not show "${a}"`);
    } else if (kind === "shot") {
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(b) });
      fs.writeFileSync(path.join(shotDir, `${a}.png`), Buffer.from(shot.result.data, "base64"));
      const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
      if (overflow > 0) note(false, `${a}: horizontal overflow ${overflow}px`);
    }
  }

  if (recording) {
    await send("Page.stopScreencast");
    await sleep(300);
    const start = captured[0].at;
    const end = captured[captured.length - 1].at + 1200;
    const frames = [];
    let cursor = -1;
    for (let t = start; t <= end; t += 1000 / FPS) {
      let next = cursor;
      while (next + 1 < captured.length && captured[next + 1].at <= t) next += 1;
      frames.push(next === cursor && next >= 0 ? null : captured[Math.max(next, 0)].data);
      cursor = Math.max(next, 0);
    }
    avi(frames, width, height, recording);
    console.log(`recorded ${frames.length} frames (${Math.round(frames.length / FPS)}s), ${captured.length} pictures, ${(fs.statSync(recording).size / 1048576).toFixed(1)} MB`);
  }

  console.log(log.join("\n"));
  console.log(`steps: ${log.length}, failed: ${log.filter((line) => line.startsWith("FAIL")).length}`);
  console.log("browser errors:", problems.length ? [...new Set(problems)].join(" | ") : "none");
  ws.close();
  edge.kill();
  process.exit(0);
})().catch((error) => {
  console.error("FAILED", error);
  process.exit(1);
});
