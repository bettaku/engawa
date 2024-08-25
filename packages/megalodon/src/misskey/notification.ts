import type MisskeyEntity from "./entity";

namespace MisskeyNotificationType {
	export const Follow: MisskeyEntity.MiNotificationType = "follow";
	export const Mention: MisskeyEntity.MiNotificationType = "mention";
	export const Reply: MisskeyEntity.MiNotificationType = "reply";
	export const Renote: MisskeyEntity.MiNotificationType = "renote";
	export const Quote: MisskeyEntity.MiNotificationType = "quote";
	export const Reaction: MisskeyEntity.MiNotificationType = "reaction";
	export const PollVote: MisskeyEntity.MiNotificationType = "pollVote";
	export const ReceiveFollowRequest: MisskeyEntity.MiNotificationType =
		"receiveFollowRequest";
	export const FollowRequestAccepted: MisskeyEntity.MiNotificationType =
		"followRequestAccepted";
	export const GroupInvited: MisskeyEntity.MiNotificationType = "groupInvited";
}

export default MisskeyNotificationType;
