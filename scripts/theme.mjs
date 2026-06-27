/**
 * D: 全局 UI 主题引擎
 * 通过 Hook 劫持 FVTT 原生渲染，将星界旅者风格注入侧边栏、聊天消息、骰点卡
 */
export function initThemeEngine() {
  // 注入根 CSS 变量到 body（比 :root 优先级高，可覆盖系统默认）
  const root = document.documentElement;
  const vars = {
    "--color-shadow-primary":     "rgba(201,168,76,0.35)",
    "--color-border-highlight":   "#c9a84c",
    "--color-text-dark-heading":  "#e8eaf6",
    "--color-text-dark-primary":  "#c9b99a",
    "--sidebar-width":            "300px",
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

  // 聊天消息卡：骰点结果高亮
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.classList.add("sw-chat-msg");
    // 高亮 20 和 1
    html.querySelectorAll(".dice-total").forEach(el => {
      const v = parseInt(el.textContent);
      if (v === 20) el.classList.add("sw-crit");
      if (v === 1)  el.classList.add("sw-fumble");
    });
  });

  // 侧边栏目录：加星界旅者金色滚动条主题
  Hooks.on("renderActorDirectory", (app, html) => {
    html.classList.add("sw-directory");
  });

  // 战斗追踪器：当前行高亮
  Hooks.on("renderCombatTracker", (app, html) => {
    html.classList.add("sw-combat");
  });
}
