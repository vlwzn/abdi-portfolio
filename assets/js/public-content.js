const escapeContent = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const categorySlug = (category) => {
  const known = {
    "Graphic Design": "graphic-design",
    "Motion Graphic": "motion-graphic",
    "Video Editing": "video-editing",
  };
  return known[category] || category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

const makeProjectMedia = (project, className = "") => {
  const source = escapeContent(project.mediaPath || "");
  const title = escapeContent(project.title);
  const isVideoFile = project.mediaType === "video" && /\.(mp4|webm)$/i.test(project.mediaPath || "");
  return isVideoFile
    ? `<video class="${className}" src="${source}" aria-label="${title}" muted playsinline controls preload="metadata"></video>`
    : `<img class="${className}" src="${source}" alt="${title}" loading="lazy">`;
};

const updateLogo = (path) => {
  if (!path) return;
  document.querySelectorAll('img[src*="logo-white.svg"], img[src*="logo-black.svg"], img[data-site-logo]').forEach((image) => {
    image.src = path;
  });
  document.querySelectorAll(".services-topbar .brand, .services-footer .brand").forEach((brand) => {
    const image = document.createElement("img");
    image.src = path;
    image.alt = "";
    image.width = 38;
    image.height = 49;
    brand.replaceChildren(image);
  });
};

const updateContact = (settings) => {
  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    const oldHref = link.getAttribute("href") || "";
    const subject = oldHref.includes("?") ? oldHref.slice(oldHref.indexOf("?")) : "";
    link.href = `mailto:${settings.contactEmail}${subject}`;
    if (link.textContent.trim().includes("@")) link.textContent = link.textContent.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, settings.contactEmail);
  });
  document.querySelectorAll("nav.social-links, .site-footer nav.social-links, .work-footer .social-links").forEach((navigation) => {
    navigation.innerHTML = settings.socials.map((social) => {
      const external = social.url !== "#";
      return `<a href="${escapeContent(social.url)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${escapeContent(social.name)}</a>`;
    }).join("");
  });
};

const updateHome = ({ home, projects }) => {
  if (!document.body.classList.contains("home-page") && !document.querySelector(".hero-copy")) return;
  const title = document.querySelector(".hero-copy h1");
  if (title) {
    const subtitle = document.createElement("span");
    subtitle.textContent = home.subtitle;
    title.replaceChildren(document.createTextNode(home.title), subtitle);
  }
  const description = document.querySelector(".hero-copy > p");
  if (description) description.textContent = home.description;
  const cta = document.querySelector(".hero-actions .primary");
  if (cta) {
    cta.textContent = home.ctaText;
    cta.href = home.ctaHref;
  }
  const stats = document.querySelector(".stats-row");
  if (stats) {
    stats.innerHTML = home.stats.map((item) =>
      `<div class="stat"><strong>${escapeContent(item.value)}</strong><span>${escapeContent(item.label)}</span></div>`,
    ).join("");
  }
  const grid = document.querySelector(".project-grid");
  if (grid) {
    grid.innerHTML = projects.filter((project) => project.featured).map((project, index) =>
      `<article class="project-card card-${index + 1}" data-project-id="${escapeContent(project.id)}">
        ${makeProjectMedia(project, "home-project-media")}
        <span class="chip">${escapeContent(project.category)}</span>
        <div class="project-meta"><h3>${escapeContent(project.title)}</h3><span>${escapeContent(project.year)}</span></div>
      </article>`,
    ).join("");
  }
};

const updateAbout = ({ about }) => {
  if (!document.body.classList.contains("about-page")) return;
  const heading = document.querySelector(".about-intro h1");
  if (heading) {
    const subtitle = document.createElement("span");
    subtitle.textContent = about.subtitle;
    heading.replaceChildren(document.createTextNode(about.title), subtitle);
  }
  const introduction = document.querySelector(".about-intro-description");
  if (introduction) introduction.textContent = about.bio;
  const bio = document.querySelector(".personal-story > p:not(.eyebrow)");
  if (bio) bio.textContent = about.bio;
  const experience = document.querySelector(".experience-intro > p:last-child");
  if (experience) experience.textContent = about.experience;
  const skills = document.querySelector(".software-skills");
  if (skills) {
    skills.innerHTML = about.skills.map((skill) =>
      `<div class="software-skill"><div class="skill-information"><div><p class="skill-name">${escapeContent(skill.name)}</p><p class="skill-description">${escapeContent(skill.description)}</p></div><span>${skill.percent}%</span></div><div class="skill-track" role="meter" aria-label="${escapeContent(skill.name)} proficiency" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${skill.percent}"><span class="skill-level is-visible" style="--skill-level:${skill.percent}%"></span></div></div>`,
    ).join("");
  }
};

