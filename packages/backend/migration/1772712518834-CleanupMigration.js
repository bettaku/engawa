export class CleanupMigration1772712518834 {
    name = 'CleanupMigration1772712518834'

    async up(queryRunner) {
        // 古いインデックスの削除
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_renote_muting_muteeId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_renote_muting_muterId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_06491459e0de1dd8ee1b86ee4d7368a2"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_2cd3b2a6b4cf0b910b260afe08"`);

        // FK削除
        await queryRunner.query(`ALTER TABLE "poll_vote" DROP CONSTRAINT IF EXISTS "FK_poll_vote_poll"`);

        // event周りの修正
        await queryRunner.query(`ALTER TABLE "event" ALTER COLUMN "metadata" SET DEFAULT '{"@context": "https://schema.org", "@type": "Event"}'`);
        await queryRunner.query(`ALTER TYPE "public"."event_notevisibility_enum" RENAME TO "event_notevisibility_enum_old"`);
        await queryRunner.query(`CREATE TYPE "event_notevisibility_enum" AS ENUM('public', 'followers', 'reacted', 'limited')`);
        await queryRunner.query(`ALTER TABLE "event" ALTER COLUMN "noteVisibility" TYPE "public"."event_notevisibility_enum" USING "noteVisibility"::"text"::"public"."event_notevisibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."event_notevisibility_enum_old"`);

        // user.canChatの修正
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "canChat" DROP DEFAULT`);

        // meta NOT NULL
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "remoteObjectStorageUseSSL" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "remoteObjectStorageUseProxy" SET NOT NULL`);

        // note_searchableBy_enumの再作成
        await queryRunner.query(`ALTER TYPE "note_searchableBy_enum" RENAME TO "note_searchableby_enum_old"`);
        await queryRunner.query(`CREATE TYPE "note_searchableby_enum" AS ENUM('public', 'followers', 'reacted', 'limited')`);
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum" USING "searchableBy"::"text"::"public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" TYPE "public"."note_searchableby_enum" USING "searchableBy"::"text"::"public"."note_searchableby_enum"`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" SET DEFAULT 'public'`);
        await queryRunner.query(`DROP TYPE "public"."note_searchableby_enum_old"`);

        // === note_draft columns ===
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "hasEvent" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "disableRightClick" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "eventMetadata" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "eventMetadata" SET DEFAULT '{"@context":"https://schema.org/","@type":"Event"}'`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "searchableBy" SET NOT NULL`);

        // === note_draft visibility enum ===
        await queryRunner.query(`ALTER TYPE "public"."note_draft_visibility_enum" RENAME TO "note_draft_visibility_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."note_draft_visibility_enum" AS ENUM('public', 'home', 'followers', 'specified', 'private')`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "visibility" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "note_draft" ALTER COLUMN "visibility" TYPE "public"."note_draft_visibility_enum" USING "visibility"::"text"::"public"."note_draft_visibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."note_draft_visibility_enum_old"`);

        // === poll: drop constraints + enum ===
        await queryRunner.query(`ALTER TABLE "poll" DROP CONSTRAINT IF EXISTS "FK_da851e06d0dfe2ef397d8b1bf1b"`);
        await queryRunner.query(`ALTER TABLE "poll" DROP CONSTRAINT IF EXISTS "UQ_da851e06d0dfe2ef397d8b1bf1b"`);
        await queryRunner.query(`ALTER TYPE "public"."poll_notevisibility_enum" RENAME TO "poll_notevisibility_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."poll_notevisibility_enum" AS ENUM('public', 'home', 'followers', 'specified', 'private')`);
        await queryRunner.query(`ALTER TABLE "poll" ALTER COLUMN "noteVisibility" TYPE "public"."poll_notevisibility_enum" USING "noteVisibility"::"text"::"public"."poll_notevisibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."poll_notevisibility_enum_old"`);

        // === promo_note: drop constraints ===
        await queryRunner.query(`ALTER TABLE "promo_note" DROP CONSTRAINT IF EXISTS "FK_e263909ca4fe5d57f8d4230dd5c"`);
        await queryRunner.query(`ALTER TABLE "promo_note" DROP CONSTRAINT IF EXISTS "UQ_e263909ca4fe5d57f8d4230dd5c"`);

        // === user_keypair: drop constraints ===
        await queryRunner.query(`ALTER TABLE "user_keypair" DROP CONSTRAINT IF EXISTS "FK_f4853eb41ab722fe05f81cedeb6"`);
        await queryRunner.query(`ALTER TABLE "user_keypair" DROP CONSTRAINT IF EXISTS "UQ_f4853eb41ab722fe05f81cedeb6"`);

        // === user_publickey: drop constraints ===
        await queryRunner.query(`ALTER TABLE "user_publickey" DROP CONSTRAINT IF EXISTS "FK_10c146e4b39b443ede016f6736d"`);
        await queryRunner.query(`ALTER TABLE "user_publickey" DROP CONSTRAINT IF EXISTS "UQ_10c146e4b39b443ede016f6736d"`);

        // === note_history visibility enum ===
        await queryRunner.query(`ALTER TYPE "public"."note_history_visibility_enum" RENAME TO "note_history_visibility_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."note_history_visibility_enum" AS ENUM('public', 'home', 'followers', 'specified', 'private')`);
        await queryRunner.query(`ALTER TABLE "note_history" ALTER COLUMN "visibility" TYPE "public"."note_history_visibility_enum" USING "visibility"::"text"::"public"."note_history_visibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."note_history_visibility_enum_old"`);

        // === Create indexes ===
        await queryRunner.query(`CREATE INDEX "IDX_22ef9dc9e442811517f31c8789" ON "drive_file" ("userHost", "isLink", "id")`);
        await queryRunner.query(`CREATE INDEX "IDX_e74020bacf28b80bed9ace40d7" ON "user" ("isIndexable")`);
        await queryRunner.query(`CREATE INDEX "IDX_e72c391f099ef17655c5c2fbe9" ON "user" ("isSensitive")`);
        await queryRunner.query(`CREATE INDEX "IDX_3fcc2c589eaefc205e0714b99c" ON "ad" ("startsAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_f7b9d338207e40e768e4a5265a" ON "instance" ("firstRetrievedAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_72689e25ff8131746cb31ef9a1" ON "note_draft" ("eventStart")`);
        await queryRunner.query(`CREATE INDEX "IDX_7eac97594bcac5ffcf2068089b" ON "renote_muting" ("muteeId")`);
        await queryRunner.query(`CREATE INDEX "IDX_7aa72a5fe76019bfe8e5e0e8b7" ON "renote_muting" ("muterId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0d801c609cec4e9eb4b6b4490c" ON "renote_muting" ("muterId", "muteeId")`);

        // === Recreate FK constraints ===
        await queryRunner.query(`ALTER TABLE "user_profile" ADD CONSTRAINT "FK_51cb79b5555effaf7d69ba1cff9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "abuse_report_notification_recipient" ADD CONSTRAINT "FK_abuse_report_notification_recipient_userId2" FOREIGN KEY ("userId") REFERENCES "user_profile"("userId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "poll" ADD CONSTRAINT "FK_da851e06d0dfe2ef397d8b1bf1b" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "promo_note" ADD CONSTRAINT "FK_e263909ca4fe5d57f8d4230dd5c" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "renote_muting" ADD CONSTRAINT "FK_7eac97594bcac5ffcf2068089b6" FOREIGN KEY ("muteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "renote_muting" ADD CONSTRAINT "FK_7aa72a5fe76019bfe8e5e0e8b7d" FOREIGN KEY ("muterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_keypair" ADD CONSTRAINT "FK_f4853eb41ab722fe05f81cedeb6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_publickey" ADD CONSTRAINT "FK_10c146e4b39b443ede016f6736d" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        // === COMMENT fixes ===
        await queryRunner.query(`COMMENT ON COLUMN "abuse_report_resolver"."updatedAt" IS 'The updated date of the AbuseReportResolver.'`);
        await queryRunner.query(`COMMENT ON COLUMN "abuse_report_resolver"."expirationDate" IS 'The expiration date of the AbuseReportResolver'`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."isIndexable" IS 'Whether the User is indexable'`);
        await queryRunner.query(`COMMENT ON COLUMN "user"."isSensitive" IS 'Whether the User is sensitive.'`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."isIndexable" IS 'Whether User is indexable.'`);
        await queryRunner.query(`COMMENT ON COLUMN "user_profile"."isSensitive" IS 'Whether User is sensitive.'`);
        await queryRunner.query(`COMMENT ON COLUMN "event"."metadata" IS 'metadata object describing the event. Follows https://schema.org/Event'`);
        await queryRunner.query(`COMMENT ON COLUMN "meta"."trustedLinkUrlPatterns" IS 'An array of URL strings or regex that can be used to omit warnings about redirects to external sites. Separate them with spaces to specify AND, and enclose them with slashes to specify regular expressions. Each item is regarded as an OR.'`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."eventStart" IS 'The start time of the event'`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."eventEnd" IS 'The end of the event'`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."eventTitle" IS 'short name of event'`);
        await queryRunner.query(`COMMENT ON COLUMN "note_draft"."eventMetadata" IS 'metadata object describing the event. Follows https://schema.org/Event'`);

    }

    async down(queryRunner) {
    }
}
