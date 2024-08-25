import type { UserDetail } from "./userDetail"

export type Follower = {
	id: string
	createdAt: string
	followeeId: string
	followerId: string
	follower: UserDetail
}
