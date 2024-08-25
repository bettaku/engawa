import type { Account } from "./account"
import type { Application } from "./application"
import type { Mention } from "./mention"
import type { Attachment } from "./attachment"
import type { Emoji } from "./emoji"
import type { Card } from "./card"
import type { Poll } from "./poll"

export type Status = {
	id: string
	uri: string
	url: string
	account: Account
	in_reply_to_id: string | null
	in_reply_to_account_id: string | null
	reblog: Status | null
	content: string
	created_at: string
	emojis: Emoji[]
	replies_count: number
	reblogs_count: number
	favourites_count: number
	reblogged: boolean | null
	favourited: boolean | null
	muted: boolean | null
	sensitive: boolean
	spoiler_text: string
	visibility: 'public' | 'unlisted' | 'private' | 'direct'
	media_attachments: Array<Attachment>
	mentions: Array<Mention>
	tags: Array<StatusTag>
	card: Card | null
	poll: Poll | null
	application: Application | null
	language: string | null
	pinned: boolean | null
	bookmarked?: boolean
	// These parameters are unique parameters in fedibird.com for quote.
	quote_id?: string
	quote?: Status | null
}

export type StatusTag = {
	name: string
	url: string
}
