alter table public.property_chatbot_settings
add column if not exists retrieval_top_k integer not null default 5 check (retrieval_top_k > 0 and retrieval_top_k <= 50),
add column if not exists retrieval_similarity_threshold numeric(4,3) not null default 0.200 check (retrieval_similarity_threshold >= 0 and retrieval_similarity_threshold <= 1),
add column if not exists retrieval_memory_mode text not null default 'hybrid' check (retrieval_memory_mode in ('hybrid', 'rolling_window', 'summary_memory', 'retrieval_only')),
add column if not exists retrieval_history_window integer not null default 20 check (retrieval_history_window >= 1 and retrieval_history_window <= 100);
