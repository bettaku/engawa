/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import * as parse5 from 'parse5';
import { Window, XMLSerializer } from 'happy-dom';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { intersperse } from '@/misc/prelude/array.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type { DefaultTreeAdapterMap } from 'parse5';
import type * as mfm from 'mfc-js';

const treeAdapter = parse5.defaultTreeAdapter;
type Node = DefaultTreeAdapterMap['node'];
type ChildNode = DefaultTreeAdapterMap['childNode'];

const urlRegex = /^https?:\/\/[\w\/:%#@$&?!()\[\]~.,=+\-]+/;
const urlRegexFull = /^https?:\/\/[\w\/:%#@$&?!()\[\]~.,=+\-]+$/;
const MAX_FLAT = 100;

@Injectable()
export class MfmService {
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
	}

	@bindThis
	public fromHtml(html: string, hashtagNames?: string[]): string {
		// some AP servers like Pixelfed use br tags as well as newlines
		html = html.replace(/<br\s?\/?>\r?\n/gi, '\n');

		const normalizedHashtagNames = hashtagNames == null ? undefined : new Set<string>(hashtagNames.map(x => normalizeForSearch(x)));

		const dom = parse5.parseFragment(html);

		return toMFM(dom.childNodes, '');

		function toMFM(childNode: ChildNode[], background = ''): string {
			return appendChildren(childNode, background).join('').trim();
		}

		function getText(node: Node): string {
			if (treeAdapter.isTextNode(node)) return node.value;
			if (!treeAdapter.isElementNode(node)) return '';
			if (node.nodeName === 'br') return '\n';

			if (node.childNodes) {
				return node.childNodes.map(n => getText(n)).join('');
			}

			return '';
		}

		function appendChildren(childNodes: ChildNode[], background = ''): string[] {
			if (childNodes) {
				return childNodes.map((n, index) => analyze(n, index + 1, background)).flat(MAX_FLAT);
			} else {
				return [''];
			}
		}

		function analyze(node: Node, index = 1, background = ''): (string | string[])[] {
			if (treeAdapter.isTextNode(node)) {
				return [node.value];
			}

			// Skip comment or document type node
			if (!treeAdapter.isElementNode(node)) {
				return [];
			}

			switch (node.nodeName) {
				case 'br': {
					return ['\n'];
				}

				case 'a': {
					const txt = getText(node);
					const rel = node.attrs.find(x => x.name === 'rel');
					const href = node.attrs.find(x => x.name === 'href');

					// ハッシュタグ
					if (normalizedHashtagNames && href && normalizedHashtagNames.has(normalizeForSearch(txt))) {
						return [txt];
						// メンション
					} else if (txt.startsWith('@') && !(rel && rel.value.startsWith('me '))) {
						const part = txt.split('@');

						if (part.length === 2 && href) {
							//#region ホスト名部分が省略されているので復元する
							return [`${txt}@${new URL(href.value).hostname}`];
							//#endregion
						} else if (part.length === 3) {
							return [txt];
						}
						// その他
					} else {
						if (!href && !txt) {
							return [''];
						}
						if (!href) {
							return [txt];
						}
						if (!txt || txt === href.value) {	// #6383: Missing text node
							if (href.value.match(urlRegexFull)) {
								return [href.value];
							} else {
								return [`<${href.value}>`];
							}
						}
						if (href.value.match(urlRegex) && !href.value.match(urlRegexFull)) {
							return [`[${txt}](<${href.value}>)`];	// #6846
						} else {
							return [`[${txt}](${href.value})`];
						}
					}
					break;
				}

				case 'h1': {
					return ['\n\n', '**$[x2', appendChildren(node.childNodes), ' ]**'];
				}

				case 'h2':
				case 'h3': {
					return ['\n\n', '**', appendChildren(node.childNodes), '**'];
				}

				case 'b':
				case 'strong': {
					return ['**', appendChildren(node.childNodes), '**'];
				}

				case 'small': {
					return ['<small>', appendChildren(node.childNodes), '</small>'];
				}

				case 's':
				case 'del': {
					return ['~~', appendChildren(node.childNodes), '~~'];
				}

				case 'i':
				case 'em': {
					return ['<i>', appendChildren(node.childNodes), '</i>'];
				}

				case 'ruby': {
					let ruby: [string, string][] = [];
					for (const child of node.childNodes) {
						if (child.nodeName === 'rp') {
							continue;
						}
						if (treeAdapter.isTextNode(child) && !/\s|\[|\]/.test(child.value)) {
							ruby.push([child.value, '']);
							continue;
						}
						if (child.nodeName === 'rt' && ruby.length > 0) {
							const rt = getText(child);
							if (/\s|\[|\]/.test(rt)) {
								// If any space is included in rt, it is treated as a normal text
								ruby = [];
								return appendChildren(node.childNodes);
							} else {
								ruby.at(-1)![1] = rt;
								continue;
							}
						}
						// If any other element is included in ruby, it is treated as a normal text
						ruby = [];
						return appendChildren(node.childNodes);
					}
					return ruby.map(([base, rt]) => `$[ruby ${base} ${rt}]`);
				}

				// block code (<pre><code>)
				case 'pre': {
					if (node.childNodes.length === 1 && node.childNodes[0].nodeName === 'code') {
						return [
							'\n```\n',
							getText(node.childNodes[0]),
							'\n```\n',
						];
					} else {
						return appendChildren(node.childNodes);
					}
				}

				// inline code (<code>)
				case 'code': {
					return ['`', appendChildren(node.childNodes), '`'];
				}

				case 'blockquote': {
					return ['\n', toMFM(node.childNodes).split('\n').map(line => `> ${line}`).join('\n> ')];
				}

				case 'p':
				case 'h4':
				case 'h5':
				case 'h6': {
					return ['\n\n', appendChildren(node.childNodes)];
				}

				// other block elements
				case 'div':
				case 'header':
				case 'footer':
				case 'article':
				case 'dt':
				case 'dd': {
					return ['\n', appendChildren(node.childNodes)];
				}

				case 'ul': {
					return ['\n', toMFM(node.childNodes, 'ul').split('\n').join('\n').trim()];
				}

				case 'ol': {
					return ['\n', toMFM(node.childNodes, 'ol').split('\n').join('\n').trim()];
				}

				case 'li': {
					if (background === 'ol') {
						const order = index - 1;
						return ['\n', `${order}. `, toMFM(node.childNodes).split('\n').join('\n').trim()];
					} else {
						return ['\n', '- ', toMFM(node.childNodes).split('\n').join('\n').trim()];
					}
				}

				default:	// includes inline elements
				{
					return appendChildren(node.childNodes);
				}
			}
			return [];
		}
	}

	@bindThis
	public toHtml(nodes: mfm.MfmNode[] | null, mentionedRemoteUsers: IMentionedRemoteUsers = []) {
		if (nodes == null) {
			return null;
		}

		const { happyDOM, window } = new Window();

		const doc = window.document;

		const body = doc.createElement('p');

		function appendChildren(children: mfm.MfmNode[], targetElement: any): void {
			if (children) {
				for (const child of children.map(x => (handlers as any)[x.type](x))) targetElement.appendChild(child);
			}
		}

		function fnDefault(node: mfm.MfmFn) {
			const el = doc.createElement('i');
			appendChildren(node.children, el);
			return el;
		}

		const handlers: { [K in mfm.MfmNode['type']]: (node: mfm.NodeType<K>) => any } = {
			bold: (node) => {
				const el = doc.createElement('b');
				appendChildren(node.children, el);
				return el;
			},

			small: (node) => {
				const el = doc.createElement('small');
				appendChildren(node.children, el);
				return el;
			},

			strike: (node) => {
				const el = doc.createElement('del');
				appendChildren(node.children, el);
				return el;
			},

			italic: (node) => {
				const el = doc.createElement('i');
				appendChildren(node.children, el);
				return el;
			},

			fn: (node) => {
				switch (node.props.name) {
					case 'unixtime': {
						const text = node.children[0].type === 'text' ? node.children[0].props.text : '';
						try {
							const date = new Date(parseInt(text, 10) * 1000);
							const el = doc.createElement('time');
							el.setAttribute('datetime', date.toISOString());
							el.textContent = date.toISOString();
							return el;
						} catch (err) {
							return fnDefault(node);
						}
					}

					case 'ruby': {
						if (node.children.length === 1) {
							const child = node.children[0];
							const text = child.type === 'text' ? child.props.text : '';
							const rubyEl = doc.createElement('ruby');
							const rtEl = doc.createElement('rt');

							// ruby未対応のHTMLサニタイザーを通したときにルビが「劉備（りゅうび）」となるようにする
							const rpStartEl = doc.createElement('rp');
							rpStartEl.appendChild(doc.createTextNode('('));
							const rpEndEl = doc.createElement('rp');
							rpEndEl.appendChild(doc.createTextNode(')'));

							rubyEl.appendChild(doc.createTextNode(text.split(' ')[0]));
							rtEl.appendChild(doc.createTextNode(text.split(' ')[1]));
							rubyEl.appendChild(rpStartEl);
							rubyEl.appendChild(rtEl);
							rubyEl.appendChild(rpEndEl);
							return rubyEl;
						} else {
							const rt = node.children.at(-1);

							if (!rt) {
								return fnDefault(node);
							}

							const text = rt.type === 'text' ? rt.props.text : '';
							const rubyEl = doc.createElement('ruby');
							const rtEl = doc.createElement('rt');

							// ruby未対応のHTMLサニタイザーを通したときにルビが「劉備（りゅうび）」となるようにする
							const rpStartEl = doc.createElement('rp');
							rpStartEl.appendChild(doc.createTextNode('('));
							const rpEndEl = doc.createElement('rp');
							rpEndEl.appendChild(doc.createTextNode(')'));

							appendChildren(node.children.slice(0, node.children.length - 1), rubyEl);
							rtEl.appendChild(doc.createTextNode(text.trim()));
							rubyEl.appendChild(rpStartEl);
							rubyEl.appendChild(rtEl);
							rubyEl.appendChild(rpEndEl);
							return rubyEl;
						}
					}

					default: {
						return fnDefault(node);
					}
				}
			},

			blockCode: (node) => {
				const pre = doc.createElement('pre');
				const inner = doc.createElement('code');
				inner.textContent = node.props.code;
				pre.appendChild(inner);
				return pre;
			},

			center: (node) => {
				const el = doc.createElement('div');
				appendChildren(node.children, el);
				return el;
			},

			emojiCode: (node) => {
				return doc.createTextNode(`\u200B:${node.props.name}:\u200B`);
			},

			unicodeEmoji: (node) => {
				return doc.createTextNode(node.props.emoji);
			},

			hashtag: (node) => {
				const a = doc.createElement('a');
				a.setAttribute('href', `${this.config.url}/tags/${node.props.hashtag}`);
				a.textContent = `#${node.props.hashtag}`;
				a.setAttribute('rel', 'tag');
				return a;
			},

			inlineCode: (node) => {
				const el = doc.createElement('code');
				el.textContent = node.props.code;
				return el;
			},

			mathInline: (node) => {
				const el = doc.createElement('code');
				el.textContent = node.props.formula;
				return el;
			},

			mathBlock: (node) => {
				const el = doc.createElement('code');
				el.textContent = node.props.formula;
				return el;
			},

			link: (node) => {
				const a = doc.createElement('a');
				a.setAttribute('href', node.props.url);
				appendChildren(node.children, a);
				return a;
			},

			mention: (node) => {
				const a = doc.createElement('a');
				const { username, host, acct } = node.props;
				const remoteUserInfo = mentionedRemoteUsers.find(remoteUser => remoteUser.username.toLowerCase() === username.toLowerCase() && remoteUser.host.toLowerCase() === host?.toLowerCase());
				a.setAttribute('href', remoteUserInfo
					? (remoteUserInfo.url ? remoteUserInfo.url : remoteUserInfo.uri)
					: `${this.config.url}/${acct.endsWith(`@${this.config.url}`) ? acct.substring(0, acct.length - this.config.url.length - 1) : acct}`);
				a.className = 'u-url mention';
				a.textContent = acct;
				return a;
			},

			quote: (node) => {
				const el = doc.createElement('blockquote');
				appendChildren(node.children, el);
				return el;
			},

			text: (node) => {
				if (!node.props.text.match(/[\r\n]/)) {
					return doc.createTextNode(node.props.text);
				}

				const el = doc.createElement('span');
				const nodes = node.props.text.split(/\r\n|\r|\n/).map(x => doc.createTextNode(x));

				for (const x of intersperse<FIXME | 'br'>('br', nodes)) {
					el.appendChild(x === 'br' ? doc.createElement('br') : x);
				}

				return el;
			},

			url: (node) => {
				const a = doc.createElement('a');
				a.setAttribute('href', node.props.url);
				a.textContent = node.props.url;
				return a;
			},

			search: (node) => {
				const a = doc.createElement('a');
				a.setAttribute('href', `https://www.google.com/search?q=${node.props.query}`);
				a.textContent = node.props.content;
				return a;
			},

			plain: (node) => {
				const el = doc.createElement('span');
				appendChildren(node.children, el);
				return el;
			},
		};

		appendChildren(nodes, body);

		const serialized = new XMLSerializer().serializeToString(body);

		happyDOM.close().catch(err => {});

		return serialized;
	}
}
