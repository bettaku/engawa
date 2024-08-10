/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Module } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import {
	MiAbuseReportNotificationRecipient,
	MiAbuseReportResolver,
	MiAbuseUserReport,
	MiAccessToken,
	MiAd,
	MiAnnouncement,
	MiAnnouncementRead,
	MiAntenna,
	MiApp,
	MiAuthSession,
	MiAvatarDecoration,
	MiBlocking,
	MiBubbleGameRecord,
	MiChannel,
	MiChannelFavorite,
	MiChannelFollowing,
	MiClip,
	MiClipFavorite,
	MiClipNote,
	MiDriveFile,
	MiDriveFolder,
	MiEmoji,
	MiEvent,
	MiFlash,
	MiFlashLike,
	MiFollowing,
	MiFollowRequest,
	MiGalleryLike,
	MiGalleryPost,
	MiHashtag,
	MiInstance,
	MiMessagingMessage,
	MiMeta,
	MiModerationLog,
	MiMuting,
	MiNote,
	MiNoteFavorite,
	MiNoteReaction,
	MiNoteThreadMuting,
	MiNoteUnread,
	MiPage,
	MiPageLike,
	MiPasswordResetRequest,
	MiPoll,
	MiPollVote,
	MiPromoNote,
	MiPromoRead,
	MiRegistrationTicket,
	MiRegistryItem,
	MiRelay,
	MiRenoteMuting,
	MiRepository,
	miRepository,
	MiRetentionAggregation,
	MiRole,
	MiRoleAssignment,
	MiSignin,
	MiSwSubscription,
	MiSystemWebhook,
	MiUsedUsername,
	MiUser,
	MiUserGroup,
	MiUserGroupJoining,
	MiUserGroupInvitation,
	MiUserIp,
	MiUserKeypair,
	MiUserList,
	MiUserListFavorite,
	MiUserListMembership,
	MiUserMemo,
	MiUserNotePining,
	MiUserPending,
	MiUserProfile,
	MiUserPublickey,
	MiUserSecurityKey,
	MiWebhook,
} from './_.js';
import type { Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';

const $usersRepository: Provider = {
	provide: DI.usersRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUser).extend(miRepository as MiRepository<MiUser>),
	inject: [DI.db],
};

const $notesRepository: Provider = {
	provide: DI.notesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNote).extend(miRepository as MiRepository<MiNote>),
	inject: [DI.db],
};

const $announcementsRepository: Provider = {
	provide: DI.announcementsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAnnouncement).extend(miRepository as MiRepository<MiAnnouncement>),
	inject: [DI.db],
};

const $announcementReadsRepository: Provider = {
	provide: DI.announcementReadsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAnnouncementRead).extend(miRepository as MiRepository<MiAnnouncementRead>),
	inject: [DI.db],
};

const $appsRepository: Provider = {
	provide: DI.appsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiApp).extend(miRepository as MiRepository<MiApp>),
	inject: [DI.db],
};

const $avatarDecorationsRepository: Provider = {
	provide: DI.avatarDecorationsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAvatarDecoration).extend(miRepository as MiRepository<MiAvatarDecoration>),
	inject: [DI.db],
};

const $noteFavoritesRepository: Provider = {
	provide: DI.noteFavoritesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteFavorite).extend(miRepository as MiRepository<MiNoteFavorite>),
	inject: [DI.db],
};

const $noteThreadMutingsRepository: Provider = {
	provide: DI.noteThreadMutingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteThreadMuting).extend(miRepository as MiRepository<MiNoteThreadMuting>),
	inject: [DI.db],
};

const $noteReactionsRepository: Provider = {
	provide: DI.noteReactionsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteReaction).extend(miRepository as MiRepository<MiNoteReaction>),
	inject: [DI.db],
};

const $noteUnreadsRepository: Provider = {
	provide: DI.noteUnreadsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiNoteUnread).extend(miRepository as MiRepository<MiNoteUnread>),
	inject: [DI.db],
};

const $pollsRepository: Provider = {
	provide: DI.pollsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPoll).extend(miRepository as MiRepository<MiPoll>),
	inject: [DI.db],
};

const $pollVotesRepository: Provider = {
	provide: DI.pollVotesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPollVote).extend(miRepository as MiRepository<MiPollVote>),
	inject: [DI.db],
};

