// Types for settings.json
// See settings.schema.json for full documentation with descriptions.

export type LearningLevel = "beginner" | "intermediate" | "advanced"; // intermediate kept for backwards compat

/** Built-in sidebar page IDs */
export type SidebarBuiltinId =
  | "dashboard"
  | "register"
  | "accounts"
  | "balancesheet"
  | "pnl"
  | "cashflow"
  | "budget"
  | "portfolio"
  | "vendors"
  | "forecast"
  | "recurring"
  | "reconcile"
  | "triage"
  | "docs"
  | "mappings"
  | "git"
  | "check"
  | "welcome";

export type SidebarItemConfig =
  | SidebarBuiltinId
  | "divider"
  | { type: "section"; label: string }
  | { type: "custom"; label: string; icon: string; href: string };

export interface Settings {
  _version: number;
  sidebar: {
    items: SidebarItemConfig[];
  };
  learning: {
    enabled: boolean;
    level: LearningLevel;
    completedTours: string[];
    dismissedTips: string[]; // "{tourId}:{tipIndex}" keys for individually dismissed tips
  };
  display: {
    showCurrencySymbol: boolean;
    roundAmounts: boolean;
  };
  views: {
    register: "cards" | "table";
  };
  welcome: {
    enabled: boolean;
  };
  import: {
    suggestions: boolean;
  };
  /** User-defined keyword → account mappings learned from their rules */
  keywords: { keywords: string[]; account: string }[];
}

export const DEFAULT_SETTINGS: Settings = {
  _version: 1,
  sidebar: {
    items: [
      "welcome",
      "dashboard",
      "register",
      "accounts",
      "divider",
      "triage",
      "docs",
    ],
  },
  learning: {
    enabled: true,
    level: "beginner",
    completedTours: [],
    dismissedTips: [],
  },
  display: {
    showCurrencySymbol: true,
    roundAmounts: false,
  },
  views: {
    register: "cards",
  },
  welcome: {
    enabled: true,
  },
  import: {
    suggestions: true,
  },
  keywords: [],
};

export function mergeSettings(partial: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    sidebar: {
      ...DEFAULT_SETTINGS.sidebar,
      ...(partial.sidebar ?? {}),
    },
    learning: {
      ...DEFAULT_SETTINGS.learning,
      ...(partial.learning ?? {}),
    },
    display: {
      ...DEFAULT_SETTINGS.display,
      ...(partial.display ?? {}),
    },
    views: {
      ...DEFAULT_SETTINGS.views,
      ...(partial.views ?? {}),
    },
    welcome: {
      ...DEFAULT_SETTINGS.welcome,
      ...(partial.welcome ?? {}),
    },
    import: {
      ...DEFAULT_SETTINGS.import,
      ...(partial.import ?? {}),
    },
    keywords: partial.keywords ?? DEFAULT_SETTINGS.keywords,
  };
}
