export function applyTheme(theme) {
  if (theme === "claro") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
  localStorage.setItem("biz_theme", theme);
}

export function applySystemBackground(imageUrl) {
  let bgEl = document.getElementById("system-background-layer");
  if (!bgEl) {
    bgEl = document.createElement("div");
    bgEl.id = "system-background-layer";
    document.body.prepend(bgEl);
  }

  if (imageUrl) {
    bgEl.style.backgroundImage = `url(${imageUrl})`;
    bgEl.classList.add("active");
    document.body.classList.add("has-custom-bg");
  } else {
    bgEl.style.backgroundImage = "";
    bgEl.classList.remove("active");
    document.body.classList.remove("has-custom-bg");
  }
}

export function initTheme() {
  const savedTheme = localStorage.getItem("biz_theme") || "escuro";
  applyTheme(savedTheme);
  return savedTheme;
}

window.applySystemBackground = applySystemBackground;