const $userProfilesRepository: Provider = {
	provide: DI.userProfilesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserProfile).extend(miRepository as MiRepository<MiUserProfile>),
	inject: [DI.db],
};

const $userKeypairsRepository: Provider = {
	provide: DI.userKeypairsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserKeypair).extend(miRepository as MiRepository<MiUserKeypair>),
	inject: [DI.db],
};

const $userPendingsRepository: Provider = {
	provide: DI.userPendingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserPending).extend(miRepository as MiRepository<MiUserPending>),
	inject: [DI.db],
};

const $userSecurityKeysRepository: Provider = {
	provide: DI.userSecurityKeysRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserSecurityKey).extend(miRepository as MiRepository<MiUserSecurityKey>),
	inject: [DI.db],
};

const $userPublickeysRepository: Provider = {
	provide: DI.userPublickeysRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserPublickey).extend(miRepository as MiRepository<MiUserPublickey>),
	inject: [DI.db],
};

const $userListsRepository: Provider = {
	provide: DI.userListsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserList).extend(miRepository as MiRepository<MiUserList>),
	inject: [DI.db],
};

const $userListFavoritesRepository: Provider = {
	provide: DI.userListFavoritesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserListFavorite).extend(miRepository as MiRepository<MiUserListFavorite>),
	inject: [DI.db],
};

const $userListMembershipsRepository: Provider = {
	provide: DI.userListMembershipsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserListMembership).extend(miRepository as MiRepository<MiUserListMembership>),
	inject: [DI.db],
};

const $userGroupsRepository: Provider = {
	provide: DI.userGroupsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserGroup).extend(miRepository as MiRepository<MiUserGroup>),
	inject: [DI.db],
};

const $userGroupJoiningsRepository: Provider = {
	provide: DI.userGroupJoiningsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserGroupJoining).extend(miRepository as MiRepository<MiUserGroupJoining>),
	inject: [DI.db],
};

const $userGroupInvitationsRepository: Provider = {
	provide: DI.userGroupInvitationsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserGroupInvitation).extend(miRepository as MiRepository<MiUserGroupInvitation>),
	inject: [DI.db],
};

const $userNotePiningsRepository: Provider = {
	provide: DI.userNotePiningsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserNotePining).extend(miRepository as MiRepository<MiUserNotePining>),
	inject: [DI.db],
};

const $userIpsRepository: Provider = {
	provide: DI.userIpsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserIp).extend(miRepository as MiRepository<MiUserIp>),
	inject: [DI.db],
};

const $usedUsernamesRepository: Provider = {
	provide: DI.usedUsernamesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUsedUsername).extend(miRepository as MiRepository<MiUsedUsername>),
	inject: [DI.db],
};

const $followingsRepository: Provider = {
	provide: DI.followingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFollowing).extend(miRepository as MiRepository<MiFollowing>),
	inject: [DI.db],
};

const $followRequestsRepository: Provider = {
	provide: DI.followRequestsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFollowRequest).extend(miRepository as MiRepository<MiFollowRequest>),
	inject: [DI.db],
};

const $instancesRepository: Provider = {
	provide: DI.instancesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiInstance).extend(miRepository as MiRepository<MiInstance>),
	inject: [DI.db],
};

const $emojisRepository: Provider = {
	provide: DI.emojisRepository,
	useFactory: (db: DataSource) => db.getRepository(MiEmoji).extend(miRepository as MiRepository<MiEmoji>),
	inject: [DI.db],
};

const $eventsRepository: Provider = {
	provide: DI.eventsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiEvent).extend(miRepository as MiRepository<MiEvent>),
	inject: [DI.db],
};

const $driveFilesRepository: Provider = {
	provide: DI.driveFilesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiDriveFile).extend(miRepository as MiRepository<MiDriveFile>),
	inject: [DI.db],
};

const $driveFoldersRepository: Provider = {
	provide: DI.driveFoldersRepository,
	useFactory: (db: DataSource) => db.getRepository(MiDriveFolder).extend(miRepository as MiRepository<MiDriveFolder>),
	inject: [DI.db],
};

const $metasRepository: Provider = {
	provide: DI.metasRepository,
	useFactory: (db: DataSource) => db.getRepository(MiMeta).extend(miRepository as MiRepository<MiMeta>),
	inject: [DI.db],
};

