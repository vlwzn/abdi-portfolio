const observeTeamCards = () => {
  const memberCards = document.querySelectorAll(".member-card:not(.is-visible)");
  if (!memberCards.length) return;

  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("has-js");
    const memberObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    memberCards.forEach((card) => memberObserver.observe(card));
  } else {
    memberCards.forEach((card) => card.classList.add("is-visible"));
  }
};

observeTeamCards();
document.addEventListener("site:content-ready", observeTeamCards);
