// Reads the user's preferences, filters the catalog, and shows a random pick.

function getPreferences() {
  const diet = document.querySelector('input[name="diet"]:checked').value;
  const adventure = document.querySelector('input[name="adventure"]:checked').value;
  const styles = Array.from(document.querySelectorAll('input[name="style"]:checked')).map(
    (el) => el.value
  );
  return { diet, adventure, styles };
}

function matches(item, prefs) {
  if (!prefs.styles.includes(item.style)) return false;
  // "Anything" accepts all diets; "cooked" also allows vegetarian items,
  // since the constraint is really "no raw fish".
  if (prefs.diet === "cooked" && item.diet === "raw") return false;
  if (prefs.diet === "vegetarian" && item.diet !== "vegetarian") return false;
  // Classic eaters only see classics; adventurous eaters see everything.
  if (prefs.adventure === "classic" && item.adventure !== "classic") return false;
  return true;
}

function pickSushi() {
  const prefs = getPreferences();
  const candidates = SUSHI.filter((item) => matches(item, prefs));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function render(pick) {
  const result = document.getElementById("result");
  result.classList.remove("hidden");
  if (!pick) {
    result.innerHTML = `<p class="empty">No sushi matches those preferences — try loosening a filter.</p>`;
    return;
  }
  result.innerHTML = `
    <h2>${pick.name}</h2>
    <p class="meta">${pick.style} · ${pick.diet}</p>
    <p>${pick.description}</p>
  `;
}

document.getElementById("select-btn").addEventListener("click", () => {
  render(pickSushi());
});