const $mutingsRepository: Provider = {
	provide: DI.mutingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiMuting).extend(miRepository as MiRepository<MiMuting>),
	inject: [DI.db],
};

const $renoteMutingsRepository: Provider = {
	provide: DI.renoteMutingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRenoteMuting).extend(miRepository as MiRepository<MiRenoteMuting>),
	inject: [DI.db],
};

const $blockingsRepository: Provider = {
	provide: DI.blockingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiBlocking).extend(miRepository as MiRepository<MiBlocking>),
	inject: [DI.db],
};

const $swSubscriptionsRepository: Provider = {
	provide: DI.swSubscriptionsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiSwSubscription).extend(miRepository as MiRepository<MiSwSubscription>),
	inject: [DI.db],
};

const $hashtagsRepository: Provider = {
	provide: DI.hashtagsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiHashtag).extend(miRepository as MiRepository<MiHashtag>),
	inject: [DI.db],
};

const $abuseUserReportsRepository: Provider = {
	provide: DI.abuseUserReportsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAbuseUserReport).extend(miRepository as MiRepository<MiAbuseUserReport>),
	inject: [DI.db],
};

const $abuseReportNotificationRecipientRepository: Provider = {
	provide: DI.abuseReportNotificationRecipientRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAbuseReportNotificationRecipient),
	inject: [DI.db],
};

const $registrationTicketsRepository: Provider = {
	provide: DI.registrationTicketsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRegistrationTicket).extend(miRepository as MiRepository<MiRegistrationTicket>),
	inject: [DI.db],
};

const $authSessionsRepository: Provider = {
	provide: DI.authSessionsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAuthSession).extend(miRepository as MiRepository<MiAuthSession>),
	inject: [DI.db],
};

const $accessTokensRepository: Provider = {
	provide: DI.accessTokensRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAccessToken).extend(miRepository as MiRepository<MiAccessToken>),
	inject: [DI.db],
};

const $signinsRepository: Provider = {
	provide: DI.signinsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiSignin).extend(miRepository as MiRepository<MiSignin>),
	inject: [DI.db],
};

const $messagingMessagesRepository: Provider = {
	provide: DI.messagingMessagesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiMessagingMessage).extend(miRepository as MiRepository<MiMessagingMessage>),
	inject: [DI.db],
};

const $pagesRepository: Provider = {
	provide: DI.pagesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPage).extend(miRepository as MiRepository<MiPage>),
	inject: [DI.db],
};

const $pageLikesRepository: Provider = {
	provide: DI.pageLikesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPageLike).extend(miRepository as MiRepository<MiPageLike>),
	inject: [DI.db],
};

const $galleryPostsRepository: Provider = {
	provide: DI.galleryPostsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiGalleryPost).extend(miRepository as MiRepository<MiGalleryPost>),
	inject: [DI.db],
};

const $galleryLikesRepository: Provider = {
	provide: DI.galleryLikesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiGalleryLike).extend(miRepository as MiRepository<MiGalleryLike>),
	inject: [DI.db],
};

const $moderationLogsRepository: Provider = {
	provide: DI.moderationLogsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiModerationLog).extend(miRepository as MiRepository<MiModerationLog>),
	inject: [DI.db],
};

const $clipsRepository: Provider = {
	provide: DI.clipsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiClip).extend(miRepository as MiRepository<MiClip>),
	inject: [DI.db],
};

const $clipNotesRepository: Provider = {
	provide: DI.clipNotesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiClipNote).extend(miRepository as MiRepository<MiClipNote>),
	inject: [DI.db],
};

const $clipFavoritesRepository: Provider = {
	provide: DI.clipFavoritesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiClipFavorite).extend(miRepository as MiRepository<MiClipFavorite>),
	inject: [DI.db],
};

const $antennasRepository: Provider = {
	provide: DI.antennasRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAntenna).extend(miRepository as MiRepository<MiAntenna>),
	inject: [DI.db],
};

const $promoNotesRepository: Provider = {
	provide: DI.promoNotesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPromoNote).extend(miRepository as MiRepository<MiPromoNote>),
	inject: [DI.db],
};

