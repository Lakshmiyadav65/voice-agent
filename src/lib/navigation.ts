export type NavItem = {
  label: string;
  href: string;
};

export const ownerNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "AI Employee", href: "/dashboard/ai-employee" },
  { label: "Calls", href: "/dashboard/calls" },
  { label: "Leads", href: "/dashboard/leads" },
  { label: "WhatsApp", href: "/dashboard/whatsapp" },
  { label: "Appointments", href: "/dashboard/appointments" },
  { label: "Business Information", href: "/dashboard/business" },
  { label: "Settings", href: "/dashboard/settings" },
];

export const trainerNav: NavItem[] = [
  { label: "Trainer Dashboard", href: "/trainer" },
  { label: "Businesses", href: "/trainer/businesses" },
  { label: "AI Employees", href: "/trainer/ai-employees" },
  { label: "Business Data", href: "/trainer/business-data" },
  { label: "Knowledge", href: "/trainer/knowledge" },
  { label: "AI Configuration", href: "/trainer/configuration" },
  { label: "Test Lab", href: "/trainer/test-lab" },
  { label: "Conversations", href: "/trainer/conversations" },
  { label: "Knowledge Gaps", href: "/trainer/knowledge-gaps" },
  { label: "Versions", href: "/trainer/versions" },
  { label: "Deployment", href: "/trainer/deployment" },
];
