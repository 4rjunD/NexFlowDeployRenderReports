-- =====================================================================
-- Migration 0001 — Agent Firm Foundation (schema additions)
-- =====================================================================
-- This migration is ADDITIVE ONLY. It does not modify or drop any
-- existing tables, columns, or constraints. Adds:
--
--   1. Two columns on `organizations` (is_test, industry)
--   2. Extends two existing enums (IntegrationType, ReportType)
--   3. Adds 14 new enums for the agent fleet domain
--   4. Adds 11 new tables (engagements, transcripts, client_documents,
--      audit_runs, agent_tasks, agent_runs, findings, recommendations,
--      deliverables, messages, agent_artifacts) plus indexes and FKs
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS where supported.
-- ALTER TYPE ADD VALUE IF NOT EXISTS for enum extensions.
--
-- After applying, prisma/schema.prisma must be updated to match (so
-- that future `prisma db push` does not try to revert these tables).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Organization additions
-- ---------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_test  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry text;

CREATE INDEX IF NOT EXISTS organizations_is_test_idx ON public.organizations (is_test);

-- ---------------------------------------------------------------------
-- 2. Extend existing enums (additive)
-- ---------------------------------------------------------------------
-- IntegrationType: data sources beyond the original 5
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'NOTION';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'GOOGLE_DRIVE';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'FATHOM';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'OTTER';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'READ_AI';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'GRANOLA';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'HUBSPOT';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'SALESFORCE';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'STRIPE';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'MIXPANEL';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'POSTHOG';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'INTERCOM';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'NETSUITE';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'META_ADS';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'GOOGLE_ADS';
ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'LINKEDIN_ADS';

-- ReportType: more audit and brief types
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'AUDIT';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'ROADMAP';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'RESEARCH_BRIEF';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'PROGRESS_UPDATE';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'EXECUTIVE_BRIEF';

