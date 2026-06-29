// Funções utilitárias

export function fmt(valor) {
  return "MT " + Number(valor).toLocaleString("pt-MZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function getExpirationStatus(dateStr) {
  if (!dateStr) return { color: "green", days: 999, text: "Sem validade" };
  const val = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  val.setHours(0, 0, 0, 0);

  const diffTime = val - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { color: "red", days: diffDays, text: "Produto vencido" };
  if (diffDays <= 30) return { color: "amber", days: diffDays, text: "Produto próximo da validade" };
  return { color: "green", days: diffDays, text: "Produto dentro do prazo" };
}

export function getExpirationBadge(dateStr) {
  const status = getExpirationStatus(dateStr);
  if (!dateStr) return "";
  return `<span class="badge ${status.color}">${status.text} (${status.days} dias)</span>`;
}

export function debounce(func, wait) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

export function destroyCharts(charts) {
  Object.values(charts).forEach((c) => {
    try {
      c.destroy();
    } catch (e) {}
  });
  return {};
}

export function getRandomHour(index) {
  const horas = ["09:12", "10:35", "11:20", "13:45", "15:02", "16:30"];
  return horas[index] || "—";
}

export function formatDate(date) {
  return date.toISOString().split("T")[0];
}