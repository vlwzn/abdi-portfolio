import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";
const configuredOrigin = process.env.APP_ORIGIN?.trim();
let appOrigin = "";
if (configuredOrigin) {
  try {
    appOrigin = new URL(configuredOrigin).origin;
  } catch {
    console.error("APP_ORIGIN must be a valid site origin.");
    process.exit(1);
  }
}
const adminUsername = process.env.ADMIN_USERNAME?.trim();
const adminPassword = process.env.ADMIN_PASSWORD;
const maxBodyBytes = 52 * 1024 * 1024;
const sessionDuration = 12 * 60 * 60 * 1000;
const mediaRoot = path.join(root, "storage", "media");
const dataRoot = path.join(root, "data");
process.umask(0o077);

if (!adminUsername || !adminPassword || adminPassword.length < 12) {
  console.error(
    "Set ADMIN_USERNAME and a unique ADMIN_PASSWORD of at least 12 characters before starting the CMS.",
  );
  process.exit(1);
}
if (isProduction && (!appOrigin || !appOrigin.startsWith("https://"))) {
  console.error("Set APP_ORIGIN to the exact HTTPS origin when NODE_ENV=production.");
  process.exit(1);
}

await mkdir(dataRoot, { recursive: true });
await mkdir(mediaRoot, { recursive: true });
await chmod(dataRoot, 0o700);
await chmod(mediaRoot, 0o700);

