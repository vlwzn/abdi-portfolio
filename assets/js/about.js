const aboutPage = document.querySelector(".about-page");
const skillLevels = document.querySelectorAll(".skill-level");

if (aboutPage && skillLevels.length > 0) {
  aboutPage.classList.add("has-js");

  if ("IntersectionObserver" in window) {
    const skillObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 },
    );

    skillLevels.forEach((skillLevel) => skillObserver.observe(skillLevel));
  } else {
    skillLevels.forEach((skillLevel) => skillLevel.classList.add("is-visible"));
  }
}
