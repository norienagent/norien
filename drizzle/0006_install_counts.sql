ALTER TABLE "agents" ADD COLUMN "install_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "install_count" integer DEFAULT 0 NOT NULL;