const filterButtons = document.querySelectorAll(".filter-button");
const projectCards = document.querySelectorAll(".project-card");
const projectCount = document.querySelector(".project-count");

const projectCounts = {
  all: "05 projects · 2023–2024",
  "graphic-design": "02 projects · 2023–2024",
  "motion-graphic": "02 projects · 2023–2024",
  "video-editing": "01 project · 2023",
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedFilter = button.dataset.filter;

    filterButtons.forEach((filterButton) => {
      const isSelected = filterButton === button;
      filterButton.classList.toggle("is-active", isSelected);
      filterButton.setAttribute("aria-pressed", String(isSelected));
    });

    projectCards.forEach((card) => {
      card.hidden = selectedFilter !== "all" && card.dataset.category !== selectedFilter;
    });

    projectCount.textContent = projectCounts[selectedFilter];
  });
});
