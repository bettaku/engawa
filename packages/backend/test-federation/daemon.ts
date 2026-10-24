import { Redis } from 'ioredis';

/**
 * Purge the signin rate limit so the tester can create many accounts quickly.
 *
 * The backend keys the `signin` limit by the client IP hash. Depending on the
 * docker network topology the backend may observe different source IPs (for
 * example the per-site nginx proxy address rather than the tester's own IP), so
 * instead of trying to reproduce a single hash we clear every signin limit key
 * for the host.
 */
export async function purgeLimit(host: string, client: Redis) {
	const pattern = `${host}:limit:ip-*:signin*`;
	const keys: string[] = [];
	let cursor = '0';
	do {
		const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
		cursor = next;
		keys.push(...batch);
	} while (cursor !== '0');
	if (keys.length !== 0) {
		await client.del(...keys);
	}
}

console.log('Daemon started running');

{
	const redisClient = new Redis({
		host: 'redis.test',
	});

	setInterval(() => {
		purgeLimit('a.test', redisClient);
		purgeLimit('b.test', redisClient);
		purgeLimit('c.test', redisClient);
	}, 200);
}