const $promoReadsRepository: Provider = {
	provide: DI.promoReadsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPromoRead).extend(miRepository as MiRepository<MiPromoRead>),
	inject: [DI.db],
};

const $relaysRepository: Provider = {
	provide: DI.relaysRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRelay).extend(miRepository as MiRepository<MiRelay>),
	inject: [DI.db],
};

const $channelsRepository: Provider = {
	provide: DI.channelsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChannel).extend(miRepository as MiRepository<MiChannel>),
	inject: [DI.db],
};

const $channelFollowingsRepository: Provider = {
	provide: DI.channelFollowingsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChannelFollowing).extend(miRepository as MiRepository<MiChannelFollowing>),
	inject: [DI.db],
};

const $channelFavoritesRepository: Provider = {
	provide: DI.channelFavoritesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiChannelFavorite).extend(miRepository as MiRepository<MiChannelFavorite>),
	inject: [DI.db],
};

const $registryItemsRepository: Provider = {
	provide: DI.registryItemsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRegistryItem).extend(miRepository as MiRepository<MiRegistryItem>),
	inject: [DI.db],
};

const $webhooksRepository: Provider = {
	provide: DI.webhooksRepository,
	useFactory: (db: DataSource) => db.getRepository(MiWebhook).extend(miRepository as MiRepository<MiWebhook>),
	inject: [DI.db],
};

const $systemWebhooksRepository: Provider = {
	provide: DI.systemWebhooksRepository,
	useFactory: (db: DataSource) => db.getRepository(MiSystemWebhook),
	inject: [DI.db],
};

const $adsRepository: Provider = {
	provide: DI.adsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAd).extend(miRepository as MiRepository<MiAd>),
	inject: [DI.db],
};

const $passwordResetRequestsRepository: Provider = {
	provide: DI.passwordResetRequestsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiPasswordResetRequest).extend(miRepository as MiRepository<MiPasswordResetRequest>),
	inject: [DI.db],
};

const $retentionAggregationsRepository: Provider = {
	provide: DI.retentionAggregationsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRetentionAggregation).extend(miRepository as MiRepository<MiRetentionAggregation>),
	inject: [DI.db],
};

const $flashsRepository: Provider = {
	provide: DI.flashsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFlash).extend(miRepository as MiRepository<MiFlash>),
	inject: [DI.db],
};

const $flashLikesRepository: Provider = {
	provide: DI.flashLikesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiFlashLike).extend(miRepository as MiRepository<MiFlashLike>),
	inject: [DI.db],
};

const $rolesRepository: Provider = {
	provide: DI.rolesRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRole).extend(miRepository as MiRepository<MiRole>),
	inject: [DI.db],
};

const $roleAssignmentsRepository: Provider = {
	provide: DI.roleAssignmentsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiRoleAssignment).extend(miRepository as MiRepository<MiRoleAssignment>),
	inject: [DI.db],
};

const $userMemosRepository: Provider = {
	provide: DI.userMemosRepository,
	useFactory: (db: DataSource) => db.getRepository(MiUserMemo).extend(miRepository as MiRepository<MiUserMemo>),
	inject: [DI.db],
};

const $bubbleGameRecordsRepository: Provider = {
	provide: DI.bubbleGameRecordsRepository,
	useFactory: (db: DataSource) => db.getRepository(MiBubbleGameRecord).extend(miRepository as MiRepository<MiBubbleGameRecord>),
	inject: [DI.db],
};

const $abuseReportResolversRepository: Provider = {
	provide: DI.abuseReportResolversRepository,
	useFactory: (db: DataSource) => db.getRepository(MiAbuseReportResolver).extend(miRepository as MiRepository<MiAbuseReportResolver>),
	inject: [DI.db],
};