const db = new DatabaseSync(path.join(dataRoot, "site.sqlite"));
await chmod(path.join(dataRoot, "site.sqlite"), 0o600);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS site_content (
    section TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    year TEXT NOT NULL DEFAULT '',
    media_path TEXT NOT NULL DEFAULT '',
    media_type TEXT NOT NULL DEFAULT 'image',
    featured INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    promise TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '',
    deliverables TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    specialty TEXT NOT NULL DEFAULT '',
    photo_path TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS media (
    path TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    ip_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started INTEGER NOT NULL,
    blocked_until INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS projects_order_idx ON projects(sort_order, created_at);
  CREATE INDEX IF NOT EXISTS services_order_idx ON services(sort_order, created_at);
  CREATE INDEX IF NOT EXISTS team_order_idx ON team_members(sort_order, created_at);
`);

const timestamp = () => new Date().toISOString();
const defaultContent = {
  home: {
    title: "Graphic Designer",
    subtitle: "Motion & Video Editor.",
    description: "Crafting visual stories through design, motion, and film. Based in Indonesia — available worldwide.",
    ctaText: "See My Work",
    ctaHref: "work.html",
    stats: [
      { value: "5+", label: "Years Exp" },
      { value: "80+", label: "Projects" },
      { value: "30+", label: "Clients" },
    ],
  },
  about: {
    title: "Turning ideas",
    subtitle: "into visuals.",
    bio: "We are 5S.MOTION, a multidisciplinary creative studio based in Indonesia. We bring stories to life through graphic design, motion, and film — with precision and creativity.",
    experience: "5+ years of experience",
    skills: [
      { name: "After Effects", description: "Animation & visual effects", percent: 92 },
      { name: "Premiere Pro", description: "Editing & storytelling", percent: 90 },
      { name: "Illustrator", description: "Identity & vector design", percent: 88 },
      { name: "Photoshop", description: "Image making & compositing", percent: 85 },
    ],
  },
  settings: {
    contactEmail: "hello@abdi.design",
    logoPath: "assets/logo/logo-white.svg",
    socials: [
      { name: "Instagram", url: "#" },
      { name: "Behance", url: "#" },
      { name: "LinkedIn", url: "#" },
      { name: "Dribbble", url: "#" },
    ],
  },
};

const readContent = (section) => {
  const row = db.prepare("SELECT json FROM site_content WHERE section = ?").get(section);
  return row ? JSON.parse(row.json) : null;
};

const saveContent = (section, content) => {
  db.prepare(
    "INSERT INTO site_content(section, json) VALUES(?, ?) ON CONFLICT(section) DO UPDATE SET json = excluded.json",
  ).run(section, JSON.stringify(content));
};

const defaultProjects = [
  {
    title: "Brand Identity System",
    description: "A cohesive visual language, from the first mark to the final touchpoint.",
    category: "Graphic Design",
    year: "2024",
    mediaPath: "assets/images/work-brand-identity.jpg",
    mediaType: "image",
  },
  {
    title: "Product Launch Film",
    description: "An expressive product story built through movement, light, and rhythm.",
    category: "Motion Graphic",
    year: "2024",
    mediaPath: "assets/images/work-product-launch.jpg",
    mediaType: "video",
  },
  {
    title: "Corporate Video Edit",
    description: "A clear narrative with a human perspective.",
    category: "Video Editing",
    year: "2023",
    mediaPath: "assets/images/work-corporate-video.jpg",
    mediaType: "video",
  },
  {
    title: "Social Media Motion",
    description: "Bold, platform-ready stories made to move.",
    category: "Motion Graphic",
    year: "2023",
    mediaPath: "assets/images/work-social-motion.jpg",
    mediaType: "video",
  },
  {
    title: "Visual Campaign",
    description: "One strong idea, across every format.",
    category: "Graphic Design",
    year: "2023",
    mediaPath: "assets/images/work-visual-campaign.jpg",
    mediaType: "image",
  },
];

if (!db.prepare("SELECT 1 FROM site_content LIMIT 1").get()) {
  db.exec("BEGIN");
  try {
    for (const [section, content] of Object.entries(defaultContent)) {
      saveContent(section, content);
    }
    const insert = db.prepare(
      `INSERT INTO projects
        (id, title, description, category, year, media_path, media_type, featured, sort_order, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'published', ?, ?)`,
    );
    defaultProjects.forEach((project, index) => {
      const now = timestamp();
      insert.run(
        `project-${index + 1}`,
        project.title,
        project.description,
        project.category,
        project.year,
        project.mediaPath,
        project.mediaType,
        index,
        now,
        now,
      );
    });
    const insertService = db.prepare(
      `INSERT INTO services
        (id, title, description, promise, tools, deliverables, sort_order, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    [
      ["graphic-design", "Graphic Design", "Brand identity, visual systems, print & digital design that communicates your vision clearly and memorably.", "A consistent identity. A lasting impression.", "Illustrator · Photoshop", ["Brand identity & logo systems", "Visual guidelines & brand assets", "Campaign, print & digital design", "Social media design systems"]],
      ["motion-graphic", "Motion Graphic", "Animated content, title sequences, explainer videos & visual effects crafted for any platform.", "Your story, with a new dimension.", "After Effects · Illustrator", ["Brand & logo animation", "Product films & explainer videos", "Title sequences & visual effects", "Social motion & platform cutdowns"]],
      ["video-editing", "Video Editing", "Corporate films, social content, color grading & complete post-production workflow.", "Every frame working for your story.", "Premiere Pro · After Effects", ["Corporate & brand films", "Social content & promotional edits", "Color grading & sound finishing", "Multi-format exports & subtitles"]],
    ].forEach(([id, title, description, promise, tools, deliverables], index) => {
      const now = timestamp();
      insertService.run(id, title, description, promise, tools, JSON.stringify(deliverables), index, now, now);
    });
    const insertMember = db.prepare(
      `INSERT INTO team_members
        (id, name, role, bio, specialty, photo_path, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    [
      ["member-1", "[Member name]", "Creative Director", "Connects the big picture with the smallest details, shaping a clear direction from the first conversation.", "Direction · Concept"],
      ["member-2", "[Member name]", "Graphic Designer", "Explores type, color, and composition to turn ideas into thoughtful identities and visual systems.", "Identity · Visual systems"],
      ["member-3", "[Member name]", "Motion Designer", "Brings a sense of rhythm and play to every frame, making visual stories move with intention.", "Animation · Storytelling"],
    ].forEach(([id, name, role, bio, specialty], index) => {
      const now = timestamp();
      insertMember.run(id, name, role, bio, specialty, "assets/images/team-portrait-head.svg", index, now, now);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const passwordSalt = randomBytes(16);
const passwordHash = scryptSync(adminPassword, passwordSalt, 64);
db.prepare(
  `INSERT INTO site_content(section, json) VALUES('admin_credentials', ?)
   ON CONFLICT(section) DO UPDATE SET json = excluded.json`,
).run(JSON.stringify({
  username: adminUsername,
  salt: passwordSalt.toString("hex"),
  hash: passwordHash.toString("hex"),
}));
db.prepare("DELETE FROM admin_sessions").run();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const send = (response, status, body, contentType = "application/json; charset=utf-8", extraHeaders = {}) => {
  response.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(Buffer.isBuffer(body) ? body : typeof body === "string" ? body : JSON.stringify(body));
};

const json = (response, status, body, headers) => send(response, status, body, "application/json; charset=utf-8", headers);
const parseCookies = (header = "") =>
  Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0
      ? ["", ""]
      : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([name]) => name));

const sessionFor = (request) => {
  const token = parseCookies(request.headers.cookie).cms_session;
  if (!token) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = db.prepare("SELECT expires_at FROM admin_sessions WHERE token_hash = ?").get(tokenHash);
  if (!session) return false;
  if (session.expires_at < Date.now()) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
    return false;
  }
  return true;
};

const requireAdmin = (request) => {
  if (!sessionFor(request)) throw new HttpError(401, "Sign in to manage website content.");
};

const verifySameOrigin = (request) => {
  const origin = request.headers.origin;
  const requestHost = request.headers.host;
  if (!origin || !requestHost) throw new HttpError(403, "This request origin is not allowed.");
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new HttpError(403, "This request origin is not allowed.");
  }
  if (
    (appOrigin ? parsedOrigin.origin !== appOrigin : parsedOrigin.host !== requestHost) ||
    (isProduction && parsedOrigin.protocol !== "https:")
  ) {
    throw new HttpError(403, "This request origin is not allowed.");
  }
  if (request.headers["sec-fetch-site"] === "cross-site") {
    throw new HttpError(403, "Cross-site requests are not allowed.");
  }
};

const requestBody = async (request, limit = maxBodyBytes) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const contentType = request.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await new Request(`http://${request.headers.host}${request.url}`, {
        method: request.method,
        headers: { "content-type": contentType },
        body: raw,
      }).formData();
      return Object.fromEntries(form.entries());
    } catch {
      throw new HttpError(400, "The uploaded form could not be read.");
    }
  }
  if (!raw.length) return {};
  try {
    const text = raw.toString("utf8");
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(text));
    }
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
};

