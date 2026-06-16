-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  channel character varying DEFAULT 'whatsapp'::character varying,
  status character varying DEFAULT 'active'::character varying,
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone_number character varying NOT NULL UNIQUE,
  name character varying,
  email character varying,
  tags ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.knowledge_base (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category character varying NOT NULL,
  title character varying NOT NULL,
  content text NOT NULL,
  tags ARRAY,
  is_active boolean DEFAULT true,
  source_type text NOT NULL DEFAULT 'legacy'::text CHECK (source_type = ANY (ARRAY['file'::text, 'text'::text, 'website'::text, 'api'::text, 'database'::text, 'tool'::text, 'legacy'::text])),
  source_id text,
  source_name text NOT NULL DEFAULT ''::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT knowledge_base_pkey PRIMARY KEY (id)
);
CREATE TABLE public.knowledge_vectors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  knowledge_base_id uuid,
  source_type text NOT NULL CHECK (source_type = ANY (ARRAY['file'::text, 'text'::text, 'website'::text, 'api'::text, 'database'::text, 'tool'::text, 'legacy'::text])),
  source_id text NOT NULL,
  source_name text NOT NULL DEFAULT ''::text,
  title text NOT NULL,
  content text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  chunk_count integer NOT NULL DEFAULT 1 CHECK (chunk_count > 0),
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small'::text,
  embedding_dimensions integer NOT NULL DEFAULT 768 CHECK (embedding_dimensions = 768),
  embedding extensions.vector(768) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_vectors_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_vectors_source_chunk_key UNIQUE (source_type, source_id, chunk_index),
  CONSTRAINT knowledge_vectors_knowledge_base_id_fkey FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_base(id) ON DELETE CASCADE
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  direction character varying NOT NULL,
  content text NOT NULL,
  message_type character varying DEFAULT 'text'::character varying,
  external_id character varying,
  delivery_status character varying DEFAULT 'pending'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'ORG'::text,
  description text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.prompt_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL DEFAULT 'default'::character varying,
  system_prompt text NOT NULL DEFAULT 'You are a helpful assistant.'::text,
  temperature numeric NOT NULL DEFAULT 0.40 CHECK (temperature >= 0::numeric AND temperature <= 2::numeric),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  llm_provider character varying NOT NULL DEFAULT 'openai'::character varying,
  llm_model character varying NOT NULL DEFAULT 'gpt-5.4'::character varying,
  llm_api_key text NOT NULL DEFAULT ''::text,
  llm_base_url character varying NOT NULL DEFAULT ''::character varying,
  CONSTRAINT prompt_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.properties (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  location text NOT NULL DEFAULT ''::text,
  icon text NOT NULL DEFAULT 'PR'::text,
  image_url text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT properties_pkey PRIMARY KEY (id),
  CONSTRAINT properties_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.property_chatbot_settings (
  property_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'openai'::text,
  model text NOT NULL DEFAULT 'gpt-5.4'::text,
  temperature numeric NOT NULL DEFAULT 0.40 CHECK (temperature >= 0::numeric AND temperature <= 2::numeric),
  system_prompt text NOT NULL DEFAULT ''::text,
  knowledge_sources ARRAY NOT NULL DEFAULT '{}'::text[],
  quick_replies ARRAY NOT NULL DEFAULT '{}'::text[],
  whatsapp_templates ARRAY NOT NULL DEFAULT '{}'::text[],
  retrieval_top_k integer NOT NULL DEFAULT 5 CHECK (retrieval_top_k > 0 AND retrieval_top_k <= 50),
  retrieval_similarity_threshold numeric(4,3) NOT NULL DEFAULT 0.200 CHECK (retrieval_similarity_threshold >= 0::numeric AND retrieval_similarity_threshold <= 1::numeric),
  retrieval_memory_mode text NOT NULL DEFAULT 'hybrid'::text CHECK (retrieval_memory_mode = ANY (ARRAY['hybrid'::text, 'rolling_window'::text, 'summary_memory'::text, 'retrieval_only'::text])),
  retrieval_history_window integer NOT NULL DEFAULT 20 CHECK (retrieval_history_window >= 1 AND retrieval_history_window <= 100),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT property_chatbot_settings_pkey PRIMARY KEY (property_id),
  CONSTRAINT property_chatbot_settings_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id)
);
CREATE TABLE public.webhooks_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type character varying NOT NULL,
  payload jsonb NOT NULL,
  status character varying DEFAULT 'processing'::character varying,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhooks_log_pkey PRIMARY KEY (id)
);
