import type { CaptureField, CapturedValue } from "@/lib/voice/capture-fields";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlatformRole = "business_owner" | "trainer" | "admin";
export type BusinessMemberRole = "owner" | "manager" | "staff";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  platform_role: PlatformRole;
  created_at: string;
  updated_at: string;
};

export type Business = {
  id: string;
  name: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  status: "active" | "inactive" | "onboarding";
  rate_per_minute_paise: number;
  created_at: string;
  updated_at: string;
};

export type BusinessMember = {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessMemberRole;
  created_at: string;
};

export type AiEmployee = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  status: "draft" | "testing" | "live" | "paused";
  current_version_id: string | null;
  capture_fields: CaptureField[];
  // Provider-neutral; read through sanitizeAgentSettings, which fills defaults.
  agent_settings: Json;
  agent_tests: Json;
  // The Sarvam agent staff trained for this employee; null uses the shared default (SARVAM_AGENT_ID).
  sarvam_agent_id: string | null;
  // What staff trained in Sarvam's console, read through sanitizeAgentTraining; null until recorded.
  agent_training: Json | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeDocument = {
  id: string;
  business_id: string;
  ai_employee_id: string;
  name: string;
  source_type: "voice_transcript" | "document_upload" | "direct_note";
  file_type: string;
  raw_text: string;
  summary: string | null;
  status: "pending" | "processing" | "indexed" | "failed";
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunk = {
  id: string;
  document_id: string;
  business_id: string;
  ai_employee_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, any>;
  created_at: string;
};

export type Lead = {
  id: string;
  business_id: string;
  ai_employee_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  enquiry: string | null;
  source: string;
  utm: Record<string, any>;
  ip_hash: string | null;
  external_id: string | null;
  status: "new" | "calling" | "contacted" | "unreachable" | "converted" | "closed";
  created_at: string;
  updated_at: string;
};

export type CallTranscriptTurn = {
  role: "agent" | "user";
  en_text: string;
};

export type CallAttempt = {
  id: string;
  lead_id: string;
  business_id: string;
  attempt_id: string;
  interaction_id: string | null;
  status: "dispatched" | "connected" | "no_answer" | "busy" | "failed";
  duration: number | null;
  failure_reason: string | null;
  transcript: CallTranscriptTurn[] | null;
  final_variables: Record<string, any> | null;
  summary: string | null;
  visit_requested: boolean | null;
  preferred_visit_at: string | null;
  outcome: CallOutcomeLabel | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  unanswered_questions: string[];
  topics: string[];
  captured: CapturedValue[];
  billed_minutes: number | null;
  charge_paise: number | null;
  created_at: string;
  updated_at: string;
};

export type MetaPageConnection = {
  id: string;
  business_id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  connected_by: string | null;
  last_lead_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
  id: string;
  business_id: string;
  ai_employee_id: string | null;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  max_concurrent: number;
  window_start: string;
  window_end: string;
  time_zone: string;
  max_attempts: number;
  retry_after_minutes: number;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignContact = {
  id: string;
  campaign_id: string;
  business_id: string;
  name: string;
  phone: string;
  notes: string | null;
  status: "queued" | "calling" | "completed" | "unreachable" | "failed" | "do_not_call";
  attempts: number;
  next_attempt_at: string;
  lead_id: string | null;
  last_call_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type DoNotCall = {
  business_id: string;
  phone: string;
  reason: string | null;
  created_at: string;
};

export type CreditLedgerEntry = {
  id: string;
  business_id: string;
  kind: "topup" | "call_charge" | "adjustment";
  amount_paise: number;
  call_attempt_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type DeliveryKind = "email" | "sheet" | "webhook";

export type DeliveryTarget = {
  id: string;
  business_id: string;
  kind: DeliveryKind;
  destination: string;
  secret: string;
  enabled: boolean;
  last_status: "sent" | "failed" | null;
  last_error: string | null;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Delivery = {
  id: string;
  target_id: string;
  business_id: string;
  call_attempt_id: string;
  status: "pending" | "sent" | "failed";
  response_code: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CallOutcomeLabel =
  | "interested"
  | "not_interested"
  | "callback_requested"
  | "wrong_number"
  | "no_answer"
  | "unclear";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          platform_role: PlatformRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Profile>;
        Relationships: [];
      };
      businesses: {
        Row: Business;
        Insert: {
          id?: string;
          name: string;
          industry?: string | null;
          phone?: string | null;
          email?: string | null;
          timezone?: string;
          status?: Business["status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Business>;
        Relationships: [];
      };
      business_members: {
        Row: BusinessMember;
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role: BusinessMemberRole;
          created_at?: string;
        };
        Update: Partial<BusinessMember>;
        Relationships: [];
      };
      ai_employees: {
        Row: AiEmployee;
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          description?: string | null;
          status?: AiEmployee["status"];
          current_version_id?: string | null;
          capture_fields?: CaptureField[];
          agent_settings?: Json;
          agent_tests?: Json;
          sarvam_agent_id?: string | null;
          agent_training?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AiEmployee>;
        Relationships: [];
      };
      knowledge_documents: {
        Row: KnowledgeDocument;
        Insert: {
          id?: string;
          business_id: string;
          ai_employee_id: string;
          name: string;
          source_type: KnowledgeDocument["source_type"];
          file_type?: string;
          raw_text: string;
          summary?: string | null;
          status?: KnowledgeDocument["status"];
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<KnowledgeDocument>;
        Relationships: [];
      };
      knowledge_chunks: {
        Row: KnowledgeChunk;
        Insert: {
          id?: string;
          document_id: string;
          business_id: string;
          ai_employee_id: string;
          chunk_index: number;
          content: string;
          embedding?: number[] | string | null;
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: Partial<KnowledgeChunk>;
        Relationships: [];
      };
      leads: {
        Row: Lead;
        Insert: {
          id?: string;
          business_id: string;
          ai_employee_id?: string | null;
          name: string;
          phone: string;
          email?: string | null;
          enquiry?: string | null;
          source?: string;
          utm?: Record<string, any>;
          ip_hash?: string | null;
          external_id?: string | null;
          status?: Lead["status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Lead>;
        Relationships: [];
      };
      call_attempts: {
        Row: CallAttempt;
        Insert: {
          id?: string;
          lead_id: string;
          business_id: string;
          attempt_id: string;
          interaction_id?: string | null;
          status?: CallAttempt["status"];
          duration?: number | null;
          failure_reason?: string | null;
          transcript?: CallTranscriptTurn[] | null;
          final_variables?: Record<string, any> | null;
          summary?: string | null;
          visit_requested?: boolean | null;
          preferred_visit_at?: string | null;
          outcome?: CallOutcomeLabel | null;
          sentiment?: CallAttempt["sentiment"];
          unanswered_questions?: string[];
          topics?: string[];
          captured?: CapturedValue[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<CallAttempt>;
        Relationships: [];
      };
      delivery_targets: {
        Row: DeliveryTarget;
        Insert: {
          id?: string;
          business_id: string;
          kind: DeliveryKind;
          destination: string;
          secret?: string;
          enabled?: boolean;
          last_status?: DeliveryTarget["last_status"];
          last_error?: string | null;
          last_sent_at?: string | null;
        };
        Update: Partial<DeliveryTarget>;
        Relationships: [];
      };
      meta_page_connections: {
        Row: MetaPageConnection;
        Insert: {
          id?: string;
          business_id: string;
          page_id: string;
          page_name: string;
          page_access_token: string;
          connected_by?: string | null;
          last_lead_at?: string | null;
          last_error?: string | null;
        };
        Update: Partial<MetaPageConnection>;
        Relationships: [];
      };
      campaigns: {
        Row: Campaign;
        Insert: Partial<Campaign> & { business_id: string; name: string };
        Update: Partial<Campaign>;
        Relationships: [];
      };
      campaign_contacts: {
        Row: CampaignContact;
        Insert: Partial<CampaignContact> & {
          campaign_id: string;
          business_id: string;
          name: string;
          phone: string;
        };
        Update: Partial<CampaignContact>;
        Relationships: [];
      };
      do_not_call: {
        Row: DoNotCall;
        Insert: { business_id: string; phone: string; reason?: string | null };
        Update: Partial<DoNotCall>;
        Relationships: [];
      };
      credit_ledger: {
        Row: CreditLedgerEntry;
        Insert: Partial<CreditLedgerEntry> & {
          business_id: string;
          kind: CreditLedgerEntry["kind"];
          amount_paise: number;
        };
        Update: Partial<CreditLedgerEntry>;
        Relationships: [];
      };
      deliveries: {
        Row: Delivery;
        Insert: {
          id?: string;
          target_id: string;
          business_id: string;
          call_attempt_id: string;
          status?: Delivery["status"];
          response_code?: number | null;
          error?: string | null;
        };
        Update: Partial<Delivery>;
        Relationships: [];
      };
    };
    Views: {
      business_balances: {
        Row: { business_id: string; balance_paise: number };
        Relationships: [];
      };
    };
    Functions: {
      match_knowledge_chunks: {
        Args: {
          query_embedding: number[] | string;
          match_threshold?: number;
          match_count?: number;
          filter_employee_id?: string;
          filter_business_id?: string;
        };
        Returns: Array<{
          id: string;
          document_id: string;
          content: string;
          metadata: Record<string, any>;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
