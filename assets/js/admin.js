const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const loginForm = document.querySelector("#login-form");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorMessage = loginForm.querySelector(".form-error");
    errorMessage.textContent = "";
    const formData = new FormData(loginForm);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      window.location.assign("/admin");
    } catch (error) {
      errorMessage.textContent = error.message;
    }
  });
}

const contentArea = document.querySelector("#content-area");

if (contentArea) {
  const sectionNames = {
    dashboard: "Dashboard",
    home: "Beranda",
    about: "Tentang & keahlian",
    projects: "Proyek",
    services: "Layanan",
    team: "Tim",
    settings: "Pengaturan situs",
  };

  const descriptions = {
    dashboard: "Kelola karya, cerita, dan wajah studio dalam satu tempat.",
    home: "Perbarui judul utama, ajakan, statistik, dan pilihan karya unggulan.",
    about: "Atur bio, pengalaman, dan keahlian yang tampil di website.",
    projects: "Tambah, edit, urutkan, simpan sebagai draf, dan terbitkan proyek.",
    services: "Kelola layanan dan atur urutan tampilnya di website.",
    team: "Perbarui profil, foto, peran, dan urutan anggota tim.",
    settings: "Kelola kontak, media sosial, dan logo global situs.",
  };

  let data = null;
  let currentSection = "dashboard";
  let activeProjectStatus = "all";
  let toastTimer;
  const contentRoot = document.querySelector(".dashboard-content");
  const editor = document.querySelector("#editor-dialog");
  const editorForm = document.querySelector("#editor-form");
  let editing = { collection: "", id: "" };

  const showToast = (message, isError = false) => {
    const toast = document.querySelector("#toast");
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
  };

  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.assign("/admin/login");
      throw new Error(result.error || "Your session has expired.");
    }
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
  };

  const updateLocation = (section) => {
    currentSection = sectionNames[section] ? section : "dashboard";
    document.querySelector("#page-title").textContent = sectionNames[currentSection];
    document.querySelector("#breadcrumb-title").textContent = sectionNames[currentSection];
    document.querySelector("#page-description").textContent = descriptions[currentSection];
    const collectionName = currentSection === "team" ? "anggota" : currentSection === "services" ? "layanan" : "proyek";
    document.querySelector("#create-project-button").textContent = `＋  Tambah ${collectionName}`;
    document.querySelectorAll(".side-nav [data-section]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.section === currentSection);
    });
    document.querySelector("#create-project-button").hidden = currentSection !== "dashboard" && currentSection !== "projects";
    render();
  };

  const updateChrome = () => {
    for (const collection of ["projects", "services", "team"]) {
      const count = document.querySelector(`[data-count="${collection}"]`);
      const items = data[collection];
      count.textContent = collection === "projects"
        ? String(items.filter((item) => item.status === "published").length).padStart(2, "0")
        : String(items.length).padStart(2, "0");
    }
    const logo = document.querySelector("#site-logo-preview");
    logo.src = data.settings.logoPath || "/assets/logo/logo-white.svg";
  };

  const refresh = async (successMessage = "") => {
    const result = await request("/api/admin/data");
    data = result;
    updateChrome();
    render();
    if (successMessage) showToast(successMessage);
  };

  const button = (label, action, extraClass = "button-secondary") =>
    `<button class="button ${extraClass}" type="button" data-action="${action}">${label}</button>`;

  const renderProjectRow = (project) => {
    const thumbnail = project.mediaPath
      ? `<img class="project-thumb" src="${escapeHtml(project.mediaPath)}" alt="" loading="lazy">`
      : `<span class="project-thumb project-thumb-placeholder">▧</span>`;
    return `<tr data-project-row="${escapeHtml(project.id)}">
      <td class="check-cell"><input type="checkbox" aria-label="Select ${escapeHtml(project.title)}" data-select-project="${escapeHtml(project.id)}"></td>
      <td><div class="project-info">${thumbnail}<div><strong>${escapeHtml(project.title)}</strong><small>${escapeHtml(project.category)} · ${escapeHtml(project.year || "Year not set")}${project.featured ? " · Featured" : ""}</small></div></div></td>
      <td><span class="media-type">${project.mediaType === "video" ? "▷ Video" : "▧ Foto"}</span></td>
      <td><select class="status-select ${project.status === "published" ? "is-published" : "is-draft"}" aria-label="Publication status for ${escapeHtml(project.title)}" data-status-id="${escapeHtml(project.id)}"><option value="published" ${project.status === "published" ? "selected" : ""}>● Terbit</option><option value="draft" ${project.status === "draft" ? "selected" : ""}>● Draf</option></select></td>
      <td><div class="row-actions"><button class="button button-secondary" type="button" data-edit-collection="projects" data-edit-id="${escapeHtml(project.id)}">✎ &nbsp; Edit</button><button class="delete-button" type="button" data-delete-collection="projects" data-delete-id="${escapeHtml(project.id)}" aria-label="Delete ${escapeHtml(project.title)}" title="Delete">▤</button></div></td>
    </tr>`;
  };

  const renderProjectTable = (items, showHeading = true) => {
    const categories = [...new Set(items.map((project) => project.category))].sort();
    return `<section class="panel">
      ${showHeading ? `<div class="panel-heading"><div><h2>Proyek</h2><p>Atur karya yang tampil di Home dan Work.</p></div><span aria-hidden="true">▱</span></div>` : ""}
      <div class="section-tabs" role="tablist" aria-label="Filter projects by publication status">
        ${[["all", `Semua ${items.length}`], ["published", `Terbit ${items.filter((item) => item.status === "published").length}`], ["draft", `Draf ${items.filter((item) => item.status === "draft").length}`]].map(([key, label]) => `<button class="section-tab ${activeProjectStatus === key ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeProjectStatus === key}" data-project-status="${key}">${label}</button>`).join("")}
      </div>
      <div class="project-filters">
        <input class="filter-control" type="search" placeholder="⌕  Cari nama proyek..." aria-label="Search projects" data-project-search>
        <select class="filter-control" aria-label="Filter by category" data-project-category><option value="all">Semua kategori</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}</select>
        <select class="filter-control" aria-label="Filter by media type" data-project-media><option value="all">Semua media</option><option value="image">Foto</option><option value="video">Video</option></select>
      </div>
      <div class="table-scroll"><table class="project-table"><thead><tr><th class="check-cell"><input type="checkbox" aria-label="Select all projects" data-select-all></th><th>PROYEK</th><th>MEDIA</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody data-project-rows>${items.map(renderProjectRow).join("")}</tbody></table></div>
      <div class="table-footer"><span data-project-count>Menampilkan ${items.length} proyek</span><span>${items.length ? "↕ &nbsp; Urutan ditentukan lewat tombol Edit" : ""}</span></div>
    </section>`;
  };

  const renderOverview = () => {
    const published = data.projects.filter((project) => project.status === "published").length;
    const drafts = data.projects.length - published;
    const draft = data.projects.find((project) => project.status === "draft");
    const metrics = [
      ["Total proyek", data.projects.length.toString().padStart(2, "0"), `${published} terbit · ${drafts} draf`, "▱"],
      ["Layanan", data.services.filter((service) => service.enabled).length.toString().padStart(2, "0"), "Sesuai website", "▱"],
      ["Anggota tim", data.team.length.toString().padStart(2, "0"), "Profil anggota", "♧"],
      ["Keahlian", data.about.skills.length.toString().padStart(2, "0"), "Software kreatif", "☷"],
    ];
    const websiteLinks = [
      ["⌂", "Beranda", "Hero, proyek pilihan & CTA", "home"],
      ["♙", "Tentang & keahlian", "Profil, pengalaman & keahlian", "about"],
      ["▱", "Layanan", `${data.services.filter((service) => service.enabled).length} layanan · Deskripsi & detail`, "services"],
      ["♧", "Tim", `${data.team.length} profil · Kelola anggota`, "team"],
      ["☷", "Pengaturan situs", "Kontak & tautan sosial", "settings"],
    ];
    return `<div class="metric-grid">${metrics.map(([label, value, detail, icon]) => `<article class="metric-card"><span>${label}<span aria-hidden="true">${icon}</span></span><div><strong>${value}</strong><small>${detail}</small></div></article>`).join("")}</div>
      <div class="cms-columns">
        ${renderProjectTable(data.projects)}
        <aside class="dashboard-aside">
          <section class="side-card"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Lanjutkan draf</h2><span class="draft-chip">● Draf</span></div>
            ${draft ? `<p class="draft-title">${escapeHtml(draft.title)}</p><p>Contoh draf. Tambahkan judul, kategori, dan media sebelum diterbitkan.</p><div class="aside-actions">${button("✎ Edit draf", "edit-draft")}<button class="button button-secondary" type="button" data-publish-id="${escapeHtml(draft.id)}">⇧ Terbitkan</button></div><p style="margin-top:10px">◉ &nbsp; Belum tampil di website</p>` : `<p class="draft-title">Tidak ada draf tertunda.</p><p>Tambah proyek dan simpan sebagai draf untuk menerbitkannya nanti.</p><div class="aside-actions">${button("＋ Tambah proyek", "new-project", "button-primary")}</div>`}
          </section>
          <section class="side-card"><h2>Konten website</h2><p>Pilih bagian untuk mengubah isi.</p><div class="website-links">${websiteLinks.map(([icon, title, note, section]) => `<button class="website-link" type="button" data-section="${section}"><span>${icon}</span><span>${title}<small>${note}</small></span><span>↗</span></button>`).join("")}</div></section>
          <p class="field-help">ⓘ &nbsp; Gunakan menu status untuk mengubah proyek terbit menjadi draf.</p>
        </aside>
      </div>`;
  };

  const field = (label, name, value, options = {}) => {
    const { type = "text", required = false, full = false, help = "", accept = "", maxLength = 1200 } = options;
    const requiredAttribute = required ? "required" : "";
    const fullClass = full ? "field-full" : "";
    if (type === "textarea") {
      return `<label class="field ${fullClass}">${label}<textarea name="${name}" ${requiredAttribute} maxlength="${maxLength}">${escapeHtml(value || "")}</textarea>${help ? `<span class="field-help">${help}</span>` : ""}</label>`;
    }
    if (type === "file") {
      return `<label class="field ${fullClass}">${label}<input name="${name}" type="file" accept="${accept}" ${requiredAttribute}>${help ? `<span class="field-help">${help}</span>` : ""}</label>`;
    }
    if (type === "checkbox") {
      return `<label class="checkbox-field ${fullClass}"><input name="${name}" type="checkbox" ${value ? "checked" : ""}>${label}</label>`;
    }
    return `<label class="field ${fullClass}">${label}<input name="${name}" type="${type}" value="${escapeHtml(value ?? "")}" ${requiredAttribute} maxlength="${maxLength}">${help ? `<span class="field-help">${help}</span>` : ""}</label>`;
  };

  const renderEditableContent = (section) => {
    if (section === "home") {
      const home = data.home;
      const stats = home.stats.map((item) => `${item.value} | ${item.label}`).join("\n");
      return `<section class="panel content-form-card"><h2>Konten beranda</h2><p>Perubahan tersimpan akan langsung tampil di halaman Home.</p><form class="content-form" data-content-form="home"><div class="form-fields">
        ${field("Judul utama", "title", home.title, { required: true })}
        ${field("Subjudul", "subtitle", home.subtitle, { required: true })}
        ${field("Deskripsi", "description", home.description, { type: "textarea", required: true, full: true })}
        ${field("Teks tombol CTA", "ctaText", home.ctaText, { required: true })}
        ${field("Tautan tombol CTA", "ctaHref", home.ctaHref, { required: true, help: "Gunakan halaman situs, misalnya work.html, atau mailto:alamat." })}
        ${field("Statistik (satu per baris: nilai | label)", "statsText", stats, { type: "textarea", full: true, help: "Contoh: 5+ | Tahun pengalaman", maxLength: 500 })}
        </div><div class="dialog-actions"><button class="button button-secondary" type="button" data-cancel-content>Batal</button><button class="button button-primary" type="submit">Simpan perubahan</button></div></form></section>
        ${renderProjectTable(data.projects.filter((project) => project.status === "published" && project.featured), false)}`;
    }
    if (section === "about") {
      const about = data.about;
      const skills = about.skills.map((skill) => `${skill.name} | ${skill.description} | ${skill.percent}`).join("\n");
      return `<section class="panel content-form-card"><h2>Tentang &amp; keahlian</h2><p>Kelola informasi profil, pengalaman, dan daftar keahlian.</p><form class="content-form" data-content-form="about"><div class="form-fields">
        ${field("Judul", "title", about.title, { required: true })}
        ${field("Subjudul", "subtitle", about.subtitle, { required: true })}
        ${field("Bio", "bio", about.bio, { type: "textarea", required: true, full: true, maxLength: 2000 })}
        ${field("Pengalaman", "experience", about.experience, { type: "textarea", required: true, full: true, maxLength: 300 })}
        ${field("Keahlian (Nama | Deskripsi | Persentase)", "skillsText", skills, { type: "textarea", full: true, help: "Satu keahlian per baris. Persentase harus antara 0–100.", maxLength: 1500 })}
        </div><div class="dialog-actions"><button class="button button-secondary" type="button" data-cancel-content>Batal</button><button class="button button-primary" type="submit">Simpan perubahan</button></div></form></section>`;
    }
    const settings = data.settings;
    const socials = settings.socials.map((social) => `${social.name} | ${social.url}`).join("\n");
    return `<section class="panel content-form-card"><h2>Pengaturan situs</h2><p>Informasi kontak dan tautan sosial berlaku di halaman publik.</p><form class="content-form" data-content-form="settings"><div class="form-fields">
      ${field("Email kontak", "contactEmail", settings.contactEmail, { type: "email", required: true })}
      ${field("Logo global", "logoFile", "", { type: "file", accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp", help: "JPEG, PNG, atau WebP; maksimal 10 MB." })}
      ${field("Tautan sosial (Nama | URL)", "socialsText", socials, { type: "textarea", full: true, help: "Satu tautan per baris. Gunakan URL https:// yang valid.", maxLength: 1500 })}
      </div><div class="dialog-actions"><button class="button button-secondary" type="button" data-cancel-content>Batal</button><button class="button button-primary" type="submit">Simpan pengaturan</button></div></form></section>`;
  };

  const recordSummary = (collection, item) => {
    if (collection === "projects") return `${item.category} · ${item.year || "Year not set"} · ${item.status === "published" ? "Terbit" : "Draf"}`;
    if (collection === "services") return `${item.enabled ? "Aktif" : "Disembunyikan"} · ${item.deliverables.length} deliverable`;
    return `${item.role} · ${item.specialty || "Studio member"}`;
  };

  const renderRecords = (collection) => {
    const items = data[collection];
    const labels = { projects: "proyek", services: "layanan", team: "anggota tim" };
    const images = collection === "team";
    const content = items.length
      ? items.map((item) => {
        const media = images && item.photoPath
          ? `<img src="${escapeHtml(item.photoPath)}" alt="" loading="lazy">`
          : collection === "projects" && item.mediaPath
            ? `<img src="${escapeHtml(item.mediaPath)}" alt="" loading="lazy">`
            : "";
        const title = collection === "team" ? item.name : item.title;
        const subTitle = collection === "team" ? item.bio : item.description;
        return `<article class="record-row">${media}<div class="record-row-copy"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(recordSummary(collection, item))} · ${escapeHtml(subTitle)}</p></div><div class="row-actions"><button class="button button-secondary" type="button" data-edit-collection="${collection}" data-edit-id="${escapeHtml(item.id)}">✎ &nbsp; Edit</button><button class="delete-button" type="button" data-delete-collection="${collection}" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(title)}" title="Delete">▤</button></div></article>`;
      }).join("")
      : `<div class="empty-state">Belum ada ${labels[collection]}. Gunakan tombol Tambah untuk membuat konten.</div>`;
    return `<section class="records-list">${content}</section>`;
  };

  const render = () => {
    if (!data) return;
    contentRoot.querySelectorAll(".nav-count").forEach((node) => {
      const key = node.dataset.count;
      node.textContent = String(data[key].length).padStart(2, "0");
    });

    if (currentSection === "dashboard") {
      contentArea.innerHTML = renderOverview();
    } else if (["home", "about", "settings"].includes(currentSection)) {
      contentArea.innerHTML = `<div class="content-section">${renderEditableContent(currentSection)}</div>`;
    } else {
      const collection = currentSection === "team" ? "team" : currentSection;
      const labels = { projects: "proyek", services: "layanan", team: "anggota tim" };
      contentArea.innerHTML = `<div class="content-section">${collection === "projects" ? renderProjectTable(data.projects) : renderRecords(collection)}</div>`;
      document.querySelector("#create-project-button").textContent = `＋  Tambah ${labels[collection]}`;
    }
    updateChrome();
    if (contentArea.querySelector("[data-project-row]")) applyProjectFilters();
  };

  const editorFieldMarkup = (collection, item) => {
    if (collection === "projects") {
      return `${field("Judul proyek", "title", item?.title, { required: true })}
        ${field("Kategori", "category", item?.category, { required: true })}
        ${field("Tahun", "year", item?.year, { maxLength: 20 })}
        <label class="field">Jenis media<select name="mediaType"><option value="image" ${item?.mediaType !== "video" ? "selected" : ""}>Foto</option><option value="video" ${item?.mediaType === "video" ? "selected" : ""}>Video</option></select></label>
        <label class="field">Status<select name="status"><option value="draft" ${item?.status !== "published" ? "selected" : ""}>Draf</option><option value="published" ${item?.status === "published" ? "selected" : ""}>Terbit</option></select></label>
        ${field("Urutan", "sortOrder", item?.sortOrder ?? data.projects.length, { type: "number", required: true })}
        ${field("Deskripsi", "description", item?.description, { type: "textarea", full: true })}
        ${field("Foto / video", "mediaFile", "", { type: "file", full: true, accept: "image/jpeg,image/png,image/webp,video/mp4,video/webm", help: item?.mediaPath ? `File saat ini: ${escapeHtml(item.mediaPath)}. Pilih file hanya jika ingin menggantinya.` : "JPEG, PNG, WebP, MP4, atau WebM. Foto maks. 10 MB; video maks. 50 MB." })}
        ${field("Tampilkan sebagai proyek unggulan di Home", "featured", item?.featured || false, { type: "checkbox", full: true })}`;
    }
    if (collection === "services") {
      return `${field("Nama layanan", "title", item?.title, { required: true })}
        ${field("Urutan", "sortOrder", item?.sortOrder ?? data.services.length, { type: "number", required: true })}
        ${field("Deskripsi", "description", item?.description, { type: "textarea", required: true, full: true })}
        ${field("Janji layanan", "promise", item?.promise, { full: true })}
        ${field("Tools", "tools", item?.tools, { full: true })}
        ${field("Deliverables (satu per baris)", "deliverables", (item?.deliverables || []).join("\n"), { type: "textarea", full: true })}
        ${field("Tampilkan layanan di website", "enabled", item ? item.enabled : true, { type: "checkbox", full: true })}`;
    }
    return `${field("Nama anggota", "name", item?.name, { required: true })}
      ${field("Peran", "role", item?.role, { required: true })}
      ${field("Spesialisasi", "specialty", item?.specialty)}
      ${field("Urutan", "sortOrder", item?.sortOrder ?? data.team.length, { type: "number", required: true })}
      ${field("Bio", "bio", item?.bio, { type: "textarea", full: true })}
      ${field("Foto profil", "mediaFile", "", { type: "file", full: true, accept: "image/jpeg,image/png,image/webp", help: item?.photoPath ? `Foto saat ini: ${escapeHtml(item.photoPath)}. JPEG, PNG, atau WebP maks. 10 MB.` : "JPEG, PNG, atau WebP maks. 10 MB." })}`;
  };

  const openEditor = (collection, id = "") => {
    const item = id ? data[collection].find((entry) => entry.id === id) : null;
    if (id && !item) {
      showToast("Konten tidak ditemukan. Muat ulang dan coba lagi.", true);
      return;
    }
    editing = { collection, id };
    const names = { projects: "Proyek", services: "Layanan", team: "Anggota tim" };
    document.querySelector("#dialog-eyebrow").textContent = id ? `Edit ${names[collection]}` : `Tambah ${names[collection]}`;
    document.querySelector("#dialog-title").textContent = id ? (collection === "team" ? item.name : item.title) : `Buat ${names[collection].toLowerCase()}`;
    document.querySelector("#dialog-fields").innerHTML = editorFieldMarkup(collection, item);
    document.querySelector("#editor-error").textContent = "";
    editor.showModal();
  };

  const parseLines = (text, label, minimumParts, maximumParts) => text.split("\n").map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (!line.trim()) return null;
    if (parts.length < minimumParts || parts.length > maximumParts || parts.some((part) => !part)) {
      throw new Error(`${label}, baris ${index + 1}: gunakan format ${minimumParts === 2 ? "Nama | nilai" : "Nama | Deskripsi | nilai"}.`);
    }
    return parts;
  }).filter(Boolean);

  const submitContentForm = async (form) => {
    const section = form.dataset.contentForm;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    let content;
    if (section === "home") {
      content = {
        title: formData.get("title"),
        subtitle: formData.get("subtitle"),
        description: formData.get("description"),
        ctaText: formData.get("ctaText"),
        ctaHref: formData.get("ctaHref"),
        stats: parseLines(formData.get("statsText"), "Statistik", 2, 2).map(([value, label]) => ({ value, label })),
      };
    } else if (section === "about") {
      content = {
        title: formData.get("title"),
        subtitle: formData.get("subtitle"),
        bio: formData.get("bio"),
        experience: formData.get("experience"),
        skills: parseLines(formData.get("skillsText"), "Keahlian", 3, 3).map(([name, description, percent]) => ({
          name,
          description,
          percent: Number(percent),
        })),
      };
    } else {
      const socials = parseLines(formData.get("socialsText"), "Tautan sosial", 2, 2).map(([name, url]) => ({ name, url }));
      content = { ...data.settings, contactEmail: formData.get("contactEmail"), socials };
      const logo = formData.get("logoFile");
      if (logo?.size) content.logoFile = logo;
    }

    let options;
    if (section === "settings" && content.logoFile) {
      const upload = new FormData();
      for (const [key, value] of Object.entries(content)) {
        upload.set(key, key === "socials" ? JSON.stringify(value) : value);
      }
      options = { method: "PUT", body: upload };
    } else {
      options = { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) };
    }
    const result = await request(`/api/admin/content/${section}`, options);
    data = result.data;
    updateChrome();
    render();
    showToast("Perubahan berhasil disimpan dan diterbitkan.");
  };

  const submitEditor = async (event) => {
    event.preventDefault();
    if (!editorForm.reportValidity()) return;
    const error = document.querySelector("#editor-error");
    error.textContent = "";
    const formData = new FormData(editorForm);
    const record = Object.fromEntries(formData.entries());
    if (editing.collection === "projects") {
      record.featured = formData.get("featured") === "on";
    } else if (editing.collection === "services") {
      record.enabled = formData.get("enabled") === "on";
      record.deliverables = formData.get("deliverables").split("\n").map((item) => item.trim()).filter(Boolean);
    }
    if (record.mediaFile instanceof File && record.mediaFile.size === 0) delete record.mediaFile;
    const hasFile = record.mediaFile instanceof File;
    const options = hasFile
      ? { method: editing.id ? "PUT" : "POST", body: formData }
      : { method: editing.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) };

    try {
      const url = `/api/admin/${editing.collection}${editing.id ? `/${encodeURIComponent(editing.id)}` : ""}`;
      const result = await request(url, options);
      data = result.data;
      editor.close();
      updateChrome();
      render();
      showToast(editing.id ? "Perubahan berhasil disimpan." : "Konten berhasil ditambahkan.");
    } catch (submitError) {
      error.textContent = submitError.message;
    }
  };

  const deleteRecord = async (collection, id) => {
    const item = data[collection].find((entry) => entry.id === id);
    const title = collection === "team" ? item?.name : item?.title;
    if (!item || !window.confirm(`Hapus "${title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const result = await request(`/api/admin/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
      data = result.data;
      updateChrome();
      render();
      showToast("Konten berhasil dihapus.");
    } catch (error) {
      showToast(error.message, true);
    }
  };

  const updateProjectStatus = async (id, status) => {
    const project = data.projects.find((item) => item.id === id);
    if (!project) return;
    try {
      const result = await request(`/api/admin/projects/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...project, status }),
      });
      data = result.data;
      updateChrome();
      render();
      showToast(status === "published" ? "Proyek diterbitkan di website." : "Proyek disimpan sebagai draf.");
    } catch (error) {
      showToast(error.message, true);
      await refresh();
    }
  };

  const applyProjectFilters = () => {
    const search = contentArea.querySelector("[data-project-search]")?.value.trim().toLowerCase() || "";
    const category = contentArea.querySelector("[data-project-category]")?.value || "all";
    const media = contentArea.querySelector("[data-project-media]")?.value || "all";
    let count = 0;
    contentArea.querySelectorAll("[data-project-row]").forEach((row) => {
      const project = data.projects.find((item) => item.id === row.dataset.projectRow);
      const visible = project &&
        (activeProjectStatus === "all" || project.status === activeProjectStatus) &&
        (category === "all" || project.category === category) &&
        (media === "all" || project.mediaType === media) &&
        (!search || `${project.title} ${project.category}`.toLowerCase().includes(search));
      row.hidden = !visible;
      if (visible) count += 1;
    });
    const countNode = contentArea.querySelector("[data-project-count]");
    if (countNode) countNode.textContent = `Menampilkan ${count} dari ${data.projects.length} proyek`;
  };

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-cancel-content]")) {
      render();
      return;
    }
    const sectionButton = event.target.closest("[data-section]");
    if (sectionButton) {
      const section = sectionButton.dataset.section;
      if (sectionNames[section]) {
        updateLocation(section);
        return;
      }
    }
    const createButton = event.target.closest("#create-project-button, [data-action='new-project']");
    if (createButton) {
      openEditor(currentSection === "services" || currentSection === "team" ? currentSection : "projects");
      return;
    }
    const action = event.target.closest("[data-action]");
    if (action?.dataset.action === "edit-draft") {
      const draft = data.projects.find((item) => item.status === "draft");
      if (draft) openEditor("projects", draft.id);
    }
    const editButton = event.target.closest("[data-edit-collection]");
    if (editButton) openEditor(editButton.dataset.editCollection, editButton.dataset.editId);
    const deleteButton = event.target.closest("[data-delete-collection]");
    if (deleteButton) await deleteRecord(deleteButton.dataset.deleteCollection, deleteButton.dataset.deleteId);
    const publishButton = event.target.closest("[data-publish-id]");
    if (publishButton) await updateProjectStatus(publishButton.dataset.publishId, "published");
    const statusTab = event.target.closest("[data-project-status]");
    if (statusTab) {
      activeProjectStatus = statusTab.dataset.projectStatus;
      render();
      applyProjectFilters();
    }
    const selectAll = event.target.closest("[data-select-all]");
    if (selectAll) contentArea.querySelectorAll("[data-select-project]").forEach((input) => { input.checked = selectAll.checked; });
  });

  contentArea.addEventListener("input", (event) => {
    if (event.target.matches("[data-project-search]")) applyProjectFilters();
  });

  contentArea.addEventListener("change", async (event) => {
    if (event.target.matches("[data-project-category], [data-project-media]")) applyProjectFilters();
    if (event.target.matches("[data-status-id]")) await updateProjectStatus(event.target.dataset.statusId, event.target.value);
  });

  contentRoot.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-content-form]")) return;
    event.preventDefault();
    try {
      await submitContentForm(event.target);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  editorForm.addEventListener("submit", submitEditor);
  document.querySelectorAll(".dialog-close, .dialog-cancel").forEach((button) => {
    button.addEventListener("click", () => editor.close());
  });
  editor.addEventListener("click", (event) => {
    if (event.target === editor) editor.close();
  });

  document.querySelector(".logout-button").addEventListener("click", async () => {
    try {
      await request("/api/logout", { method: "POST" });
      window.location.assign("/admin/login");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  refresh().catch((error) => showToast(error.message, true));
}
