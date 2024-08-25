import * as Account from './entities/account'
import * as Activity from './entities/activity'
import * as Announcement from './entities/announcement'
import * as Application from './entities/application'
import * as AsyncAttachment from './entities/async_attachment'
import * as Attachment from './entities/attachment'
import * as Card from './entities/card'
import * as Context from './entities/context'
import * as Conversation from './entities/conversation'
import * as Emoji from './entities/emoji'
import * as FeaturedTag from './entities/featured_tag'
import * as Field from './entities/field'
import * as Filter from './entities/filter'
import * as History from './entities/history'
import * as IdentityProof from './entities/identity_proof'
import * as Instance from 	'./entities/instance'
import * as List from './entities/list'
import * as Marker from './entities/marker'
import * as Mention from './entities/mention'
import * as Notification from './entities/notification'
import * as PollOption from './entities/poll_option'
import * as Poll from './entities/poll'
import * as Preferences from './entities/preferences'
import * as PushSubscription from './entities/push_subscription'
import * as Relationship from './entities/relationship'
import * as Report from './entities/report'
import * as Results from './entities/results'
import * as Role from './entities/role'
import * as ScheduledStatus from './entities/scheduled_status'
import * as Source from './entities/source'
import * as Stats from './entities/stats'
import * as Status from './entities/status'
import * as StatusParams from './entities/status_params'
import * as StatusSource from './entities/status_source'
import * as Tag from './entities/tag'
import * as Token from './entities/token'
import * as URLs from './entities/urls'

export namespace MastodonEntity {
	export type Account = Account.Account;
	export type Activity = Activity.Activity;
	export type Announcement = Announcement.Announcement;
	export type AnnouncementAccount = Announcement.AnnouncementAccount;
	export type AnnouncementReaction = Announcement.AnnouncementReaction;
	export type AnnouncementStatus = Announcement.AnnouncementStatus;
	export type Application = Application.Application;
	export type AsyncAttachment = AsyncAttachment.AsyncAttachment;
	export type Attachment = Attachment.Attachment;
	export type Focus = Attachment.Focus;
	export type Meta = Attachment.Meta;
	export type Sub = Attachment.Sub;
	export type Card = Card.Card;
	export type Context = Context.Context;
	export type Conversation = Conversation.Conversation;
	export type Emoji = Emoji.Emoji;
	export type FeaturedTag = FeaturedTag.FeaturedTag;
	export type Field = Field.Field;
	export type Filter = Filter.Filter;
	export type FilterContext = Filter.FilterContext;
	export type History = History.History;
	export type IdentityProof = IdentityProof.IdentityProof;
	export type Instance = Instance.Instance;
	export type List = List.List;
	export type Marker = Marker.Marker;
	export type Mention = Mention.Mention;
	export type Notification = Notification.Notification;
	export type NotificationType = Notification.NotificationType;
	export type PollOption = PollOption.PollOption;
	export type Poll = Poll.Poll;
	export type Preferences = Preferences.Preferences;
	export type PushSubscription = PushSubscription.PushSubscription;
	export type Alerts = PushSubscription.Alerts;
	export type Relationship = Relationship.Relationship;
	export type Report = Report.Report;
	export type Category = Report.Category;
	export type Results = Results.Results;
	export type Role = Role.Role;
	export type ScheduledStatus = ScheduledStatus.ScheduledStatus;
	export type Source = Source.Source;
	export type Stats = Stats.Stats;
	export type StatusParams = StatusParams.StatusParams;
	export type Status = Status.Status;
	export type StatusTag = Status.StatusTag;
	export type StatusSource = StatusSource.StatusSource;
	export type Tag = Tag.Tag;
	export type Token = Token.Token;
	export type URLs = URLs.URLs;
}

export default MastodonEntity
