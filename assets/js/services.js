const observeServices = () => {
  const serviceLinks = document.querySelectorAll(".service-index a");
  const serviceSections = document.querySelectorAll(".service-detail");
  if (!("IntersectionObserver" in window) || !serviceLinks.length || !serviceSections.length) return;

  const serviceObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        serviceLinks.forEach((link) => {
          const isCurrent = link.hash === `#${entry.target.id}`;
          link.classList.toggle("is-current", isCurrent);
          if (isCurrent) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-25% 0px -55% 0px" },
  );
  serviceSections.forEach((section) => serviceObserver.observe(section));
};

observeServices();
document.addEventListener("site:content-ready", observeServices);
