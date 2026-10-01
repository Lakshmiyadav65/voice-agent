export type NavItem = {
  label: string;
  href: string;
  // Page exists but has nothing working behind it yet.
  soon?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const ownerNav: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Home", href: "/dashboard" }],
  },
  {
    label: "Build",
    items: [
      { label: "Agents", href: "/dashboard/agents" },
      { label: "Knowledge base", href: "/dashboard/ai-employee" },
      { label: "Business Information", href: "/dashboard/business", soon: true },
    ],
  },
  {
    label: "Deploy",
    items: [{ label: "Campaigns", href: "/dashboard/campaigns" }],
  },
  {
    label: "Results",
    items: [
      { label: "Leads", href: "/dashboard/leads" },
      { label: "Calls", href: "/dashboard/calls" },
      { label: "Appointments", href: "/dashboard/appointments" },
      { label: "WhatsApp", href: "/dashboard/whatsapp", soon: true },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Usage & credits", href: "/dashboard/usage" },
      { label: "Settings", href: "/dashboard/settings" },
    ],
  },
];

export const trainerNav: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Trainer Dashboard", href: "/trainer" }],
  },
  {
    label: "Clients",
    items: [
      { label: "Businesses", href: "/trainer/businesses" },
      { label: "AI Employees", href: "/trainer/ai-employees" },
      { label: "Business Data", href: "/trainer/business-data" },
      { label: "Knowledge", href: "/trainer/knowledge" },
    ],
  },
  {
    label: "Train",
    items: [
      { label: "AI Configuration", href: "/trainer/configuration" },
      { label: "Test Lab", href: "/trainer/test-lab" },
    ],
  },
  {
    label: "Review",
    items: [
      { label: "Conversations", href: "/trainer/conversations" },
      { label: "Knowledge Gaps", href: "/trainer/knowledge-gaps" },
    ],
  },
  {
    label: "Release",
    items: [
      { label: "Versions", href: "/trainer/versions" },
      { label: "Deployment", href: "/trainer/deployment" },
    ],
  },
];
