class Theme {
  isDark = $state(false);

  chartColors() {
    return {
      grid: this.isDark ? "#1e2433" : "#d8dff0",
      tick: this.isDark ? "#a0aec0" : "#3d4f7a",
      legend: this.isDark ? "#b0bcd0" : "#3d4f7a",
      tooltipBg: this.isDark ? "#0f1219" : "#1e293b",
      tooltipBorder: this.isDark ? "#2d3548" : "#334155",
      tooltipTitle: this.isDark ? "#8892a8" : "#64748b",
      tooltipBody: this.isDark ? "#eef2f6" : "#f8fafc",
    };
  }
}

export const theme = new Theme();
