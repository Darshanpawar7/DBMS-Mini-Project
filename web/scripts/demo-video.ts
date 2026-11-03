/**
 * Records the ScholarMesh demo video: a scripted walkthrough of the real app with
 * captions, a visible cursor, highlights and title/chapter cards, encoded as a
 * 1080p H.264 MP4 with chapter markers.
 *
 *   E2E_PORT=3100 FFMPEG_PATH=/path/to/ffmpeg npx tsx scripts/demo-video.ts
 *
 * Needs the app running on E2E_PORT (a production build looks best) and an ffmpeg
 * with libx264 (FFMPEG_PATH, or `ffmpeg` on PATH). Anything the demo creates
 * (a note, a bookmark, a group membership) is removed again at the end.
 * Output: docs/demo/ScholarMesh_Demo.mp4 and docs/demo/demo-script.md
 *
 * Recommended: record against a separate copy of the database, so the video shows the
 * clean demo data and your own data is neither shown nor changed (DEMO_URL = your
 * DATABASE_URL with the database name changed to scholarmesh_demo):
 *   docker exec scholarmesh-db psql -U postgres -c "CREATE DATABASE scholarmesh_demo"
 *   POSTGRES_DB=scholarmesh_demo npm run db:setup
 *   DATABASE_URL=$DEMO_URL npm run db:embed
 *   npm run build && DATABASE_URL=$DEMO_URL npx next start --port 3100
 *   DATABASE_URL=$DEMO_URL E2E_PORT=3100 FFMPEG_PATH=... npx tsx scripts/demo-video.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type CDPSession, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

const BASE = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "docs", "demo");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const ZOOM = 1.2; // the app is rendered 20% larger so text reads well in a 1080p video
const STUDENT = { email: "darshan.pawar@scholarmesh.test", password: "Scholar@123" };
const ADMIN = { email: "admin@scholarmesh.test", password: "Admin@12345" };
const DEMO_NOTE_TITLE = "Write-Ahead Logging and Crash Recovery";
let joinedGroup: string | null = null; // set during the walkthrough, undone afterwards

// ---------------------------------------------------------------- recording

interface Frame {
  file: string;
  ts: number;
}

class Recorder {
  private frames: Frame[] = [];
  private writes: Promise<void>[] = [];
  private cdp?: CDPSession;
  private stoppedAt = 0;
  readonly dir = mkdtempSync(path.join(os.tmpdir(), "scholarmesh-demo-"));
  readonly marks: { kind: "chapter" | "caption"; at: number; title: string; text?: string }[] = [];

  async start(page: Page): Promise<void> {
    this.cdp = await page.context().newCDPSession(page);
    this.cdp.on("Page.screencastFrame", (f) => {
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(6, "0")}.jpg`);
      this.frames.push({ file, ts: f.metadata.timestamp ?? Date.now() / 1000 });
      writeFileSync(file, Buffer.from(f.data, "base64"));
      this.writes.push(this.cdp!.send("Page.screencastFrameAck", { sessionId: f.sessionId }).then(() => undefined, () => undefined));
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }

  /** Seconds since the first frame (used for chapters and the narration script). */
  now(): number {
    const first = this.frames[0]?.ts ?? Date.now() / 1000;
    return Math.max(0, Date.now() / 1000 - first);
  }

  mark(kind: "chapter" | "caption", title: string, text?: string): void {
    this.marks.push({ kind, at: this.now(), title, text });
  }

  async stop(): Promise<void> {
    this.stoppedAt = Date.now() / 1000;
    await this.cdp?.send("Page.stopScreencast").catch(() => undefined);
    await Promise.all(this.writes);
  }

  get duration(): number {
    return this.stoppedAt - (this.frames[0]?.ts ?? this.stoppedAt);
  }

  /** ffmpeg concat list: each frame is held until the next one arrived. */
  writeConcatList(): string {
    const lines: string[] = [];
    this.frames.forEach((f, i) => {
      const next = this.frames[i + 1]?.ts ?? this.stoppedAt;
      lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`);
    });
    const last = this.frames[this.frames.length - 1];
    if (last) lines.push(`file '${last.file.replace(/\\/g, "/")}'`);
    const list = path.join(this.dir, "frames.txt");
    writeFileSync(list, lines.join("\n"));
    return list;
  }

  get frameCount(): number {
    return this.frames.length;
  }
}

// ---------------------------------------------------------------- in-page overlay

/** Styles for the in-page overlay. The app itself is zoomed; the overlay layer is not. */
const OVERLAY_CSS = `
    body > *:not(#demo-layer) { zoom: ${ZOOM}; }
    #demo-layer, #demo-layer * { box-sizing: border-box; }
    #demo-cursor { position: fixed; left: 0; top: 0; width: 34px; height: 34px; z-index: 2147483647; pointer-events: none;
      transform: translate(960px, 600px); filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); transition: opacity .3s; }
    #demo-cursor.hidden { opacity: 0; }
    .demo-ripple { position: fixed; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; pointer-events: none;
      border: 3px solid rgba(79,70,229,.95); background: rgba(99,102,241,.25); z-index: 2147483646; animation: demoRipple .6s ease-out forwards; }
    @keyframes demoRipple { from { transform: scale(.25); opacity: 1; } to { transform: scale(1.55); opacity: 0; } }
    #demo-spot { position: fixed; left: 0; top: 0; width: 0; height: 0; border: 3px solid #f59e0b; border-radius: 16px; pointer-events: none;
      box-shadow: 0 0 0 4000px rgba(15,23,42,.42), 0 0 28px 4px rgba(245,158,11,.55); opacity: 0; z-index: 2147483640;
      transition: opacity .4s ease, left .5s ease, top .5s ease, width .5s ease, height .5s ease; }
    #demo-spot.on { opacity: 1; }
    #demo-caption { position: fixed; left: 50%; bottom: 46px; max-width: 1480px; transform: translate(-50%, 24px); opacity: 0;
      padding: 18px 34px 22px; border-radius: 20px; background: rgba(15,23,42,.9); color: #fff; z-index: 2147483645; pointer-events: none;
      font: 500 28px/1.42 "Segoe UI", Inter, system-ui, sans-serif; box-shadow: 0 24px 60px rgba(0,0,0,.28); text-align: left;
      transition: opacity .35s ease, transform .35s ease; }
    #demo-caption.on { opacity: 1; transform: translate(-50%, 0); }
    #demo-caption .k { display: block; margin-bottom: 4px; font-size: 16px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #a5b4fc; }
    #demo-caption b { color: #fde68a; font-weight: 600; }
    #demo-card { position: fixed; inset: 0; z-index: 2147483644; display: flex; align-items: center; justify-content: center; pointer-events: none;
      background: radial-gradient(circle at 25% 15%, #4f46e5 0%, #312e81 45%, #1e1b4b 100%); color: #fff; opacity: 0; transition: opacity .6s ease;
      font-family: "Segoe UI", Inter, system-ui, sans-serif; }
    #demo-card.on { opacity: 1; }
    #demo-card .wrap { width: 1500px; }
    #demo-card .kicker { font-size: 22px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #a5b4fc; }
    #demo-card .title { font-family: var(--font-fraunces), Georgia, serif; font-size: 120px; font-weight: 600; line-height: 1.02; margin: 10px 0 16px; }
    #demo-card .title.md { font-size: 82px; }
    #demo-card .sub { font-size: 34px; color: #e0e7ff; line-height: 1.4; max-width: 1300px; }
    #demo-card .num { display: inline-flex; width: 74px; height: 74px; border-radius: 22px; background: #fde68a; color: #1e1b4b; font-size: 40px;
      font-weight: 800; align-items: center; justify-content: center; margin-right: 22px; vertical-align: middle; }
    #demo-card .row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 34px; }
    #demo-card .row span { padding: 10px 20px; border-radius: 999px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); font-size: 24px; }
    #demo-card .team { margin-top: 40px; font-size: 26px; color: #c7d2fe; }
    #demo-card .team b { color: #fff; }
    #demo-card .panel { background: #fff; border-radius: 22px; padding: 18px; margin-top: 18px; box-shadow: 0 30px 80px rgba(0,0,0,.35); }
    #demo-card .panel svg { display: block; width: 100%; height: auto; max-height: 690px; }
    #demo-card .wrap:has(.diagram) { width: 1840px; }
    #demo-card .diagram { text-align: center; }
    #demo-card .diagram .title { font-size: 46px; margin: 4px 0 12px; }
    #demo-card .diagram .panel { display: inline-block; padding: 12px; margin-top: 0; }
    #demo-card .diagram .panel svg { width: auto; max-width: 1800px; height: 845px; max-height: none; }
    #demo-card .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-top: 36px; }
    #demo-card .stats div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); border-radius: 18px; padding: 18px; text-align: center; }
    #demo-card .stats b { display: block; font-family: var(--font-fraunces), Georgia, serif; font-size: 52px; color: #fde68a; }
    #demo-card .stats span { font-size: 20px; color: #e0e7ff; }
    #demo-card .problem { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 40px; }
    #demo-card .problem div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); border-radius: 20px; padding: 26px; font-size: 27px; line-height: 1.4; }
    #demo-card .problem b { display: block; color: #fde68a; font-size: 30px; margin-bottom: 8px; }
  `;

const CURSOR_SVG =
  '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 22 L14.6 20.6 L11.7 14.2 L18 14.2 Z" fill="#0f172a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

/**
 * Runs inside every page: cursor, click ripples, captions, spotlight and full-screen cards.
 * Kept as plain JavaScript text on purpose -- functions compiled by tsx carry helper
 * calls (keepNames) that do not exist inside the browser.
 */
const OVERLAY_JS = `(() => {
  if (window.__demo) return;
  var css = ${JSON.stringify(OVERLAY_CSS)};
  var cursorSvg = ${JSON.stringify(CURSOR_SVG)};
  var cx = 960, cy = 600;
  var layer = function () {
    var el = document.getElementById("demo-layer");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-layer";
      el.innerHTML = "<style>" + css + "</style><div id='demo-spot'></div><div id='demo-card'></div>" +
        "<div id='demo-caption'><span class='k'></span><span class='t'></span></div><div id='demo-cursor'>" + cursorSvg + "</div>";
      document.body.appendChild(el);
    }
    return el;
  };
  var byId = function (id) { layer(); return document.getElementById(id); };
  var api = {
    ensure: function () { layer(); },
    cursor: function (x, y) { cx = x; cy = y; byId("demo-cursor").style.transform = "translate(" + (x - 4) + "px, " + (y - 3) + "px)"; },
    cursorVisible: function (on) { byId("demo-cursor").classList.toggle("hidden", !on); },
    caption: function (kicker, html) {
      var c = byId("demo-caption");
      c.querySelector(".k").textContent = kicker;
      c.querySelector(".t").innerHTML = html;
      c.classList.add("on");
    },
    hideCaption: function () { byId("demo-caption").classList.remove("on"); },
    spot: function (x, y, w, h) {
      var s = byId("demo-spot");
      s.style.left = x + "px"; s.style.top = y + "px"; s.style.width = w + "px"; s.style.height = h + "px";
      s.classList.add("on");
    },
    clearSpot: function () { byId("demo-spot").classList.remove("on"); },
    card: function (html) { var c = byId("demo-card"); c.innerHTML = "<div class='wrap'>" + html + "</div>"; c.classList.add("on"); },
    hideCard: function () { byId("demo-card").classList.remove("on"); }
  };
  window.__demo = api;
  document.addEventListener("DOMContentLoaded", function () { layer(); api.cursor(cx, cy); });
  window.addEventListener("mousemove", function (e) { if (document.body) api.cursor(e.clientX, e.clientY); }, true);
  window.addEventListener("mousedown", function (e) {
    if (!document.body) return;
    var r = document.createElement("div");
    r.className = "demo-ripple";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    layer().appendChild(r);
    setTimeout(function () { r.remove(); }, 700);
  }, true);
})();`;

// ---------------------------------------------------------------- choreography helpers

class Director {
  private x = 960;
  private y = 600;
  private captionUntil = 0; // the current caption stays up at least until this time (epoch ms)
  constructor(
    private readonly page: Page,
    private readonly rec: Recorder,
  ) {}

  async beat(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async demo(fn: string, ...args: unknown[]): Promise<void> {
    await this.page.evaluate(([name, params]) => {
      const d = (window as unknown as { __demo: Record<string, (...a: unknown[]) => void> }).__demo;
      d.ensure();
      d[name as string](...(params as unknown[]));
    }, [fn, args] as const);
  }

  /** Re-attach the overlay after a full page load and put the cursor back where it was. */
  async settle(): Promise<void> {
    await this.page.waitForLoadState("load");
    await this.demo("cursor", this.x, this.y);
  }

  async glide(x: number, y: number, ms = 700): Promise<void> {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = this.x;
    const sy = this.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out cubic
      await this.page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await this.page.waitForTimeout(12);
    }
    this.x = x;
    this.y = y;
  }

  private async box(target: Locator) {
    await target.waitFor({ state: "visible", timeout: 20_000 });
    // scroll only when the element is not comfortably on screen (keeps clear of the caption)
    const offscreen = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top < 90 || r.bottom > window.innerHeight - 190;
    });
    if (offscreen) {
      await target.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
      await this.page.waitForTimeout(750);
    }
    const b = await target.boundingBox();
    if (!b) throw new Error("element has no box");
    return b;
  }

  async point(target: Locator, ms = 700): Promise<void> {
    const b = await this.box(target);
    await this.glide(b.x + b.width / 2, b.y + b.height / 2, ms);
  }

  async click(target: Locator, pause = 350): Promise<void> {
    await this.point(target);
    await this.beat(180);
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.beat(pause);
  }

  async type(target: Locator, text: string, delay = 55): Promise<void> {
    await this.click(target, 150);
    await this.page.keyboard.type(text, { delay });
  }

  async select(target: Locator, value: { label?: string; value?: string }): Promise<void> {
    await this.point(target);
    await this.beat(250);
    await target.selectOption(value);
    await this.beat(350);
  }

  async spot(target: Locator, ms: number, pad = 10): Promise<void> {
    const b = await this.box(target);
    await this.demo("spot", b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    await this.beat(ms);
    await this.demo("clearSpot");
    await this.beat(250);
  }

  /** Never replace or hide a caption before it could be read. */
  private async letCaptionBeRead(): Promise<void> {
    const wait = this.captionUntil - Date.now();
    if (wait > 0) await this.page.waitForTimeout(wait);
  }

  async caption(kicker: string, html: string, readMs = 0): Promise<void> {
    await this.letCaptionBeRead();
    await this.demo("caption", kicker, html);
    const text = html.replace(/<[^>]+>/g, "");
    this.rec.mark("caption", kicker, text);
    const words = text.split(/\s+/).filter(Boolean).length;
    this.captionUntil = Date.now() + Math.min(7500, Math.max(3800, 1400 + words * 260));
    if (readMs) await this.beat(readMs);
  }

  async hideCaption(): Promise<void> {
    await this.letCaptionBeRead();
    await this.demo("hideCaption");
    await this.beat(250);
  }

  async card(html: string, ms: number, chapter?: string): Promise<void> {
    await this.letCaptionBeRead();
    if (chapter) this.rec.mark("chapter", chapter);
    await this.demo("cursorVisible", false);
    await this.demo("hideCaption");
    await this.demo("card", html);
    await this.beat(ms);
    await this.demo("hideCard");
    await this.beat(650);
    await this.demo("cursorVisible", true);
  }

  async scrollBy(dy: number, ms = 900): Promise<void> {
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
    await this.beat(ms);
  }

  async scrollTop(ms = 700): Promise<void> {
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await this.beat(ms);
  }
}

// ---------------------------------------------------------------- data clean-up (before and after)

async function resetDemoData(): Promise<void> {
  process.loadEnvFile(path.join(ROOT, "web", ".env.local"));
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const me = (await db.query("SELECT student_id FROM STUDENT WHERE email = $1", [STUDENT.email])).rows[0]?.student_id;
    if (!me) throw new Error("Demo student not found -- run npm run db:setup first");
    const notes = await db.query<{ file_path: string }>(
      "DELETE FROM DOCUMENT WHERE title = $1 AND student_id = $2 RETURNING file_path",
      [DEMO_NOTE_TITLE, me],
    );
    for (const { file_path } of notes.rows) {
      try {
        unlinkSync(path.join(ROOT, "web", "storage", "uploads", path.basename(file_path)));
      } catch {
        // already gone
      }
    }
    await db.query(
      "DELETE FROM BOOKMARK WHERE student_id = $1 AND doc_id = (SELECT doc_id FROM DOCUMENT WHERE file_path = 'seed/rnn-lstm-vanishing-gradient.md')",
      [me],
    );
    const group = joinedGroup
      ? (await db.query("SELECT group_id FROM STUDY_GROUP WHERE group_name = $1", [joinedGroup])).rows[0]?.group_id
      : undefined;
    if (group) {
      const member = await db.query("SELECT 1 FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND student_id = $2", [group, me]);
      if (member.rowCount) await db.query("CALL sp_leave_group($1, $2)", [me, group]);
      joinedGroup = null;
    }
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------- cards

const DB_ICON = (n: string) => `<span class="num">${n}</span>`;

function introCard(): string {
  return `
    <div class="kicker">DBMS Mini Project · PES University</div>
    <div class="title">ScholarMesh</div>
    <div class="sub">Find study notes by <b style="color:#fde68a">meaning</b>, not by filename — and the classmates who are studying the same ideas.</div>
    <div class="row"><span>PostgreSQL 17</span><span>pgvector</span><span>Full-text search</span><span>Next.js 16</span><span>Docker</span><span>Local AI embeddings</span></div>
    <div class="team"><b>Darshan P Pawar</b> · PES2UG24CS143 &nbsp;&nbsp;|&nbsp;&nbsp; <b>Dhanush V Biradar</b> · PES2UG24CS155</div>`;
}

function problemCard(): string {
  return `
    <div class="kicker">The problem</div>
    <div class="title md">Notes are everywhere. Search is literal.</div>
    <div class="problem">
      <div><b>Scattered notes</b>Drive folders, WhatsApp groups and laptops — nothing is in one place.</div>
      <div><b>Exact-word search</b>“How do models decide which words matter?” finds nothing unless a note uses those exact words.</div>
      <div><b>Random study partners</b>Groups form by asking around, not by who studies the same topics.</div>
    </div>`;
}

function chapterCard(n: string, title: string, sub: string): string {
  return `<div class="kicker">Chapter ${n}</div><div class="title md">${DB_ICON(n)}${title}</div><div class="sub">${sub}</div>`;
}

function diagramCard(kicker: string, title: string, svg: string): string {
  return `<div class="diagram"><div class="kicker">${kicker}</div><div class="title">${title}</div><div class="panel">${svg}</div></div>`;
}

function outroCard(): string {
  return `
    <div class="kicker">ScholarMesh · summary</div>
    <div class="title md">One database. Two kinds of data. Rules it enforces itself.</div>
    <div class="stats">
      <div><b>12</b><span>tables</span></div><div><b>14</b><span>triggers</span></div><div><b>15</b><span>functions &amp; procedures</span></div>
      <div><b>34</b><span>indexes</span></div><div><b>5</b><span>views</span></div><div><b>101</b><span>automated tests</span></div>
    </div>
    <div class="team" style="margin-top:44px">github.com/Darshanpawar7/DBMS-Mini-Project<br/><b>Darshan P Pawar</b> · PES2UG24CS143 &nbsp;&nbsp;|&nbsp;&nbsp; <b>Dhanush V Biradar</b> · PES2UG24CS155</div>`;
}

// ---------------------------------------------------------------- the walkthrough

async function logIn(d: Director, page: Page, who: { email: string; password: string }): Promise<void> {
  await d.type(page.getByLabel("Email"), who.email, 38);
  await d.type(page.getByLabel("Password"), who.password, 60);
  await d.click(page.getByRole("button", { name: "Log in" }), 200);
}

async function walkthrough(page: Page, d: Director, rec: Recorder): Promise<void> {
  const nav = (name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });
  const results = page.locator("ol > li");
  const svg = (file: string) => readFileSync(path.join(ROOT, "docs", "report", file), "utf8").replace(/<\?xml[^>]*>/, "");

  // ---------------------------------------------------------- intro (the title card is already on screen)
  rec.mark("chapter", "Introduction");
  await d.beat(6000);
  await d.demo("hideCard");
  await d.beat(700);
  await d.card(problemCard(), 8000);
  await d.demo("cursorVisible", true);
  await d.caption("ScholarMesh", "A shared library for the semester: upload notes, <b>search them by meaning</b>, and get matched into <b>study groups</b>.", 5200);
  await d.click(page.getByRole("link", { name: "Log in" }).first(), 300);
  await page.waitForURL(/\/login/);
  await d.settle();
  await d.caption("Sign in", "Passwords are stored only as <b>bcrypt hashes</b> — a CHECK constraint in the database rejects anything else.");
  await logIn(d, page, STUDENT);
  await page.waitForURL(/\/dashboard/);
  await d.settle();
  await page.getByRole("heading", { name: /Good to see you/ }).waitFor();
  await d.hideCaption();

  // ---------------------------------------------------------- dashboard
  rec.mark("chapter", "Student dashboard");
  await d.caption("Dashboard", "Everything here is computed live by <b>SQL</b>: my numbers come from one stored function, <b>fn_student_stats</b>.", 1200);
  await d.spot(page.getByText("My notes", { exact: true }).locator("xpath=ancestor::div[contains(@class,'grid')][1]"), 3800);
  const groupsCard = page.locator("section", { has: page.getByRole("heading", { name: "Groups for you" }) });
  await d.caption("Groups for you", "Study groups are ranked by how close their members' interests are to mine — <b>vector similarity</b> computed inside PostgreSQL.", 600);
  await d.spot(groupsCard, 5200);
  await d.caption("Dashboard", "Plus new notes from my courses, trending topics (<b>GROUP BY … HAVING</b>) and my recent searches.", 600);
  await d.scrollBy(520, 1600);
  await d.beat(2600);
  await d.scrollTop();
  await d.hideCaption();

  // ---------------------------------------------------------- search
  await d.card(chapterCard("1", "Search by meaning", "Keyword search needs the exact words. Semantic search understands the question."), 4200, "1 · Search by meaning");
  await d.click(nav("Search"));
  await page.waitForURL(/\/search/);
  await d.settle();
  await d.caption("Keyword mode", "First, classic <b>keyword search</b>: PostgreSQL full-text search with a GIN index.");
  await d.click(page.getByRole("radio", { name: "Keyword" }), 250);
  await d.type(page.getByLabel("Search query"), "bcnf decomposition", 70);
  await page.keyboard.press("Enter");
  await page.getByText(/\d+ results? ·/).waitFor();
  await d.beat(500);
  await d.caption("Keyword mode", "<b>0 results</b> — no note contains the word “decomposition”, even though one explains exactly this.", 600);
  await d.spot(page.getByText("No notes matched").locator(".."), 4200);
  await d.caption("Semantic mode", "Now <b>semantic search</b>: the question becomes 384 numbers (an embedding), and pgvector finds the closest note passages.");
  await d.click(page.getByRole("radio", { name: "Semantic" }), 300);
  await page.getByText(/semantic mode/).waitFor();
  await d.beat(700);
  await d.spot(results.first(), 5200);
  await d.caption("Semantic mode", "Found the <b>Normalization</b> note by meaning — with an <b>HNSW index</b> and <b>cosine similarity</b>.", 3800);
  await d.caption("Hybrid mode", "<b>Hybrid</b> runs both searches and merges the rankings (Reciprocal Rank Fusion).");
  const box = page.getByLabel("Search query");
  await d.click(box, 150);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("how do models decide which words matter", { delay: 45 });
  await d.click(page.getByRole("radio", { name: "Hybrid" }), 300);
  await page.getByText(/hybrid mode/).waitFor();
  await d.beat(800);
  await d.spot(results.nth(0), 3000);
  await d.caption("Privacy", "Every search goes through one database function, <b>fn_visible_doc_ids</b> — private notes never leak into results.", 4200);

  // open a note
  await d.click(page.getByRole("link", { name: "Transformers and Self-Attention Explained" }));
  await page.waitForURL(/\/documents\/\d+/);
  await d.settle();
  await d.caption("A note", "Each note keeps its passages and their embeddings in the <b>DOC_CHUNK</b> table.", 2400);
  const moreLikeThis = page.locator("section", { has: page.getByRole("heading", { name: "More like this" }) });
  await d.caption("More like this", "Similar notes = the nearest <b>document centroids</b> (the average of each note's passage vectors).", 600);
  await d.spot(moreLikeThis, 4600);
  await d.click(moreLikeThis.getByRole("link", { name: /RNNs, LSTMs/ }));
  await page.waitForURL(/\/documents\/\d+/);
  await d.settle();
  await page.getByRole("heading", { name: /RNNs, LSTMs/ }).waitFor();
  await d.caption("Bookmark", "Saving a note is a row in the <b>BOOKMARK</b> table — and a signal for my interest profile.");
  await d.click(page.getByRole("button", { name: /Save/ }), 300);
  await page.getByRole("button", { name: /Saved/ }).waitFor();
  await d.beat(2200);
  await d.hideCaption();

  // ---------------------------------------------------------- upload
  await d.card(chapterCard("2", "Upload a note", "Saved in one transaction, split into passages by a trigger, embedded — and instantly searchable."), 4200, "2 · Upload a note");
  await d.click(nav("Library"));
  await page.waitForURL(/\/documents/);
  await d.settle();
  await d.caption("Library", "The library lists only notes I'm allowed to see — public, my courses, and my own.", 2800);
  await d.click(page.getByRole("link", { name: "Upload a note" }).first());
  await page.waitForURL(/\/documents\/new/);
  await d.settle();
  await d.caption("Upload", "PDF, TXT or Markdown — or paste text. Here I paste my notes on crash recovery.");
  await d.click(page.getByRole("button", { name: "Paste text" }), 250);
  const text = page.getByLabel("Text", { exact: true });
  await d.click(text, 150);
  await text.fill(
    "Write-ahead logging (WAL) means every change is first written to a log on disk, and only later to the data files.\n\n" +
      "If the server crashes, the database replays the log: committed transactions are redone and unfinished ones are undone, so the data is consistent again.\n\n" +
      "Checkpoints limit how much log has to be replayed after a crash.",
  );
  await d.beat(900);
  await d.type(page.getByLabel("Title", { exact: true }), DEMO_NOTE_TITLE, 32);
  await d.select(page.getByLabel("Course"), { label: "UE23CS351A · Database Management Systems" });
  await d.select(page.getByLabel("Visibility"), { value: "course" });
  await d.type(page.getByLabel("Tags"), "transactions, recovery", 45);
  await d.caption("Upload", "One <b>transaction</b>: insert the note, a <b>trigger</b> splits it into passages, tags are linked. If anything fails, nothing is saved.");
  await d.click(page.getByRole("button", { name: "Upload note" }), 300);
  await page.waitForURL(/\/documents\/\d+/, { timeout: 60_000 });
  await d.settle();
  await page.getByRole("heading", { name: DEMO_NOTE_TITLE }).waitFor();
  await d.beat(600);
  const details = page.locator("section", { has: page.getByRole("heading", { name: "Details" }) });
  await d.caption("Upload", "Done: the passages were <b>embedded</b> by the local AI model right after the save.", 600);
  await d.spot(details, 4200);
  // find it by meaning
  await d.click(nav("Search"));
  await page.waitForURL(/\/search/);
  await d.settle();
  await d.caption("Search", "Ask in different words — <b>no shared keywords</b> with the title.");
  await d.type(page.getByLabel("Search query"), "what happens after a power failure in a database", 45);
  await d.click(page.getByRole("radio", { name: "Semantic" }), 300);
  await page.getByText(/semantic mode/).waitFor();
  await d.beat(600);
  // only claim "first" when it really is
  const first = (await results.first().innerText()).includes(DEMO_NOTE_TITLE);
  const found = first ? "The new note comes back <b>first</b>" : "The new note is already in the results";
  await d.caption("Search", `${found} — searchable <b>by meaning</b> seconds after uploading.`, 600);
  await d.spot(results.filter({ hasText: DEMO_NOTE_TITLE }).first(), 5200);
  await d.hideCaption();

  // ---------------------------------------------------------- study groups
  await d.card(chapterCard("3", "Study groups", "Matched by interests — and the database itself guards the seat limits."), 4200, "3 · Study groups");
  await d.click(nav("Study groups"));
  await page.waitForURL(/\/groups/);
  await d.settle();
  const best = page.locator("section", { has: page.getByRole("heading", { name: "Best matches for you" }) });
  await d.caption("Best matches", "Match = <b>70%</b> interest-vector similarity + <b>30%</b> shared topic tags, only for groups in my courses with a free seat.", 600);
  await d.spot(best, 6000);
  await d.caption("A full group", "Query Optimizers already has <b>4 of 4</b> members. What if I try to join anyway?");
  await d.click(page.getByRole("link", { name: "Query Optimizers" }).first());
  await page.waitForURL(/\/groups\/\d+/);
  await d.settle();
  await page.getByRole("heading", { name: "Query Optimizers" }).waitFor();
  await d.beat(800);
  await d.click(page.getByRole("button", { name: /Join \(full/ }), 300);
  const refusal = page.getByRole("alert").filter({ hasText: "full" });
  await refusal.waitFor();
  await d.caption("Trigger", "The <b>database refuses</b>: a trigger locks the group row and checks the seat limit — even if two people click at the same moment.", 600);
  await d.spot(refusal.locator(".."), 5600);
  await d.click(nav("Study groups"));
  await page.waitForURL(/\/groups$/);
  await d.settle();
  await d.caption("Join", "Joining a group with a free seat calls the stored procedure <b>sp_join_group</b>.");
  const firstMatch = best.locator("a").first();
  joinedGroup = (await firstMatch.innerText()).trim();
  await d.click(best.getByRole("button", { name: /Join/ }).first(), 300);
  const mine = page.locator("section", { has: page.getByRole("heading", { name: "Your groups" }) });
  await mine.getByText(joinedGroup, { exact: true }).waitFor({ timeout: 20_000 });
  await d.beat(500);
  await d.spot(mine, 4200);
  await d.hideCaption();

  // ---------------------------------------------------------- admin
  await d.card(chapterCard("4", "Admin &amp; audit", "Analytics with GROUP BY, HAVING, window functions and a materialized view."), 4200, "4 · Admin & audit");
  await d.click(page.getByRole("button", { name: "Log out" }), 300);
  await page.waitForURL(/\/login/);
  await d.settle();
  await d.caption("Admin", "Logging in as the <b>admin</b> — a second role, checked against the database on every request.");
  await logIn(d, page, ADMIN);
  await page.waitForURL(/\/admin/);
  await d.settle();
  await page.getByRole("heading", { name: "Platform overview" }).waitFor();
  await d.beat(600);
  const chart = page.locator("section", { has: page.getByRole("heading", { name: "Searches per day, by mode" }) });
  await d.caption("Analytics", "Searches per day by mode — one query with <b>COUNT(*) FILTER</b> over a generated calendar.", 600);
  await d.point(chart.locator("button").nth(9), 900);
  await d.beat(900);
  await d.point(chart.locator("button").nth(12), 700);
  await d.beat(900);
  await d.point(chart.locator("button").nth(13), 500);
  await d.beat(1600);
  const engagement = page.locator("section", { has: page.getByRole("heading", { name: "Course engagement" }) });
  await d.caption("Materialized view", "Course engagement is a <b>materialized view</b>, refreshed on demand through a SECURITY DEFINER function.");
  await d.spot(engagement, 3600);
  await d.click(engagement.getByRole("button", { name: "Refresh view" }), 1500);
  const gaps = page.locator("section", { has: page.getByRole("heading", { name: "Content gaps" }) });
  await d.caption("Content gaps", "Questions that never found a note (<b>HAVING MAX(result_count) = 0</b>) — topics students need notes for.", 600);
  await d.spot(gaps, 5200);
  await d.click(nav("Audit log"));
  await page.waitForURL(/\/admin\/audit/);
  await d.settle();
  await page.getByRole("heading", { name: "Audit log" }).waitFor();
  await d.caption("Audit log", "Written only by <b>triggers</b>, with who did it — here, Darshan's upload. The app's database login can add to this log but never edit it.", 600);
  await d.spot(page.locator("tbody tr").first(), 6200);
  await d.hideCaption();

  // ---------------------------------------------------------- under the hood + outro
  await d.card(diagramCard("Under the hood", "Browser → Next.js API → PostgreSQL + pgvector", svg("architecture.svg")), 9000, "Under the hood");
  await d.card(diagramCard("Database design", "12 tables · ER diagram (Chen notation)", svg("er-diagram.svg")), 10500);
  await d.card(outroCard(), 8500, "Summary");
}

// ---------------------------------------------------------------- encode

function encode(rec: Recorder, outFile: string): void {
  const list = rec.writeConcatList();
  const chapters = rec.marks.filter((m) => m.kind === "chapter");
  const meta = [";FFMETADATA1", "title=ScholarMesh — demo", "artist=Darshan P Pawar & Dhanush V Biradar"];
  chapters.forEach((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].at : rec.duration;
    meta.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${Math.round(c.at * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${c.title}`);
  });
  const metaFile = path.join(rec.dir, "chapters.ffmeta");
  writeFileSync(metaFile, meta.join("\n"));
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", list,
    "-i", metaFile, "-map_metadata", "1", "-map_chapters", "1",
    "-fps_mode", "cfr", "-r", "30",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outFile,
  ];
  const result = spawnSync(FFMPEG, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed (${result.status ?? result.error?.message})`);
}

function writeScript(rec: Recorder, file: string): void {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const lines = [
    "# ScholarMesh — demo video script",
    "",
    `Video: \`ScholarMesh_Demo.mp4\` (${fmt(rec.duration)}, 1920×1080, chapters included).`,
    "Use this as a narration guide: each line is what the caption on screen says at that moment.",
    "",
  ];
  for (const m of rec.marks) {
    if (m.kind === "chapter") lines.push("", `## ${fmt(m.at)} — ${m.title}`, "");
    else lines.push(`- **${fmt(m.at)}** ${m.text}`);
  }
  writeFileSync(file, lines.join("\n") + "\n");
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  await resetDemoData();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await context.addInitScript({ content: OVERLAY_JS });
  const page = await context.newPage();
  const rec = new Recorder();
  const d = new Director(page, rec);
  try {
    await page.goto(BASE);
    await d.settle();
    await page.evaluate(() => document.fonts.ready);
    await d.demo("cursorVisible", false);
    await d.demo("card", introCard());
    await d.beat(1200);
    await rec.start(page);
    await d.beat(300);
    await walkthrough(page, d, rec);
    await d.beat(400);
  } finally {
    await rec.stop();
    await browser.close();
    await resetDemoData();
  }
  console.log(`recorded ${rec.frameCount} frames, ${rec.duration.toFixed(1)} s`);
  const out = path.join(OUT_DIR, "ScholarMesh_Demo.mp4");
  encode(rec, out);
  writeScript(rec, path.join(OUT_DIR, "demo-script.md"));
  rmSync(rec.dir, { recursive: true, force: true });
  console.log(`wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
