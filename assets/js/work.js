document.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-button");
  if (!button) return;

  const selectedFilter = button.dataset.filter;
  document.querySelectorAll(".filter-button").forEach((filterButton) => {
    const isSelected = filterButton === button;
    filterButton.classList.toggle("is-active", isSelected);
    filterButton.setAttribute("aria-pressed", String(isSelected));
  });

  const cards = [...document.querySelectorAll(".work-page .project-card")];
  let shown = 0;
  cards.forEach((card) => {
    const isVisible = selectedFilter === "all" || card.dataset.category === selectedFilter;
    card.hidden = !isVisible;
    if (isVisible) shown += 1;
  });
  const count = document.querySelector(".project-count");
  if (count) count.textContent = `${String(shown).padStart(2, "0")} ${shown === 1 ? "project" : "projects"}`;
});
