import type { Account } from "./account"
import type { Status } from "./status"

export type Notification = {
	account: Account
	created_at: string
	id: string
	status?: Status
	emoji?: string
	type: NotificationType
	target?: Account
}

export type NotificationType = string
