export type PageMeta = {
  title: string;
  description: string;
  breadcrumbs?: { label: string; href?: string }[];
  comingInPhase?: string;
  features?: string[];
  emptyTitle?: string;
  emptyDescription?: string;
};

export const ownerPages = {
  dashboard: {
    title: "Dashboard",
    description: "Your leads, what happened on their calls, and your setup — at a glance.",
  },
  aiEmployee: {
    title: "AI Employee",
    description: "Status, performance, and configuration summary for your voice employee.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "AI Employee" }],
    comingInPhase: "Phase 5+",
    features: [
      "Live / paused status and current version",
      "Calls handled and performance score",
      "Quick link to recent conversations",
    ],
  },
  calls: {
    title: "Calls",
    description: "How your AI employee's calls are going: pick-up rate, outcomes, and what customers ask about.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Calls" }],
    emptyTitle: "No calls yet",
    emptyDescription: "When your AI employee starts calling leads, the numbers and outcomes appear here.",
  },
  leads: {
    title: "Leads",
    description: "Everyone who filled your lead form, with the summary of their call.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Leads" }],
    emptyTitle: "No leads yet",
    emptyDescription: "When someone fills your lead form, they appear here along with what happened on their call.",
  },
  whatsapp: {
    title: "WhatsApp",
    description: "Messages sent during and after calls, with delivery status.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "WhatsApp" }],
    comingInPhase: "Phase 11",
    emptyTitle: "No WhatsApp messages yet",
    emptyDescription: "When customers request details on WhatsApp, sent messages and delivery status appear here.",
    features: ["Message content and template used", "Provider delivery status", "Linked call or lead"],
  },
  appointments: {
    title: "Appointments",
    description: "Leads who asked to visit or book a time during their call.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Appointments" }],
    emptyTitle: "No appointments yet",
    emptyDescription: "When a lead asks to visit or book a time on a call, they appear here with their preferred time.",
  },
  campaigns: {
    title: "Campaigns",
    description: "Upload a list of numbers and your AI employee calls them for you, during calling hours, retrying anyone who doesn't pick up.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Campaigns" }],
    emptyTitle: "No campaigns yet",
    emptyDescription: "Create a campaign to call a list of past customers, enquiries or event sign-ups in one go.",
  },
  usage: {
    title: "Usage & credits",
    description: "Your call credit balance, what each day of calling cost, and every top-up and charge.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Usage & credits" }],
  },
  businessHub: {
    title: "Business Information",
    description: "Manage the facts your AI employee uses — products, prices, stock, offers, and documents.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Business Information" }],
    comingInPhase: "Phase 5",
    features: [
      "Products and variants",
      "Prices with scheduled effective dates",
      "Inventory, offers, FAQs, documents, policies",
    ],
  },
  products: {
    title: "Products & Services",
    description: "Product catalogue with variants used for price and stock lookups.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "Products" },
    ],
    comingInPhase: "Phase 5",
    emptyTitle: "No products yet",
    emptyDescription: "Add products and variants so your AI employee can answer price and availability questions accurately.",
  },
  prices: {
    title: "Prices",
    description: "Current and scheduled prices with effective-date resolution.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "Prices" },
    ],
    comingInPhase: "Phase 5",
    emptyTitle: "No prices configured",
    emptyDescription: "Set prices per variant. Schedule future changes — the AI picks up new values at the effective time.",
  },
  inventory: {
    title: "Inventory",
    description: "Current stock levels per variant and location.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "Inventory" },
    ],
    comingInPhase: "Phase 5",
    emptyTitle: "No inventory records",
    emptyDescription: "Track stock so the AI can answer availability questions without guessing.",
  },
  offers: {
    title: "Offers",
    description: "Active and scheduled promotional offers.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "Offers" },
    ],
    comingInPhase: "Phase 5",
    emptyTitle: "No offers yet",
    emptyDescription: "Create offers with effective dates. The AI uses only approved offer data at runtime.",
  },
  faqs: {
    title: "FAQs",
    description: "Structured answers for common customer questions.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "FAQs" },
    ],
    comingInPhase: "Phase 6",
    emptyTitle: "No FAQs yet",
    emptyDescription: "Add frequently asked questions. The AI retrieves these before generating an answer.",
  },
  documents: {
    title: "Documents",
    description: "Uploaded brochures, policies, and business documents for knowledge retrieval.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "Documents" },
    ],
    comingInPhase: "Phase 6",
    emptyTitle: "No documents uploaded",
    emptyDescription: "Upload PDF, DOCX, or TXT files. They are parsed, chunked, and searched at conversation time.",
  },
  policies: {
    title: "Policies",
    description: "Return, warranty, delivery, and business policy rules.",
    breadcrumbs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Business Information", href: "/dashboard/business" },
      { label: "Policies" },
    ],
    comingInPhase: "Phase 6",
    emptyTitle: "No policies added",
    emptyDescription: "Define policies the AI must follow when answering customer questions.",
  },
  settings: {
    title: "Settings",
    description: "Links for your ads, and your account preferences.",
    breadcrumbs: [{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }],
  },
} satisfies Record<string, PageMeta>;