const asString = (value, label, { required = false, max = 3000 } = {}) => {
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${label} is required.`);
  if (result.length > max) throw new HttpError(400, `${label} must be no longer than ${max} characters.`);
  return result;
};

const asInteger = (value, label, min = 0, max = 100000) => {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}.`);
  }
  return result;
};

const validateLocalLink = (value, label) => {
  const link = asString(value, label, { required: true, max: 300 });
  if (!/^(?:index\.html|work\.html|about\.html|services\.html|team\.html)(?:#[a-z0-9-]+)?$|^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(link)) {
    throw new HttpError(400, `${label} must link to a site page or a valid email address.`);
  }
  return link;
};

const validateMediaPath = (value, label) => {
  const mediaPath = asString(value, label, { max: 300 });
  if (
    mediaPath &&
    !/^\/media\/[a-f0-9]{32}\.(?:jpg|png|webp|mp4|webm)$/.test(mediaPath) &&
    !/^assets\/(?:images|logo)\/[a-z0-9-]+\.(?:jpg|png|webp|svg)$/.test(mediaPath)
  ) {
    throw new HttpError(400, `${label} must refer to a local media file.`);
  }
  return mediaPath;
};

const toProject = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  year: row.year,
  mediaPath: row.media_path,
  mediaType: row.media_type,
  featured: Boolean(row.featured),
  sortOrder: row.sort_order,
  status: row.status,
});
const toService = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  promise: row.promise,
  tools: row.tools,
  deliverables: JSON.parse(row.deliverables),
  sortOrder: row.sort_order,
  enabled: Boolean(row.enabled),
});
const toMember = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  bio: row.bio,
  specialty: row.specialty,
  photoPath: row.photo_path,
  sortOrder: row.sort_order,
});

