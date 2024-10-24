<template></template>

<script lang="ts" setup>
import * as os from '@/os';
import { host as hostRaw } from '@@/js/config.js';
import { $i } from '@/account';
import { acct } from '@/filters/user';
import { i18n } from '@/i18n';
import { misskeyApi } from '@/scripts/misskey-api';
import * as Misskey from 'cherrypick-js';

const acctUri = new URL(location.href).searchParams.get("acct");
if (acctUri == null) {
	throw new Error("acct required");
}


if ($i != null) {
	const { canceled } = await os.confirm({
		type: 'question',
		text: i18n.ts.useThisAccountConfirm,
	});

	if (!canceled) {
		os.waiting();
		window.location.href = `/authorize-follow?acct=${acctUri}`;
	}
}

const remoteAccountId = await os.inputText({
	text: i18n.ts.inputHandle,
});

if (!remoteAccountId.result) {
	os.waiting();
	window.location.href = `/authorize-follow?acct=${acctUri}`;
} else {
	const remoteAccountInfo = Misskey.acct.parse(remoteAccountId.result);
	os.waiting();
	fetch(
		`https://${remoteAccountInfo.host}/.well-known/webfinger?resource=acct:${remoteAccountInfo.username}@${remoteAccountInfo.host}`,
		{
			method: 'GET',
		},
	)
	.then((res) => res.json())
	.then((data) => {
		const subscribeUri = data.links.find((link: { rel: string }) => link.rel === "http://ostatus.org/schema/1.0/subscribe").template;
		window.location.href = subscribeUri.replace("{uri}", acctUri.includes("@") ? acctUri : `${acctUri}@${hostRaw}`);
	})
	.catch((_) => {
		window.location.href = `/@${acctUri}`;
	});
}

</script>
