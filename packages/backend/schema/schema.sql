CREATE TYPE public.abuse_report_resolver_expiresat_enum AS ENUM (
    '1hour',
    '12hours',
    '1day',
    '1week',
    '1month',
    '3months',
    '6months',
    '1year',
    'indefinitely'
);

CREATE TYPE public.antenna_src_enum AS ENUM (
    'home',
    'all',
    'users',
    'list',
    'users_blacklist',
    'group'
);

CREATE TYPE public.event_notevisibility_enum AS ENUM (
    'public',
    'home',
    'followers',
    'specified',
    'private'
);

CREATE TYPE public.instance_suspensionstate_enum AS ENUM (
    'none',
    'manuallySuspended',
    'goneSuspended',
    'autoSuspendedForNotResponding'
);

CREATE TYPE public.log_level_enum AS ENUM (
    'error',
    'warning',
    'info',
    'success',
    'debug'
);

CREATE TYPE public.meta_sensitivemediadetection_enum AS ENUM (
    'none',
    'all',
    'local',
    'remote'
);

CREATE TYPE public.meta_sensitivemediadetectionsensitivity_enum AS ENUM (
    'medium',
    'low',
    'high',
    'veryLow',
    'veryHigh'
);

CREATE TYPE public.muted_note_reason_enum AS ENUM (
    'word',
    'manual',
    'spam',
    'other'
);

CREATE TYPE public.note_draft_visibility_enum AS ENUM (
    'public',
    'home',
    'followers',
    'specified',
    'private'
);

CREATE TYPE public.note_history_visibility_enum AS ENUM (
    'public',
    'home',
    'followers',
    'specified',
    'private'
);

CREATE TYPE public.note_searchableby_enum AS ENUM (
    'public',
    'followers',
    'reacted',
    'limited'
);

CREATE TYPE public.note_visibility_enum AS ENUM (
    'public',
    'home',
    'followers',
    'specified',
    'private'
);

CREATE TYPE public.notification_type_enum AS ENUM (
    'follow',
    'mention',
    'reply',
    'renote',
    'quote',
    'reaction',
    'pollVote',
    'pollEnded',
    'receiveFollowRequest',
    'followRequestAccepted',
    'groupInvited',
    'achievementEarned',
    'app'
);

CREATE TYPE public.page_visibility_enum AS ENUM (
    'public',
    'followers',
    'specified'
);

CREATE TYPE public.poll_notevisibility_enum AS ENUM (
    'public',
    'home',
    'followers',
    'specified',
    'private'
);

CREATE TYPE public.relay_status_enum AS ENUM (
    'requesting',
    'accepted',
    'rejected'
);

CREATE TYPE public.role_target_enum AS ENUM (
    'manual',
    'conditional'
);

CREATE TYPE public.user_profile_followersvisibility_enum AS ENUM (
    'public',
    'followers',
    'private'
);

CREATE TYPE public.user_profile_followingvisibility_enum AS ENUM (
    'public',
    'followers',
    'private'
);

CREATE TYPE public.user_profile_mutingnotificationtypes_enum AS ENUM (
    'note',
    'follow',
    'mention',
    'reply',
    'renote',
    'quote',
    'reaction',
    'pollEnded',
    'receiveFollowRequest',
    'followRequestAccepted',
    'achievementEarned',
    'app',
    'test',
    'pollVote',
    'groupInvited'
);