-- ---------------------------------------------------------------------
-- 3. New enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "EngagementStatus" AS ENUM
    ('PROSPECT','PRE_SIGNATURE','ACTIVE','PAUSED','COMPLETED','CHURNED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EngagementPhase" AS ENUM
    ('DISCOVERY','AUDIT','IMPLEMENTATION','ADVISORY','FOLLOW_UP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TranscriptKind" AS ENUM
    ('DISCOVERY_CALL','PROGRESS_CALL','RETROSPECTIVE','ADHOC','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentKind" AS ENUM
    ('CONTRACT','NDA','BRIEF','REPORT','PRESENTATION','PDF','IMAGE','SPREADSHEET','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditRunStatus" AS ENUM
    ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentTaskStatus" AS ENUM
    ('PROPOSED','QUEUED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentTaskKind" AS ENUM
    ('RESEARCH','ANALYSIS','SYNTHESIS','WRITING','CODE_CHANGE','PRESENTATION','COMMUNICATION','REVIEW','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentRunStatus" AS ENUM
    ('RUNNING','COMPLETED','FAILED','TIMEOUT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FindingSeverity" AS ENUM
    ('INFO','LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RecommendationStatus" AS ENUM
    ('PROPOSED','APPROVED','IN_PROGRESS','COMPLETED','REJECTED','DEFERRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliverableKind" AS ENUM
    ('AUDIT_REPORT','PRESENTATION_DECK','ROADMAP','CODE_PR','PROTOTYPE','RESEARCH_BRIEF','EXECUTIVE_SUMMARY','CONTRACT','EMAIL','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliverableStatus" AS ENUM
    ('DRAFT','IN_REVIEW','APPROVED','DELIVERED','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('INBOUND','OUTBOUND');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageChannel" AS ENUM ('EMAIL','SMS','SLACK','IN_APP','WHATSAPP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentArtifactKind" AS ENUM
    ('RESEARCH_NOTE','BRIEFING','HYPOTHESIS','ANALYSIS','DRAFT','REVIEW','DECISION_LOG','QUESTION','OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------
-- 4. New tables
-- ---------------------------------------------------------------------

-- engagements: one per client engagement phase. Multiple engagements per org over time.
CREATE TABLE IF NOT EXISTS public.engagements (
  id                    text PRIMARY KEY,
  org_id                text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name                  text NOT NULL,
  status                "EngagementStatus" NOT NULL DEFAULT 'PROSPECT',
  phase                 "EngagementPhase"  NOT NULL DEFAULT 'DISCOVERY',
  contract_value        numeric(10,2),
  contract_currency     text DEFAULT 'USD',
  signed_at             timestamp(3),
  started_at            timestamp(3),
  expected_complete_at  timestamp(3),
  completed_at          timestamp(3),
  context_summary       text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS engagements_org_id_status_idx ON public.engagements(org_id, status);

-- transcripts: discovery-call and progress-call transcripts. Primary input for agent fleet.
CREATE TABLE IF NOT EXISTS public.transcripts (
  id             text PRIMARY KEY,
  engagement_id  text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id         text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind           "TranscriptKind" NOT NULL DEFAULT 'DISCOVERY_CALL',
  title          text,
  source         text,
  source_url     text,
  meeting_date   timestamp(3),
  raw_text       text NOT NULL,
  summary        text,
  participants   jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS transcripts_engagement_id_idx ON public.transcripts(engagement_id);

-- client_documents: contracts, NDAs, briefs, decks. PDFs/HTML uploaded or referenced.
CREATE TABLE IF NOT EXISTS public.client_documents (
  id             text PRIMARY KEY,
  engagement_id  text REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id         text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind           "DocumentKind" NOT NULL,
  title          text NOT NULL,
  file_path      text,
  storage_url    text,
  content_text   text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS client_documents_org_id_idx        ON public.client_documents(org_id);
CREATE INDEX IF NOT EXISTS client_documents_engagement_id_idx ON public.client_documents(engagement_id);

-- audit_runs: a single agent fleet pass for an engagement. Groups related agent_runs and findings.
CREATE TABLE IF NOT EXISTS public.audit_runs (
  id              text PRIMARY KEY,
  engagement_id   text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id          text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  profile         text NOT NULL,
  status          "AuditRunStatus" NOT NULL DEFAULT 'QUEUED',
  started_at      timestamp(3),
  finished_at     timestamp(3),
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary         text,
  risk_score      double precision,
  error_message   text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_runs_engagement_id_status_idx ON public.audit_runs(engagement_id, status);

-- agent_tasks: the agent fleet's work queue. Agents pick these up and execute.
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id              text PRIMARY KEY,
  engagement_id   text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id          text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  parent_task_id  text REFERENCES public.agent_tasks(id) ON DELETE SET NULL ON UPDATE CASCADE,
  title           text NOT NULL,
  description     text,
  kind            "AgentTaskKind" NOT NULL,
  status          "AgentTaskStatus" NOT NULL DEFAULT 'PROPOSED',
  priority        integer NOT NULL DEFAULT 50,
  assigned_agent  text,
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  output          jsonb,
  error_message   text,
  started_at      timestamp(3),
  completed_at    timestamp(3),
  deadline        timestamp(3),
  risk_level      text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS agent_tasks_engagement_id_status_priority_idx
  ON public.agent_tasks(engagement_id, status, priority DESC);

-- agent_runs: each execution of an agent on a task. Cost/token tracking.
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id              text PRIMARY KEY,
  agent_task_id   text REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  audit_run_id    text REFERENCES public.audit_runs(id)  ON DELETE SET NULL,
  engagement_id   text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  agent_name      text NOT NULL,
  status          "AgentRunStatus" NOT NULL,
  started_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     timestamp(3),
  inputs          jsonb,
  output          jsonb,
  tokens_used     integer,
  cost_usd        numeric(10,4),
  error_message   text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS agent_runs_agent_task_id_idx ON public.agent_runs(agent_task_id);
CREATE INDEX IF NOT EXISTS agent_runs_audit_run_id_idx  ON public.agent_runs(audit_run_id);

-- findings: granular findings from agents. Severity-tiered.
CREATE TABLE IF NOT EXISTS public.findings (
  id             text PRIMARY KEY,
  engagement_id  text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  audit_run_id   text REFERENCES public.audit_runs(id) ON DELETE SET NULL,
  org_id         text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  agent_source   text NOT NULL,
  category       text NOT NULL,
  severity       "FindingSeverity" NOT NULL DEFAULT 'MEDIUM',
  title          text NOT NULL,
  description    text NOT NULL,
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  metric_value   double precision,
  confidence     double precision,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS findings_engagement_id_severity_idx ON public.findings(engagement_id, severity);

-- recommendations: actionable recommendations with impact/effort scoring and status workflow.
CREATE TABLE IF NOT EXISTS public.recommendations (
  id                text PRIMARY KEY,
  engagement_id     text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id            text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title             text NOT NULL,
  description       text NOT NULL,
  rationale         text,
  impact_score      integer,
  effort_score      integer,
  status            "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
  priority_rank     integer,
  proposed_tools    jsonb DEFAULT '[]'::jsonb,
  related_findings  jsonb DEFAULT '[]'::jsonb,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS recommendations_engagement_id_status_idx ON public.recommendations(engagement_id, status);

-- deliverables: polished outputs (Gamma decks, Slides URLs, PDFs, PR links, etc.)
CREATE TABLE IF NOT EXISTS public.deliverables (
  id                  text PRIMARY KEY,
  engagement_id       text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id              text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind                "DeliverableKind" NOT NULL,
  status              "DeliverableStatus" NOT NULL DEFAULT 'DRAFT',
  title               text NOT NULL,
  summary             text,
  external_url        text,
  file_path           text,
  generated_by_agent  text,
  version             integer NOT NULL DEFAULT 1,
  delivered_at        timestamp(3),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deliverables_engagement_id_status_idx ON public.deliverables(engagement_id, status);

-- messages: text-agent chat history (inbound + outbound) per channel.
CREATE TABLE IF NOT EXISTS public.messages (
  id             text PRIMARY KEY,
  engagement_id  text REFERENCES public.engagements(id) ON DELETE SET NULL,
  org_id         text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction      "MessageDirection" NOT NULL,
  channel        "MessageChannel"   NOT NULL,
  subject        text,
  body           text NOT NULL,
  from_address   text,
  to_address     text,
  thread_id      text,
  agent_name     text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at        timestamp(3),
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS messages_org_id_created_at_idx ON public.messages(org_id, created_at);
CREATE INDEX IF NOT EXISTS messages_thread_id_idx          ON public.messages(thread_id);

-- agent_artifacts: the inter-agent communication channel. Structured posts.
CREATE TABLE IF NOT EXISTS public.agent_artifacts (
  id             text PRIMARY KEY,
  engagement_id  text NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id         text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  agent_task_id  text REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  author_agent   text NOT NULL,
  kind           "AgentArtifactKind" NOT NULL,
  title          text NOT NULL,
  body           text NOT NULL,
  referenced_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS agent_artifacts_engagement_id_kind_idx ON public.agent_artifacts(engagement_id, kind);

COMMIT;