const projects = () => db.prepare("SELECT * FROM projects ORDER BY sort_order, created_at").all().map(toProject);
const services = () => db.prepare("SELECT * FROM services ORDER BY sort_order, created_at").all().map(toService);
const team = () => db.prepare("SELECT * FROM team_members ORDER BY sort_order, created_at").all().map(toMember);
const adminData = () => ({
  home: readContent("home"),
  about: readContent("about"),
  settings: readContent("settings"),
  projects: projects(),
  services: services(),
  team: team(),
});
const publicData = () => ({
  home: readContent("home"),
  about: readContent("about"),
  settings: readContent("settings"),
  projects: projects().filter((project) => project.status === "published"),
  services: services().filter((service) => service.enabled),
  team: team(),
});

const validateContent = (section, input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Content must be an object.");
  if (section === "home") {
    const stats = input.stats;
    if (!Array.isArray(stats) || stats.length > 6) throw new HttpError(400, "Provide up to six homepage statistics.");
    return {
      title: asString(input.title, "Title", { required: true, max: 100 }),
      subtitle: asString(input.subtitle, "Subtitle", { required: true, max: 120 }),
      description: asString(input.description, "Description", { required: true, max: 600 }),
      ctaText: asString(input.ctaText, "Button text", { required: true, max: 40 }),
      ctaHref: validateLocalLink(input.ctaHref, "Button link"),
      stats: stats.map((item) => ({
        value: asString(item.value, "Statistic value", { required: true, max: 20 }),
        label: asString(item.label, "Statistic label", { required: true, max: 40 }),
      })),
    };

  }
  if (section === "about") {
    if (!Array.isArray(input.skills) || input.skills.length > 12) throw new HttpError(400, "Provide up to twelve skills.");
    return {
      title: asString(input.title, "Title", { required: true, max: 100 }),
      subtitle: asString(input.subtitle, "Subtitle", { required: true, max: 120 }),
      bio: asString(input.bio, "Biography", { required: true, max: 2000 }),
      experience: asString(input.experience, "Experience", { required: true, max: 300 }),
      skills: input.skills.map((skill) => ({
        name: asString(skill.name, "Skill name", { required: true, max: 60 }),
        description: asString(skill.description, "Skill description", { max: 120 }),
        percent: asInteger(skill.percent, "Skill level", 0, 100),
      })),
    };
  }
  if (section === "settings") {
    if (!Array.isArray(input.socials) || input.socials.length > 8) throw new HttpError(400, "Provide up to eight social links.");
    const email = asString(input.contactEmail, "Contact email", { required: true, max: 254 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid contact email.");
    return {
      contactEmail: email,
      logoPath: validateMediaPath(input.logoPath || "assets/logo/logo-white.svg", "Logo path"),
      socials: input.socials.map((social) => {
        const name = asString(social.name, "Social link name", { required: true, max: 40 });
        const url = asString(social.url, "Social link URL", { required: true, max: 500 });
        if (url !== "#") {
          let parsed;
          try {
            parsed = new URL(url);
          } catch {
            throw new HttpError(400, `Enter a valid URL for ${name}.`);
          }
          if (!["http:", "https:"].includes(parsed.protocol)) throw new HttpError(400, "Social links must use HTTP or HTTPS.");
        }
        return { name, url };
      }),
    };
  }
  throw new HttpError(404, "Content section not found.");
};

const allowedMedia = {
  "image/jpeg": { ext: "jpg", bytes: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { ext: "png", bytes: (buffer) => buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { ext: "webp", bytes: (buffer) => buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" },
  "video/mp4": { ext: "mp4", bytes: (buffer) => buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp" },
  "video/webm": { ext: "webm", bytes: (buffer) => buffer.length > 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
};

const storeUpload = async (file, { mediaOnly = false } = {}) => {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return "";
  const policy = allowedMedia[file.type];
  if (!policy || (mediaOnly && !file.type.startsWith("image/"))) {
    throw new HttpError(400, "Use a JPEG, PNG, WebP, MP4, or WebM file.");
  }
  const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) throw new HttpError(413, "Media file exceeds the upload size limit.");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!policy.bytes(buffer)) throw new HttpError(400, "The uploaded file does not match its declared media type.");
  const filePath = `${randomBytes(16).toString("hex")}.${policy.ext}`;
  const urlPath = `/media/${filePath}`;
  await writeFile(path.join(mediaRoot, filePath), buffer, { flag: "wx", mode: 0o640 });
  db.prepare("INSERT INTO media(path, mime_type, file_name, created_at) VALUES(?, ?, ?, ?)").run(
    urlPath,
    file.type,
    path.basename(file.name || filePath),
    timestamp(),
  );
  return urlPath;
};

const cleanupMedia = async (oldPath, newPath = "") => {
  if (!oldPath || oldPath === newPath || !oldPath.startsWith("/media/")) return;
  const used = db.prepare(`
    SELECT 1 FROM projects WHERE media_path = ?
    UNION ALL SELECT 1 FROM team_members WHERE photo_path = ?
    UNION ALL SELECT 1 FROM site_content WHERE json LIKE ?
    LIMIT 1
  `).get(oldPath, oldPath, `%${oldPath}%`);
  if (used) return;
  const file = db.prepare("SELECT path FROM media WHERE path = ?").get(oldPath);
  if (!file) return;
  db.prepare("DELETE FROM media WHERE path = ?").run(oldPath);
  try {
    await unlink(path.join(mediaRoot, path.basename(file.path)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};

const normalizeRecord = (collection, body, current = null, uploadedPath = "") => {
  const sortOrder = asInteger(body.sortOrder ?? current?.sortOrder ?? 0, "Order", 0, 100000);
  if (collection === "projects") {
    const status = body.status ?? current?.status ?? "draft";
    if (!["draft", "published"].includes(status)) throw new HttpError(400, "Choose draft or published status.");
    const mediaType = body.mediaType ?? current?.mediaType ?? "image";
    if (!["image", "video"].includes(mediaType)) throw new HttpError(400, "Choose photo or video media.");
    return {
      title: asString(body.title, "Project title", { required: true, max: 120 }),
      description: asString(body.description, "Project description", { max: 2000 }),
      category: asString(body.category, "Category", { required: true, max: 60 }),
      year: asString(body.year ?? current?.year ?? "", "Year", { max: 20 }),
      mediaPath: uploadedPath || validateMediaPath(body.mediaPath ?? current?.mediaPath ?? "", "Media path"),
      mediaType,
      featured: body.featured === "true" || body.featured === true || body.featured === "on",
      sortOrder,
      status,
    };
  }
  if (collection === "services") {
    let deliverables = body.deliverables ?? current?.deliverables ?? [];
    if (typeof deliverables === "string") deliverables = deliverables.split("\n");
    if (!Array.isArray(deliverables) || deliverables.length > 20) throw new HttpError(400, "Provide up to twenty deliverables.");
    return {
      title: asString(body.title, "Service name", { required: true, max: 100 }),
      description: asString(body.description, "Description", { required: true, max: 1200 }),
      promise: asString(body.promise ?? current?.promise ?? "", "Service promise", { max: 200 }),
      tools: asString(body.tools ?? current?.tools ?? "", "Tools", { max: 200 }),
      deliverables: deliverables.map((item) => asString(item, "Deliverable", { required: true, max: 150 })).filter(Boolean),
      sortOrder,
      enabled: body.enabled === "true" || body.enabled === true || body.enabled === "on",
    };
  }
  if (collection === "team") {
    return {
      name: asString(body.name, "Member name", { required: true, max: 100 }),
      role: asString(body.role, "Role", { required: true, max: 100 }),
      bio: asString(body.bio, "Bio", { max: 1500 }),
      specialty: asString(body.specialty ?? current?.specialty ?? "", "Specialty", { max: 120 }),
      photoPath: uploadedPath || validateMediaPath(body.photoPath ?? current?.photoPath ?? "", "Photo path"),
      sortOrder,
    };
  }
  throw new HttpError(404, "Content collection not found.");
};

const storeRecord = async (collection, id, values, current = null) => {
  const now = timestamp();
  if (collection === "projects") {
    db.prepare(`INSERT INTO projects(id, title, description, category, year, media_path, media_type, featured, sort_order, status, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, category=excluded.category, year=excluded.year, media_path=excluded.media_path, media_type=excluded.media_type, featured=excluded.featured, sort_order=excluded.sort_order, status=excluded.status, updated_at=excluded.updated_at`)
      .run(id, values.title, values.description, values.category, values.year, values.mediaPath, values.mediaType, Number(values.featured), values.sortOrder, values.status, current?.createdAt || now, now);
  } else if (collection === "services") {
    db.prepare(`INSERT INTO services(id, title, description, promise, tools, deliverables, sort_order, enabled, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, promise=excluded.promise, tools=excluded.tools, deliverables=excluded.deliverables, sort_order=excluded.sort_order, enabled=excluded.enabled, updated_at=excluded.updated_at`)
      .run(id, values.title, values.description, values.promise, values.tools, JSON.stringify(values.deliverables), values.sortOrder, Number(values.enabled), current?.createdAt || now, now);
  } else {
    db.prepare(`INSERT INTO team_members(id, name, role, bio, specialty, photo_path, sort_order, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, bio=excluded.bio, specialty=excluded.specialty, photo_path=excluded.photo_path, sort_order=excluded.sort_order, updated_at=excluded.updated_at`)
      .run(id, values.name, values.role, values.bio, values.specialty, values.photoPath, values.sortOrder, current?.createdAt || now, now);
  }
};

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/work.html", ["work.html", "text/html; charset=utf-8"]],
  ["/about.html", ["about.html", "text/html; charset=utf-8"]],
  ["/services.html", ["services.html", "text/html; charset=utf-8"]],
  ["/team.html", ["team.html", "text/html; charset=utf-8"]],
  ["/assets/css/style.css", ["assets/css/style.css", "text/css; charset=utf-8"]],
  ["/assets/css/work.css", ["assets/css/work.css", "text/css; charset=utf-8"]],
  ["/assets/css/about.css", ["assets/css/about.css", "text/css; charset=utf-8"]],
  ["/assets/css/services.css", ["assets/css/services.css", "text/css; charset=utf-8"]],
  ["/assets/css/team.css", ["assets/css/team.css", "text/css; charset=utf-8"]],
  ["/assets/js/script.js", ["assets/js/script.js", "text/javascript; charset=utf-8"]],
  ["/assets/js/work.js", ["assets/js/work.js", "text/javascript; charset=utf-8"]],
  ["/assets/js/about.js", ["assets/js/about.js", "text/javascript; charset=utf-8"]],
  ["/assets/js/services.js", ["assets/js/services.js", "text/javascript; charset=utf-8"]],
  ["/assets/js/team.js", ["assets/js/team.js", "text/javascript; charset=utf-8"]],
  ["/assets/js/public-content.js", ["assets/js/public-content.js", "text/javascript; charset=utf-8"]],
  ["/assets/css/admin.css", ["assets/css/admin.css", "text/css; charset=utf-8"]],
  ["/assets/js/admin.js", ["assets/js/admin.js", "text/javascript; charset=utf-8"]],
  ["/assets/images/about-creative-workspace.jpg", ["assets/images/about-creative-workspace.jpg", "image/jpeg"]],
  ["/assets/images/team-portrait-head.svg", ["assets/images/team-portrait-head.svg", "image/svg+xml"]],
  ["/assets/images/work-brand-identity.jpg", ["assets/images/work-brand-identity.jpg", "image/jpeg"]],
  ["/assets/images/work-corporate-video.jpg", ["assets/images/work-corporate-video.jpg", "image/jpeg"]],
  ["/assets/images/work-product-launch.jpg", ["assets/images/work-product-launch.jpg", "image/jpeg"]],
  ["/assets/images/work-social-motion.jpg", ["assets/images/work-social-motion.jpg", "image/jpeg"]],
  ["/assets/images/work-visual-campaign.jpg", ["assets/images/work-visual-campaign.jpg", "image/jpeg"]],
  ["/assets/logo/logo-white.svg", ["assets/logo/logo-white.svg", "image/svg+xml"]],
  ["/assets/logo/logo-black.svg", ["assets/logo/logo-black.svg", "image/svg+xml"]],
]);

const serveStatic = async (request, response, file, contentType) => {
  try {
    const body = await readFile(path.join(root, file));
    send(response, 200, body, contentType, { "Cache-Control": contentType.startsWith("text/html") ? "no-cache" : "public, max-age=3600" });
  } catch (error) {
    if (error.code === "ENOENT") throw new HttpError(404, "Page or asset not found.");
    throw error;
  }
};

const handleLogin = async (request, response) => {
  verifySameOrigin(request);
  const body = await requestBody(request, 8 * 1024);
  const ipHash = createHash("sha256").update(request.socket.remoteAddress || "unknown").digest("hex");
  const now = Date.now();
  const attempt = db.prepare("SELECT * FROM login_attempts WHERE ip_hash = ?").get(ipHash);
  if (attempt && attempt.blocked_until > now) throw new HttpError(429, "Too many sign-in attempts. Try again later.");

  const configured = JSON.parse(db.prepare("SELECT json FROM site_content WHERE section = 'admin_credentials'").get().json);
  const salt = Buffer.from(configured.salt, "hex");
  const expected = Buffer.from(configured.hash, "hex");
  const supplied = scryptSync(String(body.password || ""), salt, expected.length);
  const usernameMatches = typeof body.username === "string" && body.username === configured.username;
  const passwordMatches = timingSafeEqual(supplied, expected);
  if (!usernameMatches || !passwordMatches) {
    const attempts = attempt && now - attempt.window_started < 15 * 60 * 1000 ? attempt.attempts + 1 : 1;
    db.prepare(`INSERT INTO login_attempts(ip_hash, attempts, window_started, blocked_until) VALUES(?, ?, ?, ?)
      ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts, window_started=excluded.window_started, blocked_until=excluded.blocked_until`)
      .run(ipHash, attempts, attempt && now - attempt.window_started < 15 * 60 * 1000 ? attempt.window_started : now, attempts >= 5 ? now + 15 * 60 * 1000 : 0);
    throw new HttpError(401, "Username or password is incorrect.");
  }

  db.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").run(ipHash);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  db.prepare("INSERT INTO admin_sessions(token_hash, expires_at) VALUES(?, ?)").run(tokenHash, now + sessionDuration);
  const secure = isProduction ? "; Secure" : "";
  json(response, 200, { success: true }, {
    "Set-Cookie": `cms_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDuration / 1000}${secure}`,
  });
};

const handleRequest = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = request.method || "GET";

  if (method === "POST" && pathname === "/api/login") return handleLogin(request, response);
  if (method === "POST" && pathname === "/api/logout") {
    requireAdmin(request);
    verifySameOrigin(request);
    const token = parseCookies(request.headers.cookie).cms_session;
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(createHash("sha256").update(token).digest("hex"));
    return json(response, 200, { success: true }, { "Set-Cookie": "cms_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    return serveStatic(request, response, sessionFor(request) ? "admin/dashboard.html" : "admin/login.html", "text/html; charset=utf-8");
  }
  if (pathname === "/admin/login") return serveStatic(request, response, "admin/login.html", "text/html; charset=utf-8");
  if (pathname === "/api/public" && method === "GET") return json(response, 200, publicData());

  if (pathname.startsWith("/api/admin/")) {
    requireAdmin(request);
    if (pathname === "/api/admin/data" && method === "GET") return json(response, 200, adminData());
    if (method === "PUT" && /^\/api\/admin\/content\/(home|about|settings)$/.test(pathname)) {
      verifySameOrigin(request);
      const section = pathname.split("/").at(-1);
      const body = await requestBody(request, 11 * 1024 * 1024);
      if (typeof body.socials === "string") {
        try {
          body.socials = JSON.parse(body.socials);
        } catch {
          throw new HttpError(400, "Social links must contain valid data.");
        }
      }
      const content = validateContent(section, body);
      if (section === "settings" && body.logoFile && typeof body.logoFile.arrayBuffer === "function" && body.logoFile.size > 0) {
        const previous = readContent("settings");
        content.logoPath = await storeUpload(body.logoFile, { mediaOnly: true });
        saveContent(section, content);
        await cleanupMedia(previous.logoPath, content.logoPath);
      } else {
        saveContent(section, content);
      }
      return json(response, 200, { success: true, data: adminData() });
    }

    const collectionMatch = pathname.match(/^\/api\/admin\/(projects|services|team)(?:\/([^/]+))?$/);
    if (collectionMatch) {
      const [, collection, id] = collectionMatch;
      if (method === "GET") return json(response, 200, adminData()[collection]);
      verifySameOrigin(request);

      if (method === "DELETE" && id) {
        const item = adminData()[collection].find((entry) => entry.id === id);
        if (!item) throw new HttpError(404, "This item no longer exists.");
        const table = collection === "team" ? "team_members" : collection;
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        if (collection === "projects") await cleanupMedia(item.mediaPath);
        if (collection === "team") await cleanupMedia(item.photoPath);
        return json(response, 200, { success: true, data: adminData() });
      }

      if (method === "POST" || (method === "PUT" && id)) {
        const body = await requestBody(request);
        const current = id ? adminData()[collection].find((entry) => entry.id === id) : null;
        if (id && !current) throw new HttpError(404, "This item no longer exists.");
        const file = body.mediaFile;
        const uploadedPath = file && typeof file.arrayBuffer === "function" && file.size > 0
          ? await storeUpload(file, { mediaOnly: collection === "team" })
          : "";
        try {
          const values = normalizeRecord(collection, body, current, uploadedPath);
          if (collection === "projects" && values.status === "published" && (!values.title || !values.category)) {
            throw new HttpError(400, "Published projects need a title and category.");
          }
          const recordId = id || `${collection}-${randomBytes(10).toString("hex")}`;
          await storeRecord(collection, recordId, values, current);
          if (current && collection === "projects") await cleanupMedia(current.mediaPath, values.mediaPath);
          if (current && collection === "team") await cleanupMedia(current.photoPath, values.photoPath);
          return json(response, id ? 200 : 201, { success: true, data: adminData(), id: recordId });
        } catch (error) {
          if (uploadedPath) await cleanupMedia(uploadedPath);
          throw error;
        }
      }
    }
    throw new HttpError(404, "CMS endpoint not found.");
  }

  if (pathname.startsWith("/media/") && method === "GET") {
    const fileName = path.basename(pathname.slice("/media/".length));
    if (!/^[a-f0-9]{32}\.(?:jpg|png|webp|mp4|webm)$/.test(fileName)) throw new HttpError(404, "Media not found.");
    const filePath = `/media/${fileName}`;
    const publicReference =
      db.prepare("SELECT 1 FROM projects WHERE media_path = ? AND status = 'published'").get(filePath) ||
      db.prepare("SELECT 1 FROM site_content WHERE section = 'settings' AND json LIKE ?").get(`%${filePath}%`);
    if (!publicReference && !sessionFor(request)) throw new HttpError(404, "Media not found.");
    const media = db.prepare("SELECT mime_type FROM media WHERE path = ?").get(filePath);
    if (!media) throw new HttpError(404, "Media not found.");
    const bytes = await readFile(path.join(mediaRoot, fileName));
    const contentType = media.mime_type.startsWith("image/") ? media.mime_type : media.mime_type;
    return send(response, 200, bytes, contentType, { "Cache-Control": "private, max-age=3600" });
  }

  const staticFile = staticFiles.get(pathname);
  if (staticFile && method === "GET") return serveStatic(request, response, ...staticFile);
  throw new HttpError(404, "Page or endpoint not found.");
};

const server = createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    json(response, status, {
      error: status >= 500 ? "The server could not complete the request." : error.message,
    });
  }
});

server.listen(port, host, () => {
  console.log(`5S.MOTION CMS listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
