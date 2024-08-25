import type { Emoji } from "./emoji"

export type User = {
	id: string
	name: string
	username: string
	host: string | null
	avatarUrl: string
	avatarColor: string
	emojis: Array<Emoji> | { [key: string]: string }
}
