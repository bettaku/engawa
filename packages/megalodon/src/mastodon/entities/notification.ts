import type { Account } from "./account";
import type { Status } from "./status";

export type Notification = {
	account: Account;
	created_at: string;
	id: string;
	status?: Status;
	type: NotificationType;
};

export type NotificationType = string;
