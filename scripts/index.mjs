import { StarworldCharacterSheet } from "./StarworldCharacterSheet.mjs";
import { StarworldNPCSheet }       from "./StarworldNPCSheet.mjs";
import { initThemeEngine }         from "./theme.mjs";

Hooks.once("init", () => {
  const { DocumentSheetConfig } = foundry.applications.apps;

  // 玩家角色卡
  DocumentSheetConfig.registerSheet(Actor, "starworld-sheet", StarworldCharacterSheet, {
    types: ["character"], makeDefault: false, label: "星界旅者角色卡",
  });

  // C: NPC 角色卡
  DocumentSheetConfig.registerSheet(Actor, "starworld-sheet", StarworldNPCSheet, {
    types: ["npc"], makeDefault: false, label: "星界旅者 NPC 卡",
  });

  // Handlebars helpers
  Handlebars.registerHelper("percent", (v, m) => m > 0 ? Math.round((v/m)*100) : 0);
  Handlebars.registerHelper("gte",    (a, b) => a >= b);
  Handlebars.registerHelper("gt",     (a, b) => a > b);
  Handlebars.registerHelper("eq",     (a, b) => a === b);
  Handlebars.registerHelper("ne",     (a, b) => a !== b);
  Handlebars.registerHelper("array",  (...args) => args.slice(0, -1));
  Handlebars.registerHelper("hash",   (opts) => opts.hash);
  Handlebars.registerHelper("lookup", (obj, key) => obj?.[key]);

  console.log("⭐ 星界旅者角色卡 v0.5 | 已加载");
});

// D: 全局主题引擎在 ready 后启动（DOM 已就绪）
Hooks.once("ready", () => initThemeEngine());
