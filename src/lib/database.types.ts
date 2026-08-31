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
  created_at: string;
  updated_at: string;
};

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
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AiEmployee>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
