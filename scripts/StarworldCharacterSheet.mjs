const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class StarworldCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static #packCache = {};
  _prevHp = null;

  static #SPELL_LEVEL_ZH = ["戏法","一环","二环","三环","四环","五环","六环","七环","八环","九环"];
  static async #getItemOptions(type) {
    if (StarworldCharacterSheet.#packCache[type]) return StarworldCharacterSheet.#packCache[type];
    const results = [];
    for (const pack of game.packs ?? []) {
      if (pack.metadata.type !== "Item") continue;
      try {
        const index = await pack.getIndex({ fields: ["img", "type"] });
        for (const e of index) {
          if (e.type === type) results.push({ uuid: e.uuid, name: e.name, img: e.img ?? "icons/svg/item-bag.svg" });
        }
      } catch { /* skip locked packs */ }
    }
    for (const item of game.items ?? []) {
      if (item.type === type) results.push({ uuid: item.uuid, name: item.name, img: item.img ?? "icons/svg/item-bag.svg" });
    }
    StarworldCharacterSheet.#packCache[type] = results;
    return results;
  }

  static async #getSpellOptions(actor) {
    const cls = actor.items.find(i => i.type === "class");
    if (!cls) return [];
    const identifier = cls.system?.identifier ?? cls.name.toLowerCase().replace(/\s+/g, "-");

    const sysSpells = actor.system.spells ?? {};
    let maxLevel = 0;
    for (let l = 1; l <= 9; l++) {
      if ((sysSpells[`spell${l}`]?.max ?? 0) > 0) maxLevel = l;
    }
    if (maxLevel === 0) {
      const clsLvl = cls.system?.levels ?? 1;
      // standard D&D 5e spell level by class level table (half-caster rounds down, full-caster)
      maxLevel = Math.min(9, Math.ceil(clsLvl / 2));
      if (maxLevel === 0) maxLevel = 1;
    }

    const cacheKey = `spells_${identifier}_${maxLevel}`;
    if (StarworldCharacterSheet.#packCache[cacheKey]) return StarworldCharacterSheet.#packCache[cacheKey];

    const results = [];

    // dnd5e 5.x：尝试从职业的 spellList JournalPage 获取精确 UUID 集合
    let allowedUUIDs = null;
    const spellListUUID = cls.system?.spellcasting?.spellList;
    if (spellListUUID) {
      try {
        const page = await fromUuid(spellListUUID);
        const uuids = page?.system?.spells;
        if (Array.isArray(uuids) && uuids.length) allowedUUIDs = new Set(uuids);
      } catch { /* ignore */ }
    }

    for (const pack of game.packs ?? []) {
      if (pack.metadata.type !== "Item") continue;
      if (pack.metadata.packageName !== "dnd5e") continue; // 只用 SRD 5.2 官方包
      try {
        const index = await pack.getIndex({ fields: ["img", "type", "system.level", "system.sourceClasses"] });
        for (const e of index) {
          if (e.type !== "spell") continue;
          const lvl = e.system?.level ?? 0;
          if (lvl > maxLevel) continue;
          if (allowedUUIDs) {
            if (!allowedUUIDs.has(e.uuid)) continue;
          } else {
            const sc = e.system?.sourceClasses;
            // sourceClasses 过滤：有字段时匹配，无字段（index未携带）时放行
            if (sc && typeof sc === "object" && Object.keys(sc).length > 0 && !sc[identifier]) continue;
          }
          results.push({ uuid: e.uuid, name: e.name, img: e.img ?? "icons/svg/magic-swirls.svg", level: lvl });
        }
      } catch { /* skip locked packs */ }
    }
    results.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    StarworldCharacterSheet.#packCache[cacheKey] = results;
    return results;
  }

  static DEFAULT_OPTIONS = {
    classes: ["starworld-sheet"],
    position: { width: 880, height: 760 },
    window: { resizable: true, minimizable: true },
    form: { submitOnChange: true },
    actions: {
      selectRace:       StarworldCharacterSheet.#onSelectRace,
      selectBackground: StarworldCharacterSheet.#onSelectBackground,
      selectClass:      StarworldCharacterSheet.#onSelectClass,
      addSpell:         StarworldCharacterSheet.#onAddSpell,
      toggleSpellPrepared: StarworldCharacterSheet.#onToggleSpellPrepared,
      rollTool:         StarworldCharacterSheet.#onRollTool,
      rollAbility:  StarworldCharacterSheet.#onRollAbility,
      rollSkill:    StarworldCharacterSheet.#onRollSkill,
      rollSave:     StarworldCharacterSheet.#onRollSave,
      rollDeath:    StarworldCharacterSheet.#onRollDeath,
      itemAction:   StarworldCharacterSheet.#onItemAction,
      toggleDetail: StarworldCharacterSheet.#onToggleDetail,
      changeTab:    StarworldCharacterSheet.#onChangeTab,
      toggleEdit:   StarworldCharacterSheet.#onToggleEdit,
      toggleInspiration: StarworldCharacterSheet.#onToggleInspiration,
      shortRest:         StarworldCharacterSheet.#onShortRest,
      longRest:          StarworldCharacterSheet.#onLongRest,
      spendSlot:         StarworldCharacterSheet.#onSpendSlot,
      recoverSlot:       StarworldCharacterSheet.#onRecoverSlot,
      useHitDie:         StarworldCharacterSheet.#onUseHitDie,
      cycleSkillProf:    StarworldCharacterSheet.#onCycleSkillProf,
      toggleEquipped:    StarworldCharacterSheet.#onToggleEquipped,
      toggleCondition:   StarworldCharacterSheet.#onToggleCondition,
      toggleDiceDrawer:  StarworldCharacterSheet.#onToggleDiceDrawer,
      levelUpClass:      StarworldCharacterSheet.#onLevelUpClass,
      addMulticlass:     StarworldCharacterSheet.#onAddMulticlass,
      setTheme:          StarworldCharacterSheet.#onSetTheme,
    },
  };

  static PARTS = {
    sheet: { template: "modules/starworld-sheet/templates/character-sheet.hbs" },
  };

  get title() { return `${this.actor.name} — 星界旅者`; }

  /* ─── Static maps ─────────────────────────────────────────────────── */
  static #ABILITY_ZH = {
    str:"力量", dex:"敏捷", con:"体质", int:"智力", wis:"感知", cha:"魅力",
  };
  static #SKILL_ZH = {
    acr:"体操", ani:"驯兽", arc:"奥秘", ath:"运动", dec:"欺骗", his:"历史",
    ins:"洞察", itm:"威吓", inv:"调查", med:"医药", nat:"自然", prc:"察觉",
    prf:"表演", per:"说服", rel:"宗教", slt:"手法", ste:"隐匿", sur:"生存",
  };
  static #CONDITION_ZH = {
    blinded:"目盲", charmed:"魅惑", deafened:"耳聋", exhaustion:"衰竭",
    frightened:"恐惧", grappled:"擒抱", incapacitated:"失能", invisible:"隐形",
    paralyzed:"麻痹", petrified:"石化", poisoned:"中毒", prone:"倒地",
    restrained:"束缚", stunned:"震慑", unconscious:"昏迷",
  };
  static #fmt(v) { return v >= 0 ? `+${v}` : `${v}`; }
  static #previewText(html) {
    return (html ?? "")
      .replace(/@(?:Embed|UUID|Compendium)\[[^\]]+\](?:\{([^}]*)\})?/g, "$1")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  /* ─── Context ─────────────────────────────────────────────────────── */
  async _prepareContext(options) {
    const ctx    = await super._prepareContext(options);
    const actor  = this.actor;
    const system = actor.system;
    const flags  = actor.flags["starworld-sheet"] ?? {};

    // A: 属性值 — 编辑模式下暴露原始值供 input 绑定
    const abilities = Object.entries(system.abilities ?? {}).map(([key, abl]) => {
      const saveNum = typeof abl.save === "object" ? (abl.save?.value ?? 0) : (abl.save ?? 0);
      return {
        key, value: abl.value,
        label: StarworldCharacterSheet.#ABILITY_ZH[key] ?? key,
        mod:   StarworldCharacterSheet.#fmt(abl.mod ?? 0),
        save:  StarworldCharacterSheet.#fmt(saveNum),
        saveProficient: abl.proficient > 0,
      };
    });

    const skills = Object.entries(system.skills ?? {}).map(([key, skl]) => ({
      key, label: StarworldCharacterSheet.#SKILL_ZH[key] ?? key,
      total: StarworldCharacterSheet.#fmt(skl.total ?? 0),
      passive: skl.passive, prof: skl.proficient,
      // prof levels: 0=无 1=熟练 2=专精
      profLabel: skl.proficient >= 2 ? "专" : skl.proficient === 1 ? "熟" : "○",
      ability: skl.ability ?? "dex",
    }));

    const hp = system.attributes?.hp ?? {};

    // B: 死亡豁免
    const death = system.attributes?.death ?? {};
    const isDying = (hp.value ?? 1) <= 0 && (hp.max ?? 0) > 0;
    const deathSuccesses = Array.from({ length: 3 }, (_, i) => i < (death.success ?? 0));
    const deathFailures  = Array.from({ length: 3 }, (_, i) => i < (death.failure ?? 0));

    // B: 条件状态（当前激活 + 全部可用）
    const conditions = [...(actor.statuses ?? [])].map(id => ({
      id,
      label: StarworldCharacterSheet.#CONDITION_ZH[id] ?? id,
      icon: CONFIG.statusEffects?.find(e => e.id === id)?.icon ?? "icons/svg/aura.svg",
    }));
    const allConditions = (CONFIG.statusEffects ?? [])
      .filter(e => e.id && !["dead","target"].includes(e.id))
      .map(e => ({
        id: e.id,
        label: StarworldCharacterSheet.#CONDITION_ZH[e.id] ?? e.label ?? e.id,
        icon: e.icon ?? "icons/svg/aura.svg",
        active: actor.statuses?.has(e.id) ?? false,
      }));

    const allEquip  = actor.items.filter(i =>
      ["weapon","equipment","consumable","backpack","loot","tool"].includes(i.type)
    ).sort((a,b) => a.sort - b.sort);

    const weapons   = allEquip.filter(i => i.type === "weapon" && !i.system.container);
    const equipment = allEquip.filter(i => i.type !== "weapon"  && !i.system.container);

    // 格子背包：顶层物品（含 backpack），backpack 附含内部物品
    const gridItems = [...weapons, ...equipment].map(i => ({
      id:       i.id,
      name:     i.name,
      img:      i.img ?? "icons/svg/item-bag.svg",
      type:     i.type,
      qty:      i.system.quantity ?? 1,
      equipped: i.system.equipped ?? false,
      isContainer: i.type === "backpack",
      contents: i.type === "backpack"
        ? allEquip.filter(c => c.system.container === i.id).map(c => ({
            id: c.id, name: c.name, img: c.img ?? "icons/svg/item-bag.svg",
            qty: c.system.quantity ?? 1, type: c.type,
          }))
        : [],
    }));

    // 物品分类（物品Tab列表视图）
    const INV_GROUPS = [
      { key: "weapon",     label: "⚔ 武器",   types: ["weapon"] },
      { key: "armor",      label: "🛡 护甲",   types: ["equipment"] },
      { key: "consumable", label: "🧪 消耗品", types: ["consumable"] },
      { key: "tool",       label: "🔧 工具",   types: ["tool"] },
      { key: "container",  label: "🎒 容器",   types: ["backpack"] },
      { key: "loot",       label: "💎 战利品", types: ["loot"] },
    ];
    const invGroups = INV_GROUPS
      .map(g => ({ ...g, items: allEquip.filter(i => g.types.includes(i.type) && !i.system.container) }))
      .filter(g => g.items.length > 0);

    const spells    = actor.items.filter(i => i.type === "spell").sort((a,b) => (a.system.level??0)-(b.system.level??0));
    const features  = actor.items.filter(i => ["feat","race","class","subclass","background"].includes(i.type));

    const FEAT_GROUPS = [
      { type: "class",      label: "⚔ 职业特性" },
      { type: "subclass",   label: "✦ 子职业特性" },
      { type: "race",       label: "🌿 种族特性" },
      { type: "background", label: "📖 背景特性" },
      { type: "feat",       label: "★ 专长" },
    ];
    const featureGroups = FEAT_GROUPS
      .map(g => ({ ...g, items: features.filter(i => i.type === g.type) }))
      .filter(g => g.items.length > 0);

    // F1:
    const spellsByLevel = [];
    for (let lv = 0; lv <= 9; lv++) {
      const group = spells.filter(s => (s.system.level ?? 0) === lv);
      if (group.length) spellsByLevel.push({ level: lv, label: StarworldCharacterSheet.#SPELL_LEVEL_ZH[lv], spells: group });
    }

    // F3: 多职业 — 所有 class 物品
    const classes = actor.items.filter(i => i.type === "class").sort((a,b) => a.sort-b.sort);

    // 模组状态检测
    const modStatus = {
      midi:   !!game.modules?.get("midi-qol")?.active,
      aa:     !!game.modules?.get("autoanimations")?.active,
      cpr:    !!game.modules?.get("chris-premades")?.active,
      seq:    !!game.modules?.get("sequencer")?.active,
    };

    // 特性类型汉化
    const FEATURE_TYPE_ZH = { feat:"专长", race:"种族", class:"职业", subclass:"子职业", background:"背景" };

    // 物品使用次数 Map（itemId -> {value, max}）
    const itemUsesMap = {};
    for (const item of actor.items) {
      const u = item.system?.uses;
      if (u?.max) itemUsesMap[item.id] = { value: u.value ?? 0, max: u.max };
    }

    // 法术准备
    const spellcastingCls = actor.items.find(i => i.type === "class");
    const prepareMode = spellcastingCls?.system?.spellcasting?.preparation?.mode ?? "";
    const alwaysPrepared = ["always","innate","pact","atwill"].includes(prepareMode);
    const maxPrepared = (() => {
      if (alwaysPrepared) return null;
      const intMod = system.abilities?.int?.mod ?? 0;
      const wisMod = system.abilities?.wis?.mod ?? 0;
      const chaMod = system.abilities?.cha?.mod ?? 0;
      const spellAbl = system.attributes?.spellcasting ?? "";
      const ablMod = { int: intMod, wis: wisMod, cha: chaMod }[spellAbl] ?? 0;
      const clsLevel = spellcastingCls?.system?.levels ?? 1;
      return Math.max(1, clsLevel + ablMod);
    })();
    const preparedCount = spells.filter(s => s.system?.preparation?.prepared && s.system?.level > 0).length;

    // 生命骰
    const hitDice = actor.items.filter(i => i.type === "class").map(cls => ({
      id: cls.id, name: cls.name,
      denomination: cls.system?.hitDice ?? "d8",
      available: cls.system?.hitDiceUsed != null
        ? (cls.system.levels ?? 1) - (cls.system.hitDiceUsed ?? 0)
        : (cls.system?.levels ?? 1),
      total: cls.system?.levels ?? 1,
    }));

    // 经验值
    const xpData = system.details?.xp ?? {};
    const xpPct  = xpData.max > 0 ? Math.min(100, Math.round((xpData.value / xpData.max) * 100)) : 0;

    // 法术施法属性（dnd5e 5.x 路径）
    const spellAbility = system.attributes?.spellcasting ?? "";
    const spellDC      = system.attributes?.spelldc ?? system.attributes?.spell?.dc ?? 0;
    const spellAtk     = system.attributes?.spellAtk ?? system.attributes?.spell?.attack ?? null;
    const spellAtkFmt  = spellAtk != null ? StarworldCharacterSheet.#fmt(spellAtk) : null;

    // 衰竭
    const exhaustion = system.attributes?.exhaustion ?? 0;

    // 移动速度（多类型）
    const movement = system.attributes?.movement ?? {};
    const speeds = ["walk","swim","climb","fly","burrow"]
      .filter(k => movement[k] > 0)
      .map(k => ({ key: k, label: { walk:"步行", swim:"游泳", climb:"攀爬", fly:"飞行", burrow:"挖掘" }[k], value: movement[k] }));

    // 熟练项 & 语言 & 抗性
    const traits = system.traits ?? {};
    const languages = traits.languages?.value ? [...traits.languages.value].join("、") : "";
    const armorProf  = traits.armorProf?.value  ? [...traits.armorProf.value].join("、")  : "";
    const weaponProf = traits.weaponProf?.value ? [...traits.weaponProf.value].join("、") : "";
    const toolProf   = traits.toolProf?.value   ? [...traits.toolProf.value].join("、")   : "";
    const dmgResist  = traits.dr?.value   ? [...traits.dr.value].join("、")   : "";
    const dmgImmune  = traits.di?.value   ? [...traits.di.value].join("、")   : "";
    const dmgVuln    = traits.dv?.value   ? [...traits.dv.value].join("、")   : "";
    const condImmune = traits.ci?.value   ? [...traits.ci.value].join("、")   : "";

    // E: 快速武器栏（最多4件）
    const quickWeapons = weapons.slice(0, 4).map(w => ({
      id: w.id, name: w.name, img: w.img,
      dmg: w.system?.damage?.parts?.[0]?.[0] ?? "—",
    }));

    const spellSlots = Object.entries(system.spells ?? {})
      .filter(([k]) => k.startsWith("spell") && !isNaN(k.slice(5)))
      .map(([key, slot]) => ({ key, level: Number(key.slice(5)), value: slot.value, max: slot.max }))
      .filter(s => s.max > 0);

    // 契约法术位（术士）
    const pactSlot = (() => {
      const p = system.spells?.pact;
      if (!p || !p.max) return null;
      return { key: "pact", level: p.level ?? 0, value: p.value ?? 0, max: p.max, isPact: true };
    })();

    // E: 展开状态
    const expandedItems = flags.expandedItems ?? {};

    const isEmpty   = !actor.items.some(i => i.type === "class");
    const editMode  = flags.editMode ?? false;
    const activeTab = flags.activeTab ?? (isEmpty ? "guide" : "skills");

    const raceLabel       = system.details?.race?.name ?? system.details?.race ?? "—";
    const backgroundLabel = system.details?.background?.name ?? system.details?.background ?? "—";
    const classLabel      = actor.items.find(i => i.type === "class")?.name ?? "";

    // ── 种族/背景/职业选项列表（从压缩包索引拉取）
    const [raceOptions, backgroundOptions, classOptions, spellOptions] = await Promise.all([
      StarworldCharacterSheet.#getItemOptions("race"),
      StarworldCharacterSheet.#getItemOptions("background"),
      StarworldCharacterSheet.#getItemOptions("class"),
      StarworldCharacterSheet.#getSpellOptions(actor),
    ]);

    // ── 车卡完成度检测 ──────────────────────────────────────────────
    const abilitySum = Object.values(system.abilities ?? {}).reduce((s, a) => s + (a.value ?? 10), 0);
    const guideChecks = [
      { id: "name",      label: "填写角色名",   done: !!actor.name && !["New Actor","新角色","Actor","角色","新建角色","演员"].includes(actor.name), hint: "在下方输入框填写角色名称" },
      { id: "class",     label: "选择职业",     done: actor.items.some(i => i.type === "class"),                              hint: "从压缩包拖入 Class 物品，系统自动计算 HP 与熟练加值" },
      { id: "abilities", label: "分配属性值",   done: abilitySum !== 60,                                                      hint: "开启 ✏️ 编辑，左侧六维数值变为输入框，填入属性点" },
      { id: "race",      label: "设置种族",     done: raceLabel !== "—",                                                      hint: "在特性标签页拖入 Race 物品，或直接编辑种族字段" },
      { id: "background",label: "设置背景",     done: backgroundLabel !== "—",                                                hint: "在特性标签页拖入 Background 物品" },
      { id: "biography", label: "填写角色描述", done: !!(system.details?.trait || system.details?.ideal || system.details?.bond || system.details?.flaw), hint: "在背景标签页填写性格特征、理想、羁绊或缺陷" },
    ];
    const guideDoneCount = guideChecks.filter(c => c.done).length;
    const guideTotalCount = guideChecks.length;
    const guidePct = Math.round((guideDoneCount / guideTotalCount) * 100);
    const guideComplete = guideDoneCount === guideTotalCount;

    // 引导已获得摘要
    const guideGrants = {
      items: actor.items
        .filter(i => ["weapon","equipment","consumable","tool","loot","container"].includes(i.type))
        .map(i => ({ name: i.name, img: i.img ?? "icons/svg/item-bag.svg", qty: i.system?.quantity ?? 1 })),
      currency: Object.entries(system.currency ?? {}).filter(([,v]) => v > 0).map(([k,v]) => ({ key: k, value: v })),
    };
    const guideHasGrants = guideGrants.items.length > 0 || guideGrants.currency.length > 0;

    // F2: 负重
    const enc = system.attributes?.encumbrance ?? {};
    const encumbrance = enc.max > 0 ? {
      value: Math.round(enc.value ?? 0),
      max:   Math.round(enc.max ?? 0),
      pct:   Math.min(100, Math.round(((enc.value ?? 0) / enc.max) * 100)),
      heavy: (enc.value ?? 0) >= (enc.max ?? Infinity),
    } : null;

    return {
      actor, system, abilities, skills, hp,
      weapons, equipment, spells, spellsByLevel, features, featureGroups, spellSlots, pactSlot, quickWeapons,
      classes, gridItems, invGroups,
      modStatus,
      isDying, deathSuccesses, deathFailures, conditions, allConditions,
      activeTab, isEmpty, editMode, expandedItems,
      guideChecks, guideDoneCount, guideTotalCount, guidePct, guideComplete,
      raceOptions, backgroundOptions, classOptions,
      raceItemImg:       actor.items.find(i => i.type === "race")?.img ?? "",
      backgroundItemImg: actor.items.find(i => i.type === "background")?.img ?? "",
      spellOptions,
      knownSpellNames: Object.fromEntries(spells.map(s => [s.name, true])),
      hasSpellcasting: !!actor.items.find(i => i.type === "class"),
      alwaysPrepared, maxPrepared, preparedCount,
      FEATURE_TYPE_ZH, itemUsesMap,
      proficiencyBonus: system.attributes?.prof ?? 0,
      initiative: system.attributes?.init?.total ?? 0,
      ac: system.attributes?.ac?.value ?? 10,
      speed: system.attributes?.movement?.walk ?? 30,
      level: system.details?.level ?? 1,
      isEditable: this.isEditable,
      canEdit: this.isEditable && editMode,
      tempHp: hp.temp ?? 0,
      inspiration: system.attributes?.inspiration ?? false,
      currency: system.currency ?? {},
      hitDice, xpData, xpPct,
      spellAbility, spellDC, spellAtkFmt,
      exhaustion, speeds,
      languages, armorProf, weaponProf, toolProf, dmgResist, dmgImmune, dmgVuln, condImmune,
      raceLabel, backgroundLabel, classLabel,
      encumbrance,
      guideGrants, guideHasGrants,
    };
  }

  /* ─── Actions ─────────────────────────────────────────────────────── */

  // V3: HP动画 + V4: Tab切换动画 + A2: 快捷栏拖拽初始化
  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    this.#clearPreviewCards();

    // V3: HP 变化闪烁动画
    const curHp = context.hp.value ?? 0;
    if (this._prevHp !== null && this._prevHp !== curHp) {
      const hpEl = el.querySelector(".sw-qs-hp");
      if (hpEl) {
        const cls = curHp < this._prevHp ? "sw-hp-damage" : "sw-hp-heal";
        hpEl.classList.add(cls);
        setTimeout(() => hpEl.classList.remove(cls), 600);
      }
    }
    this._prevHp = curHp;

    // V4: Tab内容区淡入
    const content = el.querySelector(".sw-content");
    if (content) {
      content.classList.remove("sw-tab-in");
      requestAnimationFrame(() => content.classList.add("sw-tab-in"));
    }

    // A1: 恢复主题
    const theme = this.actor.flags["starworld-sheet"]?.theme ?? "";
    el.querySelector(".sw-sheet")?.setAttribute("data-theme", theme);

    // A2: 快捷栏拖拽排序
    this.#initQuickbarDrag(el);

    // A3: 骰点历史抽屉注入
    this.#syncDiceHistory(el);

    // G1: picker hover 预览（异步加载描述）
    this.#initPickerPreviews(el);
  }

  #clearPreviewCards() {
    document.querySelectorAll(".sw-pp-card").forEach(card => card.remove());
  }

  #initPickerPreviews(el) {
    const clear = () => this.#clearPreviewCards();
    el.addEventListener("click", clear, { once: true });
    el.addEventListener("scroll", clear, { once: true, capture: true });
    el.addEventListener("mouseleave", clear, { once: true });
    window.addEventListener("blur", clear, { once: true });

    el.querySelectorAll(".sw-picker-opt[data-uuid]").forEach(btn => {
      let card = null;
      btn.addEventListener("mouseenter", async () => {
        clear();
        const doc = await fromUuid(btn.dataset.uuid).catch(() => null);
        if (!doc || !btn.isConnected || !btn.matches(":hover")) return;
        const desc = StarworldCharacterSheet.#previewText(doc.system?.description?.value);
        card = document.createElement("div");
        card.className = "sw-pp-card";
        card.innerHTML = `<img class="sw-pp-img" src="${doc.img ?? ""}"><div class="sw-pp-body"><strong>${doc.name}</strong>${desc ? `<p>${desc}…</p>` : ""}</div>`;
        const rect = btn.getBoundingClientRect();
        const shRect = el.getBoundingClientRect();
        card.style.cssText = `top:${rect.bottom - shRect.top + 4}px;left:${Math.min(rect.left - shRect.left, shRect.width - 240)}px`;
        el.appendChild(card);
        document.addEventListener("pointerdown", clear, { once: true, capture: true });
        document.addEventListener("pointerover", event => {
          if (!event.target?.closest?.(".sw-picker-opt, .sw-pp-card")) clear();
        }, { once: true, capture: true });
        document.addEventListener("scroll", clear, { once: true, capture: true });
        window.addEventListener("resize", clear, { once: true });
      });
      btn.addEventListener("mouseleave", () => { card?.remove(); card = null; });
      btn.addEventListener("click", clear);
    });
  }

  #initQuickbarDrag(el) {
    const bar = el.querySelector(".sw-quickbar");
    if (!bar) return;
    let dragging = null;
    bar.querySelectorAll(".sw-qw[data-item-id]").forEach(card => {
      card.setAttribute("draggable", "true");
      card.addEventListener("dragstart", e => {
        dragging = card;
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("sw-dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("sw-dragging");
        dragging = null;
      });
      card.addEventListener("dragover", e => {
        e.preventDefault();
        if (dragging && dragging !== card) card.classList.add("sw-drag-over");
      });
      card.addEventListener("dragleave", () => card.classList.remove("sw-drag-over"));
      card.addEventListener("drop", async e => {
        e.preventDefault();
        card.classList.remove("sw-drag-over");
        if (!dragging || dragging === card) return;
        // 交换 sort 值
        const idA = dragging.dataset.itemId, idB = card.dataset.itemId;
        const itemA = this.actor.items.get(idA), itemB = this.actor.items.get(idB);
        if (itemA && itemB) {
          const sA = itemA.sort, sB = itemB.sort;
          await Promise.all([
            itemA.update({ sort: sB }),
            itemB.update({ sort: sA }),
          ]);
        }
      });
    });
  }

  #syncDiceHistory(el) {
    const drawer = el.querySelector(".sw-dice-drawer-list");
    if (!drawer) return;
    const msgs = [...(game.messages ?? [])].reverse().slice(0, 10);
    const rows = msgs.filter(m => m.rolls?.length).map(m => {
      const roll = m.rolls[0];
      const total = roll?.total ?? "?";
      const formula = roll?.formula ?? "";
      const speaker = m.speaker?.alias ?? "?";
      return `<li class="sw-dice-entry"><span class="sw-dice-total-badge">${total}</span><span class="sw-dice-formula">${formula}</span><span class="sw-dice-speaker">${speaker}</span></li>`;
    });
    drawer.innerHTML = rows.join("") || "<li class=\"sw-dice-empty\">暂无骰点记录</li>";
  }

  static async #onToggleDiceDrawer(event, target) {
    const drawer = this.element.querySelector(".sw-dice-drawer");
    if (drawer) {
      drawer.classList.toggle("open");
      this.#syncDiceHistory(this.element);
    }
  }

  static async #onSetTheme(event, target) {
    const theme = target.dataset.theme ?? "";
    await this.actor.setFlag("starworld-sheet", "theme", theme);
    this.element.querySelector(".sw-sheet")?.setAttribute("data-theme", theme);
  }

  static async #onToggleCondition(event, target) {
    const id = target.dataset.condition;
    if (!id) return;
    const active = this.actor.statuses?.has(id);
    const effect = CONFIG.statusEffects?.find(e => e.id === id);
    if (!effect) return;
    if (active) {
      const existing = this.actor.effects.find(e => e.statuses?.has(id));
      await existing?.delete();
    } else {
      await ActiveEffect.implementation.fromStatusEffect(id).then(e => this.actor.createEmbeddedDocuments("ActiveEffect", [e.toObject()]));
    }
  }

  static async #onRollAbility(event, target) {
    this.actor.rollAbilityCheck({ ability: target.dataset.ability });
  }
  static async #onRollSave(event, target) {
    this.actor.rollSavingThrow({ ability: target.dataset.ability });
  }
  static async #onRollSkill(event, target) {
    this.actor.rollSkill({ skill: target.dataset.skill });
  }
  static async #onRollDeath(event, target) {
    this.actor.rollDeathSave?.({});
  }
  static async #onItemAction(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const t = target.dataset.actionType;
    if (t === "use")    item.use({}, { event });
    if (t === "edit")   item.sheet.render(true);
    if (t === "delete") item.deleteDialog();
  }
  // E: 展开/折叠物品详情
  static async #onToggleDetail(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (!id) return;
    const expanded = foundry.utils.deepClone(this.actor.flags["starworld-sheet"]?.expandedItems ?? {});
    expanded[id] = !expanded[id];
    await this.actor.setFlag("starworld-sheet", "expandedItems", expanded);
    this.render();
  }
  static async #onChangeTab(event, target) {
    await this.actor.setFlag("starworld-sheet", "activeTab", target.dataset.tab);
    this.render();
  }
  static async #onToggleEdit(event, target) {
    const cur = this.actor.flags["starworld-sheet"]?.editMode ?? false;
    await this.actor.setFlag("starworld-sheet", "editMode", !cur);
    this.render();
  }
  static async #onToggleInspiration() {
    const cur = this.actor.system.attributes?.inspiration ?? false;
    await this.actor.update({ "system.attributes.inspiration": !cur });
  }
  static async #onShortRest() { this.actor.shortRest(); }
  static async #onLongRest()  { this.actor.longRest(); }
  static async #onSpendSlot(event, target) {
    const lv = target.dataset.level;
    const key = lv === "pact" ? "pact" : `spell${lv}`;
    const slot = this.actor.system.spells?.[key] ?? {};
    if ((slot.value ?? 0) <= 0) return;
    await this.actor.update({ [`system.spells.${key}.value`]: (slot.value ?? 0) - 1 });
  }
  static async #onRecoverSlot(event, target) {
    const lv = target.dataset.level;
    const key = lv === "pact" ? "pact" : `spell${lv}`;
    const slot = this.actor.system.spells?.[key] ?? {};
    const cur = slot.value ?? 0, max = slot.max ?? 0;
    if (cur >= max) return;
    await this.actor.update({ [`system.spells.${key}.value`]: cur + 1 });
  }
  static async #onUseHitDie(event, target) {
    const cls = this.actor.items.get(target.dataset.classId);
    if (!cls) return;
    this.actor.rollHitDie({ denomination: cls.system?.hitDice });
  }
  static async #onCycleSkillProf(event, target) {
    if (!this.isEditable) return;
    const skill = target.dataset.skill;
    const skl = this.actor.system.skills?.[skill] ?? {};
    // dnd5e 5.x: stored field is .value (multiplier 0/1/2); .proficient is a derived alias
    const cur = skl.value ?? skl.proficient ?? 0;
    const next = cur >= 2 ? 0 : cur + 1;
    await this.actor.update({ [`system.skills.${skill}.value`]: next });
  }
  static async #onToggleEquipped(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    await item.update({ "system.equipped": !item.system.equipped });
  }
  static async #onToggleSpellPrepared(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.system?.level === 0) return;
    await item.update({ "system.preparation.prepared": !item.system.preparation?.prepared });
  }
  static async #onRollTool(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    item.rollToolCheck?.() ?? item.use({ event }, {});
  }

  // ── 种族/背景/职业下拉选择 ─────────────────────────────────────────
  static async #onSelectRace(event, target) {
    await StarworldCharacterSheet.#applyUniqueItem(this.actor, target.dataset.uuid, "race");
    StarworldCharacterSheet.#packCache = {};
    this.render();
  }
  static async #onSelectBackground(event, target) {
    await StarworldCharacterSheet.#applyUniqueItem(this.actor, target.dataset.uuid, "background");
    StarworldCharacterSheet.#packCache = {};
    this.render();
  }
  static async #onSelectClass(event, target) {
    await StarworldCharacterSheet.#applyUniqueItem(this.actor, target.dataset.uuid, "class");
    StarworldCharacterSheet.#packCache = {};
    this.render();
  }
  static async #onLevelUpClass(event, target) {
    const cls = this.actor.items.get(target.dataset.classId);
    if (!cls) return;
    const mgr = dnd5e.applications.advancement.AdvancementManager.forLevelChange(this.actor, cls.id, 1);
    if (mgr?.steps.length) mgr.render(true);
    else await cls.update({ "system.levels": (cls.system.levels ?? 1) + 1 });
  }
  static async #onAddMulticlass(event, target) {
    // 从职业选择器添加新职业，不删除或重置已有职业。
    const uuid = target.dataset.uuid;
    if (!uuid) {
      ui.notifications?.warn("没有找到要添加的职业");
      return;
    }
    if (!this.isEditable) {
      ui.notifications?.warn("当前角色不可编辑");
      return;
    }
    const source = await fromUuid(uuid).catch(() => null);
    if (!source) {
      ui.notifications?.warn("无法读取这个职业");
      return;
    }

    const classLevel = this.actor.items
      .filter(i => i.type === "class")
      .reduce((sum, i) => sum + (i.system?.levels ?? 0), 0);
    if (classLevel >= (CONFIG.DND5E?.maxLevel ?? 20)) {
      ui.notifications?.warn(`角色等级已达到 ${CONFIG.DND5E?.maxLevel ?? 20} 级上限`);
      return;
    }

    const identifier = source.system?.identifier ?? source.name.slugify?.() ?? source.name.toLowerCase().replace(/\s+/g, "-");
    if (this.actor.items.some(i => i.type === "class" && ((i.system?.identifier === identifier) || (i.name === source.name)))) {
      ui.notifications?.warn(`${source.name} 已经是该角色的职业`);
      return;
    }

    target.closest(".sw-multiclass-picker")?.removeAttribute("open");
    const itemData = source.toObject();
    itemData.system ??= {};
    itemData.system.levels = Math.min(itemData.system.levels ?? 1, (CONFIG.DND5E?.maxLevel ?? 20) - classLevel);

    if (!game.settings.get("dnd5e", "disableAdvancements")) {
      const mgr = dnd5e.applications.advancement.AdvancementManager.forNewItem(this.actor, itemData);
      if (mgr?.steps.length) {
        mgr.render(true);
        return;
      }
    }

    await this.actor.createEmbeddedDocuments("Item", [itemData]);
    StarworldCharacterSheet.#packCache = {};
    this.render();
  }
  static async #applyUniqueItem(actor, uuid, type) {
    // 删除同类旧物品
    const old = actor.items.filter(i => i.type === type);
    if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(i => i.id));
    // 从 uuid 获取物品数据
    const source = await fromUuid(uuid);
    if (!source) return;
    const itemData = source.toObject();
    // 触发 AdvancementManager 引导流程（如有 advancement 则弹向导，否则直接创建）
    const manager = dnd5e.applications.advancement.AdvancementManager.forNewItem(actor, itemData);
    if (manager?.steps.length) manager.render(true);
    else await actor.createEmbeddedDocuments("Item", [itemData]);
  }
  static async #onAddSpell(event, target) {
    const uuid = target.dataset.uuid;
    const source = await fromUuid(uuid);
    if (!source) return;
    // 同名法术已存在则跳过
    if (this.actor.items.some(i => i.type === "spell" && i.name === source.name)) return;
    await this.actor.createEmbeddedDocuments("Item", [source.toObject()]);
    StarworldCharacterSheet.#packCache = {};
    this.render();
  }
}