const updateWork = ({ projects }) => {
  if (!document.body.classList.contains("work-page")) return;
  const featured = document.querySelector(".featured-projects");
  const more = document.querySelector(".more-projects");
  const filterList = document.querySelector(".filter-list");
  if (!featured || !more) return;
  if (filterList) {
    const categories = [...new Set(projects.map((project) => project.category))];
    filterList.innerHTML = `<button class="filter-button is-active" type="button" data-filter="all" aria-pressed="true">All Work (${projects.length})</button>${categories.map((category) => {
      const slug = categorySlug(category);
      const count = projects.filter((project) => project.category === category).length;
      return `<button class="filter-button" type="button" data-filter="${escapeContent(slug)}" aria-pressed="false">${escapeContent(category)} (${count})</button>`;
    }).join("")}`;
  }
  const renderCard = (project) =>
    `<article class="project-card" data-category="${escapeContent(categorySlug(project.category))}" data-project-id="${escapeContent(project.id)}">
      <div class="project-artwork">${makeProjectMedia(project, "")}<span class="project-badge">${escapeContent(project.category)}</span></div>
      <div class="project-information"><div class="project-title-row"><h2>${escapeContent(project.title)}</h2><span aria-hidden="true">↗</span></div><p>${escapeContent(project.description)}</p><time datetime="${escapeContent(project.year)}">${escapeContent(project.year)}</time></div>
    </article>`;
  featured.innerHTML = projects.slice(0, 2).map(renderCard).join("");
  more.innerHTML = projects.slice(2).map(renderCard).join("");
  const count = document.querySelector(".project-count");
  if (count) count.textContent = `${String(projects.length).padStart(2, "0")} ${projects.length === 1 ? "project" : "projects"} · ${projects.map((project) => project.year).filter(Boolean).sort().at(-1) || ""}${projects.length ? `–${projects.map((project) => project.year).filter(Boolean).sort()[0]}` : ""}`;
};

const updateServices = ({ services }) => {
  if (!document.body.classList.contains("services-page")) return;
  const index = document.querySelector(".service-index");
  const list = document.querySelector(".service-list");
  if (!index || !list) return;
  const serviceId = (service) => `service-${service.id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  index.innerHTML = services.map((service, position) =>
    `<a href="#${serviceId(service)}"><span>${String(position + 1).padStart(2, "0")}</span>${escapeContent(service.title)} ↓</a>`,
  ).join("");
  list.innerHTML = services.map((service, position) =>
    `<article class="service-detail" id="${serviceId(service)}" aria-labelledby="${serviceId(service)}-title">
      <div class="service-identity"><span class="service-number">${String(position + 1).padStart(2, "0")}</span><span class="service-icon" aria-hidden="true">${escapeContent(service.title.slice(0, 1))}</span></div>
      <div class="service-description"><h2 id="${serviceId(service)}-title">${escapeContent(service.title)}</h2><p>${escapeContent(service.description)}</p><p class="service-promise">${escapeContent(service.promise)}</p><p class="service-tools">${escapeContent(service.tools)}</p></div>
      <div class="service-deliverables"><p class="deliverables-label">What I can help with</p><ul>${service.deliverables.map((deliverable) => `<li>${escapeContent(deliverable)}</li>`).join("")}</ul><a href="mailto:hello@abdi.design?subject=${encodeURIComponent(`${service.title} Project`)}">Discuss your project →</a></div>
    </article>`,
  ).join("");
};

const updateTeam = ({ team }) => {
  if (!document.body.classList.contains("team-page")) return;
  const grid = document.querySelector(".member-grid");
  if (!grid) return;
  grid.innerHTML = team.map((member, index) =>
    `<article class="member-card is-visible"><div class="member-portrait"><div class="portrait-meta"><span>Portrait</span><span>${String(index + 1).padStart(2, "0")}</span></div>${member.photoPath ? `<img class="profile-photo" src="${escapeContent(member.photoPath)}" alt="${escapeContent(member.name)}" loading="lazy">` : ""}<span class="member-specialty">${escapeContent(member.specialty)}</span></div><div class="member-details"><h3>${escapeContent(member.name)}</h3><p class="member-role">${escapeContent(member.role)}</p><p class="member-bio">${escapeContent(member.bio)}</p></div></article>`,
  ).join("");
};

const updatePublicSite = async () => {
  try {
    const response = await fetch("/api/public", { cache: "no-store" });
    if (!response.ok) throw new Error(`Content could not be refreshed (HTTP ${response.status}).`);
    const content = await response.json();
    updateLogo(content.settings.logoPath);
    updateContact(content.settings);
    updateHome(content);
    updateAbout(content);
    updateWork(content);
    updateServices(content);
    updateTeam(content);
    document.dispatchEvent(new CustomEvent("site:content-ready", { detail: content }));
  } catch (error) {
    console.error("Unable to load published CMS content.", error);
  }
};

updatePublicSite();
