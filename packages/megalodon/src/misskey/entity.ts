import * as MiAnnouncement from "./entities/announcement";
import * as MiApp from "./entities/app";
import * as MiBlocking from "./entities/blocking";
import * as MiCreatedNote from "./entities/createdNote";
import * as MiEmoji from "./entities/emoji";
import * as MiFavorite from "./entities/favorite";
import * as MiFile from "./entities/file";
import * as MiFollowing from "./entities/following";
import * as MiFollowers from "./entities/follower";
import * as MiFollowRequest from "./entities/followRequest";
import * as MiHashTag from "./entities/hashtag";
import * as MiList from "./entities/list";
import * as MiMeta from "./entities/meta";
import * as MiMute from "./entities/mute";
import * as MiNote from "./entities/note";
import * as MiNotification from "./entities/notification";
import * as MiPoll from "./entities/poll";
import * as MiReaction from "./entities/reaction";
import * as MiRelation from "./entities/relation";
import * as MiUser from "./entities/user";
import * as MiUserDetail from "./entities/userDetail";
import * as MiUserKey from "./entities/userkey";
import * as MiSession from "./entities/session";
import * as MiStats from "./entities/stats";

export namespace MisskeyEntity {
	export type MiAnnouncement = MiAnnouncement.Announcement;
	export type MiApp = MiApp.App;
	export type MiBlocking = MiBlocking.Blocking;
	export type MiCreatedNote = MiCreatedNote.CreatedNote;
	export type MiEmoji = MiEmoji.Emoji;
	export type MiFavorite = MiFavorite.Favorite;
	export type MiFile = MiFile.File;
	export type MiFollowing = MiFollowing.Following;
	export type MiFollowers = MiFollowers.Follower;
	export type MiFollowRequest = MiFollowRequest.FollowRequest;
	export type MiHashTag = MiHashTag.Hashtag;
	export type MiList = MiList.List;
	export type MiMeta = MiMeta.Meta;
	export type MiMute = MiMute.Mute;
	export type MiNote = MiNote.Note;
	export type MiNotification = MiNotification.Notification;
	export type MiNotificationType = MiNotification.NotificationType;
	export type MiPoll = MiPoll.Poll;
	export type MiPollChoice = MiPoll.Choice;
	export type MiReaction = MiReaction.Reaction;
	export type MiRelation = MiRelation.Relation;
	export type MiUser = MiUser.User;
	export type MiUserDetail = MiUserDetail.UserDetail;
	export type MiUserKey = MiUserKey.UserKey;
	export type MiSession = MiSession.Session;
	export type MiStats = MiStats.Stats;
}

export default MisskeyEntity
