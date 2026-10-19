CREATE TABLE "activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"request_id" varchar,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"user_id" varchar,
	"user_name" text DEFAULT 'System' NOT NULL,
	"work_list_activity_id" varchar,
	"request_type_id" varchar,
	"activity_code" text,
	"scheduled_date" text,
	"created_at" date DEFAULT CURRENT_DATE NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_checklist_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" varchar NOT NULL,
	"checklist_item_id" varchar NOT NULL,
	"added_by" varchar,
	"added_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(20) NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"size" text NOT NULL,
	"upload_date" date DEFAULT CURRENT_DATE NOT NULL,
	"file_data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"title" text,
	"file_name" text NOT NULL,
	"file_type" varchar(100),
	"file_url" text,
	"file_size" integer,
	"uploaded_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"project_id" varchar,
	"request_id" varchar,
	"activity_id" varchar,
	"link" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_arabic" text,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"company" text,
	"address" text,
	"sector_type" text,
	"vat_number" varchar(15),
	"ccr_number" varchar(10),
	"logo" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numeric_id" integer NOT NULL,
	"title_english" text NOT NULL,
	"title_arabic" text NOT NULL,
	"purpose_id" varchar,
	CONSTRAINT "positions_numeric_id_unique" UNIQUE("numeric_id")
);
--> statement-breakpoint
CREATE TABLE "project_form_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"work_acceptance_enabled" boolean DEFAULT true NOT NULL,
	"work_acceptance_prefix" text DEFAULT 'WAR',
	"work_acceptance_next_number" integer DEFAULT 1,
	"work_acceptance_requires_approval" boolean DEFAULT true,
	"material_approval_enabled" boolean DEFAULT true NOT NULL,
	"material_approval_prefix" text DEFAULT 'MAR',
	"material_approval_next_number" integer DEFAULT 1,
	"material_approval_requires_approval" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"organization_id" varchar NOT NULL,
	"contractor_id" varchar,
	"consultant_id" varchar,
	"creator_id" varchar,
	"status" text NOT NULL,
	"location" text NOT NULL,
	"contract_value" numeric(12, 2) NOT NULL,
	"estimated_cost" numeric(12, 2) NOT NULL,
	"actual_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "purposes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "purposes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "request_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"title" text,
	"file_name" text NOT NULL,
	"file_type" varchar(100),
	"file_data" text,
	"uploaded_by_user_id" varchar,
	"uploaded_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_consultant_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"resident_engineer_user_id" varchar,
	"comments" text,
	"status_code" varchar(50),
	"received_at" text,
	"reviewed_at" text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "request_counters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"request_type_id" varchar NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"document_type" varchar(100),
	"document_ref" varchar(255),
	"description" text,
	"title" text,
	"file_name" text,
	"file_url" text,
	"file_size" integer,
	"mime_type" varchar(100),
	"uploaded_by" varchar,
	"uploaded_at" text DEFAULT CURRENT_TIMESTAMP,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "request_inquiries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"asked_by" varchar NOT NULL,
	"answered_by" varchar,
	"asked_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"answered_at" text
);
--> statement-breakpoint
CREATE TABLE "request_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"message" text,
	"sender_id" varchar NOT NULL,
	"sent_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_purposes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"purpose_id" varchar NOT NULL,
	"purpose_name" text NOT NULL,
	"purpose_category" varchar(50),
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "request_revisions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar NOT NULL,
	"revision_no" integer DEFAULT 0 NOT NULL,
	"current_step_id" integer,
	"title" text NOT NULL,
	"description" text,
	"work_list_activity_id" varchar,
	"work_location_id" varchar,
	"work_level_id" varchar,
	"scheduled_date" date,
	"remarks" text,
	"created_by_user_id" varchar NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_status_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"old_status" text NOT NULL,
	"new_status" text NOT NULL,
	"changed_by_user_id" varchar NOT NULL,
	"remarks" text,
	"changed_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_number" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "request_types_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