export const trainerPages = {
  dashboard: {
    title: "Trainer dashboard",
    description: "Overview of businesses under your care and items needing attention.",
  },
  businesses: {
    title: "Businesses",
    description: "All onboarded businesses — setup status, AI employees, and health.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Businesses" }],
    comingInPhase: "Phase 4",
    emptyTitle: "No businesses onboarded",
    emptyDescription: "New businesses appear here after signup and trainer assignment.",
  },
  aiEmployees: {
    title: "AI Employees",
    description: "Configure and monitor AI employees across all businesses.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "AI Employees" }],
    comingInPhase: "Phase 7",
    features: ["Per-business AI identity", "Status: draft, testing, live", "Link to Test Lab and versions"],
  },
  businessData: {
    title: "Business Data",
    description: "Structured products, prices, stock, and offers across businesses.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Business Data" }],
    comingInPhase: "Phase 5",
    features: ["Cross-business data browser", "Validate scheduled changes", "Audit trail"],
  },
  knowledge: {
    title: "Knowledge",
    description: "Each client's knowledge base. Upload, read, edit and delete what their agent knows, the same as the client can.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Knowledge" }],
  },
  configuration: {
    title: "AI Configuration",
    description: "Conversational behaviour, tools, and escalation rules.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "AI Configuration" }],
    comingInPhase: "Phase 7",
    features: ["Behaviour prompts (trainer-only)", "Tool permissions", "Language and voice settings"],
  },
  testLab: {
    title: "Test Lab",
    description: "Run scenarios: input → expected → actual → source → pass/fail.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Test Lab" }],
    comingInPhase: "Phase 8",
    features: [
      '"What is the iPhone 15 price?" style tests',
      "Expected vs actual with data source",
      "Latency and tool-call trace",
    ],
  },
  conversations: {
    title: "Conversations",
    description: "Review call transcripts, tool events, and evaluation scores.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Conversations" }],
    comingInPhase: "Phase 10",
    emptyTitle: "No conversations to review",
    emptyDescription: "Live and completed conversations appear here for quality review.",
  },
  knowledgeGaps: {
    title: "Knowledge Gaps",
    description: "Failed questions that need new data or behaviour fixes.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Knowledge Gaps" }],
    comingInPhase: "Phase 14",
    emptyTitle: "No knowledge gaps",
    emptyDescription: "When the AI cannot answer from Business Brain data, gaps are flagged here for resolution.",
    features: ["Customer question and AI response", "Failure reason", "Resolve → retest workflow"],
  },
  versions: {
    title: "Versions",
    description: "AI behaviour versions: draft → testing → approved → live.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Versions" }],
    comingInPhase: "Phase 15",
    features: ["Version history per AI employee", "Diff and rollback", "Approval workflow"],
  },
  deployment: {
    title: "Deployment",
    description: "Approve and deploy tested versions to production.",
    breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Deployment" }],
    comingInPhase: "Phase 15",
    features: ["Deploy approved version", "Rollback to previous live", "Deployment audit log"],
  },
} satisfies Record<string, PageMeta>;

export const businessInfoNav = [
  { label: "Overview", href: "/dashboard/business" },
  { label: "Products", href: "/dashboard/business/products" },
  { label: "Prices", href: "/dashboard/business/prices" },
  { label: "Inventory", href: "/dashboard/business/inventory" },
  { label: "Offers", href: "/dashboard/business/offers" },
  { label: "FAQs", href: "/dashboard/business/faqs" },
  { label: "Documents", href: "/dashboard/business/documents" },
  { label: "Policies", href: "/dashboard/business/policies" },
] as const;