CREATE TABLE public.__chart__active_users (
    id integer NOT NULL,
    date integer NOT NULL,
    "unique_temp___registeredWithinWeek" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredWithinWeek" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredWithinMonth" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredWithinMonth" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredWithinYear" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredWithinYear" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredOutsideWeek" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredOutsideWeek" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredOutsideMonth" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredOutsideMonth" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredOutsideYear" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredOutsideYear" integer DEFAULT '0'::smallint NOT NULL,
    "___readWrite" integer DEFAULT '0'::smallint NOT NULL,
    unique_temp___read character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___read integer DEFAULT '0'::smallint NOT NULL,
    unique_temp___write character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___write integer DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart__active_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__active_users_id_seq OWNED BY public.__chart__active_users.id;

CREATE TABLE public.__chart__ap_request (
    id integer NOT NULL,
    date integer NOT NULL,
    "___deliverFailed" integer DEFAULT 0 NOT NULL,
    "___deliverSucceeded" integer DEFAULT 0 NOT NULL,
    "___inboxReceived" integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.__chart__ap_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__ap_request_id_seq OWNED BY public.__chart__ap_request.id;

CREATE TABLE public.__chart__drive (
    id integer NOT NULL,
    date integer NOT NULL,
    "___local_incCount" integer DEFAULT '0'::bigint NOT NULL,
    "___local_incSize" integer DEFAULT '0'::bigint NOT NULL,
    "___local_decCount" integer DEFAULT '0'::bigint NOT NULL,
    "___local_decSize" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_incCount" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_incSize" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_decCount" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_decSize" integer DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart__drive_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__drive_id_seq OWNED BY public.__chart__drive.id;

CREATE TABLE public.__chart__federation (
    id integer NOT NULL,
    date integer NOT NULL,
    "unique_temp___deliveredInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___deliveredInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___inboxInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___inboxInstances" smallint DEFAULT '0'::smallint NOT NULL,
    unique_temp___stalled character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___stalled smallint DEFAULT '0'::smallint NOT NULL,
    ___sub smallint DEFAULT '0'::smallint NOT NULL,
    ___pub smallint DEFAULT '0'::smallint NOT NULL,
    ___pubsub smallint DEFAULT '0'::smallint NOT NULL,
    "___subActive" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubActive" smallint DEFAULT '0'::smallint NOT NULL,
    ___software smallint DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart__federation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__federation_id_seq OWNED BY public.__chart__federation.id;

CREATE TABLE public.__chart__hashtag (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___local_users integer DEFAULT 0 NOT NULL,
    ___remote_users integer DEFAULT 0 NOT NULL,
    unique_temp___local_users character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    unique_temp___remote_users character varying[] DEFAULT '{}'::character varying[] NOT NULL
);

CREATE SEQUENCE public.__chart__hashtag_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__hashtag_id_seq OWNED BY public.__chart__hashtag.id;

CREATE TABLE public.__chart__instance (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___requests_failed smallint DEFAULT '0'::bigint NOT NULL,
    ___requests_succeeded smallint DEFAULT '0'::bigint NOT NULL,
    ___requests_received smallint DEFAULT '0'::bigint NOT NULL,
    ___notes_total integer DEFAULT '0'::bigint NOT NULL,
    ___notes_inc integer DEFAULT '0'::bigint NOT NULL,
    ___notes_dec integer DEFAULT '0'::bigint NOT NULL,
    ___notes_diffs_normal integer DEFAULT '0'::bigint NOT NULL,
    ___notes_diffs_reply integer DEFAULT '0'::bigint NOT NULL,
    ___notes_diffs_renote integer DEFAULT '0'::bigint NOT NULL,
    ___users_total integer DEFAULT '0'::bigint NOT NULL,
    ___users_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___users_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___following_total integer DEFAULT '0'::bigint NOT NULL,
    ___following_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___following_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___followers_total integer DEFAULT '0'::bigint NOT NULL,
    ___followers_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___followers_dec smallint DEFAULT '0'::bigint NOT NULL,
    "___drive_totalFiles" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_incFiles" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_incUsage" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_decFiles" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_decUsage" integer DEFAULT '0'::bigint NOT NULL,
    "___notes_diffs_withFile" integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.__chart__instance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__instance_id_seq OWNED BY public.__chart__instance.id;

CREATE TABLE public.__chart__network (
    id integer NOT NULL,
    date integer NOT NULL,
    "___incomingRequests" integer DEFAULT '0'::bigint NOT NULL,
    "___outgoingRequests" integer DEFAULT '0'::bigint NOT NULL,
    "___totalTime" integer DEFAULT '0'::bigint NOT NULL,
    "___incomingBytes" integer DEFAULT '0'::bigint NOT NULL,
    "___outgoingBytes" integer DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart__network_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__network_id_seq OWNED BY public.__chart__network.id;

CREATE TABLE public.__chart__notes (
    id integer NOT NULL,
    date integer NOT NULL,
    ___local_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_inc integer DEFAULT '0'::bigint NOT NULL,
    ___local_dec integer DEFAULT '0'::bigint NOT NULL,
    ___local_diffs_normal integer DEFAULT '0'::bigint NOT NULL,
    ___local_diffs_reply integer DEFAULT '0'::bigint NOT NULL,
    ___local_diffs_renote integer DEFAULT '0'::bigint NOT NULL,
    ___remote_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_inc integer DEFAULT '0'::bigint NOT NULL,
    ___remote_dec integer DEFAULT '0'::bigint NOT NULL,
    ___remote_diffs_normal integer DEFAULT '0'::bigint NOT NULL,
    ___remote_diffs_reply integer DEFAULT '0'::bigint NOT NULL,
    ___remote_diffs_renote integer DEFAULT '0'::bigint NOT NULL,
    "___local_diffs_withFile" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_withFile" integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.__chart__notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__notes_id_seq OWNED BY public.__chart__notes.id;

CREATE TABLE public.__chart__per_user_drive (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___totalCount" integer DEFAULT '0'::bigint NOT NULL,
    "___totalSize" integer DEFAULT '0'::bigint NOT NULL,
    "___incCount" smallint DEFAULT '0'::bigint NOT NULL,
    "___incSize" integer DEFAULT '0'::bigint NOT NULL,
    "___decCount" smallint DEFAULT '0'::bigint NOT NULL,
    "___decSize" integer DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart__per_user_drive_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__per_user_drive_id_seq OWNED BY public.__chart__per_user_drive.id;

CREATE TABLE public.__chart__per_user_following (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___local_followings_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_followings_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___local_followings_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___local_followers_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_followers_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___local_followers_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followings_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_followings_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followings_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followers_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_followers_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followers_dec smallint DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart__per_user_following_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__per_user_following_id_seq OWNED BY public.__chart__per_user_following.id;

CREATE TABLE public.__chart__per_user_notes (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___total integer DEFAULT '0'::bigint NOT NULL,
    ___inc smallint DEFAULT '0'::bigint NOT NULL,
    ___dec smallint DEFAULT '0'::bigint NOT NULL,
    ___diffs_normal smallint DEFAULT '0'::bigint NOT NULL,
    ___diffs_reply smallint DEFAULT '0'::bigint NOT NULL,
    ___diffs_renote smallint DEFAULT '0'::bigint NOT NULL,
    "___diffs_withFile" smallint DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart__per_user_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__per_user_notes_id_seq OWNED BY public.__chart__per_user_notes.id;

CREATE TABLE public.__chart__per_user_pv (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    unique_temp___upv_user character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___upv_user smallint DEFAULT '0'::smallint NOT NULL,
    ___pv_user smallint DEFAULT '0'::smallint NOT NULL,
    unique_temp___upv_visitor character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___upv_visitor smallint DEFAULT '0'::smallint NOT NULL,
    ___pv_visitor smallint DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart__per_user_pv_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__per_user_pv_id_seq OWNED BY public.__chart__per_user_pv.id;

CREATE TABLE public.__chart__per_user_reaction (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___local_count smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_count smallint DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart__per_user_reaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__per_user_reaction_id_seq OWNED BY public.__chart__per_user_reaction.id;

CREATE TABLE public.__chart__test (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128),
    ___foo_total bigint NOT NULL,
    ___foo_inc bigint NOT NULL,
    ___foo_dec bigint NOT NULL
);

CREATE TABLE public.__chart__test_grouped (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128),
    ___foo_total bigint NOT NULL,
    ___foo_inc bigint NOT NULL,
    ___foo_dec bigint NOT NULL
);

CREATE SEQUENCE public.__chart__test_grouped_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__test_grouped_id_seq OWNED BY public.__chart__test_grouped.id;

CREATE SEQUENCE public.__chart__test_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__test_id_seq OWNED BY public.__chart__test.id;

CREATE TABLE public.__chart__test_unique (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128),
    ___foo character varying[] DEFAULT '{}'::character varying[] NOT NULL
);

CREATE SEQUENCE public.__chart__test_unique_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__test_unique_id_seq OWNED BY public.__chart__test_unique.id;

CREATE TABLE public.__chart__users (
    id integer NOT NULL,
    date integer NOT NULL,
    ___local_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___local_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_dec smallint DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart__users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart__users_id_seq OWNED BY public.__chart__users.id;

CREATE TABLE public.__chart_day__active_users (
    id integer NOT NULL,
    date integer NOT NULL,
    "unique_temp___registeredWithinWeek" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredWithinWeek" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredWithinMonth" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredWithinMonth" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredWithinYear" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredWithinYear" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredOutsideWeek" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredOutsideWeek" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredOutsideMonth" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredOutsideMonth" integer DEFAULT '0'::smallint NOT NULL,
    "unique_temp___registeredOutsideYear" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___registeredOutsideYear" integer DEFAULT '0'::smallint NOT NULL,
    "___readWrite" integer DEFAULT '0'::smallint NOT NULL,
    unique_temp___read character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___read integer DEFAULT '0'::smallint NOT NULL,
    unique_temp___write character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___write integer DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart_day__active_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__active_users_id_seq OWNED BY public.__chart_day__active_users.id;

CREATE TABLE public.__chart_day__ap_request (
    id integer NOT NULL,
    date integer NOT NULL,
    "___deliverFailed" integer DEFAULT 0 NOT NULL,
    "___deliverSucceeded" integer DEFAULT 0 NOT NULL,
    "___inboxReceived" integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.__chart_day__ap_request_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__ap_request_id_seq OWNED BY public.__chart_day__ap_request.id;

CREATE TABLE public.__chart_day__drive (
    id integer NOT NULL,
    date integer NOT NULL,
    "___local_incCount" integer DEFAULT '0'::bigint NOT NULL,
    "___local_incSize" integer DEFAULT '0'::bigint NOT NULL,
    "___local_decCount" integer DEFAULT '0'::bigint NOT NULL,
    "___local_decSize" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_incCount" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_incSize" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_decCount" integer DEFAULT '0'::bigint NOT NULL,
    "___remote_decSize" integer DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart_day__drive_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__drive_id_seq OWNED BY public.__chart_day__drive.id;

CREATE TABLE public.__chart_day__federation (
    id integer NOT NULL,
    date integer NOT NULL,
    "unique_temp___deliveredInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___deliveredInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___inboxInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___inboxInstances" smallint DEFAULT '0'::smallint NOT NULL,
    unique_temp___stalled character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___stalled smallint DEFAULT '0'::smallint NOT NULL,
    ___sub smallint DEFAULT '0'::smallint NOT NULL,
    ___pub smallint DEFAULT '0'::smallint NOT NULL,
    ___pubsub smallint DEFAULT '0'::smallint NOT NULL,
    "___subActive" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubActive" smallint DEFAULT '0'::smallint NOT NULL,
    ___software smallint DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart_day__federation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__federation_id_seq OWNED BY public.__chart_day__federation.id;

CREATE TABLE public.__chart_day__hashtag (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___local_users integer DEFAULT 0 NOT NULL,
    ___remote_users integer DEFAULT 0 NOT NULL,
    unique_temp___local_users character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    unique_temp___remote_users character varying[] DEFAULT '{}'::character varying[] NOT NULL
);

CREATE SEQUENCE public.__chart_day__hashtag_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__hashtag_id_seq OWNED BY public.__chart_day__hashtag.id;

CREATE TABLE public.__chart_day__instance (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___requests_failed smallint DEFAULT '0'::bigint NOT NULL,
    ___requests_succeeded smallint DEFAULT '0'::bigint NOT NULL,
    ___requests_received smallint DEFAULT '0'::bigint NOT NULL,
    ___notes_total integer DEFAULT '0'::bigint NOT NULL,
    ___notes_inc integer DEFAULT '0'::bigint NOT NULL,
    ___notes_dec integer DEFAULT '0'::bigint NOT NULL,
    ___notes_diffs_normal integer DEFAULT '0'::bigint NOT NULL,
    ___notes_diffs_reply integer DEFAULT '0'::bigint NOT NULL,
    ___notes_diffs_renote integer DEFAULT '0'::bigint NOT NULL,
    ___users_total integer DEFAULT '0'::bigint NOT NULL,
    ___users_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___users_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___following_total integer DEFAULT '0'::bigint NOT NULL,
    ___following_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___following_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___followers_total integer DEFAULT '0'::bigint NOT NULL,
    ___followers_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___followers_dec smallint DEFAULT '0'::bigint NOT NULL,
    "___drive_totalFiles" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_incFiles" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_incUsage" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_decFiles" integer DEFAULT '0'::bigint NOT NULL,
    "___drive_decUsage" integer DEFAULT '0'::bigint NOT NULL,
    "___notes_diffs_withFile" integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.__chart_day__instance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__instance_id_seq OWNED BY public.__chart_day__instance.id;

CREATE TABLE public.__chart_day__network (
    id integer NOT NULL,
    date integer NOT NULL,
    "___incomingRequests" integer DEFAULT '0'::bigint NOT NULL,
    "___outgoingRequests" integer DEFAULT '0'::bigint NOT NULL,
    "___totalTime" integer DEFAULT '0'::bigint NOT NULL,
    "___incomingBytes" integer DEFAULT '0'::bigint NOT NULL,
    "___outgoingBytes" integer DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart_day__network_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__network_id_seq OWNED BY public.__chart_day__network.id;

CREATE TABLE public.__chart_day__notes (
    id integer NOT NULL,
    date integer NOT NULL,
    ___local_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_inc integer DEFAULT '0'::bigint NOT NULL,
    ___local_dec integer DEFAULT '0'::bigint NOT NULL,
    ___local_diffs_normal integer DEFAULT '0'::bigint NOT NULL,
    ___local_diffs_reply integer DEFAULT '0'::bigint NOT NULL,
    ___local_diffs_renote integer DEFAULT '0'::bigint NOT NULL,
    ___remote_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_inc integer DEFAULT '0'::bigint NOT NULL,
    ___remote_dec integer DEFAULT '0'::bigint NOT NULL,
    ___remote_diffs_normal integer DEFAULT '0'::bigint NOT NULL,
    ___remote_diffs_reply integer DEFAULT '0'::bigint NOT NULL,
    ___remote_diffs_renote integer DEFAULT '0'::bigint NOT NULL,
    "___local_diffs_withFile" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_withFile" integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.__chart_day__notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__notes_id_seq OWNED BY public.__chart_day__notes.id;

CREATE TABLE public.__chart_day__per_user_drive (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___totalCount" integer DEFAULT '0'::bigint NOT NULL,
    "___totalSize" integer DEFAULT '0'::bigint NOT NULL,
    "___incCount" smallint DEFAULT '0'::bigint NOT NULL,
    "___incSize" integer DEFAULT '0'::bigint NOT NULL,
    "___decCount" smallint DEFAULT '0'::bigint NOT NULL,
    "___decSize" integer DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart_day__per_user_drive_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__per_user_drive_id_seq OWNED BY public.__chart_day__per_user_drive.id;

CREATE TABLE public.__chart_day__per_user_following (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___local_followings_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_followings_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___local_followings_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___local_followers_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_followers_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___local_followers_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followings_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_followings_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followings_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followers_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_followers_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_followers_dec smallint DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart_day__per_user_following_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__per_user_following_id_seq OWNED BY public.__chart_day__per_user_following.id;

CREATE TABLE public.__chart_day__per_user_notes (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___total integer DEFAULT '0'::bigint NOT NULL,
    ___inc smallint DEFAULT '0'::bigint NOT NULL,
    ___dec smallint DEFAULT '0'::bigint NOT NULL,
    ___diffs_normal smallint DEFAULT '0'::bigint NOT NULL,
    ___diffs_reply smallint DEFAULT '0'::bigint NOT NULL,
    ___diffs_renote smallint DEFAULT '0'::bigint NOT NULL,
    "___diffs_withFile" smallint DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart_day__per_user_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__per_user_notes_id_seq OWNED BY public.__chart_day__per_user_notes.id;

CREATE TABLE public.__chart_day__per_user_pv (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    unique_temp___upv_user character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___upv_user smallint DEFAULT '0'::smallint NOT NULL,
    ___pv_user smallint DEFAULT '0'::smallint NOT NULL,
    unique_temp___upv_visitor character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    ___upv_visitor smallint DEFAULT '0'::smallint NOT NULL,
    ___pv_visitor smallint DEFAULT '0'::smallint NOT NULL
);

CREATE SEQUENCE public.__chart_day__per_user_pv_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__per_user_pv_id_seq OWNED BY public.__chart_day__per_user_pv.id;

CREATE TABLE public.__chart_day__per_user_reaction (
    id integer NOT NULL,
    date integer NOT NULL,
    "group" character varying(128) NOT NULL,
    ___local_count smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_count smallint DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart_day__per_user_reaction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__per_user_reaction_id_seq OWNED BY public.__chart_day__per_user_reaction.id;

CREATE TABLE public.__chart_day__users (
    id integer NOT NULL,
    date integer NOT NULL,
    ___local_total integer DEFAULT '0'::bigint NOT NULL,
    ___local_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___local_dec smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_total integer DEFAULT '0'::bigint NOT NULL,
    ___remote_inc smallint DEFAULT '0'::bigint NOT NULL,
    ___remote_dec smallint DEFAULT '0'::bigint NOT NULL
);

CREATE SEQUENCE public.__chart_day__users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.__chart_day__users_id_seq OWNED BY public.__chart_day__users.id;

CREATE TABLE public.abuse_report_notification_recipient (
    id character varying(32) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    name character varying(255) NOT NULL,
    method character varying(64) NOT NULL,
    "userId" character varying(32),
    "systemWebhookId" character varying(32)
);

CREATE TABLE public.abuse_report_resolver (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    name character varying(256) NOT NULL,
    "targetUserPattern" character varying(1024),
    "reporterPattern" character varying(1024),
    "reportContentPattern" character varying(1024),
    "expirationDate" timestamp with time zone,
    "expiresAt" public.abuse_report_resolver_expiresat_enum NOT NULL,
    forward boolean NOT NULL
);

COMMENT ON COLUMN public.abuse_report_resolver."updatedAt" IS 'The updated date of the AbuseReportResolver.';

COMMENT ON COLUMN public.abuse_report_resolver."expirationDate" IS 'The expiration date of the AbuseReportResolver';

CREATE TABLE public.abuse_user_report (
    id character varying(32) NOT NULL,
    "targetUserId" character varying(32) NOT NULL,
    "reporterId" character varying(32) NOT NULL,
    "assigneeId" character varying(32),
    resolved boolean DEFAULT false NOT NULL,
    comment character varying(2048) NOT NULL,
    "targetUserHost" character varying(128),
    "reporterHost" character varying(128),
    forwarded boolean DEFAULT false NOT NULL,
    "moderationNote" character varying(8192) DEFAULT ''::character varying NOT NULL,
    "resolvedAs" character varying(128)
);

COMMENT ON COLUMN public.abuse_user_report."targetUserHost" IS '[Denormalized]';

COMMENT ON COLUMN public.abuse_user_report."reporterHost" IS '[Denormalized]';

CREATE TABLE public.access_token (
    id character varying(32) NOT NULL,
    token character varying(128) NOT NULL,
    hash character varying(128) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "appId" character varying(32),
    "lastUsedAt" timestamp with time zone,
    session character varying(128),
    name character varying(128),
    description character varying(512),
    "iconUrl" character varying(512),
    permission character varying(64)[] DEFAULT '{}'::character varying[] NOT NULL,
    fetched boolean DEFAULT false NOT NULL
);

CREATE TABLE public.ad (
    id character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    place character varying(32) NOT NULL,
    priority character varying(32) NOT NULL,
    url character varying(1024) NOT NULL,
    "imageUrl" character varying(1024) NOT NULL,
    memo character varying(8192) NOT NULL,
    ratio integer DEFAULT 1 NOT NULL,
    "startsAt" timestamp with time zone DEFAULT now() NOT NULL,
    "dayOfWeek" integer DEFAULT 0 NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.ad."expiresAt" IS 'The expired date of the Ad.';

COMMENT ON COLUMN public.ad."startsAt" IS 'The expired date of the Ad.';

CREATE TABLE public.announcement (
    id character varying(32) NOT NULL,
    text character varying(8192) NOT NULL,
    title character varying(256) NOT NULL,
    "imageUrl" character varying(1024),
    "updatedAt" timestamp with time zone,
    display character varying(256) DEFAULT 'normal'::character varying NOT NULL,
    "needConfirmationToRead" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "forExistingUsers" boolean DEFAULT false NOT NULL,
    "userId" character varying(32),
    icon character varying(256) DEFAULT 'info'::character varying NOT NULL,
    silence boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.announcement."updatedAt" IS 'The updated date of the Announcement.';

CREATE TABLE public.announcement_read (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "announcementId" character varying(32) NOT NULL
);

CREATE TABLE public.antenna (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    src public.antenna_src_enum NOT NULL,
    "userListId" character varying(32),
    keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    "withFile" boolean NOT NULL,
    expression character varying(2048),
    "caseSensitive" boolean DEFAULT false NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "userGroupJoiningId" character varying(32),
    users character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "excludeKeywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "lastUsedAt" timestamp with time zone NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "excludeBots" boolean DEFAULT false NOT NULL,
    "excludeNotesInSensitiveChannel" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.antenna."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.antenna.name IS 'The name of the Antenna.';

CREATE TABLE public.app (
    id character varying(32) NOT NULL,
    "userId" character varying(32),
    secret character varying(64) NOT NULL,
    name character varying(128) NOT NULL,
    description character varying(512) NOT NULL,
    permission character varying(64)[] NOT NULL,
    "callbackUrl" character varying(512)
);

COMMENT ON COLUMN public.app."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.app.secret IS 'The secret key of the App.';

COMMENT ON COLUMN public.app.name IS 'The name of the App.';

COMMENT ON COLUMN public.app.description IS 'The description of the App.';

COMMENT ON COLUMN public.app.permission IS 'The permission of the App.';

COMMENT ON COLUMN public.app."callbackUrl" IS 'The callbackUrl of the App.';

CREATE TABLE public.auth_session (
    id character varying(32) NOT NULL,
    token character varying(128) NOT NULL,
    "userId" character varying(32),
    "appId" character varying(32) NOT NULL
);

CREATE TABLE public.avatar_decoration (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    url character varying(1024) NOT NULL,
    name character varying(256) NOT NULL,
    description character varying(2048) NOT NULL,
    "roleIdsThatCanBeUsedThisDecoration" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "remoteId" character varying(32),
    host character varying(128),
    "rawUrl" text
);

CREATE TABLE public.blocking (
    id character varying(32) NOT NULL,
    "blockeeId" character varying(32) NOT NULL,
    "blockerId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.blocking."blockeeId" IS 'The blockee user ID.';

COMMENT ON COLUMN public.blocking."blockerId" IS 'The blocker user ID.';

CREATE TABLE public.chat_approval (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "otherId" character varying(32) NOT NULL
);

CREATE TABLE public.chat_message (
    id character varying(32) NOT NULL,
    "fromUserId" character varying(32) NOT NULL,
    "toUserId" character varying(32),
    "toRoomId" character varying(32),
    text character varying(4096),
    uri character varying(512),
    reads character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "fileId" character varying(32),
    reactions character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    emojis character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

CREATE TABLE public.chat_room (
    id character varying(32) NOT NULL,
    name character varying(256) NOT NULL,
    "ownerId" character varying(32) NOT NULL,
    description character varying(2048) DEFAULT ''::character varying NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL,
    uri character varying(512),
    host character varying(128)
);

COMMENT ON COLUMN public.chat_room.uri IS 'The federation URI of the room. it will be null when the room is local.';

COMMENT ON COLUMN public.chat_room.host IS '[Denormalized] The host of the room. it will be null when the room is local.';

CREATE TABLE public.chat_room_invitation (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roomId" character varying(32) NOT NULL,
    ignored boolean DEFAULT false NOT NULL
);

CREATE TABLE public.chat_room_membership (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roomId" character varying(32) NOT NULL,
    "isMuted" boolean DEFAULT false NOT NULL
);

CREATE TABLE public.clip (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    description character varying(2048),
    "lastClippedAt" timestamp with time zone
);

COMMENT ON COLUMN public.clip."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.clip.name IS 'The name of the Clip.';

COMMENT ON COLUMN public.clip.description IS 'The description of the Clip.';

CREATE TABLE public.clip_favorite (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "clipId" character varying(32) NOT NULL
);

CREATE TABLE public.clip_note (
    id character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "clipId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.clip_note."noteId" IS 'The note ID.';

COMMENT ON COLUMN public.clip_note."clipId" IS 'The clip ID.';

CREATE TABLE public.drive_file (
    id character varying(32) NOT NULL,
    "userId" character varying(32),
    "userHost" character varying(128),
    md5 character varying(32) NOT NULL,
    name character varying(256) NOT NULL,
    type character varying(128) NOT NULL,
    size integer NOT NULL,
    comment character varying(512),
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    "storedInternal" boolean NOT NULL,
    url character varying(1024) NOT NULL,
    "thumbnailUrl" character varying(512),
    "webpublicUrl" character varying(512),
    "accessKey" character varying(256),
    "thumbnailAccessKey" character varying(256),
    "webpublicAccessKey" character varying(256),
    uri character varying(1024),
    src character varying(1024),
    "folderId" character varying(32),
    "isSensitive" boolean DEFAULT false NOT NULL,
    "isLink" boolean DEFAULT false NOT NULL,
    blurhash character varying(128),
    "webpublicType" character varying(128),
    "requestHeaders" jsonb DEFAULT '{}'::jsonb,
    "requestIp" character varying(128),
    "maybeSensitive" boolean DEFAULT false NOT NULL,
    "maybePorn" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.drive_file."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.drive_file."userHost" IS 'The host of owner. It will be null if the user in local.';

COMMENT ON COLUMN public.drive_file.md5 IS 'The MD5 hash of the DriveFile.';

COMMENT ON COLUMN public.drive_file.name IS 'The file name of the DriveFile.';

COMMENT ON COLUMN public.drive_file.type IS 'The content type (MIME) of the DriveFile.';

COMMENT ON COLUMN public.drive_file.size IS 'The file size (bytes) of the DriveFile.';

COMMENT ON COLUMN public.drive_file.comment IS 'The comment of the DriveFile.';

COMMENT ON COLUMN public.drive_file.properties IS 'The any properties of the DriveFile. For example, it includes image width/height.';

COMMENT ON COLUMN public.drive_file.url IS 'The URL of the DriveFile.';

COMMENT ON COLUMN public.drive_file."thumbnailUrl" IS 'The URL of the thumbnail of the DriveFile.';

COMMENT ON COLUMN public.drive_file."webpublicUrl" IS 'The URL of the webpublic of the DriveFile.';

COMMENT ON COLUMN public.drive_file.uri IS 'The URI of the DriveFile. it will be null when the DriveFile is local.';

COMMENT ON COLUMN public.drive_file."folderId" IS 'The parent folder ID. If null, it means the DriveFile is located in root.';

COMMENT ON COLUMN public.drive_file."isSensitive" IS 'Whether the DriveFile is NSFW.';

COMMENT ON COLUMN public.drive_file."isLink" IS 'Whether the DriveFile is direct link to remote server.';

COMMENT ON COLUMN public.drive_file.blurhash IS 'The BlurHash string.';

COMMENT ON COLUMN public.drive_file."maybeSensitive" IS 'Whether the DriveFile is NSFW. (predict)';

CREATE TABLE public.drive_folder (
    id character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    "userId" character varying(32),
    "parentId" character varying(32)
);

COMMENT ON COLUMN public.drive_folder.name IS 'The name of the DriveFolder.';

COMMENT ON COLUMN public.drive_folder."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.drive_folder."parentId" IS 'The parent folder ID. If null, it means the DriveFolder is located in root.';

CREATE TABLE public.emoji (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    name character varying(128) NOT NULL,
    host character varying(128),
    "originalUrl" character varying(512) NOT NULL,
    uri character varying(512),
    type character varying(64),
    aliases character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    category character varying(128),
    "publicUrl" character varying(512) DEFAULT ''::character varying NOT NULL,
    license character varying(1024),
    "localOnly" boolean DEFAULT false NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "roleIdsThatCanBeUsedThisEmojiAsReaction" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

CREATE TABLE public.event (
    "noteId" character varying(32) NOT NULL,
    start timestamp with time zone NOT NULL,
    "end" timestamp with time zone,
    title character varying(128) NOT NULL,
    metadata jsonb DEFAULT '{"@type": "Event", "@context": "https://schema.org/"}'::jsonb NOT NULL,
    "noteVisibility" public.event_notevisibility_enum NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userHost" character varying(128)
);

COMMENT ON COLUMN public.event.start IS 'The start time of the event';

COMMENT ON COLUMN public.event."end" IS 'The end of the event';

COMMENT ON COLUMN public.event.title IS 'short name of event';

COMMENT ON COLUMN public.event.metadata IS 'metadata object describing the event. Follows https://schema.org/Event';

COMMENT ON COLUMN public.event."noteVisibility" IS '[Denormalized]';

COMMENT ON COLUMN public.event."userId" IS '[Denormalized]';

COMMENT ON COLUMN public.event."userHost" IS '[Denormalized]';

CREATE TABLE public.flash (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    title character varying(256) NOT NULL,
    summary character varying(1024) NOT NULL,
    "userId" character varying(32) NOT NULL,
    script character varying(65536) NOT NULL,
    permissions character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    visibility character varying(512) DEFAULT 'public'::character varying NOT NULL
);

COMMENT ON COLUMN public.flash."updatedAt" IS 'The updated date of the Flash.';

COMMENT ON COLUMN public.flash."userId" IS 'The ID of author.';

CREATE TABLE public.flash_like (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "flashId" character varying(32) NOT NULL
);

CREATE TABLE public.follow_request (
    id character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL,
    "requestId" character varying(128),
    "followerHost" character varying(128),
    "followerInbox" character varying(512),
    "followerSharedInbox" character varying(512),
    "followeeHost" character varying(128),
    "followeeInbox" character varying(512),
    "followeeSharedInbox" character varying(512),
    "withReplies" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.follow_request."followeeId" IS 'The followee user ID.';

COMMENT ON COLUMN public.follow_request."followerId" IS 'The follower user ID.';

COMMENT ON COLUMN public.follow_request."requestId" IS 'id of Follow Activity.';

COMMENT ON COLUMN public.follow_request."followerHost" IS '[Denormalized]';

COMMENT ON COLUMN public.follow_request."followerInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.follow_request."followerSharedInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.follow_request."followeeHost" IS '[Denormalized]';

COMMENT ON COLUMN public.follow_request."followeeInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.follow_request."followeeSharedInbox" IS '[Denormalized]';

CREATE TABLE public.following (
    id character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL,
    "followerHost" character varying(128),
    "followerInbox" character varying(512),
    "followerSharedInbox" character varying(512),
    "followeeHost" character varying(128),
    "followeeInbox" character varying(512),
    "followeeSharedInbox" character varying(512),
    notify character varying(32),
    "withReplies" boolean DEFAULT false NOT NULL,
    "isFollowerHibernated" boolean DEFAULT false NOT NULL,
    "requestId" character varying(512)
);

COMMENT ON COLUMN public.following."followeeId" IS 'The followee user ID.';

COMMENT ON COLUMN public.following."followerId" IS 'The follower user ID.';

COMMENT ON COLUMN public.following."followerHost" IS '[Denormalized]';

COMMENT ON COLUMN public.following."followerInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.following."followerSharedInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.following."followeeHost" IS '[Denormalized]';

COMMENT ON COLUMN public.following."followeeInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.following."followeeSharedInbox" IS '[Denormalized]';

COMMENT ON COLUMN public.following."requestId" IS 'id of Follow Activity.';

CREATE TABLE public.gallery_like (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "postId" character varying(32) NOT NULL
);

CREATE TABLE public.gallery_post (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    title character varying(256) NOT NULL,
    description character varying(2048),
    "userId" character varying(32) NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    tags character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

COMMENT ON COLUMN public.gallery_post."updatedAt" IS 'The updated date of the GalleryPost.';

COMMENT ON COLUMN public.gallery_post."userId" IS 'The ID of author.';

COMMENT ON COLUMN public.gallery_post."isSensitive" IS 'Whether the post is sensitive.';

CREATE TABLE public.hashtag (
    id character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    "mentionedUserIds" character varying(32)[] NOT NULL,
    "mentionedUsersCount" integer DEFAULT 0 NOT NULL,
    "mentionedLocalUserIds" character varying(32)[] NOT NULL,
    "mentionedLocalUsersCount" integer DEFAULT 0 NOT NULL,
    "mentionedRemoteUserIds" character varying(32)[] NOT NULL,
    "mentionedRemoteUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedUserIds" character varying(32)[] NOT NULL,
    "attachedUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedLocalUserIds" character varying(32)[] NOT NULL,
    "attachedLocalUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedRemoteUserIds" character varying(32)[] NOT NULL,
    "attachedRemoteUsersCount" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.instance (
    id character varying(32) NOT NULL,
    "firstRetrievedAt" timestamp with time zone NOT NULL,
    host character varying(128) NOT NULL,
    "usersCount" integer DEFAULT 0 NOT NULL,
    "notesCount" integer DEFAULT 0 NOT NULL,
    "followingCount" integer DEFAULT 0 NOT NULL,
    "followersCount" integer DEFAULT 0 NOT NULL,
    "latestRequestReceivedAt" timestamp with time zone,
    "isNotResponding" boolean DEFAULT false NOT NULL,
    "softwareName" character varying(64),
    "softwareVersion" character varying(64),
    "openRegistrations" boolean,
    name character varying(256),
    description character varying(4096),
    "maintainerName" character varying(128),
    "maintainerEmail" character varying(256),
    "infoUpdatedAt" timestamp with time zone,
    "suspensionState" public.instance_suspensionstate_enum DEFAULT 'none'::public.instance_suspensionstate_enum NOT NULL,
    "iconUrl" character varying(256),
    "themeColor" character varying(64),
    "faviconUrl" character varying(256),
    "moderationNote" character varying(16384) DEFAULT ''::character varying NOT NULL,
    "notRespondingSince" timestamp with time zone,
    "quarantineLimited" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.instance."firstRetrievedAt" IS 'The caught date of the Instance.';

COMMENT ON COLUMN public.instance.host IS 'The host of the Instance.';

COMMENT ON COLUMN public.instance."usersCount" IS 'The count of the users of the Instance.';

COMMENT ON COLUMN public.instance."notesCount" IS 'The count of the notes of the Instance.';

COMMENT ON COLUMN public.instance."softwareName" IS 'The software of the Instance.';

CREATE TABLE public.messaging_message (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "recipientId" character varying(32),
    text character varying(4096),
    "isRead" boolean DEFAULT false NOT NULL,
    "fileId" character varying(32),
    "groupId" character varying(32),
    reads character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    uri character varying(512)
);

COMMENT ON COLUMN public.messaging_message."userId" IS 'The sender user ID.';

COMMENT ON COLUMN public.messaging_message."recipientId" IS 'The recipient user ID.';

COMMENT ON COLUMN public.messaging_message."groupId" IS 'The recipient group ID.';

CREATE TABLE public.meta (
    id character varying(32) NOT NULL,
    name character varying(1024),
    description character varying(1024),
    "maintainerName" character varying(1024),
    "maintainerEmail" character varying(1024),
    "disableRegistration" boolean DEFAULT true NOT NULL,
    langs character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hiddenTags" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "blockedHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mascotImageUrl" character varying(1024),
    "bannerUrl" character varying(1024),
    "iconUrl" character varying(1024),
    "cacheRemoteFiles" boolean DEFAULT false NOT NULL,
    "enableRecaptcha" boolean DEFAULT false NOT NULL,
    "recaptchaSiteKey" character varying(1024),
    "recaptchaSecretKey" character varying(1024),
    "urlPreviewSummaryProxyUrl" character varying(1024),
    "enableEmail" boolean DEFAULT false NOT NULL,
    email character varying(1024),
    "smtpSecure" boolean DEFAULT false NOT NULL,
    "smtpHost" character varying(1024),
    "smtpPort" integer,
    "smtpUser" character varying(1024),
    "smtpPass" character varying(1024),
    "enableServiceWorker" boolean DEFAULT false NOT NULL,
    "swPublicKey" character varying(1024),
    "swPrivateKey" character varying(1024),
    "pinnedUsers" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "termsOfServiceUrl" character varying(1024),
    "repositoryUrl" character varying(1024) DEFAULT 'https://github.com/bettaku/engawa'::character varying,
    "feedbackUrl" character varying(1024) DEFAULT 'https://github.com/bettaku/engawa/issues/new'::character varying,
    "useObjectStorage" boolean DEFAULT false NOT NULL,
    "objectStorageBucket" character varying(1024),
    "objectStoragePrefix" character varying(1024),
    "objectStorageBaseUrl" character varying(1024),
    "objectStorageEndpoint" character varying(1024),
    "objectStorageRegion" character varying(1024),
    "objectStorageAccessKey" character varying(1024),
    "objectStorageSecretKey" character varying(1024),
    "objectStoragePort" integer,
    "objectStorageUseSSL" boolean DEFAULT true NOT NULL,
    "objectStorageUseProxy" boolean DEFAULT true NOT NULL,
    "enableHcaptcha" boolean DEFAULT false NOT NULL,
    "hcaptchaSiteKey" character varying(1024),
    "hcaptchaSecretKey" character varying(1024),
    "objectStorageSetPublicRead" boolean DEFAULT false NOT NULL,
    "backgroundImageUrl" character varying(1024),
    "logoImageUrl" character varying(1024),
    "objectStorageS3ForcePathStyle" boolean DEFAULT true NOT NULL,
    "deeplAuthKey" character varying(1024),
    "deeplIsPro" boolean DEFAULT false NOT NULL,
    "emailRequiredForSignup" boolean DEFAULT false NOT NULL,
    "themeColor" character varying(1024),
    "defaultLightTheme" character varying(8192),
    "defaultDarkTheme" character varying(8192),
    "enableIpLogging" boolean DEFAULT false NOT NULL,
    "enableActiveEmailValidation" boolean DEFAULT true NOT NULL,
    "translatorType" character varying(1024),
    "enableTurnstile" boolean DEFAULT false NOT NULL,
    "turnstileSiteKey" character varying(1024),
    "turnstileSecretKey" character varying(1024),
    policies jsonb DEFAULT '{}'::jsonb NOT NULL,
    "sensitiveWords" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "enableChartsForRemoteUser" boolean DEFAULT true NOT NULL,
    "enableChartsForFederatedInstances" boolean DEFAULT true NOT NULL,
    "serverRules" character varying(280)[] DEFAULT '{}'::character varying[] NOT NULL,
    "preservedUsernames" character varying(1024)[] DEFAULT '{admin,administrator,root,system,maintainer,host,mod,moderator,owner,superuser,staff,auth,i,me,everyone,all,mention,mentions,example,user,users,account,accounts,official,help,helps,support,supports,info,information,informations,announce,announces,announcement,announcements,notice,notification,notifications,dev,developer,developers,tech,misskey,cherrypick}'::character varying[] NOT NULL,
    "ctav3SaKey" character varying(5120),
    "ctav3ProjectId" character varying(1024),
    "ctav3Location" character varying(1024),
    "ctav3Model" character varying(1024),
    "ctav3Glossary" character varying(1024),
    "serverErrorImageUrl" character varying(1024),
    "notFoundImageUrl" character varying(1024),
    "infoImageUrl" character varying(1024),
    "enableServerMachineStats" boolean DEFAULT false NOT NULL,
    "enableIdenticonGeneration" boolean DEFAULT true NOT NULL,
    "cacheRemoteSensitiveFiles" boolean DEFAULT true NOT NULL,
    "emailToReceiveAbuseReport" character varying(1024),
    "doNotSendNotificationEmailsForAbuseReport" boolean DEFAULT false NOT NULL,
    "app192IconUrl" character varying(1024),
    "app512IconUrl" character varying(1024),
    "manifestJsonOverride" character varying(8192) DEFAULT '{}'::character varying NOT NULL,
    "shortName" character varying(64),
    "impressumUrl" character varying(1024),
    "privacyPolicyUrl" character varying(1024),
    "perLocalUserUserTimelineCacheMax" integer DEFAULT 300 NOT NULL,
    "perRemoteUserUserTimelineCacheMax" integer DEFAULT 100 NOT NULL,
    "perUserHomeTimelineCacheMax" integer DEFAULT 300 NOT NULL,
    "perUserListTimelineCacheMax" integer DEFAULT 300 NOT NULL,
    "enableReceivePrerelease" boolean DEFAULT false NOT NULL,
    "skipVersion" boolean DEFAULT false NOT NULL,
    "skipCherryPickVersion" character varying(32),
    "notesPerOneAd" integer DEFAULT 0 NOT NULL,
    "silencedHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "enableFanoutTimeline" boolean DEFAULT true NOT NULL,
    "enableFanoutTimelineDbFallback" boolean DEFAULT true NOT NULL,
    "verifymailAuthKey" character varying(1024),
    "enableVerifymailApi" boolean DEFAULT false NOT NULL,
    "bubbleInstances" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "bannedEmailDomains" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "truemailInstance" character varying(1024),
    "truemailAuthKey" character varying(1024),
    "enableTruemailApi" boolean DEFAULT false NOT NULL,
    "enableMcaptcha" boolean DEFAULT false NOT NULL,
    "mcaptchaSitekey" character varying(1024),
    "mcaptchaSecretKey" character varying(1024),
    "mcaptchaInstanceUrl" character varying(1024),
    "prohibitedWords" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "statusUrl" character varying(1024),
    "urlPreviewEnabled" boolean DEFAULT true NOT NULL,
    "urlPreviewTimeout" integer DEFAULT 10000 NOT NULL,
    "urlPreviewMaximumContentLength" bigint DEFAULT 10485760 NOT NULL,
    "urlPreviewRequireContentLength" boolean DEFAULT false NOT NULL,
    "urlPreviewUserAgent" character varying(1024),
    "trustedLinkUrlPatterns" character varying(3072)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mediaSilencedHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "inquiryUrl" character varying(1024),
    "directSummalyProxy" boolean DEFAULT false NOT NULL,
    "customSplashText" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "enableReactionsBuffering" boolean DEFAULT false NOT NULL,
    "enableStatsForFederatedInstances" boolean DEFAULT true NOT NULL,
    federation character varying(128) DEFAULT 'none'::character varying NOT NULL,
    "federationHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "enableTestcaptcha" boolean DEFAULT false NOT NULL,
    "prohibitedWordsForNameOfUser" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "useRemoteObjectStorage" boolean DEFAULT false NOT NULL,
    "remoteObjectStorageBucket" character varying(1024),
    "remoteObjectStoragePrefix" character varying(1024),
    "remoteObjectStorageBaseUrl" character varying(1024),
    "remoteObjectStorageEndpoint" character varying(1024),
    "remoteObjectStorageRegion" character varying(1024),
    "remoteObjectStorageAccessKey" character varying(1024),
    "remoteObjectStorageSecretKey" character varying(1024),
    "remoteObjectStoragePort" integer,
    "remoteObjectStorageUseSSL" boolean DEFAULT true NOT NULL,
    "remoteObjectStorageUseProxy" boolean DEFAULT true NOT NULL,
    "remoteObjectStorageSetPublicRead" boolean DEFAULT false NOT NULL,
    "remoteObjectStorageS3ForcePathStyle" boolean DEFAULT true NOT NULL,
    "youBlockedImageUrl" character varying(1024),
    "disableRegistrationWhenInactive" boolean DEFAULT true NOT NULL,
    "disablePublicNoteWhenInactive" boolean DEFAULT false NOT NULL,
    "moderatorInactivityLimitDays" integer DEFAULT 7 NOT NULL,
    "libreTranslateEndPoint" character varying(1024),
    "libreTranslateApiKey" character varying(1024),
    "robotsTxt" character varying(2048),
    "customRobotsTxt" character varying(2048),
    "rootUserId" character varying(32),
    "deliverSuspendedSoftware" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "enableAuthorizedFetch" boolean DEFAULT false NOT NULL,
    "enableBotProtectionForAuthorizedFetch" boolean DEFAULT false NOT NULL,
    "singleUserMode" boolean DEFAULT false NOT NULL,
    "proxyRemoteFiles" boolean DEFAULT true NOT NULL,
    "signToActivityPubGet" boolean DEFAULT true NOT NULL,
    "allowExternalApRedirect" boolean DEFAULT true NOT NULL,
    "urlPreviewAllowRedirect" boolean DEFAULT true NOT NULL,
    "enableRemoteNotesCleaning" boolean DEFAULT false NOT NULL,
    "remoteNotesCleaningMaxProcessingDurationInMinutes" integer DEFAULT 60 NOT NULL,
    "remoteNotesCleaningExpiryDaysForEachNotes" integer DEFAULT 90 NOT NULL,
    "clientOptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "showRoleBadgesOfRemoteUsers" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.meta."trustedLinkUrlPatterns" IS 'An array of URL strings or regex that can be used to omit warnings about redirects to external sites. Separate them with spaces to specify AND, and enclose them with slashes to specify regular expressions. Each item is regarded as an OR.';

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;

CREATE TABLE public.moderation_log (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    type character varying(128) NOT NULL,
    info jsonb NOT NULL
);

CREATE TABLE public.muting (
    id character varying(32) NOT NULL,
    "muteeId" character varying(32) NOT NULL,
    "muterId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone
);

COMMENT ON COLUMN public.muting."muteeId" IS 'The mutee user ID.';

COMMENT ON COLUMN public.muting."muterId" IS 'The muter user ID.';

CREATE TABLE public.note (
    id character varying(32) NOT NULL,
    "replyId" character varying(32),
    "renoteId" character varying(32),
    text text,
    name character varying(256),
    cw character varying(512),
    "userId" character varying(32) NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "renoteCount" smallint DEFAULT 0 NOT NULL,
    "repliesCount" smallint DEFAULT 0 NOT NULL,
    reactions jsonb DEFAULT '{}'::jsonb NOT NULL,
    visibility public.note_visibility_enum NOT NULL,
    uri character varying(512),
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "attachedFileTypes" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    mentions character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mentionedRemoteUsers" text DEFAULT '[]'::text NOT NULL,
    emojis character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    tags character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hasPoll" boolean DEFAULT false NOT NULL,
    "userHost" character varying(128),
    "replyUserId" character varying(32),
    "replyUserHost" character varying(128),
    "renoteUserId" character varying(32),
    "renoteUserHost" character varying(128),
    url character varying(512),
    "disableRightClick" boolean DEFAULT false NOT NULL,
    "threadId" character varying(256),
    "reactionAcceptance" character varying(64),
    "hasEvent" boolean DEFAULT false NOT NULL,
    "clippedCount" smallint DEFAULT '0'::smallint NOT NULL,
    "updatedAt" timestamp with time zone,
    "updatedAtHistory" timestamp with time zone[],
    "reactionAndUserPairCache" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "deleteAt" timestamp with time zone,
    "searchableBy" public.note_searchableby_enum,
    "pageCount" smallint DEFAULT '0'::smallint NOT NULL,
    "renoteCounted" boolean
);

COMMENT ON COLUMN public.note."replyId" IS 'The ID of reply target.';

COMMENT ON COLUMN public.note."renoteId" IS 'The ID of renote target.';

COMMENT ON COLUMN public.note."userId" IS 'The ID of author.';

COMMENT ON COLUMN public.note.uri IS 'The URI of a note. it will be null when the note is local.';

COMMENT ON COLUMN public.note."userHost" IS '[Denormalized]';

COMMENT ON COLUMN public.note."replyUserId" IS '[Denormalized]';

COMMENT ON COLUMN public.note."replyUserHost" IS '[Denormalized]';

COMMENT ON COLUMN public.note."renoteUserId" IS '[Denormalized]';

COMMENT ON COLUMN public.note."renoteUserHost" IS '[Denormalized]';

COMMENT ON COLUMN public.note.url IS 'The human readable url of a note. it will be null when the note is local.';

CREATE TABLE public.note_draft (
    id character varying(32) NOT NULL,
    "replyId" character varying(32),
    "renoteId" character varying(32),
    text text,
    cw character varying(512),
    "userId" character varying(32) NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "reactionAcceptance" character varying(64),
    visibility public.note_draft_visibility_enum NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    hashtag character varying(128),
    "hasPoll" boolean DEFAULT false NOT NULL,
    "pollChoices" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "pollMultiple" boolean NOT NULL,
    "pollExpiresAt" timestamp with time zone,
    "pollExpiredAfter" bigint,
    "hasEvent" boolean DEFAULT false NOT NULL,
    "eventStart" timestamp with time zone,
    "eventEnd" timestamp with time zone,
    "eventTitle" character varying(128),
    "eventMetadata" jsonb DEFAULT '{"@type": "Event", "@context": "https://schema.org/"}'::jsonb,
    "disableRightClick" boolean DEFAULT false NOT NULL,
    "deleteAt" timestamp with time zone,
    "scheduledAt" timestamp with time zone,
    "isActuallyScheduled" boolean DEFAULT false NOT NULL,
    "searchableBy" public.note_searchableby_enum DEFAULT 'public'::public.note_searchableby_enum NOT NULL,
    "postedNoteId" character varying(32),
    "postedAt" timestamp with time zone,
    "postAttempts" integer DEFAULT 0 NOT NULL
);

COMMENT ON COLUMN public.note_draft."replyId" IS 'The ID of reply target.';

COMMENT ON COLUMN public.note_draft."renoteId" IS 'The ID of renote target.';

COMMENT ON COLUMN public.note_draft."userId" IS 'The ID of author.';

COMMENT ON COLUMN public.note_draft."eventStart" IS 'The start time of the event';

COMMENT ON COLUMN public.note_draft."eventEnd" IS 'The end of the event';

COMMENT ON COLUMN public.note_draft."eventTitle" IS 'short name of event';

COMMENT ON COLUMN public.note_draft."eventMetadata" IS 'metadata object describing the event. Follows https://schema.org/Event';

CREATE TABLE public.note_favorite (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

CREATE TABLE public.note_history (
    id character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "attachedFileTypes" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    emojis character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    text text,
    visibility public.note_history_visibility_enum NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    cw character varying(512),
    poll jsonb,
    event jsonb
);

CREATE TABLE public.note_outbox (
    seq bigint NOT NULL,
    type character varying(16) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    "doneSteps" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.note_outbox_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.note_outbox_seq_seq OWNED BY public.note_outbox.seq;

CREATE TABLE public.note_reaction (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    reaction character varying(260) NOT NULL
);

CREATE TABLE public.note_thread_muting (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "threadId" character varying(256) NOT NULL
);

CREATE TABLE public.note_unread (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "noteUserId" character varying(32) NOT NULL,
    "isSpecified" boolean NOT NULL,
    "isMentioned" boolean NOT NULL,
    "noteChannelId" character varying(32)
);

COMMENT ON COLUMN public.note_unread."noteUserId" IS '[Denormalized]';

COMMENT ON COLUMN public.note_unread."noteChannelId" IS '[Denormalized]';

CREATE TABLE public.note_watching (
    id character varying(32) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "noteUserId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.note_watching."createdAt" IS 'The created date of the NoteWatching.';

COMMENT ON COLUMN public.note_watching."userId" IS 'The watcher ID.';

COMMENT ON COLUMN public.note_watching."noteId" IS 'The target Note ID.';

COMMENT ON COLUMN public.note_watching."noteUserId" IS '[Denormalized]';

CREATE TABLE public.page (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    title character varying(256) NOT NULL,
    name character varying(256) NOT NULL,
    summary character varying(256),
    "alignCenter" boolean NOT NULL,
    font character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "eyeCatchingImageId" character varying(32),
    content jsonb DEFAULT '[]'::jsonb NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    visibility public.page_visibility_enum NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    "hideTitleWhenPinned" boolean DEFAULT false NOT NULL,
    script character varying(16384) DEFAULT ''::character varying NOT NULL
);

COMMENT ON COLUMN public.page."updatedAt" IS 'The updated date of the Page.';

COMMENT ON COLUMN public.page."userId" IS 'The ID of author.';

CREATE TABLE public.page_like (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "pageId" character varying(32) NOT NULL
);

CREATE TABLE public.password_reset_request (
    id character varying(32) NOT NULL,
    token character varying(256) NOT NULL,
    "userId" character varying(32) NOT NULL
);

CREATE TABLE public.poll (
    "noteId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone,
    multiple boolean NOT NULL,
    choices character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    votes integer[] NOT NULL,
    "noteVisibility" public.poll_notevisibility_enum NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userHost" character varying(128)
);

COMMENT ON COLUMN public.poll."noteVisibility" IS '[Denormalized]';

COMMENT ON COLUMN public.poll."userId" IS '[Denormalized]';

COMMENT ON COLUMN public.poll."userHost" IS '[Denormalized]';

CREATE TABLE public.poll_vote (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    choice integer NOT NULL
);

CREATE TABLE public.promo_note (
    "noteId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.promo_note."userId" IS '[Denormalized]';

CREATE TABLE public.promo_read (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

CREATE TABLE public.reaction_bake_ledger (
    "batchId" character varying(64) NOT NULL,
    "appliedAt" timestamp with time zone NOT NULL
);

CREATE TABLE public.registration_ticket (
    id character varying(32) NOT NULL,
    code character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone,
    "usedAt" timestamp with time zone,
    "pendingUserId" character varying(32),
    "createdById" character varying(32),
    "usedById" character varying(32)
);

CREATE TABLE public.registry_item (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    key character varying(1024) NOT NULL,
    scope character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    domain character varying(512),
    value jsonb DEFAULT '{}'::jsonb
);

COMMENT ON COLUMN public.registry_item."updatedAt" IS 'The updated date of the RegistryItem.';

COMMENT ON COLUMN public.registry_item."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.registry_item.key IS 'The key of the RegistryItem.';

COMMENT ON COLUMN public.registry_item.value IS 'The value of the RegistryItem.';

CREATE TABLE public.relay (
    id character varying(32) NOT NULL,
    inbox character varying(512) NOT NULL,
    status public.relay_status_enum NOT NULL
);

CREATE TABLE public.renote_muting (
    id character varying(32) NOT NULL,
    "muteeId" character varying(32) NOT NULL,
    "muterId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.renote_muting."muteeId" IS 'The mutee user ID.';

COMMENT ON COLUMN public.renote_muting."muterId" IS 'The muter user ID.';

CREATE TABLE public.retention_aggregation (
    id character varying(32) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "userIds" character varying(32)[] NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "usersCount" integer NOT NULL,
    "dateKey" character varying(512) NOT NULL
);

COMMENT ON COLUMN public.retention_aggregation."createdAt" IS 'The created date of the Note.';

COMMENT ON COLUMN public.retention_aggregation."updatedAt" IS 'The updated date of the GalleryPost.';

CREATE TABLE public.reversi_game (
    id character varying(32) NOT NULL,
    "startedAt" timestamp with time zone,
    "user1Id" character varying(32) NOT NULL,
    "user2Id" character varying(32) NOT NULL,
    "user1Ready" boolean DEFAULT false NOT NULL,
    "user2Ready" boolean DEFAULT false NOT NULL,
    black integer,
    "isStarted" boolean DEFAULT false NOT NULL,
    "isEnded" boolean DEFAULT false NOT NULL,
    "winnerId" character varying(32),
    "surrenderedUserId" character varying(32),
    logs jsonb DEFAULT '[]'::jsonb NOT NULL,
    map character varying(64)[] NOT NULL,
    bw character varying(32) NOT NULL,
    "isLlotheo" boolean DEFAULT false NOT NULL,
    "canPutEverywhere" boolean DEFAULT false NOT NULL,
    "loopedBoard" boolean DEFAULT false NOT NULL,
    form1 jsonb,
    form2 jsonb,
    crc32 character varying(32),
    "timeoutUserId" character varying(32),
    "endedAt" timestamp with time zone,
    "timeLimitForEachTurn" smallint DEFAULT '90'::smallint NOT NULL,
    "noIrregularRules" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.reversi_game."startedAt" IS 'The started date of the ReversiGame.';

COMMENT ON COLUMN public.reversi_game."endedAt" IS 'The ended date of the ReversiGame.';

CREATE TABLE public.reversi_matching (
    id character varying(32) NOT NULL,
    "parentId" character varying(32) NOT NULL,
    "childId" character varying(32) NOT NULL
);

CREATE TABLE public.role (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    name character varying(256) NOT NULL,
    description character varying(1024) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "isModerator" boolean DEFAULT false NOT NULL,
    "isAdministrator" boolean DEFAULT false NOT NULL,
    policies jsonb DEFAULT '{}'::jsonb NOT NULL,
    color character varying(256),
    "canEditMembersByModerator" boolean DEFAULT false NOT NULL,
    "lastUsedAt" timestamp with time zone NOT NULL,
    target public.role_target_enum DEFAULT 'manual'::public.role_target_enum NOT NULL,
    "condFormula" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "iconUrl" character varying(512),
    "asBadge" boolean DEFAULT false NOT NULL,
    "displayOrder" integer DEFAULT 0 NOT NULL,
    "isExplorable" boolean DEFAULT false NOT NULL,
    "preserveAssignmentOnMoveAccount" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.role."updatedAt" IS 'The updated date of the Role.';

COMMENT ON COLUMN public.role."lastUsedAt" IS 'The last used date of the Role.';

CREATE TABLE public.role_assignment (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roleId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone
);

COMMENT ON COLUMN public.role_assignment."userId" IS 'The user ID.';

COMMENT ON COLUMN public.role_assignment."roleId" IS 'The role ID.';

CREATE TABLE public.signin (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    ip character varying(128) NOT NULL,
    headers jsonb NOT NULL,
    success boolean NOT NULL
);

CREATE TABLE public.sw_subscription (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    endpoint character varying(512) NOT NULL,
    auth character varying(256) NOT NULL,
    publickey character varying(128) NOT NULL,
    "sendReadMessage" boolean DEFAULT false NOT NULL
);

CREATE TABLE public.system_account (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    type character varying(256) NOT NULL
);

CREATE TABLE public.system_webhook (
    id character varying(32) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "latestSentAt" timestamp with time zone,
    "latestStatus" integer,
    name character varying(255) NOT NULL,
    "on" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    url character varying(1024) NOT NULL,
    secret character varying(1024) NOT NULL
);

CREATE TABLE public.used_username (
    username character varying(128) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);

CREATE TABLE public."user" (
    id character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "lastFetchedAt" timestamp with time zone,
    username character varying(128) NOT NULL,
    "usernameLower" character varying(128) NOT NULL,
    name character varying(128),
    "followersCount" integer DEFAULT 0 NOT NULL,
    "followingCount" integer DEFAULT 0 NOT NULL,
    "notesCount" integer DEFAULT 0 NOT NULL,
    "avatarId" character varying(32),
    "bannerId" character varying(32),
    tags character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "isSuspended" boolean DEFAULT false NOT NULL,
    "isLocked" boolean DEFAULT false NOT NULL,
    "isBot" boolean DEFAULT false NOT NULL,
    "isCat" boolean DEFAULT false NOT NULL,
    emojis character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    host character varying(128),
    inbox character varying(512),
    "sharedInbox" character varying(512),
    featured character varying(512),
    uri character varying(512),
    token character(16),
    "isExplorable" boolean DEFAULT true NOT NULL,
    "followersUri" character varying(512),
    "lastActiveDate" timestamp with time zone,
    "hideOnlineStatus" boolean DEFAULT false NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "avatarUrl" character varying(1024),
    "bannerUrl" character varying(512),
    "avatarBlurhash" character varying(128),
    "bannerBlurhash" character varying(128),
    "movedToUri" character varying(512),
    "alsoKnownAs" text,
    "movedAt" timestamp with time zone,
    "isHibernated" boolean DEFAULT false NOT NULL,
    "avatarDecorations" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "isIndexable" boolean DEFAULT true NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    "requireSigninToViewContents" boolean DEFAULT false NOT NULL,
    "makeNotesFollowersOnlyBefore" integer,
    "makeNotesHiddenBefore" integer,
    "setFederationAvatarShape" boolean,
    "isSquareAvatars" boolean,
    "chatScope" character varying(128) DEFAULT 'mutual'::character varying NOT NULL,
    "autoDeleteNotesAfterDays" integer,
    "autoDeleteKeepFavorites" boolean DEFAULT true NOT NULL,
    "canChat" boolean
);

COMMENT ON COLUMN public."user"."updatedAt" IS 'The updated date of the User.';

COMMENT ON COLUMN public."user".username IS 'The username of the User.';

COMMENT ON COLUMN public."user"."usernameLower" IS 'The username (lowercased) of the User.';

COMMENT ON COLUMN public."user".name IS 'The name of the User.';

COMMENT ON COLUMN public."user"."followersCount" IS 'The count of followers.';

COMMENT ON COLUMN public."user"."followingCount" IS 'The count of following.';

COMMENT ON COLUMN public."user"."notesCount" IS 'The count of notes.';

COMMENT ON COLUMN public."user"."avatarId" IS 'The ID of avatar DriveFile.';

COMMENT ON COLUMN public."user"."bannerId" IS 'The ID of banner DriveFile.';

COMMENT ON COLUMN public."user"."isSuspended" IS 'Whether the User is suspended.';

COMMENT ON COLUMN public."user"."isLocked" IS 'Whether the User is locked.';

COMMENT ON COLUMN public."user"."isBot" IS 'Whether the User is a bot.';

COMMENT ON COLUMN public."user"."isCat" IS 'Whether the User is a cat.';

COMMENT ON COLUMN public."user".host IS 'The host of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user".inbox IS 'The inbox URL of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user"."sharedInbox" IS 'The sharedInbox URL of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user".featured IS 'The featured URL of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user".uri IS 'The URI of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user".token IS 'The native access token of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user"."isExplorable" IS 'Whether the User is explorable.';

COMMENT ON COLUMN public."user"."followersUri" IS 'The URI of the user Follower Collection. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public."user"."isDeleted" IS 'Whether the User is deleted.';

COMMENT ON COLUMN public."user"."movedToUri" IS 'The URI of the new account of the User';

COMMENT ON COLUMN public."user"."alsoKnownAs" IS 'URIs the user is known as too';

COMMENT ON COLUMN public."user"."movedAt" IS 'When the user moved to another account';

COMMENT ON COLUMN public."user"."isIndexable" IS 'Whether the User is indexable';

COMMENT ON COLUMN public."user"."isSensitive" IS 'Whether the User is sensitive.';

CREATE TABLE public.user_group (
    id character varying(32) NOT NULL,
    name character varying(256) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "isPrivate" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.user_group."userId" IS 'The ID of owner.';

CREATE TABLE public.user_group_invitation (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userGroupId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.user_group_invitation."userId" IS 'The user ID.';

COMMENT ON COLUMN public.user_group_invitation."userGroupId" IS 'The group ID.';

CREATE TABLE public.user_group_invite (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userGroupId" character varying(32) NOT NULL
);

CREATE TABLE public.user_group_joining (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userGroupId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.user_group_joining."userId" IS 'The user ID.';

COMMENT ON COLUMN public.user_group_joining."userGroupId" IS 'The group ID.';

CREATE TABLE public.user_ip (
    id integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    ip character varying(128) NOT NULL,
    "dnsNames" character varying(512)[] DEFAULT '{}'::character varying[] NOT NULL
);

CREATE SEQUENCE public.user_ip_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.user_ip_id_seq OWNED BY public.user_ip.id;

CREATE TABLE public.user_keypair (
    "userId" character varying(32) NOT NULL,
    "publicKey" character varying(4096) NOT NULL,
    "privateKey" character varying(4096) NOT NULL
);

CREATE TABLE public.user_list (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.user_list."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.user_list.name IS 'The name of the UserList.';

CREATE TABLE public.user_list_favorite (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userListId" character varying(32) NOT NULL
);

CREATE TABLE public.user_list_membership (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userListId" character varying(32) NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "userListUserId" character varying(32) NOT NULL
);

COMMENT ON COLUMN public.user_list_membership."userId" IS 'The user ID.';

COMMENT ON COLUMN public.user_list_membership."userListId" IS 'The list ID.';

CREATE TABLE public.user_memo (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "targetUserId" character varying(32) NOT NULL,
    memo character varying(2048) NOT NULL
);

COMMENT ON COLUMN public.user_memo."userId" IS 'The ID of author.';

COMMENT ON COLUMN public.user_memo."targetUserId" IS 'The ID of target user.';

COMMENT ON COLUMN public.user_memo.memo IS 'Memo.';

CREATE TABLE public.user_note_pining (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

CREATE TABLE public.user_pending (
    id character varying(32) NOT NULL,
    code character varying(128) NOT NULL,
    username character varying(128) NOT NULL,
    email character varying(128) NOT NULL,
    password character varying(128) NOT NULL
);

CREATE TABLE public.user_profile (
    "userId" character varying(32) NOT NULL,
    location character varying(128),
    birthday character(10),
    description character varying(2048),
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    url character varying(512),
    email character varying(128),
    "emailVerifyCode" character varying(128),
    "emailVerified" boolean DEFAULT false NOT NULL,
    "twoFactorTempSecret" character varying(128),
    "twoFactorSecret" character varying(128),
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    password character varying(128),
    "clientData" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "autoAcceptFollowed" boolean DEFAULT false NOT NULL,
    "alwaysMarkNsfw" boolean DEFAULT false NOT NULL,
    "carefulBot" boolean DEFAULT false NOT NULL,
    "userHost" character varying(128),
    "securityKeysAvailable" boolean DEFAULT false NOT NULL,
    "usePasswordLessLogin" boolean DEFAULT false NOT NULL,
    "pinnedPageId" character varying(32),
    room jsonb DEFAULT '{}'::jsonb NOT NULL,
    "injectFeaturedNote" boolean DEFAULT true NOT NULL,
    "enableWordMute" boolean DEFAULT false NOT NULL,
    "mutedWords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "noCrawle" boolean DEFAULT false NOT NULL,
    "receiveAnnouncementEmail" boolean DEFAULT true NOT NULL,
    "emailNotificationTypes" jsonb DEFAULT '["follow", "receiveFollowRequest", "groupInvited"]'::jsonb NOT NULL,
    lang character varying(32),
    "mutedInstances" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "publicReactions" boolean DEFAULT true NOT NULL,
    "autoSensitive" boolean DEFAULT false NOT NULL,
    "moderationNote" character varying(8192) DEFAULT ''::character varying NOT NULL,
    achievements jsonb DEFAULT '[]'::jsonb NOT NULL,
    "loggedInDates" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "preventAiLearning" boolean DEFAULT true NOT NULL,
    "twoFactorBackupSecret" character varying[],
    "verifiedLinks" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "notificationRecieveConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "hardMutedWords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "followingVisibility" public.user_profile_followingvisibility_enum DEFAULT 'public'::public.user_profile_followingvisibility_enum NOT NULL,
    "followersVisibility" public.user_profile_followersvisibility_enum DEFAULT 'public'::public.user_profile_followersvisibility_enum NOT NULL,
    "isIndexable" boolean DEFAULT true NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "followedMessage" character varying(256)
);

COMMENT ON COLUMN public.user_profile.location IS 'The location of the User.';

COMMENT ON COLUMN public.user_profile.birthday IS 'The birthday (YYYY-MM-DD) of the User.';

COMMENT ON COLUMN public.user_profile.description IS 'The description (bio) of the User.';

COMMENT ON COLUMN public.user_profile.url IS 'Remote URL of the user.';

COMMENT ON COLUMN public.user_profile.email IS 'The email address of the User.';

COMMENT ON COLUMN public.user_profile.password IS 'The password hash of the User. It will be null if the origin of the user is local.';

COMMENT ON COLUMN public.user_profile."clientData" IS 'The client-specific data of the User.';

COMMENT ON COLUMN public.user_profile."userHost" IS '[Denormalized]';

COMMENT ON COLUMN public.user_profile.room IS 'The room data of the User.';

COMMENT ON COLUMN public.user_profile."noCrawle" IS 'Whether reject index by crawler.';

COMMENT ON COLUMN public.user_profile."mutedInstances" IS 'List of instances muted by the user.';

COMMENT ON COLUMN public.user_profile."isIndexable" IS 'Whether User is indexable.';

COMMENT ON COLUMN public.user_profile."isSensitive" IS 'Whether User is sensitive.';

CREATE TABLE public.user_publickey (
    "userId" character varying(32) NOT NULL,
    "keyId" character varying(256) NOT NULL,
    "keyPem" character varying(4096) NOT NULL
);

CREATE TABLE public.user_security_key (
    id character varying NOT NULL,
    "userId" character varying(32) NOT NULL,
    "publicKey" character varying NOT NULL,
    "lastUsed" timestamp with time zone DEFAULT now() NOT NULL,
    name character varying(30) NOT NULL,
    counter bigint DEFAULT '0'::bigint NOT NULL,
    "credentialDeviceType" character varying(32),
    "credentialBackedUp" boolean,
    transports character varying(32)[]
);

COMMENT ON COLUMN public.user_security_key.id IS 'Variable-length id given to navigator.credentials.get()';

COMMENT ON COLUMN public.user_security_key."publicKey" IS 'The public key of the UserSecurityKey, hex-encoded.';

COMMENT ON COLUMN public.user_security_key."lastUsed" IS 'Timestamp of the last time the UserSecurityKey was used.';

COMMENT ON COLUMN public.user_security_key.name IS 'User-defined name for this key';

COMMENT ON COLUMN public.user_security_key.counter IS 'The number of times the UserSecurityKey was validated.';

COMMENT ON COLUMN public.user_security_key."credentialDeviceType" IS 'The type of Backup Eligibility in authenticator data';

COMMENT ON COLUMN public.user_security_key."credentialBackedUp" IS 'Whether or not the credential has been backed up';

COMMENT ON COLUMN public.user_security_key.transports IS 'The type of the credential returned by the browser';

CREATE TABLE public.webhook (
    id character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    "on" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    url character varying(1024) NOT NULL,
    secret character varying(1024) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "latestSentAt" timestamp with time zone,
    "latestStatus" integer
);

COMMENT ON COLUMN public.webhook."userId" IS 'The owner ID.';

COMMENT ON COLUMN public.webhook.name IS 'The name of the Antenna.';

ALTER TABLE ONLY public.__chart__active_users ALTER COLUMN id SET DEFAULT nextval('public.__chart__active_users_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__ap_request ALTER COLUMN id SET DEFAULT nextval('public.__chart__ap_request_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__drive ALTER COLUMN id SET DEFAULT nextval('public.__chart__drive_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__federation ALTER COLUMN id SET DEFAULT nextval('public.__chart__federation_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__hashtag ALTER COLUMN id SET DEFAULT nextval('public.__chart__hashtag_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__instance ALTER COLUMN id SET DEFAULT nextval('public.__chart__instance_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__network ALTER COLUMN id SET DEFAULT nextval('public.__chart__network_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__notes ALTER COLUMN id SET DEFAULT nextval('public.__chart__notes_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__per_user_drive ALTER COLUMN id SET DEFAULT nextval('public.__chart__per_user_drive_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__per_user_following ALTER COLUMN id SET DEFAULT nextval('public.__chart__per_user_following_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__per_user_notes ALTER COLUMN id SET DEFAULT nextval('public.__chart__per_user_notes_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__per_user_pv ALTER COLUMN id SET DEFAULT nextval('public.__chart__per_user_pv_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__per_user_reaction ALTER COLUMN id SET DEFAULT nextval('public.__chart__per_user_reaction_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__test ALTER COLUMN id SET DEFAULT nextval('public.__chart__test_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__test_grouped ALTER COLUMN id SET DEFAULT nextval('public.__chart__test_grouped_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__test_unique ALTER COLUMN id SET DEFAULT nextval('public.__chart__test_unique_id_seq'::regclass);

ALTER TABLE ONLY public.__chart__users ALTER COLUMN id SET DEFAULT nextval('public.__chart__users_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__active_users ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__active_users_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__ap_request ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__ap_request_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__drive ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__drive_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__federation ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__federation_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__hashtag ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__hashtag_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__instance ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__instance_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__network ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__network_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__notes ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__notes_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__per_user_drive ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__per_user_drive_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__per_user_following ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__per_user_following_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__per_user_notes ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__per_user_notes_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__per_user_pv ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__per_user_pv_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__per_user_reaction ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__per_user_reaction_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__users ALTER COLUMN id SET DEFAULT nextval('public.__chart_day__users_id_seq'::regclass);

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);

ALTER TABLE ONLY public.note_outbox ALTER COLUMN seq SET DEFAULT nextval('public.note_outbox_seq_seq'::regclass);

ALTER TABLE ONLY public.user_ip ALTER COLUMN id SET DEFAULT nextval('public.user_ip_id_seq'::regclass);

ALTER TABLE ONLY public.__chart_day__per_user_pv
    ADD CONSTRAINT "PK_0085d7542f6772e99b9dcfb0a9c" PRIMARY KEY (id);

ALTER TABLE ONLY public.ad
    ADD CONSTRAINT "PK_0193d5ef09746e88e9ea92c634d" PRIMARY KEY (id);

ALTER TABLE ONLY public.abuse_report_resolver
    ADD CONSTRAINT "PK_093500bf1bb38880d38b1bb41dc" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__notes
    ADD CONSTRAINT "PK_0aec823fa85c7f901bdb3863b14" PRIMARY KEY (id);

ALTER TABLE ONLY public.flash
    ADD CONSTRAINT "PK_0c01a2c1c5f2266942dd1b3fdbc" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_publickey
    ADD CONSTRAINT "PK_10c146e4b39b443ede016f6736d" PRIMARY KEY ("userId");

ALTER TABLE ONLY public.user_list_membership
    ADD CONSTRAINT "PK_11abb3768da1c5f8de101c9df45" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__instance
    ADD CONSTRAINT "PK_1267c67c7c2d47b4903975f2c00" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__hashtag
    ADD CONSTRAINT "PK_13d5a3b089344e5557f8e0980b4" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_group_joining
    ADD CONSTRAINT "PK_15f2425885253c5507e1599cfe7" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_group_invitation
    ADD CONSTRAINT "PK_160c63ec02bf23f6a5c5e8140d6" PRIMARY KEY (id);

ALTER TABLE ONLY public.note_unread
    ADD CONSTRAINT "PK_1904eda61a784f57e6e51fa9c1f" PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT "PK_19354ed146424a728c1112a8cbf" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__per_user_drive
    ADD CONSTRAINT "PK_1ae135254c137011645da7f4045" PRIMARY KEY (id);

ALTER TABLE ONLY public.clip_favorite
    ADD CONSTRAINT "PK_1b539f43906f05ebcabe752a977" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__notes
    ADD CONSTRAINT "PK_1fa4139e1f338272b758d05e090" PRIMARY KEY (id);

ALTER TABLE ONLY public.retention_aggregation
    ADD CONSTRAINT "PK_22aad3e8640b15fb3b90ee02d18" PRIMARY KEY (id);

ALTER TABLE ONLY public.event
    ADD CONSTRAINT "PK_2b481f231cd035e84390072bf7b" PRIMARY KEY ("noteId");

ALTER TABLE ONLY public.chat_room_membership
    ADD CONSTRAINT "PK_2bd59c741e571b283c048beb69a" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_ip
    ADD CONSTRAINT "PK_2c44ddfbf7c0464d028dcef325e" PRIMARY KEY (id);

ALTER TABLE ONLY public.muting
    ADD CONSTRAINT "PK_2e92d06c8b5c602eeb27ca9ba48" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__active_users
    ADD CONSTRAINT "PK_317237a9f733b970604a11e314f" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__per_user_notes
    ADD CONSTRAINT "PK_334acf6e915af2f29edc11b8e50" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_group_invite
    ADD CONSTRAINT "PK_3893884af0d3a5f4d01e7921a97" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_group
    ADD CONSTRAINT "PK_3c29fba6fe013ec8724378ce7c9" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__per_user_pv
    ADD CONSTRAINT "PK_3c938a24f0203b5bd13fab51059" PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT "PK_3cc0d85193aade457d3077dd06b" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_security_key
    ADD CONSTRAINT "PK_3e508571121ab39c5f85d10c166" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__test_unique
    ADD CONSTRAINT "PK_409bac9c97cc612d8500012319d" PRIMARY KEY (id);

ALTER TABLE ONLY public.drive_file
    ADD CONSTRAINT "PK_43ddaaaf18c9e68029b7cbb032e" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__instance
    ADD CONSTRAINT "PK_479a8ff9d959274981087043023" PRIMARY KEY (id);

ALTER TABLE ONLY public.note_outbox
    ADD CONSTRAINT "PK_479dd3c6e40560df772bb598524" PRIMARY KEY (seq);

ALTER TABLE ONLY public.note_watching
    ADD CONSTRAINT "PK_49286fdb23725945a74aa27d757" PRIMARY KEY (id);

ALTER TABLE ONLY public.announcement_read
    ADD CONSTRAINT "PK_4b90ad1f42681d97b2683890c5e" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__users
    ADD CONSTRAINT "PK_4dfcf2c78d03524b9eb2c99d328" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_profile
    ADD CONSTRAINT "PK_51cb79b5555effaf7d69ba1cff9" PRIMARY KEY ("userId");

ALTER TABLE ONLY public.follow_request
    ADD CONSTRAINT "PK_53a9aa3725f7a3deb150b39dbfc" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__ap_request
    ADD CONSTRAINT "PK_56a25cd447c7ee08876b3baf8d8" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__per_user_notes
    ADD CONSTRAINT "PK_58bab6b6d3ad9310cbc7460fd28" PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_read
    ADD CONSTRAINT "PK_61917c1541002422b703318b7c9" PRIMARY KEY (id);

ALTER TABLE ONLY public.registry_item
    ADD CONSTRAINT "PK_64b3f7e6008b4d89b826cd3af95" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__per_user_following
    ADD CONSTRAINT "PK_68ce6b67da57166da66fc8fb27e" PRIMARY KEY (id);

ALTER TABLE ONLY public.page
    ADD CONSTRAINT "PK_742f4117e065c5b6ad21b37ba1f" PRIMARY KEY (id);

ALTER TABLE ONLY public.note_reaction
    ADD CONSTRAINT "PK_767ec729b108799b587a3fcc9cf" PRIMARY KEY (id);

ALTER TABLE ONLY public.reversi_game
    ADD CONSTRAINT "PK_76b30eeba71b1193ad7c5311c3f" PRIMARY KEY (id);

ALTER TABLE ONLY public.relay
    ADD CONSTRAINT "PK_78ebc9cfddf4292633b7ba57aee" PRIMARY KEY (id);

ALTER TABLE ONLY public.used_username
    ADD CONSTRAINT "PK_78fd79d2d24c6ac2f4cc9a31a5d" PRIMARY KEY (username);

ALTER TABLE ONLY public.drive_folder
    ADD CONSTRAINT "PK_7a0c089191f5ebdc214e0af808a" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__federation
    ADD CONSTRAINT "PK_7ca721c769f31698e0e1331e8e6" PRIMARY KEY (id);

ALTER TABLE ONLY public.role_assignment
    ADD CONSTRAINT "PK_7e79671a8a5db18936173148cb4" PRIMARY KEY (id);

ALTER TABLE ONLY public.page_like
    ADD CONSTRAINT "PK_813f034843af992d3ae0f43c64c" PRIMARY KEY (id);

ALTER TABLE ONLY public.gallery_like
    ADD CONSTRAINT "PK_853ab02be39b8de45cd720cc15f" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__per_user_following
    ADD CONSTRAINT "PK_85bb1b540363a29c2fec83bd907" PRIMARY KEY (id);

ALTER TABLE ONLY public.abuse_user_report
    ADD CONSTRAINT "PK_87873f5f5cc5c321a1306b2d18c" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_list
    ADD CONSTRAINT "PK_87bab75775fd9b1ff822b656402" PRIMARY KEY (id);

ALTER TABLE ONLY public.reversi_matching
    ADD CONSTRAINT "PK_880bd0afbab232f21c8b9d146cf" PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_room
    ADD CONSTRAINT "PK_8aa3a52cf74c96469f0ef9fbe3e" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__per_user_reaction
    ADD CONSTRAINT "PK_8af24e2d51ff781a354fe595eda" PRIMARY KEY (id);

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);

ALTER TABLE ONLY public.gallery_post
    ADD CONSTRAINT "PK_8e90d7b6015f2c4518881b14753" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__ap_request
    ADD CONSTRAINT "PK_9318b49daee320194e23f712e69" PRIMARY KEY (id);

ALTER TABLE ONLY public.app
    ADD CONSTRAINT "PK_9478629fc093d229df09e560aea" PRIMARY KEY (id);

ALTER TABLE ONLY public.note
    ADD CONSTRAINT "PK_96d0c172a4fba276b1bbed43058" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__per_user_reaction
    ADD CONSTRAINT "PK_984f54dae441e65b633e8d27a7f" PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_room_invitation
    ADD CONSTRAINT "PK_9d489521a312dd28225672de2dc" PRIMARY KEY (id);

ALTER TABLE ONLY public.signin
    ADD CONSTRAINT "PK_9e96ddc025712616fc492b3b588" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_note_pining
    ADD CONSTRAINT "PK_a6a2dad4ae000abce2ea9d9b103" PRIMARY KEY (id);

ALTER TABLE ONLY public.abuse_report_notification_recipient
    ADD CONSTRAINT "PK_abuse_report_notification_recipient_id" PRIMARY KEY (id);

ALTER TABLE ONLY public.note_favorite
    ADD CONSTRAINT "PK_af0da35a60b9fa4463a62082b36" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__active_users
    ADD CONSTRAINT "PK_b1790489b14f005ae8f404f5795" PRIMARY KEY (id);

ALTER TABLE ONLY public.role
    ADD CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__federation
    ADD CONSTRAINT "PK_b39dcd31a0fe1a7757e348e85fd" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__test
    ADD CONSTRAINT "PK_b4bc31dffbd1b785276a3ecfc1e" PRIMARY KEY (id);

ALTER TABLE ONLY public.avatar_decoration
    ADD CONSTRAINT "PK_b6de9296f6097078e1dc53f7603" PRIMARY KEY (id);

ALTER TABLE ONLY public.note_history
    ADD CONSTRAINT "PK_b8603c8aa42b803c7687e52c2c0" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__network
    ADD CONSTRAINT "PK_bc4290c2e27fad14ef0c1ca93f3" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_list_favorite
    ADD CONSTRAINT "PK_c0974b21e18502a4c8178e09fe6" PRIMARY KEY (id);

ALTER TABLE ONLY public.antenna
    ADD CONSTRAINT "PK_c170b99775e1dccca947c9f2d5f" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__hashtag
    ADD CONSTRAINT "PK_c32f1ea2b44a5d2f7881e37f8f9" PRIMARY KEY (id);

ALTER TABLE ONLY public.meta
    ADD CONSTRAINT "PK_c4c17a6c2bd7651338b60fc590b" PRIMARY KEY (id);

ALTER TABLE ONLY public.following
    ADD CONSTRAINT "PK_c76c6e044bdf76ecf8bfb82a645" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__network
    ADD CONSTRAINT "PK_cac499d6f471042dfed1e7e0132" PRIMARY KEY (id);

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY (id);

ALTER TABLE ONLY public.hashtag
    ADD CONSTRAINT "PK_cb36eb8af8412bfa978f1165d78" PRIMARY KEY (id);

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT "PK_d0adca6ecfd068db83e4526cc26" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__per_user_drive
    ADD CONSTRAINT "PK_d0ef23d24d666e1a44a0cd3d208" PRIMARY KEY (id);

ALTER TABLE ONLY public.flash_like
    ADD CONSTRAINT "PK_d110109ee310588d63d6183b233" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_pending
    ADD CONSTRAINT "PK_d4c84e013c98ec02d19b8fbbafa" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__users
    ADD CONSTRAINT "PK_d7f7185abb9851f70c4726c54bd" PRIMARY KEY (id);

ALTER TABLE ONLY public.poll
    ADD CONSTRAINT "PK_da851e06d0dfe2ef397d8b1bf1b" PRIMARY KEY ("noteId");

ALTER TABLE ONLY public.messaging_message
    ADD CONSTRAINT "PK_db398fd79dc95d0eb8c30456eaa" PRIMARY KEY (id);

ALTER TABLE ONLY public.emoji
    ADD CONSTRAINT "PK_df74ce05e24999ee01ea0bc50a3" PRIMARY KEY (id);

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT "PK_e0ef0550174fd1099a308fd18a0" PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_note
    ADD CONSTRAINT "PK_e263909ca4fe5d57f8d4230dd5c" PRIMARY KEY ("noteId");

ALTER TABLE ONLY public.blocking
    ADD CONSTRAINT "PK_e5d9a541cc1965ee7e048ea09dd" PRIMARY KEY (id);

ALTER TABLE ONLY public.webhook
    ADD CONSTRAINT "PK_e6765510c2d078db49632b59020" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart_day__drive
    ADD CONSTRAINT "PK_e7ec0de057c77c40fc8d8b62151" PRIMARY KEY (id);

ALTER TABLE ONLY public.sw_subscription
    ADD CONSTRAINT "PK_e8f763631530051b95eb6279b91" PRIMARY KEY (id);

ALTER TABLE ONLY public.clip_note
    ADD CONSTRAINT "PK_e94cda2f40a99b57e032a1a738b" PRIMARY KEY (id);

ALTER TABLE ONLY public.reaction_bake_ledger
    ADD CONSTRAINT "PK_e94fdf6971b75bebaf8ed0212cd" PRIMARY KEY ("batchId");

ALTER TABLE ONLY public.user_memo
    ADD CONSTRAINT "PK_e9aaa58f7d3699a84d79078f4d9" PRIMARY KEY (id);

ALTER TABLE ONLY public.instance
    ADD CONSTRAINT "PK_eaf60e4a0c399c9935413e06474" PRIMARY KEY (id);

ALTER TABLE ONLY public.note_thread_muting
    ADD CONSTRAINT "PK_ec5936d94d1a0369646d12a3a47" PRIMARY KEY (id);

ALTER TABLE ONLY public.system_account
    ADD CONSTRAINT "PK_edb56f4aaf9ddd50ee556da97ba" PRIMARY KEY (id);

ALTER TABLE ONLY public.clip
    ADD CONSTRAINT "PK_f0685dac8d4dd056d7255670b75" PRIMARY KEY (id);

ALTER TABLE ONLY public.registration_ticket
    ADD CONSTRAINT "PK_f11696b6fafcf3662d4292734f8" PRIMARY KEY (id);

ALTER TABLE ONLY public.access_token
    ADD CONSTRAINT "PK_f20f028607b2603deabd8182d12" PRIMARY KEY (id);

ALTER TABLE ONLY public.user_keypair
    ADD CONSTRAINT "PK_f4853eb41ab722fe05f81cedeb6" PRIMARY KEY ("userId");

ALTER TABLE ONLY public.__chart__test_grouped
    ADD CONSTRAINT "PK_f4a2b175d308695af30d4293272" PRIMARY KEY (id);

ALTER TABLE ONLY public.__chart__drive
    ADD CONSTRAINT "PK_f96bc548a765cd4b3b354221ce7" PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_approval
    ADD CONSTRAINT "PK_fbbb95d60acf5c85388345b5f5d" PRIMARY KEY (id);

ALTER TABLE ONLY public.password_reset_request
    ADD CONSTRAINT "PK_fcf4b02eae1403a2edaf87fd074" PRIMARY KEY (id);

ALTER TABLE ONLY public.poll_vote
    ADD CONSTRAINT "PK_fd002d371201c472490ba89c6a0" PRIMARY KEY (id);

ALTER TABLE ONLY public.renote_muting
    ADD CONSTRAINT "PK_renoteMuting_id" PRIMARY KEY (id);

ALTER TABLE ONLY public.system_webhook
    ADD CONSTRAINT "PK_system_webhook_id" PRIMARY KEY (id);

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "REL_58f5c71eaab331645112cf8cfa" UNIQUE ("avatarId");

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "REL_afc64b53f8db3707ceb34eb28e" UNIQUE ("bannerId");

ALTER TABLE ONLY public.__chart__active_users
    ADD CONSTRAINT "UQ_0ad37b7ef50f4ddc84363d7ccca" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__drive
    ADD CONSTRAINT "UQ_0b60ebb3aa0065f10b0616c1171" UNIQUE (date);

ALTER TABLE ONLY public.__chart__drive
    ADD CONSTRAINT "UQ_13565815f618a1ff53886c5b28a" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__notes
    ADD CONSTRAINT "UQ_1a527b423ad0858a1af5a056d43" UNIQUE (date);

ALTER TABLE ONLY public.__chart__per_user_reaction
    ADD CONSTRAINT "UQ_229a41ad465f9205f1f57032910" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__hashtag
    ADD CONSTRAINT "UQ_25a97c02003338124b2b75fdbc8" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__per_user_drive
    ADD CONSTRAINT "UQ_30bf67687f483ace115c5ca6429" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__federation
    ADD CONSTRAINT "UQ_36cb699c49580d4e6c2e6159f97" UNIQUE (date);

ALTER TABLE ONLY public.__chart__instance
    ADD CONSTRAINT "UQ_39ee857ab2f23493037c6b66311" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__notes
    ADD CONSTRAINT "UQ_42eb716a37d381cdf566192b2be" UNIQUE (date);

ALTER TABLE ONLY public.__chart__per_user_notes
    ADD CONSTRAINT "UQ_5048e9daccbbbc6d567bb142d34" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart_day__federation
    ADD CONSTRAINT "UQ_617a8fe225a6e701d89e02d2c74" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__per_user_drive
    ADD CONSTRAINT "UQ_62aa5047b5aec92524f24c701d7" UNIQUE (date, "group");

ALTER TABLE ONLY public.user_profile
    ADD CONSTRAINT "UQ_6dc44f1ceb65b1e72bacef2ca27" UNIQUE ("pinnedPageId");

ALTER TABLE ONLY public.__chart__users
    ADD CONSTRAINT "UQ_845254b3eaf708ae8a6cac30265" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__network
    ADD CONSTRAINT "UQ_8bfa548c2b31f9e07db113773ee" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__hashtag
    ADD CONSTRAINT "UQ_8f589cf056ff51f09d6096f6450" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__network
    ADD CONSTRAINT "UQ_a1efd3e0048a5f2793a47360dc6" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__ap_request
    ADD CONSTRAINT "UQ_a848f66d6cec11980a5dd595822" UNIQUE (date);

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "UQ_a854e557b1b14814750c7c7b0c9" UNIQUE (token);

ALTER TABLE ONLY public.registration_ticket
    ADD CONSTRAINT "UQ_b6f93f2f30bdbb9a5ebdc7c7189" UNIQUE ("usedById");

ALTER TABLE ONLY public.__chart__per_user_following
    ADD CONSTRAINT "UQ_b77d4dd9562c3a899d9a286fcd7" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart_day__per_user_notes
    ADD CONSTRAINT "UQ_c5545d4b31cdc684034e33b81c3" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart_day__users
    ADD CONSTRAINT "UQ_cad6e07c20037f31cdba8a350c3" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__per_user_reaction
    ADD CONSTRAINT "UQ_d54b653660d808b118e36c184c0" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart_day__active_users
    ADD CONSTRAINT "UQ_d5954f3df5e5e3bdfc3c03f3906" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__per_user_following
    ADD CONSTRAINT "UQ_e4849a3231f38281280ea4c0eee" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__ap_request
    ADD CONSTRAINT "UQ_e56f4beac5746d44bc3e19c80d0" UNIQUE (date);

ALTER TABLE ONLY public.__chart_day__per_user_pv
    ADD CONSTRAINT "UQ_f221e45cfac5bea0ce0f3149fbb" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart__per_user_pv
    ADD CONSTRAINT "UQ_f2a56da57921ca8439f45c1d95f" UNIQUE (date, "group");

ALTER TABLE ONLY public.__chart_day__instance
    ADD CONSTRAINT "UQ_fea7c0278325a1a2492f2d6acbf" UNIQUE (date, "group");

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT note_draft_pkey PRIMARY KEY (id);

CREATE INDEX "IDX_00ceffb0cdc238b3233294f08f" ON public.drive_folder USING btree ("parentId");

CREATE INDEX "IDX_016f613dc4feb807e03e3e7da9" ON public.user_list_favorite USING btree ("userId");

CREATE INDEX "IDX_01cd2b829e0263917bf570cb67" ON public.event USING btree ("userId");

CREATE INDEX "IDX_021015e6683570ae9f6b0c62be" ON public.user_list_membership USING btree ("userId");

CREATE INDEX "IDX_03e7028ab8388a3f5e3ce2a861" ON public.note_watching USING btree ("noteId");

CREATE UNIQUE INDEX "IDX_044f2a7962b8ee5bbfaa02e8a3" ON public.chat_room_invitation USING btree ("userId", "roomId");

CREATE INDEX "IDX_04cc96756f89d0b7f9473e8cdf" ON public.abuse_user_report USING btree ("reporterId");

CREATE INDEX "IDX_05cca34b985d1b8edc1d1e28df" ON public.gallery_post USING btree (tags);

CREATE INDEX "IDX_0610ebcfcfb4a18441a9bcdab2" ON public.poll USING btree ("userId");

CREATE INDEX "IDX_0627125f1a8a42c9a1929edb55" ON public.blocking USING btree ("blockerId");

CREATE INDEX "IDX_084c2abb8948ef59a37dce6ac1" ON public.antenna USING btree ("lastUsedAt");

CREATE UNIQUE INDEX "IDX_0953deda7ce6e1448e935859e5" ON public.role_assignment USING btree ("userId", "roleId");

CREATE INDEX "IDX_09f4e5b9e4a2f268d3e284e4b3" ON public.retention_aggregation USING btree ("createdAt");

CREATE INDEX "IDX_0a72bdfcdb97c0eca11fe7ecad" ON public.registry_item USING btree (domain);

CREATE UNIQUE INDEX "IDX_0ad37b7ef50f4ddc84363d7ccc" ON public.__chart__active_users USING btree (date);

CREATE INDEX "IDX_0b03cbcd7e6a7ce068efa8ecc2" ON public.hashtag USING btree ("attachedRemoteUsersCount");

CREATE UNIQUE INDEX "IDX_0b575fa9a4cfe638a925949285" ON public.password_reset_request USING btree (token);

CREATE UNIQUE INDEX "IDX_0b60ebb3aa0065f10b0616c117" ON public.__chart_day__drive USING btree (date);

CREATE INDEX "IDX_0c44bf4f680964145f2a68a341" ON public.hashtag USING btree ("attachedLocalUsersCount");

CREATE INDEX "IDX_0d7718e562dcedd0aa5cf2c9f7" ON public.user_security_key USING btree ("publicKey");

CREATE UNIQUE INDEX "IDX_0d801c609cec4e9eb4b6b4490c" ON public.renote_muting USING btree ("muterId", "muteeId");

CREATE UNIQUE INDEX "IDX_0d9a1738f2cf7f3b1c3334dfab" ON public.relay USING btree (inbox);

CREATE INDEX "IDX_0e206cec573f1edff4a3062923" ON public.hashtag USING btree ("mentionedLocalUsersCount");

CREATE INDEX "IDX_0e61efab7f88dbb79c9166dbb4" ON public.page_like USING btree ("userId");

CREATE UNIQUE INDEX "IDX_0f4fb9ad355f3effff221ef245" ON public.note_favorite USING btree ("userId", "noteId");

CREATE UNIQUE INDEX "IDX_0ff69e8dfa9fe31bb4a4660f59" ON public.registration_ticket USING btree (code);

CREATE INDEX "IDX_1039988afa3bf991185b277fe0" ON public.user_group_invite USING btree ("userId");

CREATE INDEX "IDX_12c01c0d1a79f77d9f6c15fadd" ON public.follow_request USING btree ("followeeId");

CREATE UNIQUE INDEX "IDX_12c4768a2f706fc267f2078903" ON public.chat_approval USING btree ("userId", "otherId");

CREATE UNIQUE INDEX "IDX_13565815f618a1ff53886c5b28" ON public.__chart__drive USING btree (date);

CREATE INDEX "IDX_13761f64257f40c5636d0ff95e" ON public.note_reaction USING btree ("userId");

CREATE UNIQUE INDEX "IDX_153536c67d05e9adb24e99fc2b" ON public.note USING btree (uri);

CREATE UNIQUE INDEX "IDX_16effb2e888f6763673b579f80" ON public.__chart__test_unique USING btree (date) WHERE ("group" IS NULL);

CREATE UNIQUE INDEX "IDX_171e64971c780ebd23fae140bb" ON public.user_publickey USING btree ("keyId");

CREATE INDEX "IDX_17a406b7e951d3485bec6922f8" ON public.chat_room USING btree (host);

CREATE INDEX "IDX_17cb3553c700a4985dff5a30ff" ON public.note USING btree ("replyId");

CREATE UNIQUE INDEX "IDX_185b6b5afa707b5d36d1ce3144" ON public.chat_room_membership USING btree ("userId", "roomId");

CREATE INDEX "IDX_1a165c68a49d08f11caffbd206" ON public.gallery_post USING btree ("likedCount");

CREATE UNIQUE INDEX "IDX_1a527b423ad0858a1af5a056d4" ON public.__chart_day__notes USING btree (date);

CREATE INDEX "IDX_1e2492ba7582bf830b750a2962" ON public.note_history USING btree ("noteId");

CREATE UNIQUE INDEX "IDX_1eb9d9824a630321a29fd3b290" ON public.muting USING btree ("muterId", "muteeId");

CREATE UNIQUE INDEX "IDX_2133ef8317e4bdb839c0dcbf13" ON public.page USING btree ("userId", name);

CREATE UNIQUE INDEX "IDX_229a41ad465f9205f1f5703291" ON public.__chart__per_user_reaction USING btree (date, "group");

CREATE INDEX "IDX_22baca135bb8a3ea1a83d13df3" ON public.registry_item USING btree (scope);

CREATE INDEX "IDX_22ef9dc9e442811517f31c8789" ON public.drive_file USING btree ("userHost", "isLink", id);

CREATE INDEX "IDX_24e0042143a18157b234df186c" ON public.following USING btree ("followeeId");

CREATE INDEX "IDX_25a31662b0b0cc9af6549a9d71" ON public.clip_favorite USING btree ("userId");

CREATE UNIQUE INDEX "IDX_25a97c02003338124b2b75fdbc" ON public.__chart__hashtag USING btree (date, "group");

CREATE INDEX "IDX_25b1dd384bec391b07b74b861c" ON public.note_unread USING btree ("isMentioned");

CREATE INDEX "IDX_25e097b51d7622c249452c6f75" ON public.chat_message USING btree ("toUserId");

CREATE INDEX "IDX_2710a55f826ee236ea1a62698f" ON public.hashtag USING btree ("mentionedUsersCount");

CREATE INDEX "IDX_2831d60e203984101bb63db0b0" ON public.following USING btree ("requestId");

CREATE UNIQUE INDEX "IDX_2882b8a1a07c7d281a98b6db16" ON public.promo_read USING btree ("userId", "noteId");

CREATE INDEX "IDX_29c11c7deb06615076f8c95b80" ON public.note_thread_muting USING btree ("userId");

CREATE INDEX "IDX_29e8c1d579af54d4232939f994" ON public.note_unread USING btree ("noteUserId");

CREATE INDEX "IDX_2b15aaf4a0dc5be3499af7ab6a" ON public.abuse_user_report USING btree (resolved);

CREATE INDEX "IDX_2b5ec6c574d6802c94c80313fb" ON public.clip USING btree ("userId");

CREATE INDEX "IDX_2c308dbdc50d94dc625670055f" ON public.signin USING btree ("userId");

CREATE INDEX "IDX_2c4be03b446884f9e9c502135b" ON public.messaging_message USING btree ("groupId");

CREATE INDEX "IDX_2cd4a2743a99671308f5417759" ON public.blocking USING btree ("blockeeId");

CREATE INDEX "IDX_2da24ce20ad209f1d9dc032457" ON public.ad USING btree ("expiresAt");

CREATE UNIQUE INDEX "IDX_307be5f1d1252e0388662acb96" ON public.following USING btree ("followerId", "followeeId");

CREATE UNIQUE INDEX "IDX_30bf67687f483ace115c5ca642" ON public.__chart__per_user_drive USING btree (date, "group");

CREATE INDEX "IDX_315c779174fe8247ab324f036e" ON public.drive_file USING btree ("isLink");

CREATE INDEX "IDX_318cdf42a9cfc11f479bd802bb" ON public.note_watching USING btree ("createdAt");

CREATE INDEX "IDX_3252a5df8d5bbd16b281f7799e" ON public."user" USING btree (host);

CREATE UNIQUE INDEX "IDX_347fec870eafea7b26c8a73bac" ON public.hashtag USING btree (name);

CREATE UNIQUE INDEX "IDX_361b500e06721013c124b7b6c5" ON public.user_ip USING btree ("userId", ip);

CREATE UNIQUE INDEX "IDX_36cb699c49580d4e6c2e6159f9" ON public.__chart__federation USING btree (date);

CREATE INDEX "IDX_36ef5192a1ce55ed0e40aa4db5" ON public.antenna USING btree ("isActive");

CREATE INDEX "IDX_37bb9a1b4585f8a3beb24c62d6" ON public.drive_file USING btree (md5);

CREATE UNIQUE INDEX "IDX_39ee857ab2f23493037c6b6631" ON public.__chart__instance USING btree (date, "group");

CREATE INDEX "IDX_3aa8ea9a8f15214ad91638c0a7" ON public.flash USING btree ("updatedAt");

CREATE INDEX "IDX_3b25402709dd9882048c2bbade" ON public.reversi_matching USING btree ("parentId");

CREATE INDEX "IDX_3b33dff77bb64b23c88151d23e" ON public.drive_file USING btree ("maybeSensitive");

CREATE INDEX "IDX_3befe6f999c86aff06eb0257b4" ON public.user_profile USING btree ("enableWordMute");

CREATE INDEX "IDX_3ca50563facd913c425e7a89ee" ON public.gallery_post USING btree ("fileIds");

CREATE INDEX "IDX_3d6b372788ab01be58853003c9" ON public.user_group USING btree ("userId");

CREATE INDEX "IDX_3ede46f507c87ad698051d56a8" ON public.instance USING btree ("suspensionState");

CREATE INDEX "IDX_3f5b0899ef90527a3462d7c2cb" ON public.app USING btree ("userId");

CREATE INDEX "IDX_3fcc2c589eaefc205e0714b99c" ON public.ad USING btree ("startsAt");

CREATE UNIQUE INDEX "IDX_410cd649884b501c02d6e72738" ON public.user_note_pining USING btree ("userId", "noteId");

CREATE INDEX "IDX_41a3c87a37aea616ee459369e1" ON public.system_account USING btree ("userId");

CREATE UNIQUE INDEX "IDX_42eb716a37d381cdf566192b2b" ON public.__chart__notes USING btree (date);

CREATE INDEX "IDX_44499765eec6b5489d72c4253b" ON public.note_watching USING btree ("noteUserId");

CREATE INDEX "IDX_45145e4953780f3cd5656f0ea6" ON public.note_reaction USING btree ("noteId");

CREATE INDEX "IDX_47f4b1892f5d6ba8efb3057d81" ON public.note_favorite USING btree ("userId");

CREATE INDEX "IDX_48a00f08598662b9ca540521eb" ON public.user_list USING btree ("isPublic");

CREATE INDEX "IDX_4bb7fd4a34492ae0e6cc8d30ac" ON public.password_reset_request USING btree ("userId");

CREATE INDEX "IDX_4c02d38a976c3ae132228c6fce" ON public.hashtag USING btree ("mentionedRemoteUsersCount");

CREATE INDEX "IDX_4ccd2239268ebbd1b35e318754" ON public.following USING btree ("followerHost");

CREATE UNIQUE INDEX "IDX_4ce6fb9c70529b4c8ac46c9bfa" ON public.page_like USING btree ("userId", "pageId");

CREATE UNIQUE INDEX "IDX_4e5c4c99175638ec0761714ab0" ON public.user_pending USING btree (code);

CREATE INDEX "IDX_4ebbf7f93cdc10e8d1ef2fc6cd" ON public.abuse_user_report USING btree ("targetUserHost");

CREATE UNIQUE INDEX "IDX_4f4d35e1256c84ae3d1f0eab10" ON public.emoji USING btree (name, host);

CREATE UNIQUE INDEX "IDX_5048e9daccbbbc6d567bb142d3" ON public.__chart__per_user_notes USING btree (date, "group");

CREATE UNIQUE INDEX "IDX_50bd7164c5b78f1f4a42c4d21f" ON public.poll_vote USING btree ("userId", "noteId", choice);

CREATE INDEX "IDX_5108098457488634a4768e1d12" ON public.following USING btree (notify);

CREATE INDEX "IDX_52ccc804d7c69037d558bac4c9" ON public.note USING btree ("renoteId");

CREATE INDEX "IDX_530257863e1381a7f2f1d3282f" ON public.chat_approval USING btree ("userId");

CREATE UNIQUE INDEX "IDX_5319641e27338da87aa00d3b1d" ON public.chat_room USING btree (uri);

CREATE INDEX "IDX_5377c307783fce2b6d352e1203" ON public.messaging_message USING btree ("userId");

CREATE INDEX "IDX_539b6c08c05067599743bb6389" ON public.role_assignment USING btree ("expiresAt");

CREATE INDEX "IDX_55720b33a61a7c806a8215b825" ON public.drive_file USING btree ("userId", "folderId", id);

CREATE INDEX "IDX_56b0166d34ddae49d8ef7610bb" ON public.note_unread USING btree ("userId");

CREATE INDEX "IDX_5900e907bb46516ddf2871327c" ON public.emoji USING btree (host);

CREATE INDEX "IDX_5a056076f76b2efe08216ba655" ON public.webhook USING btree (active);

CREATE INDEX "IDX_5cc8c468090e129857e9fecce5" ON public.user_group_invitation USING btree ("userGroupId");

CREATE UNIQUE INDEX "IDX_5deb01ae162d1d70b80d064c27" ON public."user" USING btree ("usernameLower", host);

CREATE INDEX "IDX_5f265075b215fc390a57523b12" ON public.chat_room_invitation USING btree ("roomId");

CREATE INDEX "IDX_603a7b1e7aa0533c6c88e9bfaf" ON public.announcement_read USING btree ("announcementId");

CREATE INDEX "IDX_60c4af1c19a7a75f1592f93b28" ON public.flash_like USING btree ("userId");

CREATE UNIQUE INDEX "IDX_617a8fe225a6e701d89e02d2c7" ON public.__chart_day__federation USING btree (date);

CREATE UNIQUE INDEX "IDX_62aa5047b5aec92524f24c701d" ON public.__chart_day__per_user_drive USING btree (date, "group");

CREATE INDEX "IDX_62cb09e1129f6ec024ef66e183" ON public.auth_session USING btree (token);

CREATE INDEX "IDX_6446c571a0e8d0f05f01c78909" ON public.antenna USING btree ("userId");

CREATE INDEX "IDX_64c327441248bae40f7d92f34f" ON public.access_token USING btree (hash);

CREATE INDEX "IDX_650b49c5639b5840ee6a2b8f83" ON public.user_memo USING btree ("userId");

CREATE INDEX "IDX_6516c5a6f3c015b4eed39978be" ON public.following USING btree ("followerId");

CREATE INDEX "IDX_66ac4a82894297fd09ba61f3d3" ON public.user_memo USING btree ("targetUserId");

CREATE INDEX "IDX_66d2bd2ee31d14bcc23069a89f" ON public.poll_vote USING btree ("userId");

CREATE INDEX "IDX_67dc758bc0566985d1b3d39986" ON public.user_group_joining USING btree ("userGroupId");

CREATE INDEX "IDX_6a57f051d82c6d4036c141e107" ON public.note_unread USING btree ("noteChannelId");

CREATE UNIQUE INDEX "IDX_6fc0ec357d55a18646262fdfff" ON public.clip_note USING btree ("noteId", "clipId");

CREATE INDEX "IDX_70ba8f6af34bc924fc9e12adb8" ON public.access_token USING btree (token);

CREATE INDEX "IDX_7125a826ab192eb27e11d358a5" ON public.note USING btree ("userHost");

CREATE INDEX "IDX_72689e25ff8131746cb31ef9a1" ON public.note_draft USING btree ("eventStart");

CREATE INDEX "IDX_785ee5fc1ea38a1b9b38ff88e5" ON public.event USING btree (start);

CREATE UNIQUE INDEX "IDX_78787741f9010886796f2320a4" ON public.user_group_invite USING btree ("userId", "userGroupId");

CREATE INDEX "IDX_79a26e7a4d9afa5e4fc05f134e" ON public.chat_message USING btree ("fromUserId");

CREATE INDEX "IDX_7aa72a5fe76019bfe8e5e0e8b7" ON public.renote_muting USING btree ("muterId");

CREATE INDEX "IDX_7b8d9225168e962f94ea517e00" ON public.announcement USING btree (silence);

CREATE INDEX "IDX_7eac97594bcac5ffcf2068089b" ON public.renote_muting USING btree ("muteeId");

CREATE INDEX "IDX_7f7f1c66f48e9a8e18a33bc515" ON public.user_ip USING btree ("userId");

CREATE INDEX "IDX_7fa20a12319c7f6dc3aed98c0a" ON public.poll USING btree ("userHost");

CREATE INDEX "IDX_8063a0586ed1dfbe86e982d961" ON public.webhook USING btree ("on");

CREATE INDEX "IDX_80ca6e6ef65fb9ef34ea8c90f4" ON public."user" USING btree ("updatedAt");

CREATE INDEX "IDX_8288151386172b8109f7239ab2" ON public.announcement_read USING btree ("userId");

CREATE INDEX "IDX_83f0862e9bae44af52ced7099e" ON public.promo_note USING btree ("userId");

CREATE UNIQUE INDEX "IDX_845254b3eaf708ae8a6cac3026" ON public.__chart__users USING btree (date);

CREATE INDEX "IDX_8552bb38e7ed038c5bdd398a38" ON public.chat_room_invitation USING btree ("userId");

CREATE INDEX "IDX_860fa6f6c7df5bb887249fba22" ON public.drive_file USING btree ("userId");

CREATE INDEX "IDX_89a29c9237b8c3b6b3cbb4cb30" ON public.note_unread USING btree ("isSpecified");

CREATE INDEX "IDX_8bdcd3dd2bddb78014999a16ce" ON public.drive_file USING btree ("maybePorn");

CREATE UNIQUE INDEX "IDX_8bfa548c2b31f9e07db113773e" ON public.__chart_day__network USING btree (date);

CREATE UNIQUE INDEX "IDX_8d5afc98982185799b160e10eb" ON public.instance USING btree (host);

CREATE UNIQUE INDEX "IDX_8f589cf056ff51f09d6096f645" ON public.__chart_day__hashtag USING btree (date, "group");

CREATE INDEX "IDX_8fd5215095473061855ceb948c" ON public.gallery_like USING btree ("userId");

CREATE INDEX "IDX_90148bbc2bf0854428786bfc15" ON public.page USING btree ("visibleUserIds");

CREATE UNIQUE INDEX "IDX_924fa71815cfa3941d003702a0" ON public.announcement_read USING btree ("userId", "announcementId");

CREATE INDEX "IDX_92779627994ac79277f070c91e" ON public.drive_file USING btree ("userHost");

CREATE INDEX "IDX_93060675b4a79a577f31d260c6" ON public.muting USING btree ("muterId");

CREATE INDEX "IDX_9657d55550c3d37bfafaf7d4b0" ON public.promo_read USING btree ("userId");

CREATE INDEX "IDX_97754ca6f2baff9b4abb7f853d" ON public.sw_subscription USING btree ("userId");

CREATE INDEX "IDX_985b836dddd8615e432d7043dd" ON public.gallery_post USING btree ("userId");

CREATE UNIQUE INDEX "IDX_98a1bc5cb30dfd159de056549f" ON public.blocking USING btree ("blockerId", "blockeeId");

CREATE INDEX "IDX_9949557d0e1b2c19e5344c171e" ON public.access_token USING btree ("userId");

CREATE INDEX "IDX_9b88250fc2fd009b8f1b5623ed" ON public.flash USING btree ("userId");

CREATE INDEX "IDX_EMOJI_CATEGORY" ON public.emoji USING btree (category);

CREATE INDEX "IDX_EMOJI_ROLE_IDS" ON public.emoji USING gin ("roleIdsThatCanBeUsedThisEmojiAsReaction");

CREATE INDEX "IDX_NOTE_DRAFT_FILE_IDS" ON public.note_draft USING gin ("fileIds");

CREATE INDEX "IDX_NOTE_DRAFT_RENOTE_ID" ON public.note_draft USING btree ("renoteId");

CREATE INDEX "IDX_NOTE_DRAFT_REPLY_ID" ON public.note_draft USING btree ("replyId");

CREATE INDEX "IDX_NOTE_DRAFT_USER_ID" ON public.note_draft USING btree ("userId");

CREATE INDEX "IDX_NOTE_DRAFT_VISIBLE_USER_IDS" ON public.note_draft USING gin ("visibleUserIds");

CREATE INDEX "IDX_NOTE_FILE_IDS" ON public.note USING gin ("fileIds");

CREATE INDEX "IDX_NOTE_MENTIONS" ON public.note USING gin (mentions);

CREATE INDEX "IDX_NOTE_OUTBOX_NOTE_ID_SEQ" ON public.note_outbox USING btree ("noteId", seq);

CREATE INDEX "IDX_NOTE_TAGS" ON public.note USING gin (tags);

CREATE INDEX "IDX_NOTE_VISIBLE_USER_IDS" ON public.note USING gin ("visibleUserIds");

CREATE INDEX "IDX_a012eaf5c87c65da1deb5fdbfa" ON public.clip_note USING btree ("noteId");

CREATE INDEX "IDX_a08ad074601d204e0f69da9a95" ON public.moderation_log USING btree ("userId");

CREATE UNIQUE INDEX "IDX_a0cd75442dd10d0643a17c4a49" ON public.__chart__test_unique USING btree (date, "group");

CREATE UNIQUE INDEX "IDX_a1efd3e0048a5f2793a47360dc" ON public.__chart__network USING btree (date);

CREATE INDEX "IDX_a27b942a0d6dcff90e3ee9b5e8" ON public."user" USING btree ("usernameLower");

CREATE UNIQUE INDEX "IDX_a319e5dbf47e8a17497623beae" ON public.__chart__test USING btree (date, "group");

CREATE INDEX "IDX_a3eac04ae2aa9e221e7596114a" ON public.clip USING btree ("lastClippedAt");

CREATE INDEX "IDX_a40b8df8c989d7db937ea27cf6" ON public.drive_file USING btree (type);

CREATE UNIQUE INDEX "IDX_a42c93c69989ce1d09959df4cf" ON public.note_watching USING btree ("userId", "noteId");

CREATE INDEX "IDX_a6f649630f55af3888e5a42919" ON public.note USING btree ("userId", id DESC);

CREATE INDEX "IDX_a7eba67f8b3fa27271e85d2e26" ON public.drive_file USING btree ("isSensitive");

CREATE INDEX "IDX_a7fd92dd6dc519e6fb435dd108" ON public.follow_request USING btree ("followerId");

CREATE UNIQUE INDEX "IDX_a848f66d6cec11980a5dd59582" ON public.__chart_day__ap_request USING btree (date);

CREATE UNIQUE INDEX "IDX_a854e557b1b14814750c7c7b0c" ON public."user" USING btree (token);

CREATE INDEX "IDX_a9021cc2e1feb5f72d3db6e9f5" ON public.abuse_user_report USING btree ("targetUserId");

CREATE INDEX "IDX_abuse_report_notification_recipient_isActive" ON public.abuse_report_notification_recipient USING btree ("isActive");

CREATE INDEX "IDX_abuse_report_notification_recipient_method" ON public.abuse_report_notification_recipient USING btree (method);

CREATE INDEX "IDX_abuse_report_notification_recipient_systemWebhookId" ON public.abuse_report_notification_recipient USING btree ("systemWebhookId");

CREATE INDEX "IDX_abuse_report_notification_recipient_userId" ON public.abuse_report_notification_recipient USING btree ("userId");

CREATE UNIQUE INDEX "IDX_ad0c221b25672daf2df320a817" ON public.note_reaction USING btree ("userId", "noteId");

CREATE INDEX "IDX_ae1d917992dd0c9d9bbdad06c4" ON public.page USING btree ("userId");

CREATE UNIQUE INDEX "IDX_ae7aab18a2641d3e5f25e0c4ea" ON public.note_thread_muting USING btree ("userId", "threadId");

CREATE INDEX "IDX_aecfbd5ef60374918e63ee95fa" ON public.poll_vote USING btree ("noteId");

CREATE INDEX "IDX_af639b066dfbca78b01a920f8a" ON public.page USING btree ("updatedAt");

CREATE INDEX "IDX_b0134ec406e8d09a540f818288" ON public.note_watching USING btree ("userId");

CREATE UNIQUE INDEX "IDX_b14489029e4b3aaf4bba5fb524" ON public.__chart__test_grouped USING btree (date, "group");

CREATE UNIQUE INDEX "IDX_b1754a39d0b281e07ed7c078ec" ON public.clip_favorite USING btree ("userId", "clipId");

CREATE INDEX "IDX_b1d46037f23d170da5c05fdf75" ON public.chat_approval USING btree ("otherId");

CREATE INDEX "IDX_b37dafc86e9af007e3295c2781" ON public.emoji USING btree (name);

CREATE INDEX "IDX_b6f93f2f30bdbb9a5ebdc7c718" ON public.registration_ticket USING btree ("usedById");

CREATE UNIQUE INDEX "IDX_b77d4dd9562c3a899d9a286fcd" ON public.__chart__per_user_following USING btree (date, "group");

CREATE INDEX "IDX_b7fcefbdd1c18dce86687531f9" ON public.user_list USING btree ("userId");

CREATE INDEX "IDX_b82c19c08afb292de4600d99e4" ON public.page USING btree (name);

CREATE INDEX "IDX_bb90d1956dafc4068c28aa7560" ON public.drive_file USING btree ("folderId");

CREATE INDEX "IDX_bc1afcc8ef7e9400cdc3c0a87e" ON public.announcement USING btree ("isActive");

CREATE INDEX "IDX_be623adaa4c566baf5d29ce0c8" ON public."user" USING btree (uri);

CREATE INDEX "IDX_beba993576db0261a15364ea96" ON public.registration_ticket USING btree ("createdById");

CREATE INDEX "IDX_bf3a053c07d9fb5d87317c56ee" ON public.access_token USING btree (session);

CREATE INDEX "IDX_bfbc6305547539369fe73eb144" ON public.user_group_invitation USING btree ("userId");

CREATE INDEX "IDX_bfbc6f79ba4007b4ce5097f08d" ON public.user_note_pining USING btree ("userId");

CREATE INDEX "IDX_c1fd1c3dfb0627aa36c253fd14" ON public.muting USING btree ("expiresAt");

CREATE INDEX "IDX_c25143ebab714e930aeca1c0e8" ON public.chat_room_membership USING btree ("roomId");

CREATE UNIQUE INDEX "IDX_c362033aee0ea51011386a5a7e" ON public.system_account USING btree (type);

CREATE INDEX "IDX_c426394644267453e76f036926" ON public.note_thread_muting USING btree ("threadId");

CREATE UNIQUE INDEX "IDX_c5545d4b31cdc684034e33b81c" ON public.__chart_day__per_user_notes USING btree (date, "group");

CREATE UNIQUE INDEX "IDX_c55b2b7c284d9fef98026fc88e" ON public.drive_file USING btree ("webpublicAccessKey");

CREATE INDEX "IDX_c8cc87bd0f2f4487d17c651fbf" ON public."user" USING btree ("lastActiveDate");

CREATE INDEX "IDX_cac14a4e3944454a5ce7daa514" ON public.messaging_message USING btree ("recipientId");

CREATE UNIQUE INDEX "IDX_cad6e07c20037f31cdba8a350c" ON public.__chart_day__users USING btree (date);

CREATE INDEX "IDX_cddcaf418dc4d392ecfcca842a" ON public.user_list_membership USING btree ("userListId");

CREATE INDEX "IDX_ce62b50d882d4e9dee10ad0d2f" ON public.following USING btree ("followeeId", "followerHost", "isFollowerHibernated");

CREATE UNIQUE INDEX "IDX_cfbfeeccb0cbedcd660b17eb07" ON public.flash_like USING btree ("userId", "flashId");

CREATE INDEX "IDX_d4ebdef929896d6dc4a3c5bb48" ON public.note USING btree ("threadId");

CREATE UNIQUE INDEX "IDX_d54a512b822fac7ed52800f6b4" ON public.follow_request USING btree ("followerId", "followeeId");

CREATE UNIQUE INDEX "IDX_d54b653660d808b118e36c184c" ON public.__chart_day__per_user_reaction USING btree (date, "group");

CREATE INDEX "IDX_d57f9030cd3af7f63ffb1c267c" ON public.hashtag USING btree ("attachedUsersCount");

CREATE UNIQUE INDEX "IDX_d5954f3df5e5e3bdfc3c03f390" ON public.__chart_day__active_users USING btree (date);

CREATE INDEX "IDX_d5a1b83c7cab66f167e6888188" ON public."user" USING btree ("isExplorable");

CREATE UNIQUE INDEX "IDX_d6765a8c2a4c17c33f9d7f948b" ON public.user_list_favorite USING btree ("userId", "userListId");

CREATE UNIQUE INDEX "IDX_d85a184c2540d2deba33daf642" ON public.drive_file USING btree ("accessKey");

CREATE UNIQUE INDEX "IDX_d908433a4953cc13216cd9c274" ON public.note_unread USING btree ("userId", "noteId");

CREATE INDEX "IDX_d90c2c0e555b1eb2e4f19c9ad4" ON public.abuse_report_resolver USING btree ("updatedAt");

CREATE INDEX "IDX_d99c5279460fb77ef58c596ce5" ON public.chat_room_membership USING btree ("userId");

CREATE UNIQUE INDEX "IDX_d9ecaed8c6dc43f3592c229282" ON public.user_group_joining USING btree ("userId", "userGroupId");

CREATE UNIQUE INDEX "IDX_da522b4008a9f5d7743b87ad55" ON public.__chart__test_grouped USING btree (date) WHERE ("group" IS NULL);

CREATE INDEX "IDX_da795d3a83187e8832005ba19d" ON public.announcement USING btree ("forExistingUsers");

CREATE UNIQUE INDEX "IDX_dab383a36f3c9db4a0c9b02cf3" ON public.__chart__test USING btree (date) WHERE ("group" IS NULL);

CREATE INDEX "IDX_db5b72c16227c97ca88734d5c2" ON public.role_assignment USING btree ("userId");

CREATE INDEX "IDX_dce530b98e454793dac5ec2f5a" ON public.user_profile USING btree ("userHost");

CREATE INDEX "IDX_de22cd2b445eee31ae51cdbe99" ON public.user_profile USING btree (substr((birthday)::text, 6, 5));

CREATE UNIQUE INDEX "IDX_df1b5f4099e99fb0bc5eae53b6" ON public.gallery_like USING btree ("userId", "postId");

CREATE INDEX "IDX_e10924607d058004304611a436" ON public.user_group_invite USING btree ("userGroupId");

CREATE INDEX "IDX_e247b23a3c9b45f89ec1299d06" ON public.reversi_matching USING btree ("childId");

CREATE UNIQUE INDEX "IDX_e4849a3231f38281280ea4c0ee" ON public.__chart_day__per_user_following USING btree (date, "group");

CREATE UNIQUE INDEX "IDX_e4f3094c43f2d665e6030b0337" ON public.user_list_membership USING btree ("userId", "userListId");

CREATE UNIQUE INDEX "IDX_e56f4beac5746d44bc3e19c80d" ON public.__chart__ap_request USING btree (date);

CREATE INDEX "IDX_e5848eac4940934e23dbc17581" ON public.drive_file USING btree (uri);

CREATE INDEX "IDX_e637cba4dc4410218c4251260e" ON public.note_unread USING btree ("noteId");

CREATE INDEX "IDX_e72c391f099ef17655c5c2fbe9" ON public."user" USING btree ("isSensitive");

CREATE INDEX "IDX_e74020bacf28b80bed9ace40d7" ON public."user" USING btree ("isIndexable");

CREATE UNIQUE INDEX "IDX_e74022ce9a074b3866f70e0d27" ON public.drive_file USING btree ("thumbnailAccessKey");

CREATE INDEX "IDX_e83a32a146021c72ba9bde6675" ON public.abuse_report_resolver USING btree ("expirationDate");

CREATE UNIQUE INDEX "IDX_e9793f65f504e5a31fbaedbf2f" ON public.user_group_invitation USING btree ("userId", "userGroupId");

CREATE INDEX "IDX_ebe99317bbbe9968a0c6f579ad" ON public.clip_note USING btree ("clipId");

CREATE INDEX "IDX_ec96b4fed9dae517e0dbbe0675" ON public.muting USING btree ("muteeId");

CREATE INDEX "IDX_f006b8a76efd1abf9f221c175c" ON public.chat_message USING btree ("toRoomId");

CREATE INDEX "IDX_f0d8ad64243fa2ca2800da0dfd" ON public.chat_room USING btree ("ownerId");

CREATE INDEX "IDX_f0de67fd09cd3cd0aabca79994" ON public.role_assignment USING btree ("roleId");

CREATE UNIQUE INDEX "IDX_f221e45cfac5bea0ce0f3149fb" ON public.__chart_day__per_user_pv USING btree (date, "group");

CREATE INDEX "IDX_f272c8c8805969e6a6449c77b3" ON public.webhook USING btree ("userId");

CREATE UNIQUE INDEX "IDX_f2a56da57921ca8439f45c1d95" ON public.__chart__per_user_pv USING btree (date, "group");

CREATE INDEX "IDX_f2d744d9a14d0dfb8b96cb7fc5" ON public.gallery_post USING btree ("isSensitive");

CREATE INDEX "IDX_f3a1b4bd0c7cabba958a0c0b23" ON public.user_group_joining USING btree ("userId");

CREATE INDEX "IDX_f49922d511d666848f250663c4" ON public.app USING btree (secret);

CREATE INDEX "IDX_f4fc06e49c0171c85f1c48060d" ON public.drive_folder USING btree ("userId");

CREATE INDEX "IDX_f631d37835adb04792e361807c" ON public.gallery_post USING btree ("updatedAt");

CREATE INDEX "IDX_f6ba57dff679ccbcfe004698ec" ON public.event USING btree ("userHost");

CREATE INDEX "IDX_f7b9d338207e40e768e4a5265a" ON public.instance USING btree ("firstRetrievedAt");

CREATE UNIQUE INDEX "IDX_f7c3576b37bd2eec966ae24477" ON public.retention_aggregation USING btree ("dateKey");

CREATE INDEX "IDX_f8d8b93740ad12c4ce8213a199" ON public.abuse_user_report USING btree ("reporterHost");

CREATE INDEX "IDX_fa99d777623947a5b05f394cae" ON public."user" USING btree (tags);

CREATE UNIQUE INDEX "IDX_faef300913c738265638ba3ebc" ON public.user_memo USING btree ("userId", "targetUserId");

CREATE INDEX "IDX_fb9d21ba0abb83223263df6bcb" ON public.registry_item USING btree ("userId");

CREATE INDEX "IDX_fcdafee716dfe9c3b5fde90f30" ON public.following USING btree ("followeeHost");

CREATE INDEX "IDX_fd25dfe3da37df1715f11ba6ec" ON public.announcement USING btree ("userId");

CREATE UNIQUE INDEX "IDX_fea7c0278325a1a2492f2d6acb" ON public.__chart_day__instance USING btree (date, "group");

CREATE INDEX "IDX_ff9ca3b5f3ee3d0681367a9b44" ON public.user_security_key USING btree ("userId");

CREATE INDEX "IDX_note_deleteAt" ON public.note USING btree ("deleteAt") WHERE ("deleteAt" IS NOT NULL);

CREATE INDEX "IDX_note_draft_postedAt" ON public.note_draft USING btree ("postedAt") WHERE ("postedAt" IS NOT NULL);

CREATE INDEX "IDX_note_draft_scheduledAt_pending" ON public.note_draft USING btree ("scheduledAt") WHERE (("isActuallyScheduled" = true) AND ("postedAt" IS NULL));

CREATE INDEX "IDX_system_webhook_isActive" ON public.system_webhook USING btree ("isActive");

CREATE INDEX "IDX_system_webhook_on" ON public.system_webhook USING gin ("on");

ALTER TABLE ONLY public.drive_folder
    ADD CONSTRAINT "FK_00ceffb0cdc238b3233294f08f2" FOREIGN KEY ("parentId") REFERENCES public.drive_folder(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.user_list_favorite
    ADD CONSTRAINT "FK_016f613dc4feb807e03e3e7da92" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_list_membership
    ADD CONSTRAINT "FK_021015e6683570ae9f6b0c62bee" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_watching
    ADD CONSTRAINT "FK_03e7028ab8388a3f5e3ce2a8619" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.abuse_user_report
    ADD CONSTRAINT "FK_04cc96756f89d0b7f9473e8cdf3" FOREIGN KEY ("reporterId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.blocking
    ADD CONSTRAINT "FK_0627125f1a8a42c9a1929edb552" FOREIGN KEY ("blockerId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.abuse_user_report
    ADD CONSTRAINT "FK_08b883dd5fdd6f9c4c1572b36de" FOREIGN KEY ("assigneeId") REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.note_favorite
    ADD CONSTRAINT "FK_0e00498f180193423c992bc4370" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.page_like
    ADD CONSTRAINT "FK_0e61efab7f88dbb79c9166dbb48" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group_invite
    ADD CONSTRAINT "FK_1039988afa3bf991185b277fe03" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_publickey
    ADD CONSTRAINT "FK_10c146e4b39b443ede016f6736d" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.follow_request
    ADD CONSTRAINT "FK_12c01c0d1a79f77d9f6c15fadd2" FOREIGN KEY ("followeeId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_reaction
    ADD CONSTRAINT "FK_13761f64257f40c5636d0ff95ee" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_history
    ADD CONSTRAINT "FK_1e2492ba7582bf830b750a29627" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.following
    ADD CONSTRAINT "FK_24e0042143a18157b234df186c3" FOREIGN KEY ("followeeId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clip_favorite
    ADD CONSTRAINT "FK_25a31662b0b0cc9af6549a9d711" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT "FK_25e097b51d7622c249452c6f757" FOREIGN KEY ("toUserId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_thread_muting
    ADD CONSTRAINT "FK_29c11c7deb06615076f8c95b80a" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.event
    ADD CONSTRAINT "FK_2b481f231cd035e84390072bf7b" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clip
    ADD CONSTRAINT "FK_2b5ec6c574d6802c94c80313fb2" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.signin
    ADD CONSTRAINT "FK_2c308dbdc50d94dc625670055f7" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messaging_message
    ADD CONSTRAINT "FK_2c4be03b446884f9e9c502135be" FOREIGN KEY ("groupId") REFERENCES public.user_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.blocking
    ADD CONSTRAINT "FK_2cd4a2743a99671308f5417759e" FOREIGN KEY ("blockeeId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reversi_matching
    ADD CONSTRAINT "FK_3b25402709dd9882048c2bbade0" FOREIGN KEY ("parentId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group
    ADD CONSTRAINT "FK_3d6b372788ab01be58853003c93" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.app
    ADD CONSTRAINT "FK_3f5b0899ef90527a3462d7c2cb3" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.system_account
    ADD CONSTRAINT "FK_41a3c87a37aea616ee459369e12" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_reaction
    ADD CONSTRAINT "FK_45145e4953780f3cd5656f0ea6a" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_favorite
    ADD CONSTRAINT "FK_47f4b1892f5d6ba8efb3057d81a" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.password_reset_request
    ADD CONSTRAINT "FK_4bb7fd4a34492ae0e6cc8d30ac8" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_list_favorite
    ADD CONSTRAINT "FK_4d52b20bfe32c8552e7a61e80d2" FOREIGN KEY ("userListId") REFERENCES public.user_list(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_profile
    ADD CONSTRAINT "FK_51cb79b5555effaf7d69ba1cff9" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_approval
    ADD CONSTRAINT "FK_530257863e1381a7f2f1d3282fe" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messaging_message
    ADD CONSTRAINT "FK_535def119223ac05ad3fa9ef64b" FOREIGN KEY ("fileId") REFERENCES public.drive_file(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messaging_message
    ADD CONSTRAINT "FK_5377c307783fce2b6d352e1203b" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_unread
    ADD CONSTRAINT "FK_56b0166d34ddae49d8ef7610bb9" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "FK_58f5c71eaab331645112cf8cfa5" FOREIGN KEY ("avatarId") REFERENCES public.drive_file(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.note
    ADD CONSTRAINT "FK_5b87d9d19127bd5d92026017a7b" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group_invitation
    ADD CONSTRAINT "FK_5cc8c468090e129857e9fecce5a" FOREIGN KEY ("userGroupId") REFERENCES public.user_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_room_invitation
    ADD CONSTRAINT "FK_5f265075b215fc390a57523b12a" FOREIGN KEY ("roomId") REFERENCES public.chat_room(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_read
    ADD CONSTRAINT "FK_603a7b1e7aa0533c6c88e9bfafe" FOREIGN KEY ("announcementId") REFERENCES public.announcement(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flash_like
    ADD CONSTRAINT "FK_60c4af1c19a7a75f1592f93b287" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.antenna
    ADD CONSTRAINT "FK_6446c571a0e8d0f05f01c789096" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_memo
    ADD CONSTRAINT "FK_650b49c5639b5840ee6a2b8f83e" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.following
    ADD CONSTRAINT "FK_6516c5a6f3c015b4eed39978be5" FOREIGN KEY ("followerId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reversi_game
    ADD CONSTRAINT "FK_6649a4e8c5d5cf32fb03b5da9f6" FOREIGN KEY ("user2Id") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_memo
    ADD CONSTRAINT "FK_66ac4a82894297fd09ba61f3d35" FOREIGN KEY ("targetUserId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_vote
    ADD CONSTRAINT "FK_66d2bd2ee31d14bcc23069a89f8" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group_joining
    ADD CONSTRAINT "FK_67dc758bc0566985d1b3d399865" FOREIGN KEY ("userGroupId") REFERENCES public.user_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_note_pining
    ADD CONSTRAINT "FK_68881008f7c3588ad7ecae471cf" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flash_like
    ADD CONSTRAINT "FK_6c16fe0e93b7a1951eca624b76a" FOREIGN KEY ("flashId") REFERENCES public.flash(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_profile
    ADD CONSTRAINT "FK_6dc44f1ceb65b1e72bacef2ca27" FOREIGN KEY ("pinnedPageId") REFERENCES public.page(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.antenna
    ADD CONSTRAINT "FK_709d7d32053d0dd7620f678eeb9" FOREIGN KEY ("userListId") REFERENCES public.user_list(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT "FK_79a26e7a4d9afa5e4fc05f134ed" FOREIGN KEY ("fromUserId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.renote_muting
    ADD CONSTRAINT "FK_7aa72a5fe76019bfe8e5e0e8b7d" FOREIGN KEY ("muterId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.renote_muting
    ADD CONSTRAINT "FK_7eac97594bcac5ffcf2068089b6" FOREIGN KEY ("muteeId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.announcement_read
    ADD CONSTRAINT "FK_8288151386172b8109f7239ab28" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_room_invitation
    ADD CONSTRAINT "FK_8552bb38e7ed038c5bdd398a384" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.drive_file
    ADD CONSTRAINT "FK_860fa6f6c7df5bb887249fba22e" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.gallery_like
    ADD CONSTRAINT "FK_8fd5215095473061855ceb948cf" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.muting
    ADD CONSTRAINT "FK_93060675b4a79a577f31d260c67" FOREIGN KEY ("muterId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_history
    ADD CONSTRAINT "FK_95a9f7f6939a5cd4ec5d84979af" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promo_read
    ADD CONSTRAINT "FK_9657d55550c3d37bfafaf7d4b05" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sw_subscription
    ADD CONSTRAINT "FK_97754ca6f2baff9b4abb7f853dd" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gallery_post
    ADD CONSTRAINT "FK_985b836dddd8615e432d7043ddb" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.access_token
    ADD CONSTRAINT "FK_9949557d0e1b2c19e5344c171e9" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flash
    ADD CONSTRAINT "FK_9b88250fc2fd009b8f1b5623ed5" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clip_note
    ADD CONSTRAINT "FK_a012eaf5c87c65da1deb5fdbfa3" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.moderation_log
    ADD CONSTRAINT "FK_a08ad074601d204e0f69da9a954" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.access_token
    ADD CONSTRAINT "FK_a3ff16c90cc87a82a0b5959e560" FOREIGN KEY ("appId") REFERENCES public.app(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promo_read
    ADD CONSTRAINT "FK_a46a1a603ecee695d7db26da5f4" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.follow_request
    ADD CONSTRAINT "FK_a7fd92dd6dc519e6fb435dd108f" FOREIGN KEY ("followerId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.abuse_user_report
    ADD CONSTRAINT "FK_a9021cc2e1feb5f72d3db6e9f5f" FOREIGN KEY ("targetUserId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.page
    ADD CONSTRAINT "FK_a9ca79ad939bf06066b81c9d3aa" FOREIGN KEY ("eyeCatchingImageId") REFERENCES public.drive_file(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.abuse_report_notification_recipient
    ADD CONSTRAINT "FK_abuse_report_notification_recipient_systemWebhookId" FOREIGN KEY ("systemWebhookId") REFERENCES public.system_webhook(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.abuse_report_notification_recipient
    ADD CONSTRAINT "FK_abuse_report_notification_recipient_userId1" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.abuse_report_notification_recipient
    ADD CONSTRAINT "FK_abuse_report_notification_recipient_userId2" FOREIGN KEY ("userId") REFERENCES public.user_profile("userId") ON DELETE CASCADE;

ALTER TABLE ONLY public.page
    ADD CONSTRAINT "FK_ae1d917992dd0c9d9bbdad06c4a" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_vote
    ADD CONSTRAINT "FK_aecfbd5ef60374918e63ee95fa7" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT "FK_afc64b53f8db3707ceb34eb28e2" FOREIGN KEY ("bannerId") REFERENCES public.drive_file(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.note_watching
    ADD CONSTRAINT "FK_b0134ec406e8d09a540f8182888" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gallery_like
    ADD CONSTRAINT "FK_b1cb568bfe569e47b7051699fc8" FOREIGN KEY ("postId") REFERENCES public.gallery_post(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_approval
    ADD CONSTRAINT "FK_b1d46037f23d170da5c05fdf755" FOREIGN KEY ("otherId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.registration_ticket
    ADD CONSTRAINT "FK_b6f93f2f30bdbb9a5ebdc7c7189" FOREIGN KEY ("usedById") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_list
    ADD CONSTRAINT "FK_b7fcefbdd1c18dce86687531f99" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.drive_file
    ADD CONSTRAINT "FK_bb90d1956dafc4068c28aa7560a" FOREIGN KEY ("folderId") REFERENCES public.drive_folder(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.registration_ticket
    ADD CONSTRAINT "FK_beba993576db0261a15364ea96e" FOREIGN KEY ("createdById") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group_invitation
    ADD CONSTRAINT "FK_bfbc6305547539369fe73eb144a" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_note_pining
    ADD CONSTRAINT "FK_bfbc6f79ba4007b4ce5097f08d6" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT "FK_c072b729d71697f959bde66ade0" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_room_membership
    ADD CONSTRAINT "FK_c25143ebab714e930aeca1c0e8d" FOREIGN KEY ("roomId") REFERENCES public.chat_room(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta
    ADD CONSTRAINT "FK_c80e4079d632f95eac06a9d28cc" FOREIGN KEY ("rootUserId") REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messaging_message
    ADD CONSTRAINT "FK_cac14a4e3944454a5ce7daa5142" FOREIGN KEY ("recipientId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.antenna
    ADD CONSTRAINT "FK_ccbf5a8c0be4511133dcc50ddeb" FOREIGN KEY ("userGroupJoiningId") REFERENCES public.user_group_joining(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_list_membership
    ADD CONSTRAINT "FK_cddcaf418dc4d392ecfcca842a7" FOREIGN KEY ("userListId") REFERENCES public.user_list(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.page_like
    ADD CONSTRAINT "FK_cf8782626dced3176038176a847" FOREIGN KEY ("pageId") REFERENCES public.page(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_room_membership
    ADD CONSTRAINT "FK_d99c5279460fb77ef58c596ce51" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll
    ADD CONSTRAINT "FK_da851e06d0dfe2ef397d8b1bf1b" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_assignment
    ADD CONSTRAINT "FK_db5b72c16227c97ca88734d5c2b" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT "FK_dbe037d4bddd17b03a1dc778dee" FOREIGN KEY ("appId") REFERENCES public.app(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group_invite
    ADD CONSTRAINT "FK_e10924607d058004304611a436a" FOREIGN KEY ("userGroupId") REFERENCES public.user_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reversi_matching
    ADD CONSTRAINT "FK_e247b23a3c9b45f89ec1299d066" FOREIGN KEY ("childId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promo_note
    ADD CONSTRAINT "FK_e263909ca4fe5d57f8d4230dd5c" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_draft
    ADD CONSTRAINT "FK_e4983f28b4b18b03491536052f5" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.note_unread
    ADD CONSTRAINT "FK_e637cba4dc4410218c4251260e4" FOREIGN KEY ("noteId") REFERENCES public.note(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clip_note
    ADD CONSTRAINT "FK_ebe99317bbbe9968a0c6f579adf" FOREIGN KEY ("clipId") REFERENCES public.clip(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.muting
    ADD CONSTRAINT "FK_ec96b4fed9dae517e0dbbe0675c" FOREIGN KEY ("muteeId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT "FK_f006b8a76efd1abf9f221c175ce" FOREIGN KEY ("toRoomId") REFERENCES public.chat_room(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_room
    ADD CONSTRAINT "FK_f0d8ad64243fa2ca2800da0dfd6" FOREIGN KEY ("ownerId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_assignment
    ADD CONSTRAINT "FK_f0de67fd09cd3cd0aabca79994d" FOREIGN KEY ("roleId") REFERENCES public.role(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.webhook
    ADD CONSTRAINT "FK_f272c8c8805969e6a6449c77b3c" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_group_joining
    ADD CONSTRAINT "FK_f3a1b4bd0c7cabba958a0c0b231" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_keypair
    ADD CONSTRAINT "FK_f4853eb41ab722fe05f81cedeb6" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.drive_folder
    ADD CONSTRAINT "FK_f4fc06e49c0171c85f1c48060d2" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reversi_game
    ADD CONSTRAINT "FK_f7467510c60a45ce5aca6292743" FOREIGN KEY ("user1Id") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.registry_item
    ADD CONSTRAINT "FK_fb9d21ba0abb83223263df6bcb3" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.clip_favorite
    ADD CONSTRAINT "FK_fce61c7986cee54393e79f1d849" FOREIGN KEY ("clipId") REFERENCES public.clip(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT "FK_fd0f9a4879430239715ad4f8e2a" FOREIGN KEY ("fileId") REFERENCES public.drive_file(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT "FK_fd25dfe3da37df1715f11ba6ec8" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_security_key
    ADD CONSTRAINT "FK_ff9ca3b5f3ee3d0681367a9b447" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;