CREATE TABLE "request_work_locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"work_location_id" varchar NOT NULL,
	"unit" varchar(100),
	"zone" varchar(100),
	"block" varchar(100),
	"building" varchar(100),
	"floor" varchar(50),
	"part" varchar(100),
	"remarks" text,
	"added_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"reference_code" text NOT NULL,
	"request_type_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"contractor_id" varchar,
	"consultant_id" varchar,
	"current_status" text DEFAULT '' NOT NULL,
	"current_revision_id" varchar,
	"created_by_user_id" varchar NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_approval_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"status_code" varchar(10) NOT NULL,
	"status_label" text NOT NULL,
	"approved_by_user_id" varchar NOT NULL,
	"comments" text,
	"approved_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_checklist_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" varchar NOT NULL,
	"checklist_item_id" varchar NOT NULL,
	"response" varchar(10) NOT NULL,
	"responded_by" varchar,
	"responded_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'general' NOT NULL,
	"assigned_to" varchar,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"due_date" date
);
--> statement-breakpoint
CREATE TABLE "team_member_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"team_member_id" varchar NOT NULL,
	"request_type_id" varchar NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_arabic" text,
	"email" text NOT NULL,
	"position" text,
	"organization_id" varchar
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"request_type_id" varchar NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"team_member_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_arabic" text,
	"role" text DEFAULT 'user' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar" text,
	"phone" text,
	"photo" text,
	"signature" text,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_levels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_list_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" varchar NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_list_chapters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" varchar NOT NULL,
	"code" varchar(10) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_list_divisions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name_english" text NOT NULL,
	"name_arabic" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "work_list_divisions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "work_locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"unit_custom_number" text,
	"unit_description" text,
	"unit_zone" text,
	"unit_cluster" text,
	"unit_block" text,
	"building_no" text,
	"flat_no" text,
	"area_m2" text,
	"floor" text,
	"villa_type" text,
	"part" text
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" integer PRIMARY KEY NOT NULL,
	"request_type_id" integer NOT NULL,
	"step_name" text NOT NULL,
	"role_required" integer NOT NULL,
	"sequence_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_transitions" (
	"transition_id" integer PRIMARY KEY NOT NULL,
	"request_type_id" integer NOT NULL,
	"from_step_id" integer NOT NULL,
	"to_step_id" integer NOT NULL,
	"allowed_status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_checklist_items" ADD CONSTRAINT "activity_checklist_items_activity_id_work_list_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."work_list_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_checklist_items" ADD CONSTRAINT "activity_checklist_items_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_checklist_items" ADD CONSTRAINT "activity_checklist_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_request_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."request_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_purpose_id_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."purposes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_form_settings" ADD CONSTRAINT "project_form_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contractor_id_organizations_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_consultant_id_organizations_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_consultant_reviews" ADD CONSTRAINT "request_consultant_reviews_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_consultant_reviews" ADD CONSTRAINT "request_consultant_reviews_resident_engineer_user_id_users_id_fk" FOREIGN KEY ("resident_engineer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_counters" ADD CONSTRAINT "request_counters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_counters" ADD CONSTRAINT "request_counters_request_type_id_request_types_id_fk" FOREIGN KEY ("request_type_id") REFERENCES "public"."request_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_inquiries" ADD CONSTRAINT "request_inquiries_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_inquiries" ADD CONSTRAINT "request_inquiries_asked_by_users_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_inquiries" ADD CONSTRAINT "request_inquiries_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_purposes" ADD CONSTRAINT "request_purposes_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_purposes" ADD CONSTRAINT "request_purposes_purpose_id_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."purposes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_work_list_activity_id_work_list_activities_id_fk" FOREIGN KEY ("work_list_activity_id") REFERENCES "public"."work_list_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_work_level_id_work_levels_id_fk" FOREIGN KEY ("work_level_id") REFERENCES "public"."work_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_work_locations" ADD CONSTRAINT "request_work_locations_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_work_locations" ADD CONSTRAINT "request_work_locations_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_request_type_id_request_types_id_fk" FOREIGN KEY ("request_type_id") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_contractor_id_organizations_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_consultant_id_organizations_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_approval_status" ADD CONSTRAINT "revision_approval_status_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_approval_status" ADD CONSTRAINT "revision_approval_status_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_checklist_responses" ADD CONSTRAINT "revision_checklist_responses_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_checklist_responses" ADD CONSTRAINT "revision_checklist_responses_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_checklist_responses" ADD CONSTRAINT "revision_checklist_responses_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_team_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_permissions" ADD CONSTRAINT "team_member_permissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_permissions" ADD CONSTRAINT "team_member_permissions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_permissions" ADD CONSTRAINT "team_member_permissions_request_type_id_request_types_id_fk" FOREIGN KEY ("request_type_id") REFERENCES "public"."request_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_request_type_id_request_types_id_fk" FOREIGN KEY ("request_type_id") REFERENCES "public"."request_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_team_members" ADD CONSTRAINT "user_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_team_members" ADD CONSTRAINT "user_team_members_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_levels" ADD CONSTRAINT "work_levels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_list_activities" ADD CONSTRAINT "work_list_activities_chapter_id_work_list_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."work_list_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_list_chapters" ADD CONSTRAINT "work_list_chapters_division_id_work_list_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."work_list_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;