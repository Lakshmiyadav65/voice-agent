-- Phase 3: Vector Knowledge Store and RAG for AI Employees
-- Uses pgvector (384 dimensions for sentence-transformers/all-MiniLM-L6-v2)

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Knowledge Documents (Stores original voice transcripts & uploaded files)
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ai_employee_id uuid not null references public.ai_employees (id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('voice_transcript', 'document_upload', 'direct_note')),
  file_type text not null default 'text/plain',
  raw_text text not null,
  summary text,
  status text not null default 'indexed' check (status in ('pending', 'processing', 'indexed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_documents_business_id_idx on public.knowledge_documents (business_id);
create index if not exists knowledge_documents_ai_employee_id_idx on public.knowledge_documents (ai_employee_id);

-- ---------------------------------------------------------------------------
-- Knowledge Chunks (Stores text chunks with 384-dim sentence-transformers embeddings)
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  ai_employee_id uuid not null references public.ai_employees (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(384),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_document_id_idx on public.knowledge_chunks (document_id);
create index if not exists knowledge_chunks_ai_employee_id_idx on public.knowledge_chunks (ai_employee_id);
create index if not exists knowledge_chunks_business_id_idx on public.knowledge_chunks (business_id);

-- HNSW index for cosine distance vector search
create index if not exists knowledge_chunks_embedding_hnsw_idx 
  on public.knowledge_chunks 
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Stored Procedure: match_knowledge_chunks
-- Cosine similarity search using pgvector
-- ---------------------------------------------------------------------------

create or replace function public.match_knowledge_chunks (
  query_embedding vector(384),
  match_threshold float default 0.2,
  match_count int default 5,
  filter_employee_id uuid default null,
  filter_business_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
security definer
as $$
begin
  return query
  select
    kc.id,
    kc.document_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where
    (filter_employee_id is null or kc.ai_employee_id = filter_employee_id)
    and (filter_business_id is null or kc.business_id = filter_business_id)
    and (1 - (kc.embedding <=> query_embedding)) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

-- Documents RLS
create policy "Members read business knowledge documents"
  on public.knowledge_documents for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Members insert business knowledge documents"
  on public.knowledge_documents for insert
  with check (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Members delete business knowledge documents"
  on public.knowledge_documents for delete
  using (public.is_business_owner(business_id) or public.is_platform_staff());

-- Chunks RLS
create policy "Members read business knowledge chunks"
  on public.knowledge_chunks for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Members insert business knowledge chunks"
  on public.knowledge_chunks for insert
  with check (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Members delete business knowledge chunks"
  on public.knowledge_chunks for delete
  using (public.is_business_owner(business_id) or public.is_platform_staff());
