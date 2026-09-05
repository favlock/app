// Apply the browser preference before styles paint, without waiting for React.
(() => {
  let appearance = "auto";
  try {
    appearance = localStorage.getItem("favlock.appearance") || "auto";
  } catch {
    // Storage restrictions should not prevent the app from loading.
  }
  const dark = appearance === "dark" ||
    (appearance !== "light" && appearance !== "dark" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.appearance = dark ? "dark" : "light";
})();
