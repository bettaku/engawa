import type { UserDetail } from "./userDetail"

export type Following = {
	id: string
	createdAt: string
	followeeId: string
	followerId: string
	followee: UserDetail
}