@Module({
	imports: [],
	providers: [
		$usersRepository,
		$notesRepository,
		$announcementsRepository,
		$announcementReadsRepository,
		$appsRepository,
		$avatarDecorationsRepository,
		$noteFavoritesRepository,
		$noteThreadMutingsRepository,
		$noteReactionsRepository,
		$noteUnreadsRepository,
		$pollsRepository,
		$pollVotesRepository,
		$userProfilesRepository,
		$userKeypairsRepository,
		$userPendingsRepository,
		$userSecurityKeysRepository,
		$userPublickeysRepository,
		$userListsRepository,
		$userListFavoritesRepository,
		$userListMembershipsRepository,
		$userGroupsRepository,
		$userGroupJoiningsRepository,
		$userGroupInvitationsRepository,
		$userNotePiningsRepository,
		$userIpsRepository,
		$usedUsernamesRepository,
		$followingsRepository,
		$followRequestsRepository,
		$instancesRepository,
		$emojisRepository,
		$eventsRepository,
		$driveFilesRepository,
		$driveFoldersRepository,
		$metasRepository,
		$mutingsRepository,
		$renoteMutingsRepository,
		$blockingsRepository,
		$swSubscriptionsRepository,
		$hashtagsRepository,
		$abuseUserReportsRepository,
		$abuseReportNotificationRecipientRepository,
		$registrationTicketsRepository,
		$authSessionsRepository,
		$accessTokensRepository,
		$signinsRepository,
		$messagingMessagesRepository,
		$pagesRepository,
		$pageLikesRepository,
		$galleryPostsRepository,
		$galleryLikesRepository,
		$moderationLogsRepository,
		$clipsRepository,
		$clipNotesRepository,
		$clipFavoritesRepository,
		$antennasRepository,
		$promoNotesRepository,
		$promoReadsRepository,
		$relaysRepository,
		$channelsRepository,
		$channelFollowingsRepository,
		$channelFavoritesRepository,
		$registryItemsRepository,
		$webhooksRepository,
		$systemWebhooksRepository,
		$adsRepository,
		$passwordResetRequestsRepository,
		$retentionAggregationsRepository,
		$rolesRepository,
		$roleAssignmentsRepository,
		$flashsRepository,
		$flashLikesRepository,
		$userMemosRepository,
		$abuseReportResolversRepository,
		$bubbleGameRecordsRepository,
	],
	exports: [
		$usersRepository,
		$notesRepository,
		$announcementsRepository,
		$announcementReadsRepository,
		$appsRepository,
		$avatarDecorationsRepository,
		$noteFavoritesRepository,
		$noteThreadMutingsRepository,
		$noteReactionsRepository,
		$noteUnreadsRepository,
		$pollsRepository,
		$pollVotesRepository,
		$userProfilesRepository,
		$userKeypairsRepository,
		$userPendingsRepository,
		$userSecurityKeysRepository,
		$userPublickeysRepository,
		$userListsRepository,
		$userListFavoritesRepository,
		$userListMembershipsRepository,
		$userGroupsRepository,
		$userGroupJoiningsRepository,
		$userGroupInvitationsRepository,
		$userNotePiningsRepository,
		$userIpsRepository,
		$usedUsernamesRepository,
		$followingsRepository,
		$followRequestsRepository,
		$instancesRepository,
		$emojisRepository,
		$eventsRepository,
		$driveFilesRepository,
		$driveFoldersRepository,
		$metasRepository,
		$mutingsRepository,
		$renoteMutingsRepository,
		$blockingsRepository,
		$swSubscriptionsRepository,
		$hashtagsRepository,
		$abuseUserReportsRepository,
		$abuseReportNotificationRecipientRepository,
		$registrationTicketsRepository,
		$authSessionsRepository,
		$accessTokensRepository,
		$signinsRepository,
		$messagingMessagesRepository,
		$pagesRepository,
		$pageLikesRepository,
		$galleryPostsRepository,
		$galleryLikesRepository,
		$moderationLogsRepository,
		$clipsRepository,
		$clipNotesRepository,
		$clipFavoritesRepository,
		$antennasRepository,
		$promoNotesRepository,
		$promoReadsRepository,
		$relaysRepository,
		$channelsRepository,
		$channelFollowingsRepository,
		$channelFavoritesRepository,
		$registryItemsRepository,
		$webhooksRepository,
		$systemWebhooksRepository,
		$adsRepository,
		$passwordResetRequestsRepository,
		$retentionAggregationsRepository,
		$rolesRepository,
		$roleAssignmentsRepository,
		$flashsRepository,
		$flashLikesRepository,
		$userMemosRepository,
		$abuseReportResolversRepository,
		$bubbleGameRecordsRepository,
	],
})
export class RepositoryModule {
}
