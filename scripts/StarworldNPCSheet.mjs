const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class StarworldNPCSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["starworld-sheet", "starworld-npc"],
    position: { width: 680, height: 600 },
    window: { resizable: true, minimizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: StarworldNPCSheet.#onRollAbility,
      rollSave:    StarworldNPCSheet.#onRollSave,
      rollSkill:   StarworldNPCSheet.#onRollSkill,
      itemAction:  StarworldNPCSheet.#onItemAction,
    },
  };

  static PARTS = {
    sheet: { template: "modules/starworld-sheet/templates/npc-sheet.hbs" },
  };

  get title() { return `${this.actor.name} [NPC]`; }

  static #ABILITY_ZH = { str:"力量",dex:"敏捷",con:"体质",int:"智力",wis:"感知",cha:"魅力" };
  static #SKILL_ZH   = { prc:"察觉",ste:"隐匿",ins:"洞察",dec:"欺骗",per:"说服",itm:"威吓",
                          inv:"调查",ath:"运动",acr:"体操",arc:"奥秘",his:"历史",nat:"自然",
                          rel:"宗教",med:"医药",ani:"驯兽",sur:"生存",slt:"手法",prf:"表演" };
  static #fmt(v) { return v >= 0 ? `+${v}` : `${v}`; }

  async _prepareContext(options) {
    const ctx  = await super._prepareContext(options);
    const actor = this.actor;
    const sys   = actor.system;

    const abilities = Object.entries(sys.abilities ?? {}).map(([key, abl]) => {
      const saveNum = typeof abl.save === "object" ? (abl.save?.value ?? 0) : (abl.save ?? 0);
      return {
        key,
        label: StarworldNPCSheet.#ABILITY_ZH[key] ?? key,
        value: abl.value,
        mod:   StarworldNPCSheet.#fmt(abl.mod ?? 0),
        save:  StarworldNPCSheet.#fmt(saveNum),
        saveProficient: abl.proficient > 0,
      };
    });

    // 仅展示有值的技能熟练
    const skills = Object.entries(sys.skills ?? {})
      .filter(([, s]) => s.proficient > 0)
      .map(([key, s]) => ({
        key, label: StarworldNPCSheet.#SKILL_ZH[key] ?? key,
        total: StarworldNPCSheet.#fmt(s.total ?? 0),
      }));

    const actions  = actor.items.filter(i => ["weapon","feat"].includes(i.type)).sort((a,b) => a.sort-b.sort);
    const spells   = actor.items.filter(i => i.type === "spell").sort((a,b) => (a.system.level??0)-(b.system.level??0));

    const cr = sys.details?.cr;
    // CR 分数显示标准格式（1/4、1/2、1/8）
    const CR_FRACTIONS = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
    const crLabel = cr != null ? (CR_FRACTIONS[cr] ?? (cr < 1 ? `1/${Math.round(1/cr)}` : String(cr))) : "—";
    const xp = sys.details?.xp?.value ?? 0;

    // NPC 类型/体型/阵营本地化
    const TYPE_ZH   = { aberration:"异怪",beast:"野兽",celestial:"天界生物",construct:"构造体",
                        dragon:"龙",elemental:"元素体",fey:"精灵",fiend:"恶魔",giant:"巨人",
                        humanoid:"类人生物",monstrosity:"异形怪物",ooze:"软泥怪",plant:"植物",undead:"不死生物" };
    const SIZE_ZH   = { tiny:"超小型",sm:"小型",med:"中型",lg:"大型",huge:"超大型",grg:"超巨型" };
    const rawType = sys.details?.type?.value ?? "";
    const rawSize = sys.traits?.size ?? "";

    return {
      ...ctx, actor, sys, abilities, skills, actions, spells, crLabel, xp,
      hp: sys.attributes?.hp ?? {},
      ac: sys.attributes?.ac?.value ?? 10,
      speed: sys.attributes?.movement?.walk ?? 0,
      proficiencyBonus: sys.attributes?.prof ?? 0,
      senses: sys.attributes?.senses ?? {},
      passivePerception: sys.skills?.prc?.passive ?? 10,
      size:      SIZE_ZH[rawSize]  ?? rawSize,
      type:      TYPE_ZH[rawType]  ?? rawType,
      alignment: sys.details?.alignment ?? "",
      isEditable: this.isEditable,
    };
  }

  static async #onRollAbility(event, target) { this.actor.rollAbilityCheck({ ability: target.dataset.ability }); }
  static async #onRollSave(event, target)    { this.actor.rollSavingThrow({ ability: target.dataset.ability }); }
  static async #onRollSkill(event, target)   { this.actor.rollSkill({ skill: target.dataset.skill }); }
  static async #onItemAction(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const t = target.dataset.actionType;
    if (t === "use")  item.use({}, { event });
    if (t === "edit") item.sheet.render(true);
  }
}
