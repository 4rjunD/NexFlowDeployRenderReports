-- =====================================================================
-- Migration 0002 — Real client seed (Surya, Nick, Gary)
-- =====================================================================
-- Run AFTER 0001_agent_firm_foundation_schema.sql
--
-- 1. Hard-deletes 10 test orgs (CASCADE removes their integrations,
--    onboardings, reports, etc.)
-- 2. Marks the kept-real orgs with industry + is_test=false
-- 3. Creates Sudarshan Tech (Surya) + Skkynet (Gary)
-- 4. Creates engagement records for all 3 real clients
-- 5. Seeds discovery-call transcript summaries
-- 6. Seeds contract / brief documents (file_path references local files
--    on Arjun's machine)
-- 7. Seeds the agent task queue per client
-- 8. Seeds initial findings + recommendations
-- 9. Seeds completed deliverables + drafted-not-pitched ones
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Hard-delete test orgs
-- ---------------------------------------------------------------------
DELETE FROM public.organizations
WHERE id IN (
  'cmmqtpbaq00008k39vqly8aqi', -- Demo Corp
  'cmmqzgttb00001bvfhc2j44d7', -- NexFlow Inc dupe 1
  'cmmr1cqzg0000cmexl0zuugti', -- NexFlow Inc dupe 2 (had 4 integrations - cascade-cleaned)
  'cmmrwda100000as3s86wpgact', -- NexFlow Inc dupe 3 (had integrations)
  'cmmrxq1is00006kdu8m9f2kao', -- NexFlow Inc dupe 4
  'cmmry4jgm0000mh92ovt1x5yj', -- NexFlow Inc dupe 5
  'cmmuose6o000025wbs1zg33sf', -- Kernel dupe 1
  'cmmup6j6c00006ylhomgcdqf1', -- Kernel dupe 2
  'cmmup7ntv0000vpz1gyiuqpc8', -- Kernel dupe 3 (had integrations)
  'cmn2jvht000004defhlwsz24n'  -- Marcus / Horizon Labs (fake)
);

-- ---------------------------------------------------------------------
-- 2. Mark kept-real orgs
-- ---------------------------------------------------------------------
UPDATE public.organizations
   SET industry = 'tech_internal', is_test = false
 WHERE id = 'cmmr1d0w4000042htwgwzxmoq';  -- NexFlow internal

UPDATE public.organizations
   SET industry = 'web3_platform', is_test = false
 WHERE id = 'cmmux89m400006jwtnux04pb5';  -- Resourceful (Nick)

-- ---------------------------------------------------------------------
-- 3. Create Sudarshan Tech (Surya) + Skkynet (Gary) orgs
-- ---------------------------------------------------------------------
INSERT INTO public.organizations
  (id, name, slug, domain, plan, industry, is_test, report_preferences, report_schedule, created_at, updated_at)
VALUES
  ('org_sudarshan_tech', 'Sudarshan Tech', 'sudarshan-tech', 'sudarshan-tech.com',
   'starter', 'hardware_robotics', false,
   '{"customContext":"Battery-as-a-Service automated battery swap platform for commercial EVs. Targeting ITS Congress Xiamen May 11 2026 demo. Pre-seed/self-funded targeting $2-5M seed."}'::jsonb,
   'weekly_monday', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('org_skkynet', 'Skkynet', 'skkynet', 'skkynet.com',
   'starter', 'industrial_automation', false,
   '{"customContext":"Publicly traded SKKY, primary product Cogent DataHub, sells to industrial automation engineers and CTOs. Brand voice: technical, precise, lightly formal — never colloquial, breathless, or AI-sounding. 25-year-old company pivoting tech-led to sales/marketing focus."}'::jsonb,
   'weekly_monday', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 4. Engagements
-- ---------------------------------------------------------------------
INSERT INTO public.engagements
  (id, org_id, name, status, phase, contract_value, contract_currency,
   signed_at, started_at, expected_complete_at, completed_at,
   context_summary, metadata, created_at, updated_at)
VALUES
  -- Surya Phase 1 (essentially done)
  ('eng_surya_p1', 'org_sudarshan_tech',
   'Phase 1 — Roadmap & Simulation Foundation',
   'ACTIVE', 'IMPLEMENTATION',
   5500.00, 'USD',
   '2026-04-22'::timestamp, '2026-04-22'::timestamp, NULL, NULL,
   'CAD-to-Gazebo Harmonic port of swap-station mechanical model + 9-deliverable scope. Bargavan R subcontractor (₹45k fixed) doing 8 of 9 deliverables; NexFlow handles roadmap (D1) internally. Phase 1 essentially done; Phase 2 conversation imminent.',
   '{"contractor":"Bargavan R","contractor_fee_inr":45000,"margin_usd":4500,"deliverable_count":9,"no_specific_delivery_date_clause":true,"phase_1_complete":true,"phase_2_pending":true,"client_demo_deadline":"2026-05-11","mou_future_phases":["ROS 2 automation","BMS integration","fleet sim","demo polish","ongoing technical advisory"]}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Surya Phase 2 (being scoped)
  ('eng_surya_p2', 'org_sudarshan_tech',
   'Phase 2 — ROS 2 Automation Layer (proposed)',
   'PROSPECT', 'DISCOVERY',
   NULL, 'USD', NULL, NULL, NULL, NULL,
   'Phase 2 scoping in progress. Expected scope: ROS 2 automation layer (swap sequence, state machine, safety monitor), BMS integration (state-of-charge, charge scheduling, fleet allocation), multi-station fleet simulation, demo polish for fundraising. The bigger NexFlow revenue lives here.',
   '{"upstream_engagement":"eng_surya_p1","client_funding_window":"$2-5M seed targeted","deps":["Phase 1 deliverables signed off","ROS 2 architecture brief"]}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Nick V2 Foundation Sprint (11/12 done)
  ('eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'V2 Foundation Sprint (Phase 1)',
   'ACTIVE', 'IMPLEMENTATION',
   1500.00, 'USD',
   '2026-04-10'::timestamp, '2026-04-10'::timestamp,
   '2026-06-30'::timestamp, NULL,
   '11 of 12 deliverables LIVE on resourceful-v2 main as of 2026-05-06. Outstanding: branch protection (#1) blocked on Nick upgrading to GitHub Pro ($4/mo). April 23 force-push by Nick wiped phases 1-2; recovered via re-push. Branch protection prevents recurrence.',
   '{"deliverables_done":11,"deliverables_total":12,"blocker":"Nick GitHub Pro upgrade","payment_terms":"deferred target Jun 30 backstop Sep 30","late_interest":"1%/mo capped $45","offset_clause":"token grant or commercial arrangement","force_push_incident":"2026-04-23","next_meeting":"2026-05-12"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Nick Round 2 (drafted not pitched)
  ('eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Round 2 — Mirror Sprint + Cleanup + (optional) Architecture Enforcement',
   'PROSPECT', 'DISCOVERY',
   2000.00, 'USD', NULL, NULL, NULL, NULL,
   'Round 2 pitch DRAFTED but NOT YET PITCHED. Three packages: A Mirror Sprint $1,200 (apply 12-item foundation to resourceful-onboarding-mvp- public repo), B Cleanup Execution $1,800 (Daily.co hooks dedup, Supabase consolidation, dead docs), C Architecture Enforcement $2,500 (.windsurfrules → ESLint plugins, Vitest, observability). Recommended bundle A+B for $2,000 (saves $1K vs à la carte).',
   '{"strategic_question_for_nick":"Is resourceful-onboarding-mvp- going to merge into v2, supersede it, or stay separate forever?","packages":{"A":{"name":"Mirror Sprint","price":1200,"hours":3},"B":{"name":"Cleanup Execution","price":1800,"hours":10},"C":{"name":"Architecture Enforcement","price":2500,"hours":15},"bundle_AB":{"price":2000,"hours":13}},"pitch_target":"meeting 2026-05-12"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Gary Skkynet (pre-signature, 6 lanes)
  ('eng_gary_skkynet_v1', 'org_skkynet',
   'Skkynet — Marketing Operations Sprint (6 lanes)',
   'PRE_SIGNATURE', 'DISCOVERY',
   NULL, 'USD', NULL, NULL, NULL, NULL,
   'Discovery call with Casey (head of marketing) was scheduled for Mon May 4. 6 lanes: paid media, content, attribution dashboard, trial qualification & sales handoff, conference follow-up (Hannover Messe), executive brief for Gary. 90-day commitments: 50+ qualified trial users routed; all four conferences followed up.',
   '{"workspace":"/Users/arjundixit/Downloads/GaryEngagements/clients/skkynet/","6_lanes":["paid_media","content","attribution","trial_qualification","conference_followup","executive_brief"],"90_day_commitments":["50+ qualified trial users routed","4 conferences followed up"],"operating_principles":["approval gates first automation second","read-only by default","brand voice fidelity non-negotiable","log everything","surface decisions","deadlines are commitments — flag risk 5 days early"],"client_phone":"949-887-2240","key_contact_marketing":"Casey","brand_voice":"technical precise lightly formal — never colloquial breathless or AI-sounding"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 5. Transcripts (summaries the user provided; raw Granola URLs noted in source_url)
-- ---------------------------------------------------------------------
INSERT INTO public.transcripts
  (id, engagement_id, org_id, kind, title, source, source_url, meeting_date,
   raw_text, summary, participants, metadata, created_at)
VALUES
  -- Nick — Discovery / Onboarding
  ('tr_nick_discovery', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'DISCOVERY_CALL', 'Nick discovery / GitHub onboarding',
   'Granola (summary)', 'https://notes.granola.ai/t/32168ec1-91d5-4afb-b79a-80bbced17f60',
   NULL,
$$### Onboarding Process
- Onboarded Nick with GitHub integration
- Connected GitHub successfully, Slack optional for fuller reports
- Nick's GitHub currently unorganized but sufficient context available
- Custom calendar integration possible for their open source solution
- Report delivery by end of day to Nick's email

### Service Overview & Capabilities
- 24/7 AI monitoring for development teams to prevent shipping gaps
- Dynamic integration with existing tools (JIRA, OKR systems, custom solutions)
- Customized reporting by role (CEO/CTO/non-technical founder)
- Weekly consulting calls

### Partnership Opportunity
- Nick's company (Resourceful) offers similar services to 200+ member network
- Potential revenue share model: Resourceful finds clients, NexFlow onboards them
- White glove onboarding for better user retention
- Nick wants team involvement (bring 2-3 people to next call)

### Next Steps
- First report by end of today
- Follow-up call scheduled for Thursday same time
- Pilot discussion: $100/month current budget, enterprise clients up to $2K/month$$,
   'Initial onboarding + partnership opportunity discussion. Nick connected GitHub. Resourceful has 200+ tech-company member network — potential revenue share model.',
   '[{"name":"Arjun Dixit","role":"NexFlow"},{"name":"Nick Hadfield","role":"Resourceful founder"}]'::jsonb,
   '{"granola_url":"https://notes.granola.ai/t/32168ec1-91d5-4afb-b79a-80bbced17f60","summary_only":true}'::jsonb,
   CURRENT_TIMESTAMP),

  -- Nick — V2 contributor handbook proposal
  ('tr_nick_v2_proposal', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'PROGRESS_CALL', 'Nick V2 contributor handbook proposal',
   'Granola (summary)', 'https://notes.granola.ai/t/6f7d716b-806d-4564-9586-2ac732653d41',
   NULL,
$$### Nick's Background & Location
- Based in Sacred Valley, Peru (near Cusco), GMT-5
- Works remotely for Resourceful with global hubs

### Current Nexflowinc Platform Status (his "v2")
- Built solo using AI tools (Windsurf, Cursor, Claude)
- Super stack architecture combining MapBox, AI providers, Blockchain, Daily.co
- No tests, docs, or code structure; fragile codebase
- No sprint system or contribution framework
- Real-time session data from Daily not integrated with AI
- Transitioning from Claude to custom AI ("Rizz") causing confusion

### Team Expansion Plans
- Starting with 1 contributor, scaling to 10-30 distributed contributors
- Jordan joining next week — operational genius, not developer
- Will help transition from Nick's intuitive approach

### Resourceful's Proposed Services (NexFlow → Nick)
- Architecture audit mapping full dependency graph
- Contribution onboarding framework (PR templates, contributor guide)
- Super stack architecture design review

### Pricing & Payment Discussion
- Standard onboarding: $2K upfront (discounted to $1K end-of-month)
- Nexflowinc cash-constrained, fully bootstrapped
- Alternative: deliver onboarding framework first (free), payment after demonstrating value

### Next Steps
- Resourceful prioritizing Nexflowinc project
- Onboarding framework delivery: 1-2 weeks
- Updates via text/email
- Partnership discussions after initial deliverable$$,
   'Proposal call. Nick is non-technical, building solo with AI IDEs. Codebase is fragile (no tests/docs/structure). Free onboarding framework delivered first to demonstrate value, then paid services.',
   '[{"name":"Arjun Dixit","role":"NexFlow"},{"name":"Nick Hadfield","role":"Resourceful founder"}]'::jsonb,
   '{"granola_url":"https://notes.granola.ai/t/6f7d716b-806d-4564-9586-2ac732653d41","summary_only":true}'::jsonb,
   CURRENT_TIMESTAMP),

  -- Nick — Code review + signature
  ('tr_nick_signature', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'PROGRESS_CALL', 'Nick code review + DocuSign agreement',
   'Granola (summary)', 'https://notes.granola.ai/t/a4114e38-980d-405c-b5b9-229497bb1e6d',
   NULL,
$$### Code Review & Current State
- Nick pushed 7,000 lines in single commit to main branch
- No PR structure or CI pipeline
- Three different Daily.co video call implementations in same repo
- 18 fake documentation files (AI-generated session summaries)
- Dead components and inconsistent structure throughout
- Windsurf overwrote 10 pages of work unexpectedly (Nick rotating Windsurf/Cursor/Claude)
- Preparing to onboard Jordan; current codebase unsafe for contributor onboarding
- Jordan will use Paperclip autonomous developers for v2 rebuild

### V2 Contributor Handbook & Technical Foundation
- Contributor handbook delivered, tailored to Nick's current code
- Foundation work needed before scaling team:
  1. PR pipeline implementation
  2. CI/CD setup with automated testing
  3. Code structure cleanup and standardization
  4. Proper documentation framework
- Reference case: similar team took 80h alone vs 1 week with NexFlow

### Pricing & Next Steps
- Standard service: $2,000 for one month implementation
- Offered rate: $1,500 due to cash flow constraints
- Delayed payment until contributors generating revenue
- Maintenance: few hundred per month ongoing
- Nick confirmed strong interest — believes solution worth more than asking
- Plans to promote NexFlow through super stack publicity

### Action Items
- Arjun: Send contributor handbook PDF by EOD
- Arjun: Send DocuSign agreement with delayed payment terms by EOD
- Nick: Sign agreement by EOD tomorrow
- NexFlow: Begin implementation on signature$$,
   'Code review + DocuSign signature. Nick sees the codebase issues and accepts the $1,500 V2 Foundation Sprint scope. Delayed payment terms negotiated.',
   '[{"name":"Arjun Dixit","role":"NexFlow"},{"name":"Nick Hadfield","role":"Resourceful founder"}]'::jsonb,
   '{"granola_url":"https://notes.granola.ai/t/a4114e38-980d-405c-b5b9-229497bb1e6d","summary_only":true}'::jsonb,
   CURRENT_TIMESTAMP),

  -- Surya — Engagement debrief (synthesized from prose, not a recorded call)
  ('tr_surya_debrief', 'eng_surya_p1', 'org_sudarshan_tech',
   'OTHER', 'Surya engagement debrief (compiled from email thread + Apr 22 signing)',
   'manual (Arjun debrief)', NULL,
   '2026-04-22 12:00:00'::timestamp,
$$Full Surya engagement debrief — compiled from contract files, email thread, and Bargavan progress reports as of 2026-04-29.

CLIENT: Surya Kiran Satyavolu (he/him), Bay Area, solo founder, technical background, currently consulting in aerospace/automotive to pay bills.

COMPANY: Sudarshan Tech (likely; from email domain Surya.satyavolu@sudarshan-tech.com).

THESIS: Battery-as-a-Service for commercial EVs. Subscribe to a swap network rather than own batteries; whole-battery swap in ~5 minutes. Long-term moat: ground EVs first, eVTOLs later.

WHY NOW: Ample (closest US competitor) filed Chapter 11 Dec 2025 after raising $330M. NIO/Aulton/CATL blocked from US by connected-vehicle rules. Tesla architecturally locked out (structural battery). US automated-fleet-swap market currently vacant.

FUNDING: Pre-seed/self-funded. Wife is current investor. Targeting ~$2-5M seed raise. Demo deadline: ITS Congress Xiamen May 11 2026.

TECHNICAL STACK: Cyclus (LA-based) mechanical CAD imported into Gazebo simulation. ROS 2 automation layer (swap sequence, state machine, safety monitor). BMS layer (state of charge, charge scheduling, fleet allocation).

NEXFLOW POSITIONING: Phase 1 of multi-phase technical partnership. Forward-deployed engineer with single point of contact (Arjun); specialist subcontractors from NexFlow network handle technical execution; Surya never interfaces with subs. All IP assigned to him on full payment.

CONTRACTOR REALITY (internal): Bargavan R hired as primary subcontractor at ₹45,000 fixed. NexFlow retains the roadmap deliverable (D1) — written internally. Margin ~$4,500.

PRICING: $5,500 USD fixed, $0 upfront, invoice on mutual sign-off, payment due ~30 days post sign-off, wire or Zelle. NO specific delivery date clause.

CONTRACTS: Phase 1 LoA signed Apr 22 via DocuSign. Mutual NDA signed Apr 22 (3-yr term + 3-yr survival, Delaware governing law, sub-NDA authorization). Contractor NDA + project brief sent to Bargavan.

DELIVERABLES (9): roadmap, mesh prep, URDF/SDF package, joint topology, inertial properties, collision geometry, Gazebo Harmonic world loading stably, rack-and-rail motion end-to-end, launch files + raw verification capture.

FREE PRE-ENGAGEMENT GIFT: 60K-word battery-swap research vault sent at no cost.

PROGRESS (Apr 28-29): Stationary assembly porting complete. Geometry imports cleanly into Gazebo Harmonic. Cyclus design_review unblocking the joint hierarchy gap. 1 of 3 assemblies done at static-load stage. Remaining: moving cart assembly, dock assembly, joint definitions exercised, conditional motion sequence, combined world, launch files, verification capture.

TIMELINE REALITY: Original contractor target 4 days; actual ~8+ days. Surya's hard deadline May 11. Forecast: likely 2 more weeks → tight or just-past Surya's demo window.

KEY DECISIONS RECORDED:
- Surya wants URDF with Gazebo extensions (not SDF) for ROS 2 portability
- Surya wants derived inertials from meshes + assumed densities
- Surya wants conditional/event-driven motion (not time-scripted)
- Surya wants single combined Gazebo world, single launch file
- Surya offered Cyclus team intro for joint topology gaps

PHASE 2 OUTLOOK (where bigger NexFlow revenue lives): ROS 2 automation, BMS integration, multi-station fleet sim, demo polish, ongoing technical advisory. Discussion to start after May 11 demo.$$,
   'Comprehensive engagement debrief. Phase 1 essentially done. Phase 2 (ROS 2 automation) is where the bigger NexFlow revenue lives — pitch after May 11 demo.',
   '[{"name":"Surya Kiran Satyavolu","role":"founder Sudarshan Tech"},{"name":"Arjun Dixit","role":"NexFlow"},{"name":"Bargavan R","role":"NexFlow subcontractor"}]'::jsonb,
   '{"compiled_from":["cad-to-gazebo-agreement.html","nda-surya.html","contractor-nda-bargavan.html","contractor-brief.html","email thread Apr 22-29","Bargavan progress updates"]}'::jsonb,
   CURRENT_TIMESTAMP),

  -- Gary — Casey discovery summary
  ('tr_gary_casey_discovery', 'eng_gary_skkynet_v1', 'org_skkynet',
   'DISCOVERY_CALL', 'Gary discovery — Skkynet pivot context',
   'Granola (summary)', 'https://notes.granola.ai/t/8c10cfef-3c5a-4d4f-9e0f-4bc5c617d7e3',
   NULL,
$$### Gary's Background & Current Roles
- CEO and board member of Skkynet (publicly traded, small cap OTC)
- Advisor at Paragon Software Advisors (M&A deals for SMBs)
- Small consulting company (software companies)
- Working on 3 exit deals currently (nights/weekends)

### Skkynet's Current Transition & Challenges
- Company pivot: technology-led → sales/marketing focus
- 25+ year old company, revenue needs to double annually
- Gary joined as CEO in December 2025 (5 months ago)
- Primary bottleneck: internal resistance to Gary's pace/speed
- Existing team not used to fast decision-making
- Cultural change management taking longer than expected
- Systems challenges: data scattered across Salesforce, HubSpot, accounting systems

### Sales Structure & Automation Opportunities
- Two channels: direct (Enterprise/Global strategic accounts) + resellers (tactical)
- Reseller management neglected due to resource constraints
- Goal: 37 companies → 80 companies in 2 years
- Experimenting with European automation partner

### Marketing Setup & Strategy
- Team size: 3 people total
- Regional: APAC, EMEA, Americas marketed differently
- Focus: social media (incl. TikTok, WhatsApp for Asia), in-person conferences, content reuse
- Message targeting: C-level outcomes/ROI; Engineering tech/implementation
- Creating superhero character for branding

### Next Steps
- Follow-up call scheduled: Monday 3pm CDT (same time next week)
- Include Casey (marketing head) in next call
- Gary's contact: 949-887-2240
- Discuss pricing and onboarding (15-minute call)$$,
   'Initial Gary call. Pivot from tech-led to sales/marketing-led. Internal resistance to pace. 3-person marketing team across APAC/EMEA/Americas. Casey is head of marketing.',
   '[{"name":"Gary","role":"CEO Skkynet"},{"name":"Arjun Dixit","role":"NexFlow"}]'::jsonb,
   '{"granola_url":"https://notes.granola.ai/t/8c10cfef-3c5a-4d4f-9e0f-4bc5c617d7e3","summary_only":true,"casey_call_pending":true}'::jsonb,
   CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 6. Client documents
-- ---------------------------------------------------------------------
INSERT INTO public.client_documents
  (id, engagement_id, org_id, kind, title, file_path, content_text, metadata, created_at)
VALUES
  -- Surya
  ('doc_surya_loa', 'eng_surya_p1', 'org_sudarshan_tech',
   'CONTRACT', 'Phase 1 Letter of Agreement (CAD-to-Gazebo)',
   '/Users/arjundixit/clients/surya/cad-to-gazebo-agreement.html', NULL,
   '{"signed_date":"2026-04-22","signed_via":"DocuSign","value_usd":5500,"no_specific_delivery_date_clause":true,"counterparty":"Surya Kiran Satyavolu"}'::jsonb,
   CURRENT_TIMESTAMP),
  ('doc_surya_nda', 'eng_surya_p1', 'org_sudarshan_tech',
   'NDA', 'Mutual NDA — Surya ↔ NexFlow',
   '/Users/arjundixit/clients/surya/nda-surya.html', NULL,
   '{"signed_date":"2026-04-22","term_years":3,"survival_years":3,"governing_law":"Delaware","sub_nda_authorization":true}'::jsonb,
   CURRENT_TIMESTAMP),
  ('doc_surya_contractor_nda', 'eng_surya_p1', 'org_sudarshan_tech',
   'NDA', 'Contractor NDA — NexFlow ↔ Bargavan R',
   '/Users/arjundixit/clients/surya/contractor-nda-bargavan.html', NULL,
   '{"one_way":true,"term_years":3,"governing_law":"Delaware","work_product_assigns_on_creation":true}'::jsonb,
   CURRENT_TIMESTAMP),
  ('doc_surya_contractor_brief', 'eng_surya_p1', 'org_sudarshan_tech',
   'BRIEF', 'Contractor Project Brief — Bargavan R',
   '/Users/arjundixit/clients/surya/contractor-brief.html', NULL,
   '{"fee_inr":45000,"target_turnaround_days":4,"deliverable_count":8,"client_identity_concealed":true}'::jsonb,
   CURRENT_TIMESTAMP),

  -- Nick
  ('doc_nick_handbook', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'BRIEF', 'V2 Contributor Handbook PDF (free pre-engagement gift)',
   NULL, NULL,
   '{"sent_date":"2026-04-09","cost_usd":0,"sent_to":"nickhadfield123@gmail.com"}'::jsonb,
   CURRENT_TIMESTAMP),
  ('doc_nick_sow', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'CONTRACT', 'V2 Foundation Sprint SOW',
   NULL, NULL,
   '{"signed_date":"2026-04-10","signed_via":"DocuSign","value_usd":1500,"payment_terms":"deferred target Jun 30 backstop Sep 30","late_interest":"1%/mo capped $45","offset_clause":"token grant or commercial arrangement"}'::jsonb,
   CURRENT_TIMESTAMP),

  -- Gary (workspace docs)
  ('doc_gary_workspace', 'eng_gary_skkynet_v1', 'org_skkynet',
   'BRIEF', 'Skkynet engagement workspace (6-lane scaffold)',
   '/Users/arjundixit/Downloads/GaryEngagements/clients/skkynet/', NULL,
   '{"workspace_files":["README.md","OPEN_QUESTIONS.md","POST_CALL_CHECKLIST.md","context/","lane_1_paid_media/","lane_2_content/","lane_3_attribution/","lane_4_trial_qualification/","lane_5_conference_followup/","lane_6_executive_brief/"]}'::jsonb,
   CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 7. Agent task queue (the work each client's agent fleet will do)
-- ---------------------------------------------------------------------

-- Surya tasks
INSERT INTO public.agent_tasks
  (id, engagement_id, org_id, title, description, kind, status, priority, assigned_agent, risk_level, deadline, metadata, created_at, updated_at)
VALUES
  ('task_surya_p1_roadmap', 'eng_surya_p1', 'org_sudarshan_tech',
   'Deliverable 1: Technical roadmap (multi-phase against fundraising timeline)',
   'Produce the ROS 2 / BMS / fleet sim / demo polish phases mapped against Surya''s fundraising timeline. Use the 60K-word research vault. NexFlow handles internally with Claude Code.',
   'WRITING', 'IN_PROGRESS', 90, 'roadmap_writer', 'low', '2026-05-11'::timestamp,
   '{"deliverable_number":1,"input":"60K research vault","output_format":"markdown + Gamma deck"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_p1_progress_check', 'eng_surya_p1', 'org_sudarshan_tech',
   'Track Bargavan progress on D2-D9 + flag risk to May 11 demo',
   'Daily check-in with Bargavan: stationary done, moving cart + dock pending, joints + motion sequence still ahead. Forecast: ~2 more weeks. Demo deadline May 11 at risk.',
   'COMMUNICATION', 'IN_PROGRESS', 95, 'project_tracker', 'medium', '2026-05-11'::timestamp,
   '{"contractor":"Bargavan R","assemblies_done":1,"assemblies_total":3}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_p2_scope', 'eng_surya_p2', 'org_sudarshan_tech',
   'Phase 2 scoping: ROS 2 automation layer SOW',
   'Turn the multi-phase MOU into a concrete Phase 2 Statement of Work. Scope: ROS 2 swap sequence, state machine, safety monitor. Pricing model. Deliverables list. Acceptance criteria.',
   'SYNTHESIS', 'PROPOSED', 80, 'scoping_synthesizer', 'medium', NULL,
   '{"depends_on":"task_surya_p1_roadmap","upstream_engagement":"eng_surya_p1"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_ros2_research', 'eng_surya_p2', 'org_sudarshan_tech',
   'Research: ROS 2 automation patterns for battery-swap systems',
   'Survey published ROS 2 architectures for industrial swap/lift mechanisms. Identify proprietary edge for Sudarshan. Output: research brief with recommended node graph, state machine pattern, safety monitor architecture.',
   'RESEARCH', 'PROPOSED', 70, 'research_brief_writer', 'low', NULL,
   '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_bms_research', 'eng_surya_p2', 'org_sudarshan_tech',
   'Research: BMS layer (state-of-charge, charge scheduling, fleet allocation)',
   'Survey published baselines for fleet-scale BMS. Identify proprietary edge. Output: research brief with recommended algorithms.',
   'RESEARCH', 'PROPOSED', 65, 'research_brief_writer', 'low', NULL,
   '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_fleet_sim_scope', 'eng_surya_p2', 'org_sudarshan_tech',
   'Scope: multi-station fleet simulation requirements',
   'Define what a multi-station fleet simulation needs: number of stations, vehicle arrival distributions, swap-time variance, demand patterns. Output: simulation requirements doc.',
   'SYNTHESIS', 'PROPOSED', 55, 'scoping_synthesizer', 'low', NULL,
   '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_demo_polish_plan', 'eng_surya_p2', 'org_sudarshan_tech',
   'Demo polish plan for ITS Congress Xiamen',
   'Surya''s demo deadline is May 11. Define demo narrative, what does the deck look like, what does the live sim show. Output: demo storyboard + Gamma deck.',
   'PRESENTATION', 'PROPOSED', 75, 'presentation_generator', 'low', '2026-05-11'::timestamp,
   '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_surya_investor_brief', 'eng_surya_p2', 'org_sudarshan_tech',
   'Investor brief draft (pre-seed → seed pitch deck)',
   'Draft pitch deck from 60K research vault + Phase 1 results. Sections: market void after Ample bankruptcy, technical moat, execution capacity, capital ask $2-5M.',
   'WRITING', 'PROPOSED', 60, 'pitch_writer', 'low', NULL,
   '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Nick tasks
INSERT INTO public.agent_tasks
  (id, engagement_id, org_id, title, description, kind, status, priority, assigned_agent, risk_level, deadline, metadata, created_at, updated_at)
VALUES
  ('task_nick_may12_prep', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Pre-meeting prep for May 12 (Round 2 pitch)',
   'Refresh the 11/12 status. Draft talking points. Surface the strategic question: is resourceful-onboarding-mvp- going to merge into v2, supersede it, or stay separate forever? The answer reshapes which package fits.',
   'SYNTHESIS', 'IN_PROGRESS', 100, 'meeting_prep_synthesizer', 'low', '2026-05-12'::timestamp,
   '{"meeting_date":"2026-05-12","strategic_question":"merge / supersede / stay-separate"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_nick_round2_deck', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Round 2 pitch deck (Gamma)',
   'Turn the drafted A/B/C package structure into a final Gamma deck. Lead with bundle A+B at $2,000 (saves $1K vs à la carte). Position as "standards on new repo, debt resolution on old one."',
   'PRESENTATION', 'PROPOSED', 90, 'presentation_generator', 'low', '2026-05-12'::timestamp,
   '{"packages":{"A":"Mirror Sprint $1200","B":"Cleanup Execution $1800","C":"Architecture Enforcement $2500","bundle_AB":"$2000"}}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_nick_branch_protection_nag', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'Branch protection #1 — monthly nag until shipped',
   'Outstanding deliverable from V2 Foundation Sprint. Blocked on Nick upgrading to GitHub Pro ($4/mo). Send polite monthly reminder until resolved. Critical because force-push protection is the #1 thing that prevents recurrence of the Apr 23 incident.',
   'COMMUNICATION', 'PROPOSED', 50, 'communication_agent', 'low', NULL,
   '{"deliverable_id":"#1","blocker":"GitHub Pro upgrade","incident_reference":"2026-04-23 force-push"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_nick_mirror_sprint', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Mirror Sprint execution (Package A) — apply 12-item foundation to resourceful-onboarding-mvp-',
   'Apply the same 12-item foundation that shipped to resourceful-v2 to the new public repo. Branch protection ships free since it''s public. ~3h work. Idempotent scripts.',
   'CODE_CHANGE', 'PROPOSED', 75, 'codebase_agent', 'medium', NULL,
   '{"package":"A","price":1200,"target_repo":"resourceful-onboarding-mvp-","prerequisite":"Nick approves Round 2"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_nick_cleanup_execution', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Cleanup Execution (Package B) — execute CLEANUP.md',
   'Execute the items in CLEANUP.md: Daily.co hooks dedup (3 variants → 1), Supabase consolidation (old-supabase.ts vs supabase.ts), dead docs removal (18 *_SUMMARY.md files), 20+ test-*.js debug scripts. ~10h work.',
   'CODE_CHANGE', 'PROPOSED', 70, 'codebase_agent', 'high', NULL,
   '{"package":"B","price":1800,"target_repo":"resourceful-v2","prerequisite":"Nick approves Round 2","risk":"touches Rizz AI coordination layer (high blast radius)"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_nick_arch_enforcement', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Architecture Enforcement (Package C) — translate .windsurfrules into ESLint plugins',
   'Three-layer rule (Design / Logic / Assembly) currently defined in .windsurfrules but unenforced. Translate into ESLint plugins. Add Vitest. Standardize observability. ~15h work.',
   'CODE_CHANGE', 'PROPOSED', 60, 'codebase_agent', 'high', NULL,
   '{"package":"C","price":2500,"target_repo":"resourceful-v2","prerequisite":"Nick approves Round 2 + Package B precedes"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_nick_partnership_economics', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'Partnership scoping — Resourceful 200+ member network revenue share',
   'Model out economics of the partnership Nick raised in initial call: Resourceful finds clients, NexFlow onboards them. Tech-company members. White-glove onboarding. Output: term sheet draft + revenue model.',
   'SYNTHESIS', 'PROPOSED', 40, 'partnership_synthesizer', 'low', NULL,
   '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Gary tasks
INSERT INTO public.agent_tasks
  (id, engagement_id, org_id, title, description, kind, status, priority, assigned_agent, risk_level, deadline, metadata, created_at, updated_at)
VALUES
  ('task_gary_casey_synthesis', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Discovery synthesis from Casey call (Mon May 4)',
   'Pull insights from Casey discovery call. Populate context/brand_voice.md, context/stakeholders.md, context/current_marketing_baseline.md, context/tech_stack_skkynet.md.',
   'SYNTHESIS', 'IN_PROGRESS', 100, 'discovery_synthesizer', 'low', NULL,
   '{"workspace":"/Users/arjundixit/Downloads/GaryEngagements/clients/skkynet/context/","files_to_populate":["brand_voice.md","stakeholders.md","current_marketing_baseline.md","tech_stack_skkynet.md","compliance.md"]}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_lane6_brief', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Lane 6: Weekly executive brief generator for Gary',
   'Build the read-only, internal-only weekly executive brief that Gary gets every week. Surfaces decisions made by the agent fleet, not just metrics. Lowest risk lane — ship in week 1 to buy credibility for riskier lanes.',
   'WRITING', 'PROPOSED', 95, 'executive_brief_writer', 'low', NULL,
   '{"lane":6,"risk":"lowest","mode":"internal-only","cadence":"weekly","first_brief_day":7}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_lane5_hannover', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Lane 5: Hannover Messe follow-up automation',
   'Per-recipient review for Hannover, then template + spot-check. Hannover is the deadline; miss it and engagement momentum gone.',
   'COMMUNICATION', 'PROPOSED', 90, 'communication_agent', 'medium', NULL,
   '{"lane":5,"deadline_event":"Hannover Messe","mode":"per-recipient review during calibration"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_lane2_content', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Lane 2: Content brand-voice eval + 4× baseline output by Day 30',
   'Brand-voice eval pipeline → Casey approval → publish. Brand voice fidelity is non-negotiable: technical, precise, lightly formal — never colloquial, breathless, or "AI-sounding".',
   'WRITING', 'PROPOSED', 85, 'content_writer', 'medium', NULL,
   '{"lane":2,"target":"4x baseline output by day 30","brand_voice_arbiter":"Casey"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_lane1_paid_media', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Lane 1: Paid media advisory (read-only Meta/LinkedIn/Google APIs)',
   'Read-only access to Meta/LinkedIn/Google ad accounts. Recommendations to Casey only — no autonomous spend changes until Day 30+. Highest risk lane (touches spend).',
   'ANALYSIS', 'PROPOSED', 75, 'paid_media_analyst', 'high', NULL,
   '{"lane":1,"risk":"high","mode":"advisory read-only","ramp_evaluation":"Day 30+"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_lane3_attribution', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Lane 3: Attribution dashboard (read-only end state)',
   'Build attribution dashboard. Day 30 milestone. Read-only by definition. Makes the rest legible — without it, the executive brief plateaus at activity reporting.',
   'ANALYSIS', 'PROPOSED', 70, 'attribution_builder', 'low', NULL,
   '{"lane":3,"day":30,"risk":"low"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_lane4_trial_qual', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Lane 4: Trial qualification & sales handoff (highest risk)',
   'Highest revenue leverage and highest blast radius. Per-trial human approval during calibration. Day 60 milestone. Touches sales relationship.',
   'SYNTHESIS', 'PROPOSED', 60, 'trial_qualification_agent', 'high', NULL,
   '{"lane":4,"day":60,"risk":"highest","mode":"per-trial human approval during calibration","90_day_commitment":"50+ qualified trial users routed"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_compliance_research', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Public-company compliance research',
   'SKKY is publicly traded. Map disclosure constraints, IR review process, earnings blackout calendar. BLOCKS any client-facing action across all lanes.',
   'RESEARCH', 'PROPOSED', 90, 'compliance_researcher', 'high', NULL,
   '{"company":"Skkynet","ticker":"SKKY","blocks":"any_client_facing_action"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('task_gary_day1_access_handoff', 'eng_gary_skkynet_v1', 'org_skkynet',
   'On signature: hand Day-1 access checklist to Skkynet IT',
   'Per OPEN_QUESTIONS.md §14. Triggers on engagement signature. Coordinates with Skkynet IT/security for read-only access provisioning.',
   'COMMUNICATION', 'BLOCKED', 80, 'communication_agent', 'medium', NULL,
   '{"trigger":"engagement_signed","blocker":"engagement still PRE_SIGNATURE"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 8. Initial findings (extracted from briefs by hand for v1)
-- ---------------------------------------------------------------------
INSERT INTO public.findings
  (id, engagement_id, org_id, agent_source, category, severity, title, description, evidence, confidence, created_at)
VALUES
  -- Surya
  ('find_surya_timeline_risk', 'eng_surya_p1', 'org_sudarshan_tech',
   'project_tracker', 'delivery_risk', 'HIGH',
   'Phase 1 timeline at risk vs ITS Congress May 11',
   'Original contractor target was 4 days; actual ~8+ days. As of Apr 29: 1 of 3 assemblies done at static-load stage. Forecast: ~2 more weeks → tight or just-past Surya''s May 11 demo window. Mitigation: contract has no specific delivery date clause, so timeline dispute risk is contained.',
   '{"contractor_target_days":4,"actual_days":8,"assemblies_done":1,"assemblies_total":3,"client_demo":"2026-05-11"}'::jsonb,
   0.85, CURRENT_TIMESTAMP),
  ('find_surya_phase2_revenue', 'eng_surya_p1', 'org_sudarshan_tech',
   'opportunity_synthesizer', 'opportunity', 'HIGH',
   'Phase 2 (ROS 2 automation) is where bigger NexFlow revenue lives',
   'MOU references future phases (ROS 2, BMS, fleet sim, demo polish, advisory) without committing to scope or pricing. Engage actively for post-May-11 conversation. Surya is technical and self-funded — targeting $2-5M seed; Phase 2 SOW size should match the magnitude of his fundraising window.',
   '{"future_phases":["ROS 2 automation","BMS integration","fleet sim","demo polish","ongoing technical advisory"],"client_seed_target":"$2-5M"}'::jsonb,
   0.9, CURRENT_TIMESTAMP),
  ('find_surya_subnda_ready', 'eng_surya_p1', 'org_sudarshan_tech',
   'compliance_check', 'process', 'INFO',
   'Sub-NDA infrastructure ready for adding more contractors',
   'Mutual NDA Section 4 explicitly authorizes NexFlow to share Confidential Info with specialist subcontractors under written Sub-NDAs no less protective. Bargavan Sub-NDA already drafted as template. Adding a parallel contractor on Phase 1 (or Phase 2) is contract-clean.',
   '{"sub_nda_template_path":"/Users/arjundixit/clients/surya/contractor-nda-bargavan.html"}'::jsonb,
   0.95, CURRENT_TIMESTAMP),

  -- Nick
  ('find_nick_branch_protection_block', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'codebase_agent', 'delivery_risk', 'MEDIUM',
   'Branch protection (#1) blocked on $4/mo GitHub Pro upgrade',
   'Outstanding deliverable from V2 Foundation Sprint. Nick is on free GitHub plan; branch protection on private repo requires GitHub Pro or higher. Critical because force-push protection prevents recurrence of the Apr 23 incident where Nick rebased main and dropped phases 1-2.',
   '{"missing_deliverable":"#1","cost_blocker_usd_per_month":4,"incident_reference":"2026-04-23"}'::jsonb,
   1.0, CURRENT_TIMESTAMP),
  ('find_nick_force_push_recurrence_risk', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'codebase_agent', 'delivery_risk', 'MEDIUM',
   'Force-push recurrence risk until #1 ships',
   'On Apr 23 Nick force-pushed his "Complete v2 onboarding flow" commit, rebasing main and dropping phases 1+2. Recovered via re-running idempotent scripts. Risk repeats every time Nick uses Windsurf/Cursor/Claude on main without #1 protection.',
   '{}'::jsonb, 0.9, CURRENT_TIMESTAMP),
  ('find_nick_dailyco_dedup', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'codebase_agent', 'tech_debt', 'MEDIUM',
   'Three Daily.co hook variants coexist — needs canonicalization',
   'useDailyCall.ts, useDailyCallSimple.ts, useDailyReactCall.ts all live in resourceful-v2. CLEANUP.md flags this as the #1 canonicalization decision. Round 2 Package B is scoped to fix.',
   '{"target_repo":"resourceful-v2","files":["useDailyCall.ts","useDailyCallSimple.ts","useDailyReactCall.ts"]}'::jsonb,
   1.0, CURRENT_TIMESTAMP),
  ('find_nick_new_repo_smell', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'codebase_agent', 'tech_debt', 'HIGH',
   'resourceful-onboarding-mvp- has tech debt on day one',
   'Created Apr 23 as full fork of resourceful-cockpit (deprecated v1). Already shows: old-supabase.ts next to supabase.ts, leftover lib/testV2/, Ory auth divergence from v2''s Supabase auth. Round 2 Package A applies the foundation here; Package B can extend cleanup.',
   '{"target_repo":"resourceful-onboarding-mvp-","day_one_smells":["old-supabase.ts vs supabase.ts","lib/testV2/","Ory vs Supabase auth"]}'::jsonb,
   0.9, CURRENT_TIMESTAMP),
  ('find_nick_strategic_q', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'meeting_prep_synthesizer', 'strategic', 'HIGH',
   'Strategic question: what is the resourceful-onboarding-mvp- merge plan?',
   'Is resourceful-onboarding-mvp- going to merge into v2, supersede it, or stay separate forever? The answer reshapes which Round 2 package fits. Ask BEFORE pitching any package on May 12.',
   '{"meeting_date":"2026-05-12","blocks":"Round 2 package selection"}'::jsonb,
   0.95, CURRENT_TIMESTAMP),

  -- Gary
  ('find_gary_pre_signature_blocker', 'eng_gary_skkynet_v1', 'org_skkynet',
   'discovery_synthesizer', 'engagement_status', 'INFO',
   'Pre-signature blocker — discovery context files mostly TODO',
   'Most of context/ files in Skkynet workspace are TODO until Casey discovery call notes are synthesized. Lane 6 (executive brief) build first-week start depends on context/brand_voice.md and context/stakeholders.md being populated.',
   '{"workspace_path":"/Users/arjundixit/Downloads/GaryEngagements/clients/skkynet/context/","empty_files":["brand_voice.md","stakeholders.md","current_marketing_baseline.md","tech_stack_skkynet.md","compliance.md","financial_baseline.md"]}'::jsonb,
   1.0, CURRENT_TIMESTAMP),
  ('find_gary_compliance_unscoped', 'eng_gary_skkynet_v1', 'org_skkynet',
   'compliance_researcher', 'compliance', 'HIGH',
   'Public-company disclosure constraints not yet scoped',
   'SKKY is publicly traded. Disclosure constraints, IR review process, and earnings blackout calendar all marked TODO in context/compliance.md. This BLOCKS any client-facing action across all 6 lanes — must resolve before Lane 1, 2, or 5 ships anything externally.',
   '{"ticker":"SKKY","blocks_lanes":[1,2,5]}'::jsonb,
   1.0, CURRENT_TIMESTAMP),
  ('find_gary_hannover_deadline', 'eng_gary_skkynet_v1', 'org_skkynet',
   'project_tracker', 'delivery_risk', 'MEDIUM',
   'Hannover Messe follow-up SLA gates Lane 5',
   'Lane 5 has the conference deadline anchor. Miss it and engagement momentum is gone. SLA on follow-ups must be tight. Per-recipient review during calibration window.',
   '{"lane":5,"deadline_event":"Hannover Messe"}'::jsonb,
   0.85, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 9. Recommendations
-- ---------------------------------------------------------------------
INSERT INTO public.recommendations
  (id, engagement_id, org_id, title, description, rationale, impact_score, effort_score, status, priority_rank, related_findings, created_at, updated_at)
VALUES
  -- Surya
  ('rec_surya_phase2_pitch', 'eng_surya_p1', 'org_sudarshan_tech',
   'Pitch Phase 2 (ROS 2 + BMS) immediately after May 11 demo',
   'Within 48h of Surya''s ITS Congress demo, deliver a Phase 2 SOW. Scope: ROS 2 automation layer, BMS integration, multi-station fleet sim, demo polish. Pricing should match the magnitude of his $2-5M seed window — this is where bigger NexFlow revenue lives.',
   'MOU references these phases without committing scope/pricing. Surya is technical, self-funded, and racing toward a fundraise — momentum is on our side post-demo.',
   90, 30, 'PROPOSED', 1,
   '["find_surya_phase2_revenue"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rec_surya_parallel_contractor', 'eng_surya_p1', 'org_sudarshan_tech',
   'Add parallel contractor on Phase 1 D5-D9 to recover demo timeline',
   'Bargavan is at ~1/3 with ~2 weeks to go. Surya''s May 11 demo is in jeopardy. Sub-NDA infrastructure is ready. A second contractor on parallel assemblies (moving cart, dock) could compress the path.',
   'No-specific-delivery-date clause protects us legally, but missing the demo damages the Phase 2 conversation.',
   75, 50, 'PROPOSED', 2,
   '["find_surya_timeline_risk","find_surya_subnda_ready"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Nick
  ('rec_nick_pitch_bundle_AB', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Pitch Bundle A+B at $2,000 on May 12 (skip Package C)',
   'Bundle A (Mirror Sprint, $1,200) + B (Cleanup Execution, $1,800) at $2,000 saves Nick $1K vs à la carte. Coherent story: standards on the new repo, debt resolution on the old one. Skip Package C ($2,500 Architecture Enforcement) for now — it depends on B succeeding first.',
   'Nick is cash-constrained. $2K is a stretch but feasible. C alone is too much; bundle of A+B feels like value.',
   80, 20, 'PROPOSED', 1,
   '["find_nick_dailyco_dedup","find_nick_new_repo_smell"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rec_nick_ask_strategic_q_first', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'Ask the strategic question BEFORE pitching any package',
   'Open the May 12 meeting with: "Is resourceful-onboarding-mvp- going to merge into v2, supersede it, or stay separate forever?" Don''t pitch packages until we know. Merge-in changes the answer dramatically.',
   'Pitching the wrong package because we got the strategic context wrong wastes the meeting.',
   85, 5, 'PROPOSED', 0,
   '["find_nick_strategic_q"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rec_nick_branch_protection', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'Get Nick on GitHub Pro to ship #1',
   'Branch protection on private repos requires GitHub Pro ($4/mo). Send a one-liner: "$4/mo prevents another April 23 incident; here''s the upgrade link." Polite monthly nag until done.',
   'Force-push recurrence risk persists until #1 ships. Cost to Nick: $4/mo. Cost to us: ~5 minutes to send the email.',
   60, 5, 'PROPOSED', 2,
   '["find_nick_branch_protection_block","find_nick_force_push_recurrence_risk"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Gary
  ('rec_gary_lane6_first', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Ship Lane 6 (executive brief) in week 1',
   'Lowest-risk lane (read-only, internal-only). Ships in week 1. Buys credibility for the riskier lanes. Gives Gary a weekly artifact that surfaces decisions, not just metrics.',
   'Per the engagement plan: "Lane 6 first." Pure read, low risk, immediate value.',
   85, 25, 'PROPOSED', 1,
   '["find_gary_pre_signature_blocker"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rec_gary_compliance_first_action', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Resolve public-company compliance constraints before any external lane ships',
   'SKKY ticker brings IR review, disclosure rules, earnings blackout calendar. Map all of these BEFORE Lane 1, 2, or 5 produces anything client-facing. Otherwise risk shipping content during a blackout window.',
   'Reputational + legal risk on a public company outweighs schedule pressure. Compliance scoping is cheap (research only).',
   95, 15, 'PROPOSED', 0,
   '["find_gary_compliance_unscoped"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rec_gary_hannover_calibration', 'eng_gary_skkynet_v1', 'org_skkynet',
   'Per-recipient human review on Hannover follow-ups during calibration',
   'Hannover Messe is a deadline anchor. Run first batch with full per-recipient review by Casey. After calibration window, move to template + spot-check.',
   'High blast radius (brand voice in client''s market). Calibration window de-risks before scaling.',
   75, 30, 'PROPOSED', 2,
   '["find_gary_hannover_deadline"]'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 10. Deliverables (completed + drafted-not-shipped)
-- ---------------------------------------------------------------------
INSERT INTO public.deliverables
  (id, engagement_id, org_id, kind, status, title, summary, external_url, file_path, generated_by_agent, version, delivered_at, metadata, created_at, updated_at)
VALUES
  -- Surya — Phase 1 deliverables
  ('deliv_surya_research_vault', 'eng_surya_p1', 'org_sudarshan_tech',
   'RESEARCH_BRIEF', 'DELIVERED',
   '60K-word battery-swap research vault (free pre-engagement)',
   'Market, technical, fundraising, and competitive analysis. Sent at no cost to build trust before the proposal.',
   NULL, NULL, NULL, 1,
   '2026-04-19'::timestamp,
   '{"word_count":60000,"cost_usd":0,"reason":"trust-build pre-engagement"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('deliv_surya_loa', 'eng_surya_p1', 'org_sudarshan_tech',
   'CONTRACT', 'DELIVERED',
   'Phase 1 Letter of Agreement (signed)',
   '$5,500 fixed, $0 upfront, 9 deliverables, no specific delivery date clause, IP assigned on full payment.',
   NULL, '/Users/arjundixit/clients/surya/cad-to-gazebo-agreement.html', NULL, 1,
   '2026-04-22'::timestamp,
   '{"signing_method":"DocuSign"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('deliv_surya_nda', 'eng_surya_p1', 'org_sudarshan_tech',
   'CONTRACT', 'DELIVERED',
   'Mutual NDA (signed)',
   'Mutual, 3-year term + 3-year survival, Delaware governing law, sub-NDA authorization clause.',
   NULL, '/Users/arjundixit/clients/surya/nda-surya.html', NULL, 1,
   '2026-04-22'::timestamp,
   '{"signing_method":"DocuSign"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Nick — V2 Foundation Sprint deliverables (11 of 12 live on resourceful-v2)
  ('deliv_nick_handbook', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'EXECUTIVE_SUMMARY', 'DELIVERED',
   'V2 Contributor Handbook PDF (free)',
   'Pre-engagement gift sent April 9. GitHub collaborator setup, Supabase project access, golden rules, technical guidelines specific to Riz platform.',
   NULL, NULL, NULL, 1,
   '2026-04-09'::timestamp,
   '{"cost_usd":0,"reason":"deliver value first then pricing discussion"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('deliv_nick_sow', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'CONTRACT', 'DELIVERED',
   'V2 Foundation Sprint SOW (signed)',
   '$1,500 fixed, deferred payment target Jun 30 backstop Sep 30, 1%/mo late interest capped $45, offset clause for token grant.',
   NULL, NULL, NULL, 1,
   '2026-04-10'::timestamp,
   '{"signing_method":"DocuSign"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('deliv_nick_v2_foundation', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'CODE_PR', 'DELIVERED',
   'V2 Foundation: 11 of 12 deliverables LIVE on resourceful-v2',
   '14 distinct commits across PR template, issue templates, CODEOWNERS, CONTRIBUTING.md, setup.sh, editor configs, husky hooks, dependabot, PR size guard, CLEANUP.md. All idempotent. Verified live 2026-05-06.',
   'https://github.com/nickhadfield123-ux/resourceful-v2',
   NULL, 'codebase_agent', 1,
   '2026-05-01'::timestamp,
   '{"deliverables_done":11,"deliverables_total":12,"missing":"#1 branch protection","commits":14,"verified_live":"2026-05-06"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- Nick — Round 2 pitch (drafted, not yet pitched)
  ('deliv_nick_round2_pitch', 'eng_nick_r2', 'cmmux89m400006jwtnux04pb5',
   'PRESENTATION_DECK', 'DRAFT',
   'Round 2 pitch deck (drafted, not yet pitched)',
   '3 packages: A Mirror Sprint $1,200, B Cleanup Execution $1,800, C Architecture Enforcement $2,500. Recommended bundle A+B for $2,000.',
   NULL, NULL, NULL, 1, NULL,
   '{"target_meeting":"2026-05-12","packages":3,"recommended":"bundle A+B $2000"}'::jsonb,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------
-- 11. Audit run scaffolds (one queued audit per real client engagement)
-- ---------------------------------------------------------------------
INSERT INTO public.audit_runs
  (id, engagement_id, org_id, profile, status, inputs, summary, metadata, created_at)
VALUES
  ('audit_surya_p1_v1', 'eng_surya_p1', 'org_sudarshan_tech',
   'hardware_robotics', 'QUEUED',
   '{"transcript_ids":["tr_surya_debrief"],"document_ids":["doc_surya_loa","doc_surya_nda","doc_surya_contractor_nda","doc_surya_contractor_brief"],"agent_task_seed":"task_surya_p1_progress_check"}'::jsonb,
   NULL, '{"profile_note":"new profile to add — hardware_robotics"}'::jsonb,
   CURRENT_TIMESTAMP),
  ('audit_nick_v2_v1', 'eng_nick_v2', 'cmmux89m400006jwtnux04pb5',
   'software_engineering', 'QUEUED',
   '{"transcript_ids":["tr_nick_discovery","tr_nick_v2_proposal","tr_nick_signature"],"document_ids":["doc_nick_handbook","doc_nick_sow"],"github_repo":"nickhadfield123-ux/resourceful-v2"}'::jsonb,
   NULL, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('audit_gary_skkynet_v1', 'eng_gary_skkynet_v1', 'org_skkynet',
   'marketing', 'QUEUED',
   '{"transcript_ids":["tr_gary_casey_discovery"],"document_ids":["doc_gary_workspace"],"agent_task_seed":"task_gary_casey_synthesis"}'::jsonb,
   NULL, '{"profile_note":"new profile to add — marketing"}'::jsonb,
   CURRENT_TIMESTAMP);

COMMIT;

-- =====================================================================
-- Done. Verify with:
--   SELECT name, industry, is_test FROM organizations ORDER BY created_at;
--   SELECT id, name, status, phase FROM engagements ORDER BY created_at;
--   SELECT engagement_id, COUNT(*) FROM agent_tasks GROUP BY 1;
--   SELECT engagement_id, COUNT(*) FROM findings GROUP BY 1;
-- =====================================================================
